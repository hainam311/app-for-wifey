import type { Who } from "@/lib/session"; // type-only: safe in client code
import {
  BINGO_BONUS,
  BLANK,
  BOARD_SIZE,
  CENTER,
  END_OFFER_BELOW,
  MAX_SCORELESS_TURNS,
  MIN_BAG_TO_EXCHANGE,
  PREMIUMS,
  RACK_SIZE,
  TILES,
  tilePoints,
} from "./constants";

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
  // "Kết thúc ván" asked by one player, waiting for the other to agree.
  // Any move clears it (someone found a play, so the game goes on).
  endProposal?: { by: Player; at: number };
  endReason?: "out" | "six-scoreless" | "agreed";
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

// ─── Moves ──────────────────────────────────────────────────────────────────

// One tile put on the board this turn. `tile` is what's on the rack ("A".."Z"
// or "?"); for a blank, `as` is the letter it stands for ("A".."Z").
export type Placement = { index: number; tile: Tile; as?: string };

export type WordFound = { word: string; cells: number[] }; // word in UPPERCASE
export type ScoredWord = WordFound & { score: number };
export type PlayEvaluation = { words: ScoredWord[]; bingo: boolean; total: number };

// A refusal carries a Vietnamese reason the page shows as a toast.
export type Result<T> = { ok: true } & T | { ok: false; reason: string };
export type StateResult = Result<{ state: ScrabbleState }>;

export type IsWord = (word: string) => boolean; // gets lowercase words

const LETTER = /^[A-Z]$/;
const row = (i: number) => Math.floor(i / BOARD_SIZE);
const col = (i: number) => i % BOARD_SIZE;
const at = (r: number, c: number) => r * BOARD_SIZE + c;
const inBounds = (r: number, c: number) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;

// What a placement looks like on the board: blanks become lowercase.
const cellFor = (p: Placement): Cell => (p.tile === BLANK ? (p.as ?? "").toLowerCase() : p.tile);

export function placeTiles(board: Cell[], placements: Placement[]): Cell[] {
  const next = [...board];
  for (const p of placements) next[p.index] = cellFor(p);
  return next;
}

export const rackValue = (rack: Tile[]) => rack.reduce((sum, t) => sum + tilePoints(t), 0);

// Checks the shape of a move against the board (not the words).
// `line` is the direction of the main word.
export function validatePlacement(
  board: Cell[],
  placements: Placement[]
): Result<{ line: "row" | "col" }> {
  if (placements.length === 0) return { ok: false, reason: "Chưa đặt chữ nào nè 🤔" };
  if (placements.length > RACK_SIZE) return { ok: false, reason: "Nhiều chữ quá 😵" };
  const seen = new Set<number>();
  for (const p of placements) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= board.length) {
      return { ok: false, reason: "Ô này nằm ngoài bàn 😅" };
    }
    if (seen.has(p.index)) return { ok: false, reason: "Hai chữ cùng một ô rồi 😅" };
    seen.add(p.index);
    if (board[p.index] !== "") return { ok: false, reason: "Ô này có chữ rồi nè 👀" };
    if (p.tile === BLANK && !LETTER.test(p.as ?? "")) {
      return { ok: false, reason: "Chữ trống cần chọn một chữ cái nhé 🔤" };
    }
    if (p.tile !== BLANK && !LETTER.test(p.tile)) return { ok: false, reason: "Chữ này lạ quá 🤔" };
  }

  const rows = new Set(placements.map((p) => row(p.index)));
  const cols = new Set(placements.map((p) => col(p.index)));
  // A single tile counts as a row; findWords still picks up its column word.
  const line = rows.size === 1 ? "row" : cols.size === 1 ? "col" : null;
  if (!line) return { ok: false, reason: "Chữ phải nằm trên một hàng hoặc một cột nha 😝" };

  // No gaps: every square between the first and last new tile is filled,
  // either by a new tile or one already on the board.
  const step = line === "row" ? 1 : BOARD_SIZE;
  const indexes = placements.map((p) => p.index);
  for (let i = Math.min(...indexes); i <= Math.max(...indexes); i += step) {
    if (!seen.has(i) && board[i] === "") {
      return { ok: false, reason: "Các chữ phải liền nhau, không được chừa ô trống 🙅" };
    }
  }

  const firstMove = board.every((c) => c === "");
  if (firstMove) {
    if (!seen.has(CENTER)) return { ok: false, reason: "Từ đầu tiên phải đi qua ô ★ ở giữa nhé ⭐" };
    if (placements.length < 2) return { ok: false, reason: "Từ đầu tiên phải có ít nhất 2 chữ nha" };
  } else {
    const touches = placements.some((p) =>
      [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
        const r = row(p.index) + dr;
        const c = col(p.index) + dc;
        return inBounds(r, c) && board[at(r, c)] !== "";
      })
    );
    if (!touches) return { ok: false, reason: "Từ mới phải nối với chữ trên bàn nhé 🔗" };
  }
  return { ok: true, line };
}

