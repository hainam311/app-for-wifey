/**
 * Ludo (Cờ cá ngựa) Engine Test Suite
 * Covers >= 35 assertions across all game mechanics + 300 random fuzz games.
 */

import {
  Player,
  GameMode,
  Horse,
  other,
  toGlobalTrackIndex,
  checkWin,
  newGame,
  nextGame,
  changeMode,
  resign,
  getLegalMoves,
  rollDice,
  applyMove,
} from "../lib/ludo/engine";

let assertionsCount = 0;
let failuresCount = 0;

function assert(condition: boolean, msg: string) {
  assertionsCount++;
  if (!condition) {
    failuresCount++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertDeepNoUndefined(obj: unknown, path = "root") {
  if (obj === undefined) {
    assert(false, `Found undefined at path: ${path}`);
    return;
  }
  if (obj === null || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val === undefined) {
      assert(false, `Found undefined at path: ${path}.${key}`);
    } else if (typeof val === "object" && val !== null) {
      assertDeepNoUndefined(val, `${path}.${key}`);
    }
  }
}

console.log("Starting Ludo Engine Unit Tests...\n");

// 1. helper `other`
assert(other("nam") === "linh", "other('nam') should be 'linh'");
assert(other("linh") === "nam", "other('linh') should be 'nam'");

// 2. toGlobalTrackIndex
assert(toGlobalTrackIndex("nam", 0) === 0, "nam pos 0 -> global 0");
assert(toGlobalTrackIndex("nam", 18) === 18, "nam pos 18 -> global 18");
assert(toGlobalTrackIndex("nam", 35) === 35, "nam pos 35 -> global 35");
assert(toGlobalTrackIndex("linh", 0) === 18, "linh pos 0 -> global 18");
assert(toGlobalTrackIndex("linh", 17) === 35, "linh pos 17 -> global 35");
assert(toGlobalTrackIndex("linh", 18) === 0, "linh pos 18 -> global 0");
assert(toGlobalTrackIndex("linh", 35) === 17, "linh pos 35 -> global 17");

// 3. newGame quick mode defaults
const gQuick = newGame("nam");
assert(gQuick.mode === "quick", "mode is quick");
assert(gQuick.status === "playing", "status is playing");
assert(gQuick.turn === "nam", "starter turn is nam");
assert(gQuick.startedBy === "nam", "startedBy is nam");
assert(gQuick.phase === "roll", "phase is roll");
assert(gQuick.dice === null, "dice is null");
assert(gQuick.consecutiveBonus === 0, "consecutiveBonus is 0");
assert(gQuick.winner === null, "winner is null");
assert(gQuick.scores.nam === 0 && gQuick.scores.linh === 0, "scores are 0-0");
assert(gQuick.horses.nam.length === 2, "nam has 2 horses in quick mode");
assert(gQuick.horses.linh.length === 2, "linh has 2 horses in quick mode");
assert(
  gQuick.horses.nam.every((h) => h.zone === "stable" && h.pos === -1),
  "nam horses start in stable"
);
assertDeepNoUndefined(gQuick, "newGame_quick");

// 4. newGame classic mode
const gClassic = newGame("linh", { nam: 2, linh: 1 }, "classic");
assert(gClassic.mode === "classic", "mode is classic");
assert(gClassic.turn === "linh", "starter turn is linh");
assert(gClassic.horses.nam.length === 4, "nam has 4 horses in classic mode");
assert(gClassic.horses.linh.length === 4, "linh has 4 horses in classic mode");
assert(
  gClassic.scores.nam === 2 && gClassic.scores.linh === 1,
  "scores carry over"
);
assertDeepNoUndefined(gClassic, "newGame_classic");

// 5. changeMode
const modeSwitched = changeMode(gQuick, "classic");
assert(modeSwitched.ok && modeSwitched.state.mode === "classic", "changeMode to classic succeeds");
assert(modeSwitched.ok && modeSwitched.state.horses.nam.length === 4, "horses updated to 4");
const invalidMode = changeMode(gQuick, "turbo" as unknown as GameMode);
assert(!invalidMode.ok, "invalid mode rejected");

// 6. resign
const gResign = resign(gQuick, "nam");
assert(gResign.ok, "resign succeeds");
if (gResign.ok) {
  assert(gResign.state.status === "over", "status becomes over");
  assert(gResign.state.winner === "linh", "winner is linh");
  assert(gResign.state.scores.linh === 1, "linh score incremented");
  const resignAgain = resign(gResign.state, "linh");
  assert(!resignAgain.ok, "cannot resign when already over");
}

// 7. nextGame
const gNext = nextGame(gQuick);
assert(gNext.startedBy === "linh", "nextGame alternates starter");
assert(gNext.turn === "linh", "turn matches next starter");
assert(gNext.status === "playing", "nextGame is playing");

// 8. Deploy rules
// Deploy on 1 or 6
let stateDeploy = newGame("nam");
const movesDeploy1 = getLegalMoves(stateDeploy, "nam", 1);
assert(movesDeploy1.length === 2, "deploy allowed on dice 1 for both stable horses");
assert(movesDeploy1[0].kind === "deploy" && movesDeploy1[0].toPos === 0, "deploy target is pos 0");
const movesDeploy6 = getLegalMoves(stateDeploy, "nam", 6);
assert(movesDeploy6.length === 2, "deploy allowed on dice 6 for both stable horses");
const movesDeploy3 = getLegalMoves(stateDeploy, "nam", 3);
assert(movesDeploy3.length === 0, "deploy NOT allowed on dice 3 from stable");

// Deploy blocked by friendly horse at pos 0
stateDeploy.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 0 };
const movesDeployBlocked = getLegalMoves(stateDeploy, "nam", 6);
assert(
  !movesDeployBlocked.some((m) => m.kind === "deploy"),
  "deploy blocked when friendly horse is at pos 0"
);

