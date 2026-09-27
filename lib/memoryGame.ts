import type { Who } from "@/lib/session"; // type-only: safe in client code

// Lật hình emoji — pure game rules. No Firestore in here: the page runs
// these inside a transaction and writes the returned state to
// memory_game/shared, so both phones see every flip.
export type Player = Who;

// Each game picks PAIRS faces from this pool at random. Saved games store
// indexes into it, so only ever APPEND — reordering would change old boards.
export const CARD_FACES = [
  "🐻", "🧸", "💕", "🍯", "🎀", "🍒", "🌙", "⭐",
  "🐰", "🐱", "🍓", "🌸", "🧁", "🍩", "🍭", "🦄",
  "🌈", "🐥", "🐼", "🍑", "🎈", "💌", "🍉", "🐧",
  "🐶", "🐨", "🦊", "🐸", "🐤", "🦋", "🐝", "🌻",
  "🌷", "🍀", "🍎", "🍋", "🍇", "🥑", "🍰", "🍪",
  "🧋", "🍦", "☕", "🎁", "💎", "👑", "🎵", "🏖️",
];
export const PAIRS = 18; // 6×6 board

export const MISMATCH_SHOW_MS = 1000; // how long a wrong pair stays face-up
// A mismatch older than this was abandoned (phone closed mid-turn); the next
// tap from either player flips it back first so the game never gets stuck.
export const STALE_MISMATCH_MS = 3000;

export type GameState = {
  cardOrder: number[]; // board position -> index into CARD_FACES (each twice)
  matched: number[]; // positions already matched (stay face-up)
  flipped: number[]; // 0–2 positions face-up but not matched yet
  turn: Player;
  scores: Record<Player, number>; // pairs found this game
  status: "playing" | "finished";
  startedBy: Player; // who went first; the next game alternates
  updatedAt: number; // Date.now() of the last write
};

export type FlipResult = { ok: true; state: GameState } | { ok: false; reason: string };

export const other = (p: Player): Player => (p === "nam" ? "linh" : "nam");

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(startedBy: Player, now = Date.now()): GameState {
  const faces = shuffle(CARD_FACES.map((_, i) => i)).slice(0, PAIRS);
  return {
    cardOrder: shuffle([...faces, ...faces]),
    matched: [],
    flipped: [],
    turn: startedBy,
    scores: { nam: 0, linh: 0 },
    status: "playing",
    startedBy,
    updatedAt: now,
  };
}

// Flip the wrong pair back and pass the turn.
export function resolveMismatch(state: GameState, now = Date.now()): GameState {
  if (state.flipped.length < 2) return state;
  return { ...state, flipped: [], turn: other(state.turn), updatedAt: now };
}

// Two cards face-up: a match stays up (+1, same player goes again);
// a mismatch is left showing for resolveMismatch to flip back.
export function checkMatch(state: GameState): GameState {
  const [a, b] = state.flipped;
  if (state.flipped.length < 2 || state.cardOrder[a] !== state.cardOrder[b]) return state;
  const matched = [...state.matched, a, b];
  return {
    ...state,
    matched,
    flipped: [],
    scores: { ...state.scores, [state.turn]: state.scores[state.turn] + 1 },
    status: matched.length === state.cardOrder.length ? "finished" : "playing",
  };
}

// `me` is the phone's owner, or "shared" when one phone is passed around.
export function flipCard(
  state: GameState,
  index: number,
  me: Player | "shared",
  now = Date.now()
): FlipResult {
  let s = state;
  if (s.status === "finished") {
    return { ok: false, reason: "Ván này xong rồi, chơi ván mới nhé 🎉" };
  }
  if (s.flipped.length === 2 && now - s.updatedAt > STALE_MISMATCH_MS) {
    s = resolveMismatch(s, now);
  }
  if (me !== "shared" && s.turn !== me) {
    return { ok: false, reason: "Chưa tới lượt nè 😝" };
  }
  if (s.flipped.length === 2) {
    return { ok: false, reason: "Đợi hai lá kia úp lại đã nhé ⏳" };
  }
  if (
    index < 0 ||
    index >= s.cardOrder.length ||
    s.matched.includes(index) ||
    s.flipped.includes(index)
  ) {
    return { ok: false, reason: "Lá này mở rồi nè 👀" };
  }
  const flipped = { ...s, flipped: [...s.flipped, index], updatedAt: now };
  return { ok: true, state: flipped.flipped.length === 2 ? checkMatch(flipped) : flipped };
}

export function winner(state: GameState): Player | "tie" {
  const { nam, linh } = state.scores;
  return nam === linh ? "tie" : nam > linh ? "nam" : "linh";
}
