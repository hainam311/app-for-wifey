// Cờ caro rules checks. Run: node_modules/.bin/jiti scripts/caro-check.ts
import {
  SIZE,
  newGame,
  nextGame,
  place,
  proposeDraw,
  answerDraw,
  resign,
  findWin,
  type CaroState,
  type Cell,
  type Player,
} from "../lib/caro/engine";

let failed = 0;
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.log("✗", name);
  }
}

const at = (r: number, c: number) => r * SIZE + c;

// Board from a list of [row, col, piece].
function board(cells: [number, number, Cell][]): Cell[] {
  const b = Array<Cell>(SIZE * SIZE).fill("");
  for (const [r, c, p] of cells) b[at(r, c)] = p;
  return b;
}
const row = (r: number, c0: number, n: number, p: Cell): [number, number, Cell][] =>
  Array.from({ length: n }, (_, i) => [r, c0 + i, p]);

// Play a list of moves alternately from a fresh game; returns the final result.
function playAll(starter: Player, moves: [number, number][]) {
  let s = newGame(starter, undefined, 0);
  for (const [r, c] of moves) {
    const res = place(s, s.turn, at(r, c), 1);
    if (!res.ok) throw new Error(res.reason);
    s = res.state;
  }
  return s;
}

// --- findWin: directions ---------------------------------------------------
check("row of 5", findWin(board(row(7, 3, 5, "x")), at(7, 5))?.length === 5);
check(
  "column of 5",
  findWin(board([0, 1, 2, 3, 4].map((r) => [r + 4, 9, "o"] as [number, number, Cell])), at(6, 9))?.length === 5
);
check(
  "↘ diagonal of 5",
  findWin(board([0, 1, 2, 3, 4].map((i) => [2 + i, 2 + i, "x"] as [number, number, Cell])), at(4, 4))?.length === 5
);
check(
  "↙ diagonal of 5",
  findWin(board([0, 1, 2, 3, 4].map((i) => [2 + i, 12 - i, "x"] as [number, number, Cell])), at(2, 12))?.length === 5
);
check("4 is not a win", findWin(board(row(7, 3, 4, "x")), at(7, 4)) === null);
check("empty cell is not a win", findWin(board(row(7, 3, 5, "x")), at(0, 0)) === null);

// winLine is end to end, in order
const line = findWin(board(row(7, 3, 5, "x")), at(7, 7));
check("winLine ordered end to end", JSON.stringify(line) === JSON.stringify([3, 4, 5, 6, 7].map((c) => at(7, c))));

// --- overlines --------------------------------------------------------------
check("6 in a row wins", findWin(board(row(7, 3, 6, "x")), at(7, 5))?.length === 6);
check("7 in a row wins", findWin(board(row(7, 0, 7, "o")), at(7, 6))?.length === 7);

// --- chặn hai đầu -----------------------------------------------------------
const blockedBoth = board([...row(7, 3, 5, "x"), [7, 2, "o"], [7, 8, "o"]]);
check("blocked both ends: no win", findWin(blockedBoth, at(7, 5)) === null);
const blockedOne = board([...row(7, 3, 5, "x"), [7, 2, "o"]]);
check("blocked one end: wins", findWin(blockedOne, at(7, 5))?.length === 5);
check("edge + block: wins (edge is not a block)", findWin(board([...row(7, 0, 5, "x"), [7, 5, "o"]]), at(7, 2))?.length === 5);
check("edge both sides via full row wins", findWin(board(row(7, 0, 15, "x")), at(7, 7))?.length === 15);
check("blocked 6 in a row: no win", findWin(board([...row(7, 3, 6, "x"), [7, 2, "o"], [7, 9, "o"]]), at(7, 4)) === null);
check(
  "diagonal blocked both ends: no win",
  findWin(
    board([
      ...[0, 1, 2, 3, 4].map((i) => [3 + i, 3 + i, "x"] as [number, number, Cell]),
      [2, 2, "o"],
      [8, 8, "o"],
    ]),
    at(5, 5)
  ) === null
);
// Blocked in one direction, but a clean five in another still wins.
const cross = board([
  ...row(7, 3, 5, "x"),
  [7, 2, "o"],
  [7, 8, "o"],
  ...[3, 4, 5, 6].map((r) => [r, 5, "x"] as [number, number, Cell]),
]);
check("blocked row but open column: wins via column", findWin(cross, at(7, 5))?.length === 5);

