import type { Ref } from "react";
import { BOARD_SIZE, CENTER, PREMIUMS, tilePoints, type Premium } from "@/lib/scrabble/constants";
import type { Cell, Placement } from "@/lib/scrabble/engine";

const PREMIUM_STYLE: Record<Exclude<Premium, "">, string> = {
  "3W": "bg-rose-400 text-white",
  "2W": "bg-pink-200 text-pink-700",
  "3L": "bg-sky-500 text-white",
  "2L": "bg-sky-200 text-sky-700",
};

// The 15×15 board. Fits the screen width normally; zoomed, it's ~2× inside a
// square scroll box so tiles are big enough to tap.
export default function Board({
  board,
  pending,
  lastMove,
  zoom,
  onCell,
  scrollRef,
}: {
  board: Cell[];
  pending: Placement[];
  lastMove: number[];
  zoom: boolean;
  onCell: (index: number) => void;
  scrollRef: Ref<HTMLDivElement>;
}) {
  const pendingAt = new Map(pending.map((p) => [p.index, p]));
  const last = new Set(lastMove);
  return (
    <div
      ref={scrollRef}
      className={`aspect-square w-full rounded-xl bg-pink-100 p-0.5 ${zoom ? "overflow-auto" : "overflow-hidden"}`}
    >
      <div
        role="group"
        aria-label="Bàn chơi"
        className="grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
          width: zoom ? `${BOARD_SIZE * 2.4}rem` : "100%",
        }}
      >
        {board.map((cell, i) => {
          const p = pendingAt.get(i);
          // What to show: a tile placed this turn, a tile already on the board, or the square.
          const tile = p ? (p.tile === "?" ? (p.as ?? "").toLowerCase() : p.tile) : cell;
          const premium = PREMIUMS[i];
          const blank = tile !== "" && tile === tile.toLowerCase();
          const letter = tile.toUpperCase();
          return (
            <button
              key={i}
              onClick={() => onCell(i)}
              aria-label={tile ? `${letter}${blank ? " (chữ trống)" : ""}` : premium || "ô trống"}
              className={`relative flex aspect-square items-center justify-center rounded-[3px] font-bold leading-none ${
                zoom ? "text-lg" : "text-[11px] sm:text-sm"
              } ${
                tile
                  ? p
                    ? "bg-amber-200 text-zinc-800 ring-2 ring-pink-500 ring-inset"
                    : last.has(i)
                      ? "bg-amber-100 text-zinc-800 ring-2 ring-rose-300 ring-inset"
                      : "bg-amber-100 text-zinc-800"
                  : premium
                    ? PREMIUM_STYLE[premium]
                    : "bg-white"
              }`}
            >
              {tile ? (
                <>
                  <span className={blank ? "text-pink-500" : ""}>{letter}</span>
                  {zoom && !blank && (
                    <span className="absolute right-0.5 bottom-0.5 text-[9px] font-medium text-zinc-500">
                      {tilePoints(tile)}
                    </span>
                  )}
                </>
              ) : i === CENTER ? (
                <span className={zoom ? "text-xl" : "text-xs"}>★</span>
              ) : premium ? (
                <span className={`font-semibold ${zoom ? "text-[11px]" : "text-[6px] sm:text-[8px]"}`}>
                  {premium}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