// The full run of tiles through `index` in one direction, on `board`.
function wordThrough(board: Cell[], index: number, dir: "row" | "col"): WordFound {
  const [dr, dc] = dir === "row" ? [0, 1] : [1, 0];
  let r = row(index);
  let c = col(index);
  while (inBounds(r - dr, c - dc) && board[at(r - dr, c - dc)] !== "") {
    r -= dr;
    c -= dc;
  }
  const cells: number[] = [];
  for (; inBounds(r, c) && board[at(r, c)] !== ""; r += dr, c += dc) cells.push(at(r, c));
  return { word: cells.map((i) => board[i].toUpperCase()).join(""), cells };
}

// Every word of 2+ letters this move makes: the main word along the line,
// plus a cross word for each new tile that touches tiles across it.
// Assumes validatePlacement already passed.
export function findWords(board: Cell[], placements: Placement[], line: "row" | "col"): WordFound[] {
  const next = placeTiles(board, placements);
  const cross = line === "row" ? "col" : "row";
  return [
    wordThrough(next, placements[0].index, line),
    ...placements.map((p) => wordThrough(next, p.index, cross)),
  ].filter((w) => w.cells.length >= 2);
}

// Official scoring: letter premiums first, then word premiums, and premiums
// only count under tiles placed this turn. `board` is the board BEFORE the move.
export function scoreMove(
  board: Cell[],
  placements: Placement[],
  words: WordFound[]
): PlayEvaluation {
  const next = placeTiles(board, placements);
  const fresh = new Set(placements.map((p) => p.index));
  const scored = words.map((w) => {
    let sum = 0;
    let multiplier = 1;
    for (const i of w.cells) {
      const points = tilePoints(next[i]);
      const premium = fresh.has(i) ? PREMIUMS[i] : "";
      sum += points * (premium === "2L" ? 2 : premium === "3L" ? 3 : 1);
      multiplier *= premium === "2W" ? 2 : premium === "3W" ? 3 : 1;
    }
    return { ...w, score: sum * multiplier };
  });
  const bingo = placements.length === RACK_SIZE;
  const total = scored.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO_BONUS : 0);
  return { words: scored, bingo, total };
}

// Everything about a play that doesn't depend on whose turn it is — the page
// also calls this for the live preview while tiles are being placed.
export function evaluatePlay(
  board: Cell[],
  placements: Placement[],
  isWord: IsWord
): Result<PlayEvaluation> {
  const shape = validatePlacement(board, placements);
  if (!shape.ok) return shape;
  const words = findWords(board, placements, shape.line);
  const bad = words.find((w) => !isWord(w.word.toLowerCase()));
  if (bad) return { ok: false, reason: `${bad.word} không có trong từ điển 🥺` };
  return { ok: true, ...scoreMove(board, placements, words) };
}

// Removes `tiles` from `rack` (as a multiset); null if any tile isn't there.
function takeFromRack(rack: Tile[], tiles: Tile[]): Tile[] | null {
  const left = [...rack];
  for (const t of tiles) {
    const i = left.indexOf(t);
    if (i === -1) return null;
    left.splice(i, 1);
  }
  return left;
}

function checkTurn(state: ScrabbleState, me: Player): string | null {
  if (state.status === "finished") return "Ván này xong rồi, chơi ván mới nhé 🎉";
  if (state.turn !== me) return "Chưa tới lượt nè 😝";
  return null;
}

// Ends the turn: records the move, then either finishes the game or passes
// the turn. `out` = the player who just used their last tile.
function endTurn(state: ScrabbleState, move: Move, out: Player | null): ScrabbleState {
  const s: ScrabbleState = {
    ...withoutProposal(state),
    scorelessTurns: move.total > 0 ? 0 : state.scorelessTurns + 1,
    history: [...state.history, move],
    updatedAt: move.at,
  };
  if (out) {
    // Going out: you gain what's left on the other rack, they lose it.
    const left = rackValue(s.racks[other(out)]);
    return {
      ...s,
      scores: { ...s.scores, [out]: s.scores[out] + left, [other(out)]: s.scores[other(out)] - left },
      status: "finished",
      endReason: "out",
    };
  }
  if (s.scorelessTurns >= MAX_SCORELESS_TURNS) {
    // Six scoreless turns in a row: each player loses their own rack value.
    return {
      ...s,
      scores: { nam: s.scores.nam - rackValue(s.racks.nam), linh: s.scores.linh - rackValue(s.racks.linh) },
      status: "finished",
      endReason: "six-scoreless",
    };
  }
  return { ...s, turn: other(s.turn) };
}

