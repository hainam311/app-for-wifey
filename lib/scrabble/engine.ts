import type { Who } from "@/lib/session"; // type-only: safe in client code
import { BOARD_SIZE, RACK_SIZE, TILES } from "./constants";

// Scrabble with Love — pure game rules. No Firestore in here: the page runs
// these inside a transaction and writes the returned state to
// scrabble_game/shared, so both phones always play against the truth.
export type Player = Who;

// "A".."Z" = normal tile, "?" = blank (racks and bag only).
export type Tile = string;
// "" = empty, "A".."Z" = normal tile, "a".."z" = blank played as that letter.
export type Cell = string;

export type Move = {
  by: Player;
  type: "play" | "exchange" | "pass";
  words?: { word: string; score: number }[];
  cells?: number[]; // board indexes placed this turn (for highlighting)
  bingo?: boolean;
  total: number;
  at: number;
};

export type ScrabbleState = {
  board: Cell[]; // 225 cells, index = row * 15 + col (Firestore has no nested arrays)
  bag: Tile[]; // already shuffled; draw from the end
  racks: Record<Player, Tile[]>;
  turn: Player;
  scores: Record<Player, number>;
  status: "playing" | "finished";
  startedBy: Player; // who went first; the next game alternates
  scorelessTurns: number; // consecutive, across both players
  history: Move[];
  endReason?: "out" | "six-scoreless";
  updatedAt: number;
};

export const other = (p: Player): Player => (p === "nam" ? "linh" : "nam");

// `random` is injectable so tests can be repeatable.
function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// All 100 tiles, unshuffled.
export function fullTileSet(): Tile[] {
  return Object.entries(TILES).flatMap(([tile, [count]]) => Array<Tile>(count).fill(tile));
}

export function newGame(
  startedBy: Player,
  now = Date.now(),
  random: () => number = Math.random
): ScrabbleState {
  const bag = shuffle(fullTileSet(), random);
  const deal = () => bag.splice(bag.length - RACK_SIZE, RACK_SIZE);
  const first = deal(); // the starter is dealt first, as at a real table
  const second = deal();
  return {
    board: Array<Cell>(BOARD_SIZE * BOARD_SIZE).fill(""),
    bag,
    racks: { [startedBy]: first, [other(startedBy)]: second } as Record<Player, Tile[]>,
    turn: startedBy,
    scores: { nam: 0, linh: 0 },
    status: "playing",
    startedBy,
    scorelessTurns: 0,
    history: [],
    updatedAt: now,
  };
}
