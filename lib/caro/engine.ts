import type { Who } from "@/lib/session"; // type-only: safe in client code

// Cờ caro — pure game rules. No Firestore in here: the page runs these inside
// a transaction and writes the returned state to caro_game/shared, so both
// screens always play against the truth.
//
// House rules: 15×15, 5 or more in a row wins, but a row blocked by the
// opponent at BOTH ends doesn't (chặn hai đầu; the board edge is not a block).
// Nam is always X, Linh always O; who goes first alternates every game.
export type Player = Who;
export type Piece = "x" | "o";
// "" = empty, "x" = Nam, "o" = Linh.
export type Cell = "" | Piece;

export const SIZE = 15;
export const WIN = 5;
export const PIECE: Record<Player, Piece> = { nam: "x", linh: "o" };

export type Tally = { nam: number; linh: number; draws: number };

export type CaroState = {
  board: Cell[]; // 225 cells, index = row * 15 + col (Firestore has no nested arrays)
  moves: number[]; // indexes in play order; the last one is highlighted
  startedBy: Player; // who went first; the next game alternates
  turn: Player;
  status: "playing" | "over";
  // "Xin hòa" asked by one player, waiting for the other. Any move clears it.
  drawProposal?: { by: Player; at: number };
  winner?: Player; // absent on a draw
  winLine?: number[]; // the winning row, end to end, for the stripe
  endReason?: "five" | "full" | "agreed" | "resign";
  tally: Tally; // carried from game to game
  updatedAt: number;
};

export type Result<T> = { ok: true } & T | { ok: false; reason: string };
export type StateResult = Result<{ state: CaroState }>;

export const other = (p: Player): Player => (p === "nam" ? "linh" : "nam");

export function newGame(
  startedBy: Player,
  tally: Tally = { nam: 0, linh: 0, draws: 0 },
  now = Date.now()
): CaroState {
  return {
    board: Array<Cell>(SIZE * SIZE).fill(""),
    moves: [],
    startedBy,
    turn: startedBy,
    status: "playing",
    tally,
    updatedAt: now,
  };
}

// "Ván mới": the other player starts, the score carries over.
export function nextGame(state: CaroState, now = Date.now()): CaroState {
  return newGame(other(state.startedBy), state.tally, now);
}

// Row, column, ↘ diagonal, ↙ diagonal.
const DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// The winning line through `index`, or null. Only lines through the newest
// piece can be new, so that's all we look at.
export function findWin(board: Cell[], index: number): number[] | null {
  const piece = board[index];
  if (!piece) return null;
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    const walk = (sign: 1 | -1) => {
      const cells: number[] = [];
      let r = row + sign * dr;
      let c = col + sign * dc;
      while (inside(r, c) && board[r * SIZE + c] === piece) {
        cells.push(r * SIZE + c);
        r += sign * dr;
        c += sign * dc;
      }
      // The cell just past the run: blocked only by an opponent piece, never by the edge.
      const blocked = inside(r, c) && board[r * SIZE + c] !== "";
      return { cells, blocked };
    };
    const back = walk(-1);
    const forward = walk(1);
    const line = [...back.cells.reverse(), index, ...forward.cells];
    if (line.length >= WIN && !(back.blocked && forward.blocked)) return line;
  }
  return null;
}

function withoutProposal(state: CaroState): CaroState {
  const s = { ...state };
  delete s.drawProposal;
  return s;
}

function finish(state: CaroState, endReason: NonNullable<CaroState["endReason"]>, winner: Player | null, now: number): CaroState {
  const s: CaroState = { ...withoutProposal(state), status: "over", endReason, updatedAt: now };
  if (winner) {
    s.winner = winner;
    s.tally = { ...state.tally, [winner]: state.tally[winner] + 1 };
  } else {
    s.tally = { ...state.tally, draws: state.tally.draws + 1 };
  }
  return s;
}

const OVER = "Ván này xong rồi, chơi ván mới nhé 🎉";

export function place(state: CaroState, me: Player, index: number, now = Date.now()): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  if (state.turn !== me) return { ok: false, reason: "Chưa tới lượt em nha 😝" };
  if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE)
    return { ok: false, reason: "Ô này nằm ngoài bàn 😅" };
  if (state.board[index] !== "") return { ok: false, reason: "Ô này có quân rồi nè 👀" };

  const board = [...state.board];
  board[index] = PIECE[me];
  const next: CaroState = {
    ...withoutProposal(state),
    board,
    moves: [...state.moves, index],
    turn: other(me),
    updatedAt: now,
  };
  const line = findWin(board, index);
  if (line) return { ok: true, state: { ...finish(next, "five", me, now), winLine: line } };
  if (next.moves.length === SIZE * SIZE) return { ok: true, state: finish(next, "full", null, now) };
  return { ok: true, state: next };
}

// "🤝 Xin hòa". If the other already asked, asking back is agreeing.
export function proposeDraw(state: CaroState, me: Player, now = Date.now()): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  if (state.drawProposal?.by === me) return { ok: false, reason: "Đang chờ người kia đồng ý nè ⏳" };
  if (state.drawProposal) return answerDraw(state, me, true, now);
  return { ok: true, state: { ...state, drawProposal: { by: me, at: now }, updatedAt: now } };
}

// Either player may take back their own proposal (agree = false).
export function answerDraw(state: CaroState, me: Player, agree: boolean, now = Date.now()): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  if (!state.drawProposal) return { ok: false, reason: "Không có ai xin hòa cả 🤔" };
  if (!agree) return { ok: true, state: { ...withoutProposal(state), updatedAt: now } };
  if (state.drawProposal.by === me) return { ok: false, reason: "Người kia phải đồng ý mới được nha 😝" };
  return { ok: true, state: finish(state, "agreed", null, now) };
}

// "🏳️ Đầu hàng" — allowed any time, even on the other player's turn.
export function resign(state: CaroState, me: Player, now = Date.now()): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  return { ok: true, state: finish(state, "resign", other(me), now) };
}