export function applyPlay(
  state: ScrabbleState,
  me: Player,
  placements: Placement[],
  isWord: IsWord,
  now = Date.now()
): StateResult {
  const refused = checkTurn(state, me);
  if (refused) return { ok: false, reason: refused };
  const rackLeft = takeFromRack(state.racks[me], placements.map((p) => p.tile));
  if (!rackLeft) return { ok: false, reason: "Chữ này không có trên giá của bạn 🤔" };
  const play = evaluatePlay(state.board, placements, isWord);
  if (!play.ok) return play;

  const bag = [...state.bag];
  const drawn = bag.splice(Math.max(0, bag.length - (RACK_SIZE - rackLeft.length)));
  const rack = [...rackLeft, ...drawn];
  const move: Move = {
    by: me,
    type: "play",
    words: play.words.map(({ word, score }) => ({ word, score })),
    cells: placements.map((p) => p.index),
    bingo: play.bingo,
    total: play.total,
    at: now,
  };
  const next: ScrabbleState = {
    ...state,
    board: placeTiles(state.board, placements),
    bag,
    racks: { ...state.racks, [me]: rack },
    scores: { ...state.scores, [me]: state.scores[me] + play.total },
  };
  return { ok: true, state: endTurn(next, move, rack.length === 0 ? me : null) };
}

export function applyExchange(
  state: ScrabbleState,
  me: Player,
  tiles: Tile[],
  now = Date.now(),
  random: () => number = Math.random
): StateResult {
  const refused = checkTurn(state, me);
  if (refused) return { ok: false, reason: refused };
  if (tiles.length === 0) return { ok: false, reason: "Chọn chữ muốn đổi nhé 🔄" };
  if (state.bag.length < MIN_BAG_TO_EXCHANGE) {
    return { ok: false, reason: "Túi còn ít hơn 7 chữ, không đổi được nữa 🥺" };
  }
  const rackLeft = takeFromRack(state.racks[me], tiles);
  if (!rackLeft) return { ok: false, reason: "Chữ này không có trên giá của bạn 🤔" };

  // Official order: draw the new tiles first, then return the old ones.
  const bag = [...state.bag];
  const drawn = bag.splice(bag.length - tiles.length);
  const move: Move = { by: me, type: "exchange", total: 0, at: now };
  const next: ScrabbleState = {
    ...state,
    bag: shuffle([...bag, ...tiles], random),
    racks: { ...state.racks, [me]: [...rackLeft, ...drawn] },
  };
  return { ok: true, state: endTurn(next, move, null) };
}

export function applyPass(state: ScrabbleState, me: Player, now = Date.now()): StateResult {
  const refused = checkTurn(state, me);
  if (refused) return { ok: false, reason: refused };
  return { ok: true, state: endTurn(state, { by: me, type: "pass", total: 0, at: now }, null) };
}

// ─── Ending by agreement (the home rules' "no more plays possible") ─────────

// The key is left out entirely, not set to undefined: Firestore rejects
// undefined, and tx.set() replaces the whole doc, so the field disappears.
function withoutProposal(state: ScrabbleState): ScrabbleState {
  const s = { ...state };
  delete s.endProposal;
  return s;
}

// "Kết thúc ván" is offered near the end: once either rack is below
// END_OFFER_BELOW tiles (racks only shrink after the bag runs out).
export const canOfferEnd = (state: ScrabbleState) =>
  state.status === "playing" &&
  (state.racks.nam.length < END_OFFER_BELOW || state.racks.linh.length < END_OFFER_BELOW);

// Ask to end the game. Either player, on either turn. If the other player
// already asked, asking back counts as agreeing.
export function proposeEnd(state: ScrabbleState, me: Player, now = Date.now()): StateResult {
  if (state.status === "finished") return { ok: false, reason: "Ván này xong rồi, chơi ván mới nhé 🎉" };
  if (!canOfferEnd(state)) return { ok: false, reason: "Còn nhiều chữ lắm, chơi tiếp đã nhé 😝" };
  if (state.endProposal?.by === me) return { ok: false, reason: "Đang chờ người kia đồng ý nè ⏳" };
  if (state.endProposal) return answerEnd(state, me, true, now);
  return { ok: true, state: { ...state, endProposal: { by: me, at: now }, updatedAt: now } };
}

// The other player agrees (game over, each loses their own rack value, as in
// the official home rules) or says no (play on). The asker can also take the
// request back with agree = false.
export function answerEnd(state: ScrabbleState, me: Player, agree: boolean, now = Date.now()): StateResult {
  if (state.status === "finished") return { ok: false, reason: "Ván này xong rồi, chơi ván mới nhé 🎉" };
  if (!state.endProposal) return { ok: false, reason: "Không có ai xin kết thúc ván cả 🤔" };
  if (!agree) return { ok: true, state: { ...withoutProposal(state), updatedAt: now } };
  if (state.endProposal.by === me) return { ok: false, reason: "Người kia phải đồng ý mới được nha 😝" };
  const s = withoutProposal(state);
  return {
    ok: true,
    state: {
      ...s,
      scores: { nam: s.scores.nam - rackValue(s.racks.nam), linh: s.scores.linh - rackValue(s.racks.linh) },
      status: "finished",
      endReason: "agreed",
      updatedAt: now,
    },
  };
}

export function winner(state: ScrabbleState): Player | "tie" {
  const { nam, linh } = state.scores;
  return nam === linh ? "tie" : nam > linh ? "nam" : "linh";
}
