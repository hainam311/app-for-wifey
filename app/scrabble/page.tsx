"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe } from "@/lib/useMe";
import { BOARD_SIZE, CENTER, MIN_BAG_TO_EXCHANGE } from "@/lib/scrabble/constants";
import { isWordIn, loadDictionary } from "@/lib/scrabble/dictionary";
import { gameRef } from "@/lib/scrabble/gameDoc";
import {
  answerEnd,
  applyExchange,
  applyPass,
  applyPlay,
  canOfferEnd,
  evaluatePlay,
  newGame,
  other,
  proposeEnd,
  winner,
  type Placement,
  type Player,
  type ScrabbleState,
  type StateResult,
} from "@/lib/scrabble/engine";
import Board from "./Board";
import Rack from "./Rack";

// One async game shared by both phones in scrabble_game/shared. Every move is
// a transaction that re-reads the doc and runs the engine against that, so
// the rules always check the latest board — never a stale copy on screen.
const FIRST_EVER_STARTER: Player = "linh"; // ladies first 💕

// A rule refusal (not your turn, word not in the dictionary…) — shown as a toast.
class GameRuleError extends Error {}

const NAME: Record<Player, string> = { nam: "Nam", linh: "Linh" };
const ICON: Record<Player, string> = { nam: "🐻", linh: "🧸" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type Pending = Placement & { slot: number }; // `slot` = where it came from on the rack

export default function ScrabblePage() {
  const me = useMe();
  const [game, setGame] = useState<ScrabbleState | null>(null);
  const [words, setWords] = useState<Set<string> | null>(null);
  const [dictError, setDictError] = useState(false);

  const fetchWords = () =>
    loadDictionary()
      .then(setWords)
      .catch((err) => {
        console.error("Could not load the word list:", err);
        setDictError(true);
      });

  // Load the shared game (realtime!) and the word list; create the game the
  // first time. Only in the browser, so the deal isn't shuffled twice.
  useEffect(() => {
    fetchWords();
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(gameRef, (snap) => {
        if (snap.exists()) {
          setGame(snap.data() as ScrabbleState);
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
        <h1 className="text-3xl font-bold text-zinc-800">Scrabble with Love 💌</h1>
        <Link href="/lock?next=/scrabble" className="py-12 text-rose-500 underline">
          Chưa biết máy của ai 🤔 Mở khoá lại nhé
        </Link>
      </main>
    );
  }

  if (!game || !words || me === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
        <h1 className="text-center text-3xl font-bold text-zinc-800">Scrabble with Love 💌</h1>
        {dictError ? (
          <button
            onClick={() => {
              setDictError(false);
              fetchWords();
            }}
            className="py-12 text-center text-rose-500 underline"
          >
            Không tải được từ điển, thử lại 🔄
          </button>
        ) : (
          <p className="py-12 text-center text-gray-400">Đang tải...</p>
        )}
      </main>
    );
  }
  // A new key after every move (and new game / game over) remounts the game
  // view, which clears the half-built move, selection, zoom and rack order.
  // Not keyed on updatedAt: a "Kết thúc ván" request must not wipe the other
  // player's half-built move.
  return (
    <ScrabbleGame
      key={`${game.startedBy}:${game.history.length}:${game.status}`}
      game={game}
      me={me}
      words={words}
    />
  );
}

function ScrabbleGame({ game, me, words }: { game: ScrabbleState; me: Player; words: Set<string> }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [blankAt, setBlankAt] = useState<{ slot: number; index: number } | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(false);
  const [shuffled, setShuffled] = useState<{ key: string; order: number[] } | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const boardBox = useRef<HTMLDivElement>(null);
  const autoZoomed = useRef(false); // auto-zoom once per turn; after that the 🔍 button decides

  const rack = game.racks[me]; // only ever your own rack
  const rackKey = `${game.history.length}:${me}`;
  const order =
    shuffled?.key === rackKey && shuffled.order.length === rack.length
      ? shuffled.order
      : rack.map((_, i) => i);
  const used = new Set(pending.map((p) => p.slot));
  const lastMove = game.history.at(-1)?.cells ?? [];
  const finished = game.status === "finished";
  const myTurn = !finished && game.turn === me;

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // When zooming in, scroll to where the action is.
  useEffect(() => {
    const box = boardBox.current;
    if (!zoom || !box) return;
    const filled = game.board.flatMap((c, i) => (c ? [i] : []));
    const focus = pending.at(-1)?.index ?? (filled.length ? filled[Math.floor(filled.length / 2)] : CENTER);
    const cell = box.scrollWidth / BOARD_SIZE;
    box.scrollTo({
      left: (focus % BOARD_SIZE + 0.5) * cell - box.clientWidth / 2,
      top: (Math.floor(focus / BOARD_SIZE) + 0.5) * cell - box.clientHeight / 2,
    });
    // Only on zoom changes: following every tap would pull the board away from the finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const showToast = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  // Runs one move as a transaction against the latest saved game. On success
  // the snapshot brings the new state back and the view resets itself (see
  // the key above); on a refusal the half-built move stays so it can be fixed.
  const run = async (move: (state: ScrabbleState) => StateResult) => {
    if (busy) return;
    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new GameRuleError("Ván này không còn nữa, tải lại trang nhé 🔄");
        const result = move(snap.data() as ScrabbleState);
        if (!result.ok) throw new GameRuleError(result.reason);
        tx.set(gameRef, result.state);
      });
    } catch (err) {
      if (err instanceof GameRuleError) showToast(err.message);
      else {
        console.error("Move failed:", err);
        showToast("Có lỗi gì đó, thử lại nhé 🥺");
      }
    } finally {
      setBusy(false);
    }
  };

  const tapRack = (slot: number) => {
    if (finished) return;
    if (!myTurn) return showToast(`Đợi ${NAME[game.turn]} đánh xong đã nhé ⏳`);
    if (exchanging) {
      const next = new Set(marked);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      setMarked(next);
      return;
    }
    const picking = selected !== slot;
    setSelected(picking ? slot : null);
    if (picking && !zoom && !autoZoomed.current) {
      autoZoomed.current = true;
      setZoom(true);
    }
  };

  const tapCell = (index: number) => {
    if (finished || exchanging) return;
    if (!myTurn) return showToast(`Đợi ${NAME[game.turn]} đánh xong đã nhé ⏳`);
    const mine = pending.find((p) => p.index === index);
    if (mine) {
      setPending(pending.filter((p) => p !== mine)); // tap a tile placed this turn → back to the rack
      return;
    }
    if (game.board[index]) return;
    if (selected === null) return showToast("Chọn một chữ trên giá trước nhé 👇");
    if (rack[selected] === "?") {
      setBlankAt({ slot: selected, index });
    } else {
      setPending([...pending, { slot: selected, index, tile: rack[selected] }]);
    }
    setSelected(null);
  };

  const chooseBlank = (letter: string) => {
    if (!blankAt) return;
    setPending([...pending, { ...blankAt, tile: "?", as: letter }]);
    setBlankAt(null);
  };

  const play = () => {
    const placements = pending.map(({ index, tile, as }) => (as ? { index, tile, as } : { index, tile }));
    run((state) => applyPlay(state, me, placements, isWordIn(words)));
  };

  const exchange = () => {
    const tiles = [...marked].map((slot) => rack[slot]);
    run((state) => applyExchange(state, me, tiles));
  };

  const pass = () => {
    if (window.confirm("Bỏ lượt này hả? 🥺")) run((state) => applyPass(state, me));
  };

  const askToEnd = () => {
    if (window.confirm(`Kết thúc ván này? ${NAME[other(me)]} cần đồng ý nữa nhé 🏁`)) {
      run((state) => proposeEnd(state, me));
    }
  };

  const answerToEnd = (agree: boolean) => run((state) => answerEnd(state, me, agree));

  const startNewGame = async () => {
    if (!finished && game.history.length > 0 && !window.confirm("Bỏ ván này hả? 🥺")) return;
    try {
      await setDoc(gameRef, newGame(other(game.startedBy)));
    } catch (err) {
      console.error("Could not start a new game:", err);
      showToast("Có lỗi gì đó, thử lại nhé 🥺");
    }
  };

  // Live preview of the move being built (same rules the real move uses).
  const preview = pending.length > 0 ? evaluatePlay(game.board, pending, isWordIn(words)) : null;
  const result = finished ? winner(game) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-center text-3xl font-bold text-zinc-800">Scrabble with Love 💌</h1>

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-4 text-lg">
        <span className={!finished && game.turn === "nam" ? "font-bold text-pink-500" : "text-gray-500"}>
          {NAME.nam} {ICON.nam} {game.scores.nam}
        </span>
        <span className="text-gray-300">—</span>
        <span className={!finished && game.turn === "linh" ? "font-bold text-pink-500" : "text-gray-500"}>
          {game.scores.linh} {ICON.linh} {NAME.linh}
        </span>
      </div>

      {finished ? (
        <div className="rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-pink-200">
          {result === "tie" ? "Hoà nhau, cả hai đều giỏi 💞" : `${NAME[result as Player]} thắng rồi! 🏆`}
          <p className="mt-1 text-sm font-normal opacity-90">
            {game.endReason === "agreed"
              ? "Hai đứa đồng ý kết thúc ván 🤝"
              : game.endReason === "out"
                ? `${NAME[game.turn]} hết chữ trước 🎉`
                : "6 lượt liền không ai ghi điểm"}
            {" · "}mỗi người trừ điểm chữ còn trên giá
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500">
          {myTurn ? `Lượt của ${NAME[me]} nè 💕` : `Đợi ${NAME[game.turn]} nhé ⏳`} · Túi còn{" "}
          {game.bag.length} chữ
        </p>
      )}

      {/* A pending "Kết thúc ván" request — shown up here so it's noticed */}
      {!finished && game.endProposal && (
        <div className="rounded-2xl border-2 border-pink-200 bg-pink-50 px-4 py-3 text-center text-sm text-zinc-700">
          {game.endProposal.by === me ? (
            <>
              <p>🏁 Đang chờ {NAME[other(me)]} đồng ý kết thúc ván...</p>
              <button
                onClick={() => answerToEnd(false)}
                disabled={busy}
                className="mt-2 text-pink-500 underline disabled:opacity-40"
              >
                Huỷ, chơi tiếp
              </button>
            </>
          ) : (
            <>
              <p>
                🏁 {NAME[game.endProposal.by]} muốn kết thúc ván. Mỗi người trừ điểm chữ còn trên giá.
              </p>
              <div className="mt-2 flex justify-center gap-2">
                <button
                  onClick={() => answerToEnd(true)}
                  disabled={busy}
                  className="rounded-full bg-pink-500 px-4 py-1.5 font-semibold text-white active:scale-95 disabled:opacity-40"
                >
                  Đồng ý 🤝
                </button>
                <button
                  onClick={() => answerToEnd(false)}
                  disabled={busy}
                  className="rounded-full border-2 border-pink-300 bg-white px-4 py-1.5 font-semibold text-pink-500 active:scale-95 disabled:opacity-40"
                >
                  Chơi tiếp 💪
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Board
          board={game.board}
          pending={pending}
          lastMove={lastMove}
          zoom={zoom}
          onCell={tapCell}
          scrollRef={boardBox}
        />
        <div className="flex justify-between">
          <Link
            href="/scrabble/tu-dien"
            className="rounded-full border border-pink-200 bg-white px-3 py-1 text-sm text-pink-500 active:scale-95"
          >
            📖 Từ điển
          </Link>
          <button
            onClick={() => {
              autoZoomed.current = true; // the player chose; stop auto-zooming this turn
              setZoom(!zoom);
            }}
            className="rounded-full border border-pink-200 bg-white px-3 py-1 text-sm text-pink-500 active:scale-95"
          >
            {zoom ? "🔍 Thu nhỏ" : "🔍 Phóng to"}
          </button>
        </div>
      </div>

      {/* Move preview / status */}
      <p className="min-h-6 text-center text-sm">
        {exchanging ? (
          <span className="text-gray-500">Chạm các chữ muốn đổi ({marked.size} chữ)</span>
        ) : preview ? (
          preview.ok ? (
            <span className="font-semibold text-pink-600">
              {preview.words.map((w) => w.word).join(" + ")}
              {preview.bingo && " + 50 🎉"} = {preview.total} điểm
            </span>
          ) : (
            <span className="text-gray-400">{preview.reason}</span>
          )
        ) : (
          myTurn && <span className="text-gray-400">Chạm một chữ, rồi chạm ô trên bàn</span>
        )}
      </p>

      {!finished && (
        <Rack tiles={rack} order={order} used={used} selected={selected} marked={marked} onTap={tapRack} />
      )}

      {toast && <p className="text-center text-sm text-pink-500">{toast}</p>}

      {/* Actions */}
      {!finished &&
        (exchanging ? (
          <div className="flex justify-center gap-2">
            <button
              onClick={exchange}
              disabled={marked.size === 0 || busy}
              className="rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all active:scale-95 disabled:opacity-40"
            >
              Đổi {marked.size} chữ 🔄
            </button>
            <button
              onClick={() => {
                setExchanging(false);
                setMarked(new Set());
              }}
              className="rounded-full border-2 border-pink-300 bg-white px-5 py-3 font-semibold text-pink-500 active:scale-95"
            >
              Huỷ
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={play}
              disabled={!myTurn || !preview?.ok || busy}
              className="rounded-full bg-pink-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? "Đang gửi..." : myTurn ? `Đánh ${preview?.ok ? `+${preview.total} ` : ""}💌` : `Đợi ${NAME[game.turn]} nhé ⏳`}
            </button>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              <button
                onClick={() => setShuffled({ key: rackKey, order: shuffle(order) })}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95"
              >
                🔀 Xáo
              </button>
              <button
                onClick={() => {
                  setPending([]);
                  setSelected(null);
                }}
                disabled={pending.length === 0}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95 disabled:opacity-40"
              >
                ↩️ Rút lại
              </button>
              <button
                onClick={() => {
                  setPending([]);
                  setSelected(null);
                  setExchanging(true);
                }}
                disabled={!myTurn || game.bag.length < MIN_BAG_TO_EXCHANGE}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95 disabled:opacity-40"
              >
                🔄 Đổi chữ
              </button>
              <button
                onClick={pass}
                disabled={!myTurn || busy}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95 disabled:opacity-40"
              >
                ⏭️ Bỏ lượt
              </button>
            </div>
          </div>
        ))}

      {/* Recent moves, newest first */}
      {game.history.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-gray-500">
          {game.history
            .slice(-5)
            .reverse()
            .map((m, i) => (
              <li key={game.history.length - i}>
                {ICON[m.by]} {NAME[m.by]}:{" "}
                {m.type === "play"
                  ? `${m.words?.map((w) => w.word).join(", ")} +${m.total}${m.bingo ? " 🎉" : ""}`
                  : m.type === "exchange"
                    ? "đổi chữ"
                    : "bỏ lượt"}
              </li>
            ))}
        </ul>
      )}

      {/* Near the end (a rack under 5 tiles), either player can ask to stop */}
      {canOfferEnd(game) && !game.endProposal && (
        <button
          onClick={askToEnd}
          disabled={busy}
          className="mx-auto text-sm text-gray-400 underline active:scale-95 disabled:opacity-40"
        >
          🏁 Kết thúc ván
        </button>
      )}

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

      {/* Blank tile: pick the letter it stands for */}
      {blankAt && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <p className="mb-3 text-center font-semibold text-zinc-700">Chữ trống này là chữ gì? 🔤</p>
            <div className="grid grid-cols-7 gap-1.5">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  onClick={() => chooseBlank(l)}
                  className="rounded-lg bg-amber-100 py-2 text-lg font-bold text-pink-500 active:scale-95"
                >
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => setBlankAt(null)} className="mt-3 w-full py-2 text-sm text-gray-400">
              Huỷ
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
