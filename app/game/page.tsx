"use client";
import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe } from "@/lib/useMe";
import {
  CARD_FACES,
  MISMATCH_SHOW_MS,
  flipCard,
  newGame,
  other,
  resolveMismatch,
  winner,
  type GameState,
  type Player,
} from "@/lib/memoryGame";

const gameRef = doc(db, "memory_game", "shared");

const NAME: Record<Player, string> = { nam: "Nam", linh: "Linh" };
const ICON: Record<Player, string> = { nam: "🐻", linh: "🧸" };
const FIRST_EVER_STARTER: Player = "linh"; // ladies first 💕

// A rule refusal (not your turn, card already open…) — shown as a toast.
class GameRuleError extends Error {}

export default function GamePage() {
  const me = useMe();
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sharedPhone, setSharedPhone] = useState(false);
  const [toast, setToast] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load the one shared game from Firestore (realtime!); create it the first time.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(gameRef, (snap) => {
        if (snap.exists()) {
          setGame(snap.data() as GameState);
          setLoading(false);
        } else {
          runTransaction(db, async (tx) => {
            if (!(await tx.get(gameRef)).exists()) tx.set(gameRef, newGame(FIRST_EVER_STARTER));
          }).catch((err) => console.error("Could not create game:", err));
        }
      });
    });
    const pending = timers.current;
    return () => {
      cancelled = true;
      unsub?.();
      pending.forEach(clearTimeout);
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const showToast = (message: string) => {
    setToast(message);
    later(() => setToast(""), 2000);
  };

  const player: Player | "shared" | undefined = sharedPhone ? "shared" : me ?? undefined;

  // Flip the wrong pair back — only if nobody else already did.
  const flipBack = (pair: number[]) =>
    runTransaction(db, async (tx) => {
      const state = (await tx.get(gameRef)).data() as GameState | undefined;
      if (state && state.flipped.length === 2 && state.flipped.every((i, k) => i === pair[k])) {
        tx.set(gameRef, resolveMismatch(state));
      }
    }).catch((err) => console.error("Could not flip back:", err));

  const tap = async (index: number) => {
    if (busy || !player) return;
    setBusy(true);
    try {
      // Transaction: re-reads the latest state, so two phones tapping at once
      // can't both win — the rules always run against the truth.
      const next = await runTransaction(db, async (tx) => {
        const result = flipCard((await tx.get(gameRef)).data() as GameState, index, player);
        if (!result.ok) throw new GameRuleError(result.reason);
        tx.set(gameRef, result.state);
        return result.state;
      });
      if (next.flipped.length === 2) {
        const pair = [...next.flipped];
        later(() => flipBack(pair), MISMATCH_SHOW_MS);
      }
    } catch (err) {
      if (err instanceof GameRuleError) showToast(err.message);
      else {
        console.error("Flip failed:", err);
        showToast("Có lỗi gì đó, thử lại nhé 🥺");
      }
    } finally {
      setBusy(false);
    }
  };

  const startNewGame = async () => {
    if (!game) return;
    const inProgress =
      game.status === "playing" && (game.matched.length > 0 || game.flipped.length > 0);
    if (inProgress && !window.confirm("Bỏ ván này hả? 🥺")) return;
    await setDoc(gameRef, newGame(other(game.startedBy)));
  };

  if (loading || !game || me === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
        <h1 className="text-center text-3xl font-bold text-zinc-800">Lật hình emoji 🐻</h1>
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      </main>
    );
  }

  const finished = game.status === "finished";
  const myTurn = sharedPhone || me === game.turn;
  const result = finished ? winner(game) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-10">
      <h1 className="text-center text-3xl font-bold text-zinc-800">Lật hình emoji 🐻</h1>

      {/* Scoreboard — the current turn's name is highlighted */}
      <div className="flex items-center justify-center gap-4 text-lg">
        {(["nam", "linh"] as Player[]).map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            {i === 1 && <span className="text-gray-300">—</span>}
            <span
              className={
                !finished && game.turn === p ? "font-bold text-pink-500" : "text-gray-500"
              }
            >
              {i === 0 ? `${NAME[p]} ${ICON[p]} ${game.scores[p]}` : `${game.scores[p]} ${ICON[p]} ${NAME[p]}`}
            </span>
          </span>
        ))}
      </div>

      {/* Status line / winner banner */}
      {finished ? (
        <div className="rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-pink-200">
          {result === "tie"
            ? "Hoà nhau, cả hai đều giỏi 💞"
            : `${NAME[result as Player]} thắng rồi! 🏆`}
        </div>
      ) : (
        <p className="text-center text-gray-500">
          {myTurn
            ? `Lượt của ${NAME[game.turn]} nè 💕`
            : `Đợi ${NAME[game.turn]} lật nhé ⏳`}
        </p>
      )}

      {/* Board */}
      {/* Square board sized from the saved game (a 4×4 game started before
          the 6×6 switch still renders correctly until "Ván mới"). */}
      <div
        className={`grid gap-1.5 sm:gap-2 ${!finished && !myTurn ? "opacity-60" : ""}`}
        style={{ gridTemplateColumns: `repeat(${Math.round(Math.sqrt(game.cardOrder.length))}, minmax(0, 1fr))` }}
      >
        {game.cardOrder.map((face, i) => {
          const isMatched = game.matched.includes(i);
          const isUp = isMatched || game.flipped.includes(i);
          const isMismatch = game.flipped.length === 2 && game.flipped.includes(i);
          return (
            <button
              key={i}
              // Always ask the rules: they explain refusals and unstick
              // an abandoned mismatch.
              onClick={() => (isMatched ? undefined : tap(i))}
              aria-label={isUp ? CARD_FACES[face] : "Lá úp"}
              className={`flex aspect-square items-center justify-center rounded-xl text-2xl shadow-sm transition-all active:scale-95 sm:text-3xl ${
                isMatched
                  ? "border border-pink-100 bg-pink-50 opacity-60 ring-2 ring-pink-200"
                  : isMismatch
                    ? "border-2 border-rose-300 bg-white"
                    : isUp
                      ? "border-2 border-pink-300 bg-white"
                      : "bg-pink-400 text-white hover:bg-pink-500"
              }`}
            >
              {isUp ? CARD_FACES[face] ?? "❓" : "💗"}
            </button>
          );
        })}
      </div>

      {toast && <p className="text-center text-sm text-pink-500">{toast}</p>}

      <button
        onClick={startNewGame}
        className={
          finished
            ? "rounded-full bg-pink-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
            : "mx-auto rounded-full border-2 border-pink-300 bg-white px-6 py-2 font-semibold text-pink-500 transition-all hover:bg-pink-50 active:scale-95"
        }
      >
        {finished ? "Chơi ván nữa 🔄" : "Ván mới 🔄"}
      </button>

      {/* Whose phone + pass-and-play toggle */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-400">
        {me && (
          <span>
            Máy của {NAME[me]} {ICON[me]}
          </span>
        )}
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={sharedPhone}
            onChange={(e) => setSharedPhone(e.target.checked)}
            className="accent-pink-500"
          />
          Chơi chung một máy 📱
        </label>
      </div>
    </main>
  );
}