// Deploy kicks enemy horse at start cell (global 0 for nam)
// Linh at relPos 18 is global 0
stateDeploy = newGame("nam");
stateDeploy.horses.linh[0] = { id: 0, owner: "linh", zone: "track", pos: 18 };
const movesDeployKick = getLegalMoves(stateDeploy, "nam", 6);
assert(
  movesDeployKick.some(
    (m) =>
      m.kind === "deploy" &&
      m.kicks !== null &&
      m.kicks.owner === "linh" &&
      m.kicks.horseId === 0
  ),
  "deploy kicks enemy horse occupying start cell"
);

// 9. Advance rules
let stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 5 };
const movesAdv = getLegalMoves(stateAdv, "nam", 3);
assert(movesAdv.length === 1, "advancing horse has 1 legal move");
assert(
  movesAdv[0].kind === "advance" && movesAdv[0].toPos === 8,
  "advance moves to pos 8"
);

// Intermediate blocking by friendly horse
stateAdv.horses.nam[1] = { id: 1, owner: "nam", zone: "track", pos: 6 };
const movesBlockedInt = getLegalMoves(stateAdv, "nam", 3); // 5 to 8, 6 is occupied
assert(
  !movesBlockedInt.some((m) => m.horseId === 0),
  "horse cannot jump over intermediate friendly horse"
);

// Intermediate blocking by enemy horse
stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 5 };
// Enemy at global 7 (nam relPos 7 is linh relPos (7-18+36)%36 = 25)
stateAdv.horses.linh[0] = { id: 0, owner: "linh", zone: "track", pos: 25 };
const movesBlockedEnemy = getLegalMoves(stateAdv, "nam", 3); // 5 to 8, 7 is occupied
assert(
  movesBlockedEnemy.length === 0,
  "horse cannot jump over intermediate enemy horse"
);

