/**
 * Ludo (Cờ cá ngựa) Engine
 * Pure TypeScript, zero external dependencies.
 * Firestore-compatible: all optional / absent values use null, never undefined.
 */

export type Player = "nam" | "linh";
export type GameMode = "quick" | "classic"; // quick = 2 horses/player (default), classic = 4 horses/player

export const TRACK_LEN = 36;
export const SAFE_CELLS: readonly number[] = [9, 27];

export interface Horse {
  id: number;
  owner: Player;
  zone: "stable" | "track" | "home";
  /**
   * stable: -1
   * track: 0..35 (relative progress from owner's start cell; 0 = start, 35 = home door)
   * home: 1..6 (stair step; 6 is deepest goal cell)
   */
  pos: number;
}

export type MoveKind = "deploy" | "advance" | "enter_home" | "climb_home";

export interface LegalMove {
  horseId: number;
  kind: MoveKind;
  fromZone: "stable" | "track" | "home";
  fromPos: number;
  toZone: "track" | "home";
  toPos: number;
  kicks: { owner: Player; horseId: number } | null;
}

export interface LastAction {
  n: number;
  by: Player;
  dice: number;
  horseId: number | null;
  move: LegalMove | null;
  gotExtraTurn: boolean;
  at: number;
}

export interface LudoState {
  gameId: string;
  mode: GameMode;
  status: "playing" | "over";
  turn: Player;
  startedBy: Player;
  phase: "roll" | "move";
  dice: number | null;
  consecutiveBonus: number;
  horses: Record<Player, Horse[]>;
  winner: Player | null;
  scores: Record<Player, number>;
  lastAction: LastAction | null;
  updatedAt: number;
}

export function other(p: Player): Player {
  return p === "nam" ? "linh" : "nam";
}

/**
 * Maps player-relative track index (0..35) to circular global track index (0..35).
 * nam: 0..35 -> 0..35
 * linh: 0..35 -> (relPos + 18) % 36
 */
export function toGlobalTrackIndex(owner: Player, relPos: number): number {
  if (owner === "nam") {
    return ((relPos % TRACK_LEN) + TRACK_LEN) % TRACK_LEN;
  }
  return ((relPos + 18) % TRACK_LEN + TRACK_LEN) % TRACK_LEN;
}

/**
 * Checks whether the given player has won.
 * Quick mode (2 horses): all 2 horses in home at steps >= 5 (i.e. steps 5 and 6).
 * Classic mode (4 horses): all 4 horses in home at steps >= 3 (i.e. steps 3, 4, 5, 6).
 */
export function checkWin(horses: Horse[], mode: GameMode): boolean {
  const total = mode === "quick" ? 2 : 4;
  const minStep = 7 - total;
  if (!horses || horses.length !== total) return false;
  return horses.every((h) => h.zone === "home" && h.pos >= minStep && h.pos <= 6);
}

function createHorses(owner: Player, mode: GameMode): Horse[] {
  const count = mode === "quick" ? 2 : 4;
  return Array.from({ length: count }, (_, id) => ({
    id,
    owner,
    zone: "stable",
    pos: -1,
  }));
}

