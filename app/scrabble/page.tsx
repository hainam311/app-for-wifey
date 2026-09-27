"use client";
import { useEffect, useRef, useState } from "react";
import { BOARD_SIZE, CENTER, MIN_BAG_TO_EXCHANGE } from "@/lib/scrabble/constants";
import { isWordIn, loadDictionary } from "@/lib/scrabble/dictionary";
import {
  applyExchange,
  applyPass,
  applyPlay,
  evaluatePlay,
  newGame,
  other,
  winner,
  type Placement,
  type Player,
  type ScrabbleState,
  type StateResult,
} from "@/lib/scrabble/engine";
import Board from "./Board";
import Rack from "./Rack";

// Step 4: the game runs on local state only — one phone, both players take
// turns on it, nothing is saved. Step 5 moves the state to Firestore.

const NAME: Record<Player, string> = { nam: "Nam", linh: "Linh" };
const ICON: Record<Player, string> = { nam: "🐻", linh: "🧸" };
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type Pending = Placement & { slot: number }; // `slot` = where it came from on the rack

export default function ScrabblePage() {
  // The game is dealt in the browser once the word list is ready — dealing
  // during server rendering would shuffle a different rack than the phone.
  const [game, setGame] = useState<ScrabbleState | null>(null);
  const [words, setWords] = useState<Set<string> | null>(null);
  const [dictError, setDictError] = useState(false);

  const fetchWords = () =>
    loadDictionary()
      .then((loaded) => {
        setWords(loaded);
        setGame((g) => g ?? newGame("linh"));
      })
      .catch((err) => {
        console.error("Could not load the word list:", err);
        setDictError(true);
      });
  useEffect(() => {
    fetchWords();
  }, []);

  if (!game || !words) {
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
          <p className="py-12 text-center text-gray-400">Đang tải từ điển...</p>
        )}
      </main>
    );
  }
  return <ScrabbleGame game={game} setGame={setGame} words={words} />;
}

function ScrabbleGame({
  game,
  setGame,
  words,
}: {
  game: ScrabbleState;
  setGame: (state: ScrabbleState) => void;
  words: Set<string>;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [blankAt, setBlankAt] = useState<{ slot: number; index: number } | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(false);
  const [shuffled, setShuffled] = useState<{ key: string; order: number[] } | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const boardBox = useRef<HTMLDivElement>(null);
  const autoZoomed = useRef(false); // auto-zoom once per turn; after that the 🔍 button decides

  const me = game.turn; // Step 4: whoever's turn it is plays on this phone
  const rack = game.racks[me];
  const rackKey = `${game.history.length}:${me}`;
  const order =
    shuffled?.key === rackKey && shuffled.order.length === rack.length
      ? shuffled.order
      : rack.map((_, i) => i);
  const used = new Set(pending.map((p) => p.slot));
  const lastMove = game.history.at(-1)?.cells ?? [];
  const finished = game.status === "finished";

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

  const resetTurn = () => {
    setPending([]);
    setSelected(null);
    setBlankAt(null);
    setExchanging(false);
    setMarked(new Set());
    setZoom(false);
    autoZoomed.current = false;
  };

  const commit = (result: StateResult) => {
    if (!result.ok) return showToast(result.reason);
    setGame(result.state);
    resetTurn();
  };

  const tapRack = (slot: number) => {
    if (finished) return;
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
    commit(applyPlay(game, me, pending.map(({ index, tile, as }) => ({ index, tile, as })), isWordIn(words)));
  };

  const exchange = () => commit(applyExchange(game, me, [...marked].map((slot) => rack[slot])));

  const pass = () => {
    if (window.confirm("Bỏ lượt này hả? 🥺")) commit(applyPass(game, me));
  };

  const startNewGame = () => {
    if (!finished && game.history.length > 0 && !window.confirm("Bỏ ván này hả? 🥺")) return;
    setGame(newGame(other(game.startedBy)));
    resetTurn();
  };

  // Live preview of the move being built (same rules the real move uses).
  const preview = pending.length > 0 ? evaluatePlay(game.board, pending, isWordIn(words)) : null;
  const result = finished ? winner(game) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <h1 className="text-center text-3xl font-bold text-zinc-800">Scrabble with Love 💌</h1>
      <p className="-mt-2 text-center text-xs text-amber-600">
        Bản chơi thử trên một máy — chưa lưu ván 🧪
      </p>

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
        </div>
      ) : (
        <p className="text-center text-sm text-gray-500">
          Lượt của {NAME[me]} {ICON[me]} · Túi còn {game.bag.length} chữ
        </p>
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
        <div className="flex justify-end">
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
          !finished && <span className="text-gray-400">Chạm một chữ, rồi chạm ô trên bàn</span>
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
              disabled={marked.size === 0}
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
              disabled={!preview?.ok}
              className="rounded-full bg-pink-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              Đánh {preview?.ok ? `+${preview.total}` : ""} 💌
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
                disabled={game.bag.length < MIN_BAG_TO_EXCHANGE}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95 disabled:opacity-40"
              >
                🔄 Đổi chữ
              </button>
              <button
                onClick={pass}
                className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-pink-500 active:scale-95"
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