// --- joining two groups -----------------------------------------------------
{
  // X: (7,3)(7,4) and (7,6)(7,7); the last move (7,5) joins them into 5.
  const s = playAll("nam", [
    [7, 3], [0, 0],
    [7, 4], [0, 2],
    [7, 6], [0, 4],
    [7, 7], [0, 6],
    [7, 5],
  ]);
  check("joining two groups wins", s.status === "over" && s.winner === "nam" && s.endReason === "five");
  check("winLine set on win", s.winLine?.length === 5);
  check("tally counts the win", s.tally.nam === 1 && s.tally.linh === 0 && s.tally.draws === 0);
  const r = place(s, "linh", at(10, 10), 2);
  check("no moves after the game ends", !r.ok);
}

// --- pieces & turns ---------------------------------------------------------
{
  const s = newGame("linh", undefined, 0);
  check("starter has the first turn", s.turn === "linh");
  const wrong = place(s, "nam", at(7, 7));
  check("wrong turn refused", !wrong.ok);
  const a = place(s, "linh", at(7, 7));
  check("Linh places O even when starting", a.ok && a.state.board[at(7, 7)] === "o");
  if (a.ok) {
    check("turn passes", a.state.turn === "nam");
    check("move recorded", a.state.moves.length === 1 && a.state.moves[0] === at(7, 7));
    const taken = place(a.state, "nam", at(7, 7));
    check("taken cell refused", !taken.ok);
    const b = place(a.state, "nam", at(7, 8));
    check("Nam places X even when second", b.ok && b.state.board[at(7, 8)] === "x");
  }
  check("outside index refused", !place(s, "linh", -1).ok && !place(s, "linh", 225).ok && !place(s, "linh", 1.5).ok);
}

// --- new game alternates the starter and keeps the tally ---------------------
{
  const s = { ...newGame("linh", { nam: 2, linh: 3, draws: 1 }, 0), status: "over" as const };
  const n = nextGame(s, 5);
  check("next game: other player starts", n.startedBy === "nam" && n.turn === "nam");
  check("next game: tally kept", n.tally.nam === 2 && n.tally.linh === 3 && n.tally.draws === 1);
  check("next game: board empty", n.board.every((c) => c === "") && n.moves.length === 0);
  check("next game: no leftovers", n.winner === undefined && n.winLine === undefined && n.endReason === undefined);
  check("next of next: back to first", nextGame(n).startedBy === "linh");
}

// --- draw by agreement ------------------------------------------------------
{
  let s = newGame("nam", undefined, 0);
  const p = proposeDraw(s, "nam", 1);
  check("propose draw", p.ok && p.state.drawProposal?.by === "nam");
  if (p.ok) {
    s = p.state;
    check("can't propose twice", !proposeDraw(s, "nam").ok);
    check("can't accept own proposal", !answerDraw(s, "nam", true).ok);
    const no = answerDraw(s, "linh", false);
    check("decline clears proposal", no.ok && no.state.drawProposal === undefined && no.state.status === "playing");
    const back = answerDraw(s, "nam", false);
    check("proposer can withdraw", back.ok && back.state.drawProposal === undefined);
    const moved = place(s, "nam", at(7, 7));
    check("a move clears the proposal", moved.ok && moved.state.drawProposal === undefined);
    const yes = answerDraw(s, "linh", true);
    check(
      "accept ends in a draw",
      yes.ok && yes.state.status === "over" && yes.state.endReason === "agreed" && yes.state.winner === undefined
    );
    if (yes.ok) check("tally counts the draw", yes.state.tally.draws === 1 && yes.state.drawProposal === undefined);
    const back2 = proposeDraw(s, "linh");
    check("proposing back = agreeing", back2.ok && back2.state.endReason === "agreed");
  }
  check("answer with no proposal refused", !answerDraw(newGame("nam"), "linh", true).ok);
}

