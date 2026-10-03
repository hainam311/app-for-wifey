"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot, runTransaction } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe } from "@/lib/useMe";
import { gameRef } from "@/lib/caro/gameDoc";
import Board from "./Board";
import {
  PIECE,
  answerDraw,
  newGame,
  nextGame,
  other,
  place,
  proposeDraw,
  resign,
  type CaroState,
  type Player,
  type StateResult,
} from "@/lib/caro/engine";

// One game shared by both screens in caro_game/shared. Every move is a
// transaction that re-reads the doc and runs the engine against that, so the
// rules always check the latest board — never a stale copy on screen.
const FIRST_EVER_STARTER: Player = "linh"; // ladies first 💕

// A rule refusal (not your turn, cell taken…) — shown as a toast.
class GameRuleError extends Error {}

const NAME: Record<Player, string> = { nam: "🐻 Nam", linh: "🧸 Linh" };

function endText(game: CaroState): string {
  switch (game.endReason) {
    case "five":
      return "5 quân liền nhau 🎯";
    case "full":
      return "Bàn cờ đã kín ô";
    case "agreed":
      return "Hai bạn đồng ý hòa 🤝";
    case "resign":
      return game.winner ? `${NAME[other(game.winner)]} đầu hàng 🏳️` : "";
    default:
      return "";
  }
}

const Title = () => <h1 className="text-center text-3xl font-bold text-zinc-800">Cờ caro 🐻🧸</h1>;

export default function CaroPage() {
  const me = useMe();
  const [game, setGame] = useState<CaroState | null>(null);

  // Load the shared game (realtime!) and create it the first time.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(gameRef, (snap) => {
        if (snap.exists()) {
          setGame(snap.data() as CaroState);
        } else {
          runTransaction(db, async (tx) => {
            if (!(await tx.get(gameRef)).exists()) tx.set(gameRef, newGame(FIRST_EVER_STARTER));
          }).catch((err) => console.error("Could not create game:", err));
        }
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  if (me === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 text-center">
        <Title />
        <Link href="/lock?next=/caro" className="py-12 text-rose-500 underline">
          Chưa biết máy của ai 🤔 Mở khoá lại nhé
        </Link>
      </main>
    );
  }

  if (!game || me === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
        <Title />
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      </main>
    );
  }

  // A new key after every move (and new game / game over) remounts the game
  // view, which clears the selection. Not keyed on updatedAt, so a draw offer
  // won't wipe the other player's selection.
  return <CaroGame key={`${game.startedBy}:${game.moves.length}:${game.status}`} game={game} me={me} />;
}