// Landing on friendly horse blocked
stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 5 };
stateAdv.horses.nam[1] = { id: 1, owner: "nam", zone: "track", pos: 8 };
const movesLandFriendly = getLegalMoves(stateAdv, "nam", 3);
assert(
  !movesLandFriendly.some((m) => m.horseId === 0 && m.toPos === 8),
  "cannot land on friendly horse"
);

// Landing on enemy horse kicks it back to stable
stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 5 };
// Enemy at global 8 (linh relPos (8-18+36)%36 = 26). Global 8 is NOT safe (safe are 9, 27).
stateAdv.horses.linh[0] = { id: 0, owner: "linh", zone: "track", pos: 26 };
const movesKick = getLegalMoves(stateAdv, "nam", 3);
assert(
  movesKick.length === 1 &&
    movesKick[0].kicks !== null &&
    movesKick[0].kicks.owner === "linh" &&
    movesKick[0].kicks.horseId === 0,
  "landing on enemy horse on normal cell kicks it"
);

// Landing on enemy horse on SAFE_CELL (cell 9) DOES NOT kick it
stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 5 };
// Enemy at global 9 (linh relPos (9-18+36)%36 = 27). Global 9 IS a SAFE_CELL.
stateAdv.horses.linh[0] = { id: 0, owner: "linh", zone: "track", pos: 27 };
const movesSafeCell = getLegalMoves(stateAdv, "nam", 4); // 5 + 4 = 9
assert(
  movesSafeCell.length === 1 &&
    movesSafeCell[0].toPos === 9 &&
    movesSafeCell[0].kicks === null,
  "landing on enemy horse on SAFE_CELL does not kick"
);

// Advance cannot overshoot track (> 35)
stateAdv = newGame("nam");
stateAdv.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 34 };
const movesOvershoot = getLegalMoves(stateAdv, "nam", 2); // 34 + 2 = 36 > 35
assert(
  !movesOvershoot.some((m) => m.kind === "advance"),
  "cannot advance past 35 on track"
);

// 10. Enter Home rules
const stateHome = newGame("nam");
stateHome.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 35 }; // at home door
const movesEnterHome = getLegalMoves(stateHome, "nam", 4);
assert(
  movesEnterHome.some(
    (m) =>
      m.horseId === 0 &&
      m.kind === "enter_home" &&
      m.toZone === "home" &&
      m.toPos === 4
  ),
  "enter home to step 4 when steps 1..4 empty"
);

// Blocked if any step 1..d is occupied
stateHome.horses.nam[1] = { id: 1, owner: "nam", zone: "home", pos: 2 };
const movesEnterBlocked = getLegalMoves(stateHome, "nam", 4);
assert(
  !movesEnterBlocked.some(
    (m) => m.horseId === 0 && m.kind === "enter_home"
  ),
  "cannot enter home step 4 if step 2 is occupied"
);

// But rolling 1 enters step 1 because step 1 is empty
const movesEnterUnblocked = getLegalMoves(stateHome, "nam", 1);
assert(
  movesEnterUnblocked.some(
    (m) =>
      m.horseId === 0 &&
      m.kind === "enter_home" &&
      m.toPos === 1
  ),
  "can enter home step 1 because step 1 is empty"
);

// Cannot enter home if not at pos 35
const stateNotAtDoor = newGame("nam");
stateNotAtDoor.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 34 };
const movesNotAtDoor = getLegalMoves(stateNotAtDoor, "nam", 2);
assert(
  !movesNotAtDoor.some((m) => m.kind === "enter_home"),
  "cannot enter home if not at pos 35"
);

// 11. Climb Home rules
const stateClimb = newGame("nam");
stateClimb.horses.nam[0] = { id: 0, owner: "nam", zone: "home", pos: 2 };
const movesClimb = getLegalMoves(stateClimb, "nam", 3); // 2 + 3 = 5
assert(
  movesClimb.some(
    (m) =>
      m.horseId === 0 &&
      m.kind === "climb_home" &&
      m.toPos === 5
  ),
  "climb from step 2 to step 5"
);