export function newGame(
  startedBy: Player = "nam",
  prevScores?: Record<Player, number>,
  mode: GameMode = "quick"
): LudoState {
  return {
    gameId: `ludo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode,
    status: "playing",
    turn: startedBy,
    startedBy,
    phase: "roll",
    dice: null,
    consecutiveBonus: 0,
    horses: {
      nam: createHorses("nam", mode),
      linh: createHorses("linh", mode),
    },
    winner: null,
    scores: prevScores ? { ...prevScores } : { nam: 0, linh: 0 },
    lastAction: null,
    updatedAt: Date.now(),
  };
}

export function nextGame(prev: LudoState, mode?: GameMode): LudoState {
  const nextStarter = other(prev.startedBy);
  const nextMode = mode ?? prev.mode;
  return newGame(nextStarter, prev.scores, nextMode);
}

export function changeMode(
  state: LudoState,
  mode: GameMode
): { ok: true; state: LudoState } | { ok: false; reason: string } {
  if (mode !== "quick" && mode !== "classic") {
    return { ok: false, reason: "Chế độ chơi không hợp lệ" };
  }
  const fresh = newGame(state.startedBy, state.scores, mode);
  return { ok: true, state: fresh };
}

export function resign(
  state: LudoState,
  who: Player
): { ok: true; state: LudoState } | { ok: false; reason: string } {
  if (state.status === "over") {
    return { ok: false, reason: "Trận đấu đã kết thúc" };
  }
  if (who !== "nam" && who !== "linh") {
    return { ok: false, reason: "Người chơi không hợp lệ" };
  }
  const winningPlayer = other(who);
  const nextScores: Record<Player, number> = {
    ...state.scores,
    [winningPlayer]: (state.scores[winningPlayer] ?? 0) + 1,
  };
  return {
    ok: true,
    state: {
      ...state,
      status: "over",
      winner: winningPlayer,
      scores: nextScores,
      dice: null,
      updatedAt: Date.now(),
    },
  };
}

export function getLegalMoves(
  state: LudoState,
  who: Player,
  dice: number
): LegalMove[] {
  if (state.status !== "playing") return [];
  if (state.turn !== who) return [];
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) return [];

  const moves: LegalMove[] = [];
  const myHorses = state.horses[who] ?? [];
  const opponent = other(who);
  const opponentHorses = state.horses[opponent] ?? [];

  for (const horse of myHorses) {
    // 1. In stable: can deploy if dice is 1 or 6
    if (horse.zone === "stable") {
      if (dice === 1 || dice === 6) {
        // Destination is relPos 0
        const friendlyAtStart = myHorses.some(
          (h) => h.zone === "track" && h.pos === 0
        );
        if (!friendlyAtStart) {
          const startGlobal = toGlobalTrackIndex(who, 0);
          const enemyAtStart = opponentHorses.find(
            (h) =>
              h.zone === "track" &&
              toGlobalTrackIndex(opponent, h.pos) === startGlobal
          );
          moves.push({
            horseId: horse.id,
            kind: "deploy",
            fromZone: "stable",
            fromPos: -1,
            toZone: "track",
            toPos: 0,
            kicks: enemyAtStart
              ? { owner: opponent, horseId: enemyAtStart.id }
              : null,
          });
        }
      }
      continue;
    }

    // 2. On track
    if (horse.zone === "track") {
      // 2A. At home door (relPos 35) -> can enter home step `dice` (1..6)
      if (horse.pos === 35) {
        // Steps 1..dice must be empty of friendly horses
        const homeBlocked = myHorses.some(
          (h) => h.zone === "home" && h.pos >= 1 && h.pos <= dice
        );
        if (!homeBlocked) {
          moves.push({
            horseId: horse.id,
            kind: "enter_home",
            fromZone: "track",
            fromPos: 35,
            toZone: "home",
            toPos: dice,
            kicks: null,
          });
        }
        continue;
      }

      // 2B. Normal track advance: relPos + dice <= 35
      const targetPos = horse.pos + dice;
      if (targetPos <= 35) {
        // Intermediate cells must be empty of any horse
        let pathBlocked = false;
        for (let p = horse.pos + 1; p < targetPos; p++) {
          const pGlobal = toGlobalTrackIndex(who, p);
          const friendlyHere = myHorses.some(
            (h) => h.zone === "track" && h.pos === p
          );
          const enemyHere = opponentHorses.some(
            (h) =>
              h.zone === "track" &&
              toGlobalTrackIndex(opponent, h.pos) === pGlobal
          );
          if (friendlyHere || enemyHere) {
            pathBlocked = true;
            break;
          }
        }

        if (!pathBlocked) {
          // Check landing cell
          const friendlyAtTarget = myHorses.some(
            (h) => h.zone === "track" && h.pos === targetPos
          );
          if (!friendlyAtTarget) {
            const targetGlobal = toGlobalTrackIndex(who, targetPos);
            const enemyAtTarget = opponentHorses.find(
              (h) =>
                h.zone === "track" &&
                toGlobalTrackIndex(opponent, h.pos) === targetGlobal
            );

            let kicks: { owner: Player; horseId: number } | null = null;
            if (enemyAtTarget) {
              if (!SAFE_CELLS.includes(targetGlobal)) {
                kicks = { owner: opponent, horseId: enemyAtTarget.id };
              }
              // If on safe cell, kicks remains null (horse lands safely alongside enemy)
            }

            moves.push({
              horseId: horse.id,
              kind: "advance",
              fromZone: "track",
              fromPos: horse.pos,
              toZone: "track",
              toPos: targetPos,
              kicks,
            });
          }
        }
      }
      continue;
    }

    // 3. In home (steps 1..5)
    if (horse.zone === "home") {
      const targetStep = horse.pos + dice;
      if (targetStep <= 6) {
        // Steps from horse.pos + 1 to targetStep must be empty
        const climbBlocked = myHorses.some(
          (h) =>
            h.zone === "home" &&
            h.pos > horse.pos &&
            h.pos <= targetStep
        );
        if (!climbBlocked) {
          moves.push({
            horseId: horse.id,
            kind: "climb_home",
            fromZone: "home",
            fromPos: horse.pos,
            toZone: "home",
            toPos: targetStep,
            kicks: null,
          });
        }
      }
      continue;
    }
  }

  return moves;
}

export function applyMove(
  state: LudoState,
  who: Player,
  horseId: number
): { ok: true; state: LudoState } | { ok: false; reason: string } {
  if (state.status !== "playing") {
    return { ok: false, reason: "Trận đấu đã kết thúc" };
  }
  if (state.turn !== who) {
    return { ok: false, reason: "Không phải lượt của bạn" };
  }
  if (state.phase !== "move") {
    return { ok: false, reason: "Cần gieo xúc xắc trước khi di chuyển" };
  }
  if (state.dice === null) {
    return { ok: false, reason: "Chưa có điểm xúc xắc" };
  }

  const legalMoves = getLegalMoves(state, who, state.dice);
  const move = legalMoves.find((m) => m.horseId === horseId);
  if (!move) {
    return { ok: false, reason: "Nước đi không hợp lệ cho ngựa này" };
  }

  const opponent = other(who);
  const nextHorses: Record<Player, Horse[]> = {
    nam: state.horses.nam.map((h) => ({ ...h })),
    linh: state.horses.linh.map((h) => ({ ...h })),
  };

  const movingHorse = nextHorses[who].find((h) => h.id === horseId);
  if (!movingHorse) {
    return { ok: false, reason: "Không tìm thấy ngựa" };
  }

  movingHorse.zone = move.toZone;
  movingHorse.pos = move.toPos;

  if (move.kicks !== null) {
    const kickedHorse = nextHorses[move.kicks.owner]?.find(
      (h) => h.id === move.kicks!.horseId
    );
    if (kickedHorse) {
      kickedHorse.zone = "stable";
      kickedHorse.pos = -1;
    }
  }

  const isWin = checkWin(nextHorses[who], state.mode);
  const gotExtraTurn =
    !isWin &&
    (state.dice === 6 || move.kicks !== null) &&
    state.consecutiveBonus < 2;

  const nextStatus = isWin ? "over" : "playing";
  const nextWinner = isWin ? who : null;
  const nextScores: Record<Player, number> = isWin
    ? { ...state.scores, [who]: (state.scores[who] ?? 0) + 1 }
    : { ...state.scores };

  const nextTurn = isWin ? who : gotExtraTurn ? who : opponent;
  const nextBonus = isWin ? 0 : gotExtraTurn ? state.consecutiveBonus + 1 : 0;

  const lastAction: LastAction = {
    n: (state.lastAction?.n ?? 0) + 1,
    by: who,
    dice: state.dice,
    horseId,
    move,
    gotExtraTurn,
    at: Date.now(),
  };

  const nextState: LudoState = {
    ...state,
    status: nextStatus,
    turn: nextTurn,
    phase: "roll",
    dice: null,
    consecutiveBonus: nextBonus,
    horses: nextHorses,
    winner: nextWinner,
    scores: nextScores,
    lastAction,
    updatedAt: Date.now(),
  };

  return { ok: true, state: nextState };
}

export function rollDice(
  state: LudoState,
  who: Player,
  rng?: () => number
): { ok: true; state: LudoState; autoMoved: boolean } | { ok: false; reason: string } {
  if (state.status !== "playing") {
    return { ok: false, reason: "Trận đấu đã kết thúc" };
  }
  if (state.turn !== who) {
    return { ok: false, reason: "Không phải lượt của bạn" };
  }
  if (state.phase !== "roll") {
    return { ok: false, reason: "Đã gieo xúc xắc, cần di chuyển" };
  }

  const raw = rng ? rng() : Math.random();
  const dice = Math.min(6, Math.max(1, Math.floor(raw * 6) + 1));
  const legalMoves = getLegalMoves(state, who, dice);

  // Case 1: No legal moves -> turn passes immediately
  if (legalMoves.length === 0) {
    const lastAction: LastAction = {
      n: (state.lastAction?.n ?? 0) + 1,
      by: who,
      dice,
      horseId: null,
      move: null,
      gotExtraTurn: false,
      at: Date.now(),
    };
    const nextState: LudoState = {
      ...state,
      turn: other(who),
      phase: "roll",
      dice: null,
      consecutiveBonus: 0,
      lastAction,
      updatedAt: Date.now(),
    };
    return { ok: true, state: nextState, autoMoved: false };
  }

  // Case 2: Exactly 1 legal move -> auto-move for fast & smooth UX
  if (legalMoves.length === 1) {
    const intermediateState: LudoState = {
      ...state,
      phase: "move",
      dice,
    };
    const applied = applyMove(intermediateState, who, legalMoves[0].horseId);
    if (!applied.ok) {
      return { ok: false, reason: applied.reason };
    }
    return { ok: true, state: applied.state, autoMoved: true };
  }

  // Case 3: Multiple legal moves -> player chooses which horse to move
  const nextState: LudoState = {
    ...state,
    phase: "move",
    dice,
    updatedAt: Date.now(),
  };
  return { ok: true, state: nextState, autoMoved: false };
}
