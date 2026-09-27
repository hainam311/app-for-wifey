import { tilePoints } from "@/lib/scrabble/constants";
import type { Tile } from "@/lib/scrabble/engine";

// The player's tiles. `order` is the display order (🔀 Xáo only reorders the
// screen, never the saved rack). Tiles already put on the board this turn are
// shown as empty slots.
export default function Rack({
  tiles,
  order,
  used,
  selected,
  marked,
  onTap,
}: {
  tiles: Tile[];
  order: number[];
  used: Set<number>; // rack slots placed on the board this turn
  selected: number | null;
  marked: Set<number>; // slots picked for an exchange
  onTap: (slot: number) => void;
}) {
  return (
    <div role="group" aria-label="Giá chữ" className="flex justify-center gap-1.5">
      {order.map((slot) => {
        const tile = tiles[slot];
        if (used.has(slot)) {
          return <div key={slot} className="h-12 w-11 rounded-lg border-2 border-dashed border-amber-200" />;
        }
        const isSelected = selected === slot;
        const isMarked = marked.has(slot);
        return (
          <button
            key={slot}
            onClick={() => onTap(slot)}
            aria-label={tile === "?" ? "chữ trống" : tile}
            aria-pressed={isSelected || isMarked}
            className={`relative flex h-12 w-11 items-center justify-center rounded-lg text-2xl font-bold shadow-sm transition-all active:scale-95 ${
              isMarked
                ? "-translate-y-1 bg-rose-200 text-zinc-800 ring-2 ring-rose-400"
                : isSelected
                  ? "-translate-y-1 bg-amber-200 text-zinc-800 ring-2 ring-pink-500"
                  : "bg-amber-100 text-zinc-800"
            }`}
          >
            {tile === "?" ? <span className="text-pink-400">✱</span> : tile}
            {tile !== "?" && (
              <span className="absolute right-1 bottom-0.5 text-[10px] font-medium text-zinc-500">
                {tilePoints(tile)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
