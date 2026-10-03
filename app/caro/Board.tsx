import { SIZE, type Cell, type Piece } from "@/lib/caro/engine";

const PIECE_STYLE: Record<Piece, string> = {
  x: "text-rose-500",
  o: "text-sky-500",
};

const center = (i: number) => ({ x: (i % SIZE) + 0.5, y: Math.floor(i / SIZE) + 0.5 });

// The 15×15 paper-caro board. Click 1 on an empty cell = select (faded piece),
// click 2 on the same cell = place. A finished game gets a stripe through the
// winning row.
export default function Board({
  board,
  selected,
  ghost,
  last,
  winLine,
  playable,
  onCell,
}: {
  board: Cell[];
  selected: number | null;
  ghost: Piece; // what the selected cell would become
  last: number | null;
  winLine?: number[];
  playable: boolean; // false when the game is over: no hover, no pointer
  onCell: (index: number) => void;
}) {
  const from = winLine && center(winLine[0]);
  const to = winLine && center(winLine[winLine.length - 1]);
  return (
    // Width capped by the screen height too, so the whole board + buttons fit on a laptop.
    <div className="relative mx-auto aspect-square w-full max-w-[calc(100svh-15rem)] rounded-lg bg-sky-200 p-px">
      <div
        role="group"
        aria-label="Bàn cờ"
        className="grid h-full w-full gap-px"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${SIZE}, minmax(0, 1fr))`,
        }}
      >
        {board.map((cell, i) => {
          const isSelected = i === selected && cell === "";
          const shown = cell || (isSelected ? ghost : "");
          return (
            <button
              key={i}
              onClick={() => onCell(i)}
              aria-label={`Hàng ${Math.floor(i / SIZE) + 1} cột ${(i % SIZE) + 1}: ${
                cell ? cell.toUpperCase() : isSelected ? "đang chọn" : "trống"
              }`}
              aria-pressed={isSelected}
              className={`flex items-center justify-center font-bold leading-none text-[min(4.4vw,1.6rem)] ${
                shown ? PIECE_STYLE[shown] : ""
              } ${
                isSelected
                  ? "bg-amber-50 ring-2 ring-amber-400 ring-inset"
                  : i === last
                    ? "bg-amber-100"
                    : cell || !playable
                      ? "bg-white"
                      : "bg-white hover:bg-amber-50"
              } ${cell || !playable ? "cursor-default" : ""}`}
            >
              {shown ? <span className={isSelected ? "opacity-40" : ""}>{shown.toUpperCase()}</span> : null}
            </button>
          );
        })}
      </div>
      {from && to && (
        // Same 15×15 coordinate space as the cells; pointer-events off so it never eats a click.
        <svg
          aria-hidden
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="pointer-events-none absolute inset-px h-[calc(100%-2px)] w-[calc(100%-2px)]"
          data-testid="win-stripe"
        >
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="#f59e0b"
            strokeOpacity={0.7}
            strokeWidth={0.28}
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