// Climb cannot overshoot step 6
const movesClimbOver = getLegalMoves(stateClimb, "nam", 5); // 2 + 5 = 7 > 6
assert(
  !movesClimbOver.some((m) => m.horseId === 0 && m.kind === "climb_home"),
  "cannot climb beyond step 6"
);

// Climb blocked by intermediate horse in home
stateClimb.horses.nam[1] = { id: 1, owner: "nam", zone: "home", pos: 3 };
const movesClimbBlocked = getLegalMoves(stateClimb, "nam", 3); // 2 to 5, step 3 occupied
assert(
  !movesClimbBlocked.some((m) => m.horseId === 0),
  "cannot climb over horse in home"
);

// 12. Extra turns & Consecutive bonus cap
const stateExtra = newGame("nam");
stateExtra.phase = "move";
stateExtra.dice = 6;
// Both in stable, deploy horse 0 to pos 0
const app6 = applyMove(stateExtra, "nam", 0);
assert(app6.ok, "applyMove with 6 succeeds");
if (app6.ok) {
  assert(app6.state.turn === "nam", "extra turn granted on rolling 6");
  assert(app6.state.consecutiveBonus === 1, "consecutiveBonus incremented to 1");
  assert(app6.state.lastAction?.gotExtraTurn === true, "lastAction reports gotExtraTurn");

  // 2nd bonus turn: advance horse 0 from pos 0 to pos 6
  app6.state.phase = "move";
  app6.state.dice = 6;
  const app6_2 = applyMove(app6.state, "nam", 0);
  assert(app6_2.ok && app6_2.state.consecutiveBonus === 2, "consecutiveBonus is 2");
  assert(app6_2.ok && app6_2.state.turn === "nam", "turn still nam on 2nd bonus");

  // 3rd time rolling 6: horse 1 deploys to pos 0 (pos 0 is now empty)
  // Bonus capped at 2, turn MUST pass to linh!
  if (app6_2.ok) {
    app6_2.state.phase = "move";
    app6_2.state.dice = 6;
    const app6_3 = applyMove(app6_2.state, "nam", 1);
    assert(app6_3.ok, "3rd move succeeds");
    if (app6_3.ok) {
      assert(app6_3.state.turn === "linh", "turn passes after 2 bonuses");
      assert(app6_3.state.consecutiveBonus === 0, "consecutiveBonus reset to 0");
      assert(
        app6_3.state.lastAction?.gotExtraTurn === false,
        "gotExtraTurn is false when capped"
      );
    }
  }
}

// Extra turn on kick
const stateKickTurn = newGame("nam");
stateKickTurn.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 10 };
stateKickTurn.horses.linh[0] = { id: 0, owner: "linh", zone: "track", pos: 30 }; // global 12
stateKickTurn.phase = "move";
stateKickTurn.dice = 2; // 10 -> 12 kicks linh
const appKick = applyMove(stateKickTurn, "nam", 0);
assert(appKick.ok, "kick move succeeds");
if (appKick.ok) {
  assert(appKick.state.turn === "nam", "kick grants extra turn");
  assert(appKick.state.consecutiveBonus === 1, "kick bonus increments consecutiveBonus");
  assert(
    appKick.state.horses.linh[0].zone === "stable" &&
      appKick.state.horses.linh[0].pos === -1,
    "kicked horse sent back to stable"
  );
}

// 13. rollDice auto-move and pass turn behavior
const stateRollNoMoves = newGame("nam");
// Roll 3: stable horses cannot deploy -> auto pass turn to linh
const rPass = rollDice(stateRollNoMoves, "nam", () => 2 / 6); // returns 3
assert(rPass.ok, "rollDice succeeds");
if (rPass.ok) {
  assert(rPass.autoMoved === false, "autoMoved is false when no moves");
  assert(rPass.state.turn === "linh", "turn passed to linh");
  assert(rPass.state.lastAction?.dice === 3, "lastAction records dice 3");
  assert(rPass.state.lastAction?.horseId === null, "lastAction horseId is null");
  assert(rPass.state.lastAction?.move === null, "lastAction move is null");
}

