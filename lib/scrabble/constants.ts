// Scrabble with Love — the official Scrabble board and tile set.
// Plain data only; the rules live in engine.ts.

export const BOARD_SIZE = 15;
export const CENTER = 7 * BOARD_SIZE + 7; // the ★ square, index 112
export const RACK_SIZE = 7;
export const BINGO_BONUS = 50; // all 7 tiles in one turn
export const MIN_BAG_TO_EXCHANGE = 7;
export const MAX_SCORELESS_TURNS = 6; // across both players → game over
export const BLANK = "?"; // a blank tile on a rack

// 100 tiles: letter → [count, points]. Blanks are worth 0.
export const TILES: Record<string, readonly [count: number, points: number]> = {
  A: [9, 1], B: [2, 3], C: [2, 3], D: [4, 2], E: [12, 1], F: [2, 4], G: [3, 2],
  H: [2, 4], I: [9, 1], J: [1, 8], K: [1, 5], L: [4, 1], M: [2, 3], N: [6, 1],
  O: [8, 1], P: [2, 3], Q: [1, 10], R: [6, 1], S: [4, 1], T: [6, 1], U: [4, 1],
  V: [2, 4], W: [2, 4], X: [1, 8], Y: [2, 4], Z: [1, 10],
  [BLANK]: [2, 0],
};

// Points for a rack tile ("A".."Z" or "?") or a board cell. On the board a
// lowercase letter is a blank played as that letter, so it scores 0.
export function tilePoints(tile: string): number {
  if (tile === BLANK || (tile >= "a" && tile <= "z")) return 0;
  return TILES[tile]?.[1] ?? 0;
}

export type Premium = "" | "2L" | "3L" | "2W" | "3W";

// Premium squares of the top-left quarter (rows/cols 0–7, ★ counts as 2W).
// The board is symmetric, so the rest is mirrored from these.
const QUARTER: Record<Exclude<Premium, "">, [row: number, col: number][]> = {
  "3W": [[0, 0], [0, 7], [7, 0]],
  "2W": [[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]],
  "3L": [[1, 5], [5, 1], [5, 5]],
  "2L": [[0, 3], [2, 6], [3, 0], [3, 7], [6, 2], [6, 6], [7, 3]],
};

// PREMIUMS[row * 15 + col] — the standard board: 8×3W, 17×2W, 12×3L, 24×2L.
export const PREMIUMS: readonly Premium[] = (() => {
  const board: Premium[] = Array(BOARD_SIZE * BOARD_SIZE).fill("");
  const last = BOARD_SIZE - 1;
  for (const [premium, cells] of Object.entries(QUARTER) as [Premium, [number, number][]][]) {
    for (const [r, c] of cells) {
      for (const [rr, cc] of [[r, c], [r, last - c], [last - r, c], [last - r, last - c]]) {
        board[rr * BOARD_SIZE + cc] = premium;
      }
    }
  }
  return board;
})();