function CaroGame({ game, me }: { game: CaroState; me: Player }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const playing = game.status === "playing";
  const myTurn = playing && game.turn === me;

  // Runs one action as a transaction against the latest saved game. On
  // success the snapshot brings the new state back and the view resets
  // itself (see the key above).
  const run = async (move: (state: CaroState) => StateResult) => {
    if (busy) return;
    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new GameRuleError("Ván này không còn nữa, tải lại trang nhé 🔄");
        const result = move(snap.data() as CaroState);
        if (!result.ok) throw new GameRuleError(result.reason);
        tx.set(gameRef, result.state);
      });
    } catch (err) {
      if (err instanceof GameRuleError) say(err.message);
      else {
        console.error("Move failed:", err);
        say("Có lỗi gì đó, thử lại nhé 🥺");
      }
    } finally {
      setBusy(false);
    }
  };

  const tapCell = (i: number) => {
    if (!playing || game.board[i] !== "") return;
    if (!myTurn) return say(`Đợi ${NAME[game.turn]} đánh xong đã nhé ⏳`);
    if (selected !== i) {
      setSelected(i); // click 1: select (or move the selection)
      return;
    }
    run((s) => place(s, me, i)); // click 2: place
  };

  // Both may press "Ván mới" at once: only the first one counts, and it can
  // never wipe a game that has already started.
  const startNewGame = () =>
    run((s) =>
      s.status === "over" && s.startedBy === game.startedBy
        ? { ok: true, state: nextGame(s) }
        : { ok: false, reason: "Ván mới bắt đầu rồi nè 🎉" }
    );

  const askDraw = () => run((s) => proposeDraw(s, me));
  const answer = (agree: boolean) => run((s) => answerDraw(s, me, agree));
  const giveUp = () => {
    if (!window.confirm("Đầu hàng ván này hả? 🏳️")) return;
    run((s) => resign(s, me));
  };

  const last = game.moves.length ? game.moves[game.moves.length - 1] : null;
  const offer = playing ? game.drawProposal : undefined;
  const nextStarter: Player = game.startedBy === "nam" ? "linh" : "nam";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-8">
      <Title />

      <p className="text-center text-sm text-zinc-500">
        {NAME.nam}: <b className="text-rose-500">X</b> · {NAME.linh}: <b className="text-sky-500">O</b>
      </p>

      <p className="min-h-6 text-center" role="status">
        {playing ? (
          <>
            {myTurn ? (
              <b className="inline-block animate-pulse text-rose-500">Lượt của em!</b>
            ) : (
              <>
                Đợi <b>{NAME[game.turn]}</b> đánh…
              </>
            )}{" "}
            (
            <b className={PIECE[game.turn] === "x" ? "text-rose-500" : "text-sky-500"}>
              {PIECE[game.turn].toUpperCase()}
            </b>
            )
            {game.moves.length === 0 && (
              <span className="text-zinc-500"> · {NAME[game.startedBy]} đi trước ván này</span>
            )}
          </>
        ) : game.winner ? (
          <b className="inline-block animate-bounce text-lg text-rose-500">
            {game.winner === me ? "Em thắng rồi! 🎉🎊" : `${NAME[game.winner]} thắng! 🎉`}
          </b>
        ) : (
          <b className="text-lg">Hòa 🤝</b>
        )}
      </p>

      {offer && (
        <div className="mx-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-sm">
          {offer.by === me ? (
            <>
              <span>Đang chờ {NAME[other(me)]} đồng ý hòa ⏳</span>
              <button onClick={() => answer(false)} disabled={busy} className="text-zinc-500 underline">
                Rút lại
              </button>
            </>
          ) : (
            <>
              <span>
                <b>{NAME[offer.by]}</b> xin hòa 🤝
              </span>
              <button
                onClick={() => answer(true)}
                disabled={busy}
                className="rounded-full bg-rose-500 px-3 py-1 font-semibold text-white"
              >
                Đồng ý
              </button>
              <button
                onClick={() => answer(false)}
                disabled={busy}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-zinc-600"
              >
                Đánh tiếp
              </button>
            </>
          )}
        </div>
      )}

      <Board
        board={game.board}
        selected={selected}
        ghost={PIECE[me]}
        last={last}
        winLine={game.winLine}
        playable={myTurn}
        onCell={tapCell}
      />

      <p className="min-h-5 text-center text-sm text-zinc-500">
        {toast ? (
          <span className="text-pink-500">{toast}</span>
        ) : myTurn ? (
          selected !== null ? (
            "Bấm lần nữa vào ô đó để đặt quân ✅"
          ) : (
            "Bấm một ô để chọn"
          )
        ) : (
          !playing && endText(game)
        )}
      </p>

      {playing && game.moves.length > 0 && (
        <div className="flex justify-center gap-4 text-sm">
          {!offer && (
            <button onClick={askDraw} disabled={busy} className="text-zinc-500 underline hover:text-zinc-700">
              🤝 Xin hòa
            </button>
          )}
          <button onClick={giveUp} disabled={busy} className="text-zinc-500 underline hover:text-zinc-700">
            🏳️ Đầu hàng
          </button>
        </div>
      )}

      {!playing && (
        <button
          onClick={startNewGame}
          disabled={busy}
          className="mx-auto rounded-full bg-rose-500 px-6 py-2 font-semibold text-white shadow hover:bg-rose-600 disabled:opacity-60"
        >
          Ván mới · {NAME[nextStarter]} đi trước
        </button>
      )}
    </main>
  );
}