// Single legal move auto-moved
const stateSingle = newGame("nam");
stateSingle.horses.nam[0] = { id: 0, owner: "nam", zone: "track", pos: 10 };
stateSingle.horses.nam[1] = { id: 1, owner: "nam", zone: "stable", pos: -1 };
// Roll 3: horse 0 advances (horse 1 cannot deploy on 3) -> exactly 1 legal move!
const rSingle = rollDice(stateSingle, "nam", () => 2 / 6); // returns 3
assert(rSingle.ok, "rollDice succeeds with single legal move");
if (rSingle.ok) {
  assert(rSingle.autoMoved === true, "autoMoved is true for single legal move");
  assert(rSingle.state.horses.nam[0].pos === 13, "horse 0 auto-advanced to 13");
  assert(rSingle.state.turn === "linh", "turn passed to linh after non-bonus move");
  assert(rSingle.state.phase === "roll", "phase returned to roll");
}

// Multiple legal moves does NOT auto-move
const stateMulti = newGame("nam");
// Both in stable, roll 6: both horse 0 and horse 1 can deploy -> 2 legal moves!
const rMulti = rollDice(stateMulti, "nam", () => 5 / 6); // returns 6
assert(rMulti.ok, "rollDice succeeds with multi moves");
if (rMulti.ok) {
  assert(rMulti.autoMoved === false, "autoMoved is false when multiple moves available");
  assert(rMulti.state.phase === "move", "phase becomes move");
  assert(rMulti.state.dice === 6, "state.dice is set to 6");
}

// 14. Win condition (quick mode)
const stateWinQuick = newGame("nam", undefined, "quick");
stateWinQuick.horses.nam[0] = { id: 0, owner: "nam", zone: "home", pos: 6 };
stateWinQuick.horses.nam[1] = { id: 1, owner: "nam", zone: "home", pos: 4 };
stateWinQuick.phase = "move";
stateWinQuick.dice = 1; // 4 + 1 = 5. Now steps are 6 and 5 (both >= 5) -> WIN!
const appWin = applyMove(stateWinQuick, "nam", 1);
assert(appWin.ok, "winning move succeeds");
if (appWin.ok) {
  assert(appWin.state.status === "over", "game status is over");
  assert(appWin.state.winner === "nam", "winner is nam");
  assert(appWin.state.scores.nam === 1, "nam score incremented to 1");
  assert(appWin.state.lastAction?.gotExtraTurn === false, "no extra turn after win");
}

// Win condition (classic mode)
const horsesClassicWin: Horse[] = [
  { id: 0, owner: "linh", zone: "home", pos: 3 },
  { id: 1, owner: "linh", zone: "home", pos: 4 },
  { id: 2, owner: "linh", zone: "home", pos: 5 },
  { id: 3, owner: "linh", zone: "home", pos: 6 },
];
assert(checkWin(horsesClassicWin, "classic") === true, "classic win with 3, 4, 5, 6");
const horsesClassicNotWin: Horse[] = [
  { id: 0, owner: "linh", zone: "home", pos: 2 },
  { id: 1, owner: "linh", zone: "home", pos: 4 },
  { id: 2, owner: "linh", zone: "home", pos: 5 },
  { id: 3, owner: "linh", zone: "home", pos: 6 },
];
assert(checkWin(horsesClassicNotWin, "classic") === false, "classic not win if step < 3");

console.log(`Unit tests completed: ${assertionsCount} assertions, ${failuresCount} failures.\n`);
if (failuresCount > 0) {
  process.exit(1);
}

