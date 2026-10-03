"use client";

import { useEffect, useRef, useState } from "react";
import Board from "./Board";
import {
  PIECE,
  newGame,
  nextGame,
  place,
  type CaroState,
  type Player,
  type StateResult,
} from "@/lib/caro/engine";

const NAME: Record<Player, string> = { nam: "🐻 Nam", linh: "🧸 Linh" };

const END_TEXT = {
  five: "5 quân liền nhau 🎯",
  full: "Bàn cờ đã kín ô",
  agreed: "Hai bạn đồng ý hòa 🤝",
  resign: "Có người đầu hàng 🏳️",
} as const;

// Step 2: local only — one screen, both players take turns on it.
// Step 3 moves the game into Firestore (caro_game/shared).
export default function CaroPage() {
  const [game, setGame] = useState<CaroState>(() => newGame("linh"));
  return (
    <CaroGame
      key={`${game.startedBy}:${game.moves.length}:${game.status}`}
      game={game}
      run={(move) => {
        const res = move(game);
        if (res.ok) setGame(res.state);
        return res;
      }}
      startNewGame={() => setGame(nextGame(game))}
    />
  );
}

function CaroGame({
  game,
  run,
  startNewGame,
}: {
  game: CaroState;
  run: (move: (s: CaroState) => StateResult) => StateResult;
  startNewGame: () => void;
}) {
  const me = game.turn; // local: whoever's turn it is plays
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };

  const playing = game.status === "playing";

  const tapCell = (i: number) => {
    if (!playing || game.board[i] !== "") return;
    if (selected !== i) {
      setSelected(i); // click 1: select (or move the selection)
      return;
    }
    const res = run((s) => place(s, me, i)); // click 2: place
    if (!res.ok) say(res.reason);
  };

  const last = game.moves.length ? game.moves[game.moves.length - 1] : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-8">
      <h1 className="text-center text-3xl font-bold text-zinc-800">Cờ caro 🐻🧸</h1>

      <p className="text-center text-sm text-zinc-500">
        {NAME.nam}: <b className="text-rose-500">X</b> · {NAME.linh}: <b className="text-sky-500">O</b>
      </p>

      <p className="min-h-6 text-center" role="status">
        {playing ? (
          <>
            Lượt của <b>{NAME[game.turn]}</b> (
            <b className={PIECE[game.turn] === "x" ? "text-rose-500" : "text-sky-500"}>
              {PIECE[game.turn].toUpperCase()}
            </b>
            )
            {game.moves.length === 0 && (
              <span className="text-zinc-500"> · {NAME[game.startedBy]} đi trước ván này</span>
            )}
          </>
        ) : game.winner ? (
          <b>{NAME[game.winner]} thắng! 🎉</b>
        ) : (
          <b>Hòa 🤝</b>
        )}
      </p>

      <Board
        board={game.board}
        selected={selected}
        ghost={PIECE[me]}
        last={last}
        winLine={game.winLine}
        onCell={tapCell}
      />

      <p className="min-h-5 text-center text-sm text-zinc-500">
        {toast ? (
          <span className="text-pink-500">{toast}</span>
        ) : playing ? (
          selected !== null ? (
            "Bấm lần nữa vào ô đó để đặt quân ✅"
          ) : (
            "Bấm một ô để chọn"
          )
        ) : (
          game.endReason && END_TEXT[game.endReason]
        )}
      </p>

      {!playing && (
        <button
          onClick={startNewGame}
          className="mx-auto rounded-full bg-rose-500 px-6 py-2 font-semibold text-white shadow hover:bg-rose-600"
        >
          Ván mới · {NAME[game.startedBy === "nam" ? "linh" : "nam"]} đi trước
        </button>
      )}
    </main>
  );
}