// --- resign -----------------------------------------------------------------
{
  const s = newGame("nam", undefined, 0);
  const r = resign(s, "linh", 1); // not Linh's turn — still allowed
  check("resign on other's turn: other wins", r.ok && r.state.winner === "nam" && r.state.endReason === "resign");
  if (r.ok) {
    check("resign counts in tally", r.state.tally.nam === 1);
    check("can't resign twice", !resign(r.state, "nam").ok);
  }
}

// --- full board draw --------------------------------------------------------
{
  // Fill the board so nobody ever gets 5: "xxoo" repeating along each row,
  // shifted by 2 on every row, keeps runs short in every direction. Then play
  // it cell by cell, alternating X and O.
  const target = (r: number, c: number): Cell => ((Math.floor((c + 2 * r) / 2) % 2 === 0) ? "x" : "o");
  const xs: number[] = [];
  const os: number[] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) (target(r, c) === "x" ? xs : os).push(at(r, c));
  // 225 cells: X (starter Nam) needs exactly one more than O.
  while (xs.length > os.length + 1) os.push(xs.pop()!);
  while (os.length > xs.length) xs.push(os.pop()!);
  let s: CaroState = newGame("nam", undefined, 0);
  let ok = true;
  let earlyWin = false;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const idx = i % 2 === 0 ? xs[i / 2] : os[(i - 1) / 2];
    const res = place(s, s.turn, idx, 1);
    if (!res.ok) {
      ok = false;
      break;
    }
    s = res.state;
    if (s.status === "over" && i < SIZE * SIZE - 1) {
      earlyWin = true;
      break;
    }
  }
  if (earlyWin) console.log("  (full-board pattern made a five; skipping draw check)");
  else check("full board with no five is a draw", ok && s.status === "over" && s.endReason === "full" && !s.winner);
  if (!earlyWin) check("full draw counted", s.tally.draws === 1);
}

// --- random games -----------------------------------------------------------
{
  let seed = 42;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let games = 0;
  let bad = 0;
  const reasons = { five: 0, full: 0 };
  for (let g = 0; g < 500; g++) {
    // Play near the center so lines actually form.
    let s = newGame(g % 2 ? "nam" : "linh", undefined, 0);
    while (s.status === "playing") {
      const empty = s.board.flatMap((c, i) => (c === "" ? [i] : []));
      const near = empty.filter((i) => Math.abs(Math.floor(i / SIZE) - 7) <= 3 && Math.abs((i % SIZE) - 7) <= 3);
      const pool = near.length ? near : empty;
      const idx = pool[Math.floor(random() * pool.length)];
      const res = place(s, s.turn, idx, 1);
      if (!res.ok) {
        bad++;
        break;
      }
      s = res.state;
    }
    games++;
    if (s.endReason === "five" || s.endReason === "full") reasons[s.endReason]++;
    // Invariants
    const xCount = s.board.filter((c) => c === "x").length;
    const oCount = s.board.filter((c) => c === "o").length;
    if (xCount + oCount !== s.moves.length) bad++;
    if (Math.abs(xCount - oCount) > 1) bad++;
    if (s.endReason === "five") {
      const w = s.winLine!;
      const last = s.moves[s.moves.length - 1];
      if (!w.includes(last) || w.length < 5) bad++;
      if (s.board[last] !== (s.winner === "nam" ? "x" : "o")) bad++;
      if (!w.every((i) => s.board[i] === s.board[last])) bad++;
    }
    // Nobody had a win earlier that went unnoticed.
    const replay = Array<Cell>(SIZE * SIZE).fill("");
    for (let k = 0; k < s.moves.length - 1; k++) {
      replay[s.moves[k]] = k % 2 === 0 ? (s.startedBy === "nam" ? "x" : "o") : s.startedBy === "nam" ? "o" : "x";
      if (findWin(replay, s.moves[k])) bad++;
    }
  }
  check(`500 random games all end correctly (${reasons.five} fives, ${reasons.full} full)`, bad === 0 && games === 500);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