// -------------------------------------------------------------
// 15. Fuzz Testing: 300 random games played to completion / max steps
// -------------------------------------------------------------
console.log("Running 300 Random Fuzz Games...");
const TOTAL_FUZZ_GAMES = 300;
let completedGames = 0;
let fuzzAssertions = 0;

function assertFuzz(cond: boolean, msg: string) {
  fuzzAssertions++;
  if (!cond) {
    throw new Error(`FUZZ INVARIANT VIOLATION: ${msg}`);
  }
}

for (let i = 0; i < TOTAL_FUZZ_GAMES; i++) {
  const mode: GameMode = i % 2 === 0 ? "quick" : "classic";
  const starter: Player = i % 4 < 2 ? "nam" : "linh";
  let state = newGame(starter, undefined, mode);

  let steps = 0;
  const maxSteps = 400; // safety ceiling to prevent infinite loops

  while (state.status === "playing" && steps < maxSteps) {
    steps++;

    // Invariant check: never undefined
    assertDeepNoUndefined(state, `fuzz_game_${i}_step_${steps}`);

    // Invariant check: horses consistency
    const totalH = mode === "quick" ? 2 : 4;
    assertFuzz(state.horses.nam.length === totalH, "nam horses count");
    assertFuzz(state.horses.linh.length === totalH, "linh horses count");

    for (const p of ["nam", "linh"] as const) {
      const homeSteps = new Set<number>();
      for (const h of state.horses[p]) {
        assertFuzz(h.id >= 0 && h.id < totalH, "horse id valid");
        assertFuzz(
          h.zone === "stable" || h.zone === "track" || h.zone === "home",
          "valid zone"
        );
        if (h.zone === "stable") {
          assertFuzz(h.pos === -1, "stable pos is -1");
        } else if (h.zone === "track") {
          assertFuzz(h.pos >= 0 && h.pos <= 35, "track pos 0..35");
        } else if (h.zone === "home") {
          assertFuzz(h.pos >= 1 && h.pos <= 6, "home pos 1..6");
          assertFuzz(!homeSteps.has(h.pos), "duplicate horse in same home step");
          homeSteps.add(h.pos);
        }
      }
    }

    const currentTurn = state.turn;
    const rollRes = rollDice(state, currentTurn);
    assertFuzz(rollRes.ok, `rollDice failed: ${rollRes.ok ? "" : rollRes.reason}`);
    if (!rollRes.ok) break;

    state = rollRes.state;

    if (state.status === "over") {
      break;
    }

    if (state.phase === "move") {
      // Must pick a legal move
      assertFuzz(state.dice !== null, "dice should not be null in move phase");
      const legal = getLegalMoves(state, state.turn, state.dice!);
      assertFuzz(legal.length > 0, "should have legal moves if in move phase");

      // Pick random legal move
      const choice = legal[Math.floor(Math.random() * legal.length)];
      const moveRes = applyMove(state, state.turn, choice.horseId);
      assertFuzz(moveRes.ok, `applyMove failed: ${moveRes.ok ? "" : moveRes.reason}`);
      if (!moveRes.ok) break;
      state = moveRes.state;
    }
  }

  if (state.status === "over") {
    completedGames++;
    assertFuzz(state.winner !== null, "winner must be set when game over");
    assertFuzz(
      state.scores[state.winner!] > 0,
      "winner score must be incremented"
    );
  }
}

console.log(
  `Fuzz testing completed: ${TOTAL_FUZZ_GAMES} games simulated (${completedGames} won cleanly, ${
    TOTAL_FUZZ_GAMES - completedGames
  } reached step limit).`
);
console.log(`Fuzz invariant checks passed: ${fuzzAssertions}`);

const grandTotalAssertions = assertionsCount + fuzzAssertions;
console.log(`\nALL CHECKS PASSED: ${grandTotalAssertions} assertions verified, 0 failures.`);
