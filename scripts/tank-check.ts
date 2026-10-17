// Bắn tăng rules & physics checks. Run: node_modules/.bin/jiti scripts/tank-check.ts
import {
  COLS,
  MAX_GROUND,
  MIN_GROUND,
  TANK_R,
  WORLD_H,
  groundAt,
  tankY,
} from "../lib/tank/terrain";
import {
  MAX_FUEL,
  MAX_HP,
  SHOTS,
  chooseMobile,
  drive,
  explode,
  fire,
  newGame,
  nextGame,
  other,
  resign,
  simulateShot,
  type ShotKind,
  type Tank,
  type TankState,
  MOBILES,
} from "../lib/tank/engine";
import { MOTION, kick, newBody, smoothGround, stepBody, support } from "../lib/tank/motion";

let failed = 0;
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    console.log("✗", name);
  }
}

function makeRng(seed = 12345): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function hasUndefinedOrNestedArray(val: unknown): boolean {
  if (val === undefined) return true;
  if (val === null || typeof val !== "object") return false;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (Array.isArray(item) || hasUndefinedOrNestedArray(item)) return true;
    }
    return false;
  }
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (k in (val as object) && v === undefined) return true;
    if (hasUndefinedOrNestedArray(v)) return true;
  }
  return false;
}

function makeTestTank(x: number, facing: 1 | -1 = 1, hp = MAX_HP): Tank {
  return {
    x,
    hp,
    facing,
    shotsSinceSS: 0,
    alive: hp > 0,
    lastAngle: 45,
    lastPower: 0,
  };
}

// --- 1. New map & tank placement --------------------------------------------
{
  const rng = makeRng(7);
  const g = newGame("linh", rng, undefined, 1000);
  check("ground has 300 integers", g.ground.length === COLS && g.ground.every((h) => Number.isInteger(h)));
  check(
    "ground heights in [150, 420]",
    g.ground.every((h) => h >= MIN_GROUND && h <= MAX_GROUND)
  );
  check(
    "tanks stand on non-zero ground with 1000 HP",
    groundAt(g.ground, g.tanks.nam.x) >= MIN_GROUND &&
      groundAt(g.ground, g.tanks.linh.x) >= MIN_GROUND &&
      g.tanks.nam.hp === MAX_HP &&
      g.tanks.linh.hp === MAX_HP
  );

  let namLeft = 0;
  let linhLeft = 0;
  for (let i = 0; i < 40; i++) {
    const gi = newGame("linh", rng);
    if (gi.tanks.nam.x < gi.tanks.linh.x) namLeft++;
    else linhLeft++;
  }
  check("tank sides change with rng", namLeft > 5 && linhLeft > 5);
}

// --- 2. Flat ground, no wind, 45°, power 100 → range ~1225 ------------------
{
  const flatWide = Array<number>(350).fill(200);
  const tanks = {
    nam: makeTestTank(50, 1),
    linh: makeTestTank(1380, -1),
  };
  const sim = simulateShot(flatWide, tanks, "nam", 45, 100, 0);
  const range = sim.outcome === "hit" ? sim.boom.x - 50 : 0;
  check(
    `flat ground 45° power 100 range ~1225 (got ${range})`,
    range >= 1215 && range <= 1245
  );
}

// --- 3. Deterministic simulation (same input → same path) -------------------
{
  const g = newGame("nam", makeRng(99), undefined, 1000);
  const s1 = simulateShot(g.ground, g.tanks, "nam", 52, 73, g.wind);
  const s2 = simulateShot(g.ground, g.tanks, "nam", 52, 73, g.wind);
  check("same input gives identical path and outcome", JSON.stringify(s1) === JSON.stringify(s2));
}

// --- 4. Wind +10 moves explosion right, wind -10 moves it left --------------
{
  const flat = Array<number>(COLS).fill(200);
  const tanks = {
    nam: makeTestTank(500, 1),
    linh: makeTestTank(1150, -1),
  };
  const w0 = simulateShot(flat, tanks, "nam", 60, 60, 0);
  const wPlus = simulateShot(flat, tanks, "nam", 60, 60, 10);
  const wMinus = simulateShot(flat, tanks, "nam", 60, 60, -10);
  check(
    "wind +10 moves impact right, wind -10 moves impact left",
    w0.outcome === "hit" &&
      wPlus.outcome === "hit" &&
      wMinus.outcome === "hit" &&
      wMinus.boom.x < w0.boom.x &&
      w0.boom.x < wPlus.boom.x
  );
}

// --- 5. Shell above top (y > WORLD_H) comes back down -----------------------
{
  const flat = Array<number>(COLS).fill(300);
  const tanks = {
    nam: makeTestTank(400, 1),
    linh: makeTestTank(1000, -1),
  };
  const high = simulateShot(flat, tanks, "nam", 80, 95, 0);
  const maxY = high.path.reduce((m, v, idx) => (idx % 2 === 1 ? Math.max(m, v) : m), 0);
  check(
    "shell goes above WORLD_H (600) and comes back down to hit ground",
    maxY > WORLD_H && high.outcome === "hit" && high.boom.y <= 300
  );
}

// --- 6. Shell out of left, right, or bottom → lost (no crater, no damage) ---
{
  const s0 = newGame("nam", makeRng(12), undefined, 1000);
  // Force Nam near left edge facing left and shoot hard out the left wall
  s0.tanks.nam.x = 30;
  s0.tanks.nam.facing = -1;
  const resLeft = fire(
    s0,
    "nam",
    { toX: 30, facing: -1, angle: 30, power: 80, kind: "s1" },
    makeRng(1),
    1001
  );
  check(
    "out of left side is lost: no boom, no crater, no damage",
    resLeft.ok &&
      resLeft.state.lastShot?.boom === undefined &&
      JSON.stringify(resLeft.state.ground) === JSON.stringify(s0.ground) &&
      resLeft.state.tanks.nam.hp === MAX_HP &&
      resLeft.state.tanks.linh.hp === MAX_HP
  );

  // Out of right side
  s0.tanks.nam.x = 1170;
  s0.tanks.nam.facing = 1;
  const resRight = fire(
    s0,
    "nam",
    { toX: 1170, facing: 1, angle: 30, power: 80, kind: "s1" },
    makeRng(1),
    1002
  );
  check(
    "out of right side is lost: no boom, no crater, no damage",
    resRight.ok && resRight.state.lastShot?.boom === undefined
  );

  // Out of bottom (shoot into a zero-ground pit)
  const pitGround = Array<number>(COLS).fill(200);
  for (let i = 100; i < 200; i++) pitGround[i] = 0;
  const tanks = {
    nam: makeTestTank(380, 1),
    linh: makeTestTank(1000, -1),
  };
  const simBottom = simulateShot(pitGround, tanks, "nam", 45, 35, 0);
  check("shell falling through bottom (y <= 0) is lost", simBottom.outcome === "lost");
}

// --- 7. Damage falloff: direct hit, edge hit, outside radius ----------------
{
  const flat = Array<number>(COLS).fill(250);
  const tx = 600;
  const ty = tankY(flat, tx);
  const baseState = {
    ground: flat,
    tanks: {
      nam: makeTestTank(tx, 1),
      linh: makeTestTank(100, 1),
    },
  };

  // Direct hit (d = 0)
  const d0 = explode(baseState, { x: tx, y: ty, directHit: "nam" }, "s1");
  check("direct hit gives full damage (250)", d0.damage.nam === 250 && d0.tanks.nam.hp === 750);

  // Edge hit (just inside radius + TANK_R = 35 + 14 = 49)
  const edgeDist = SHOTS.s1.radius + TANK_R - 0.01;
  const dEdge = explode(baseState, { x: tx + edgeDist, y: ty }, "s1");
  check(
    `edge hit gives ~half damage (${dEdge.damage.nam})`,
    dEdge.damage.nam >= 124 && dEdge.damage.nam <= 126
  );

  // Outside radius + TANK_R
  const dOut = explode(baseState, { x: tx + SHOTS.s1.radius + TANK_R + 1, y: ty }, "s1");
  check("outside radius gives 0 damage", dOut.damage.nam === 0 && dOut.tanks.nam.hp === MAX_HP);
}

// --- 8. Self-damage: shooting near own tank damages own tank ----------------
{
  const s = newGame("nam", makeRng(21), undefined, 1000);
  s.ground = Array<number>(COLS).fill(220);
  s.tanks.nam = makeTestTank(500, 1);
  s.tanks.linh = makeTestTank(1000, -1);
  s.wind = 0;
  // Angle 90, low power: lands right back on shooter
  const res = fire(
    s,
    "nam",
    { toX: 500, facing: 1, angle: 90, power: 20, kind: "s1" },
    makeRng(22),
    1005
  );
  check(
    "shot landing on own tank damages own tank",
    res.ok && res.state.tanks.nam.hp < MAX_HP && (res.state.lastShot?.damage.nam ?? 0) > 0
  );
}

// --- 9. Crater lowers only columns in radius, never below 0 -----------------
{
  const lowGround = Array<number>(COLS).fill(20);
  const state = {
    ground: lowGround,
    tanks: {
      nam: makeTestTank(100, 1),
      linh: makeTestTank(1000, -1),
    },
  };
  const boomX = 500;
  const radius = SHOTS.s2.radius; // 70
  const exp = explode(state, { x: boomX, y: 10 }, "s2");
  const allNonNeg = exp.ground.every((h) => h >= 0);
  const outsideUnchanged = exp.ground.every((h, i) => {
    const colX = i * 4 + 2;
    return Math.abs(colX - boomX) > radius ? h === 20 : h < 20;
  });
  check("crater lowers only columns inside radius and clamps at 0", allNonNeg && outsideUnchanged);
}

// --- 10. Crater to bottom below a tank → tank falls and dies ----------------
{
  const lowGround = Array<number>(COLS).fill(30);
  const state = {
    ground: lowGround,
    tanks: {
      nam: makeTestTank(200, 1),
      linh: makeTestTank(600, -1),
    },
  };
  const exp = explode(state, { x: 600, y: 20 }, "s2"); // radius 70 carves down to 0
  check(
    "tank over a 0-height crater falls and dies",
    exp.fell.includes("linh") && !exp.tanks.linh.alive && exp.tanks.linh.hp === 0
  );
}

// --- 11. drive stops at steep slope, hole, map side, and 0 fuel -------------
{
  // Fuel limit (120)
  const flat = Array<number>(COLS).fill(200);
  check("drive stops when fuel (120) runs out", drive(flat, 500, 900, MAX_FUEL) === 620);
  check("drive with 0 fuel does not move", drive(flat, 500, 600, 0) === 500);

  // Map sides (10 and 1190)
  check("drive stops at left boundary x=10", drive(flat, 50, -20, MAX_FUEL) === 10);
  check("drive stops at right boundary x=1190", drive(flat, 1150, 1250, MAX_FUEL) === 1190);

  // Steep slope (> 6 per column)
  const steep = Array<number>(COLS).fill(200);
  steep[100] = 207; // column 100 covers x = 400..403 (+7 jump from col 99)
  check("drive stops before steep slope (>6/col)", drive(steep, 390, 420, MAX_FUEL) === 399);

  // Gentle slope (<= 6 per column) is climbable
  const gentle = Array<number>(COLS).fill(200);
  gentle[100] = 206;
  check("drive climbs slope of 6/col", drive(gentle, 390, 410, MAX_FUEL) === 410);

  // Hole (ground === 0)
  const hole = Array<number>(COLS).fill(200);
  hole[100] = 0; // x = 400..403
  check("drive stops at edge of hole", drive(hole, 390, 420, MAX_FUEL) === 399);
}

// --- 12. fire input validation & refusals -----------------------------------
{
  const s = newGame("linh", makeRng(5), undefined, 1000);
  const validAim = { toX: s.tanks.linh.x, facing: s.tanks.linh.facing, angle: 45, power: 50, kind: "s1" as const };

  const wrongTurn = fire(s, "nam", validAim);
  check("fire refuses wrong turn", !wrongTurn.ok && wrongTurn.reason === "Chưa tới lượt em nha 😝");

  const badAngle1 = fire(s, "linh", { ...validAim, angle: -1 });
  const badAngle2 = fire(s, "linh", { ...validAim, angle: 91 });
  const badAngle3 = fire(s, "linh", { ...validAim, angle: 45.5 });
  check(
    "fire refuses invalid angle",
    !badAngle1.ok && !badAngle2.ok && !badAngle3.ok && badAngle1.reason === "Góc hoặc lực không hợp lệ"
  );

  const badPower1 = fire(s, "linh", { ...validAim, power: -0.1 });
  const badPower2 = fire(s, "linh", { ...validAim, power: 100.1 });
  const badPower3 = fire(s, "linh", { ...validAim, power: Number.NaN });
  check(
    "fire refuses invalid power",
    !badPower1.ok && !badPower2.ok && !badPower3.ok && badPower1.reason === "Góc hoặc lực không hợp lệ"
  );

  const earlySS = fire(s, "linh", { ...validAim, kind: "ss" });
  check("fire refuses SS before 3 shots", !earlySS.ok && earlySS.reason === "Chưa đủ lực cho SS ⚡");

  const overState: TankState = { ...s, status: "over", winner: "linh", endReason: "hp" };
  const afterOver = fire(overState, "linh", validAim);
  check("fire refuses when game is over", !afterOver.ok && afterOver.reason === "Ván này xong rồi, chơi ván mới nhé 🎉");
}

// --- 13. SS charge counter: ready after 3 own shots, resets after use -------
{
  let s = newGame("nam", makeRng(77), undefined, 1000);
  // Make sure nobody dies during charge test by firing gently away
  s.tanks.nam = makeTestTank(200, -1);
  s.tanks.linh = makeTestTank(1000, 1);

  for (let i = 1; i <= 3; i++) {
    const rNam = fire(s, "nam", { toX: s.tanks.nam.x, facing: -1, angle: 45, power: 5, kind: "s1" });
    if (!rNam.ok) throw new Error(rNam.reason);
    s = rNam.state;
    check(`Nam shotsSinceSS is ${i} after shot ${i}`, s.tanks.nam.shotsSinceSS === i);

    const rLinh = fire(s, "linh", { toX: s.tanks.linh.x, facing: 1, angle: 45, power: 5, kind: "s2" });
    if (!rLinh.ok) throw new Error(rLinh.reason);
    s = rLinh.state;
  }

  // Now Nam has shotsSinceSS === 3 -> SS is allowed and resets counter to 0
  const rSS = fire(s, "nam", { toX: s.tanks.nam.x, facing: -1, angle: 45, power: 5, kind: "ss" });
  check("SS succeeds after 3 own shots and resets shotsSinceSS to 0", rSS.ok && rSS.state.tanks.nam.shotsSinceSS === 0);
}

// --- 14. End conditions: hp, fell, both (draw), resign & nextGame -----------
{
  // End by HP
  const sHp = newGame("nam", makeRng(101), undefined, 1000);
  sHp.ground = Array<number>(COLS).fill(200);
  sHp.tanks.nam = makeTestTank(400, 1, 1000);
  sHp.tanks.linh = makeTestTank(420, -1, 100);
  sHp.wind = 0;
  const rHp = fire(sHp, "nam", { toX: 400, facing: 1, angle: 0, power: 30, kind: "s1" });
  check(
    "endReason 'hp' when opponent HP hits 0",
    rHp.ok && rHp.state.status === "over" && rHp.state.winner === "nam" && rHp.state.endReason === "hp" && rHp.state.tally.nam === 1
  );

  // End by fell
  const sFell = newGame("nam", makeRng(102), undefined, 1000);
  sFell.ground = Array<number>(COLS).fill(25);
  sFell.tanks.nam = makeTestTank(100, 1, 1000);
  sFell.tanks.linh = makeTestTank(220, -1, 1000);
  sFell.wind = 0;
  const rFell = fire(sFell, "nam", { toX: 100, facing: 1, angle: 0, power: 40, kind: "s2" });
  check(
    "endReason 'fell' when crater drops opponent to y=0",
    rFell.ok && rFell.state.status === "over" && rFell.state.winner === "nam" && rFell.state.endReason === "fell" && rFell.state.tally.nam === 1
  );

  // End by both (draw)
  const sBoth = newGame("nam", makeRng(103), undefined, 1000);
  sBoth.ground = Array<number>(COLS).fill(200);
  sBoth.tanks.nam = makeTestTank(500, 1, 100);
  sBoth.tanks.linh = makeTestTank(515, -1, 100);
  sBoth.wind = 0;
  const rBoth = fire(sBoth, "nam", { toX: 500, facing: 1, angle: 0, power: 20, kind: "s1" });
  check(
    "endReason 'both' (draw) when both tanks die on one shot",
    rBoth.ok &&
      rBoth.state.status === "over" &&
      rBoth.state.endReason === "both" &&
      rBoth.state.winner === undefined &&
      rBoth.state.tally.draws === 1
  );

  // End by resign (works even on the other player's turn)
  const sRes = newGame("nam", makeRng(104), undefined, 1000);
  const rRes = resign(sRes, "linh", 1005);
  check(
    "resign on either turn awards win to other player",
    rRes.ok &&
      rRes.state.status === "over" &&
      rRes.state.winner === "nam" &&
      rRes.state.endReason === "resign" &&
      rRes.state.tally.nam === 1
  );

  // nextGame alternates starter and keeps tally
  if (rRes.ok) {
    const n1 = nextGame(rRes.state, makeRng(105), 2000);
    check(
      "nextGame alternates starter and preserves tally",
      n1.startedBy === "linh" &&
        n1.turn === "linh" &&
        n1.status === "playing" &&
        n1.tally.nam === 1 &&
        n1.winner === undefined &&
        n1.endReason === undefined &&
        n1.lastShot === undefined
    );
  }
}

// --- 15. Firestore compatibility & document size (< 10 KB) ------------------
{
  const s = newGame("linh", makeRng(55), undefined, 1000);
  const r = fire(s, "linh", { toX: s.tanks.linh.x, facing: s.tanks.linh.facing, angle: 45, power: 75, kind: "s1" });
  if (!r.ok) throw new Error(r.reason);
  const bytes = Buffer.byteLength(JSON.stringify(r.state), "utf8");
  check("no undefined or nested arrays in state", !hasUndefinedOrNestedArray(r.state));
  check(`serialized state is under 10 KB (got ${bytes} bytes)`, bytes < 10_240);
}

// --- 16. 500 random games ---------------------------------------------------
{
  const rng = makeRng(2026);
  let games = 0;
  let bad = 0;
  const reasons = { hp: 0, fell: 0, both: 0 };

  for (let g = 0; g < 500; g++) {
    let s = newGame(g % 2 === 0 ? "linh" : "nam", rng, undefined, g * 1000);
    let turns = 0;
    while (s.status === "playing" && turns < 300) {
      turns++;
      const me = s.turn;
      const myTank = s.tanks[me];
      const oppTank = s.tanks[other(me)];

      // Random drive toward or around current x
      const toX = myTank.x + Math.floor((rng() - 0.5) * 300);
      // Mostly face opponent so games end naturally, with occasional random facing
      const dirToOpp: 1 | -1 = oppTank.x >= myTank.x ? 1 : -1;
      const facing: 1 | -1 = rng() < 0.85 ? dirToOpp : (rng() < 0.5 ? 1 : -1);

      // Estimate approximate ballistic power for distance + random spread
      const dist = Math.abs(oppTank.x - myTank.x);
      const angle = Math.floor(25 + rng() * 55); // 25..79°
      const rad = (angle * Math.PI) / 180;
      const sin2 = Math.max(0.2, Math.sin(2 * rad));
      const approxPower = Math.sqrt((dist * 400) / sin2) / 7;
      const power = Math.max(5, Math.min(100, Math.round(approxPower + (rng() - 0.5) * 40)));

      const kinds: ShotKind[] = myTank.shotsSinceSS >= 3 ? ["s1", "s2", "ss"] : ["s1", "s2"];
      const kind = kinds[Math.floor(rng() * kinds.length)];

      const res = fire(s, me, { toX, facing, angle, power, kind }, rng, g * 1000 + turns);
      if (!res.ok) {
        bad++;
        break;
      }
      s = res.state;

      if (
        s.tanks.nam.hp < 0 ||
        s.tanks.linh.hp < 0 ||
        s.ground.some((h) => h < 0 || h > MAX_GROUND) ||
        hasUndefinedOrNestedArray(s)
      ) {
        bad++;
        break;
      }
    }

    if (s.status !== "over") {
      bad++;
    } else {
      games++;
      if (s.endReason === "hp" || s.endReason === "fell" || s.endReason === "both") {
        reasons[s.endReason]++;
      }
    }
  }

  check(
    `500 random games all end cleanly (hp: ${reasons.hp}, fell: ${reasons.fell}, both: ${reasons.both})`,
    bad === 0 && games === 500
  );
}

// --- 18. chooseMobile updates player's mobile and nextGame preserves it ------
{
  const g0 = newGame("linh", makeRng(99), undefined, 1000);
  const c1 = chooseMobile(g0, "nam", "dragon", 1010);
  const c2 = c1.ok ? chooseMobile(c1.state, "linh", "mage", 1020) : c1;
  const gNext = c2.ok ? nextGame(c2.state, makeRng(100), 2000) : g0;
  check(
    "chooseMobile updates mobile and nextGame preserves both players' mobiles",
    c2.ok &&
      c2.state.tanks.nam.mobile === "dragon" &&
      c2.state.tanks.linh.mobile === "mage" &&
      gNext.tanks.nam.mobile === "dragon" &&
      gNext.tanks.linh.mobile === "mage"
  );
}

// --- 19. Motion (visual only): every mobile moves, settles, and stays stable --
{
  const flat = () => 300;
  const sim = (
    id: (typeof MOBILES)[number]["id"],
    fromX: number,
    toX: number,
    secs: number,
    groundAt: (x: number) => number = flat,
    alive = true
  ) => {
    const body = newBody(fromX, groundAt);
    let contacts = 0;
    let maxX = -Infinity;
    let minGapBelow = Infinity;
    let pose = stepBody(body, { x: fromX, groundAt, alive }, MOTION[id], 0, 0);
    for (let i = 1; i <= Math.round(secs * 60); i++) {
      pose = stepBody(body, { x: toX, groundAt, alive }, MOTION[id], 1 / 60, i / 60);
      if (pose.contact) contacts++;
      maxX = Math.max(maxX, body.x);
      minGapBelow = Math.min(minGapBelow, body.gy - groundAt(body.x));
    }
    return { body, pose, contacts, maxX, minGapBelow };
  };

  check(
    "every mobile has a motion profile",
    MOBILES.every((m) => MOTION[m.id] !== undefined)
  );

  const allSettle = MOBILES.every((m) => {
    const r = sim(m.id, 500, 600, 1.5);
    return r.body.x === 600 && r.maxX <= 600.5 && r.pose.moving < 0.05;
  });
  check("each mobile reaches the engine x without overshoot and stops", allSettle);

  const far = sim("armor", 100, 900, 1 / 60);
  check("a jump of more than 160 units snaps (new game, first frame)", far.body.x === 900);

  const dragon = sim("dragon", 400, 500, 2);
  const armor = sim("armor", 400, 500, 2);
  check(
    `dragon hops while it moves (${dragon.contacts} landings), armor does not`,
    dragon.contacts >= 3 && armor.contacts === 0
  );

  const hoverAlive = sim("mage", 500, 500, 1);
  const hoverDead = sim("mage", 500, 500, 1, flat, false);
  check(
    "mage hovers above the ground when alive and rests on it when dead",
    hoverAlive.pose.lift > 3 && hoverDead.pose.lift === 0
  );

  // Crater under a walker: the ground drops 40 units → the body falls and lands
  {
    let g = 300;
    const groundAt = () => g;
    const body = newBody(600, groundAt);
    for (let i = 0; i < 30; i++) stepBody(body, { x: 600, groundAt, alive: true }, MOTION.turtle, 1 / 60, i / 60);
    g = 260;
    let landedBy = -1;
    let lowest = Infinity;
    for (let i = 0; i < 120; i++) {
      stepBody(body, { x: 600, groundAt, alive: true }, MOTION.turtle, 1 / 60, i / 60);
      lowest = Math.min(lowest, body.gy - g);
      if (landedBy < 0 && Math.abs(body.gy - g) < 0.01) landedBy = i;
    }
    check(
      `a walker falls into a crater and lands (frame ${landedBy}), never sinks far below`,
      landedBy > 0 && landedBy < 30 && lowest > -3 && Math.abs(body.gy - g) < 0.5
    );
  }

  // Recoil and hit kicks settle back
  {
    const body = newBody(600, flat);
    kick(body, { recoil: -180, liftv: 250, rotv: 6 });
    let pose = stepBody(body, { x: 600, groundAt: flat, alive: true }, MOTION.armor, 1 / 60, 0);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      pose = stepBody(body, { x: 600, groundAt: flat, alive: true }, MOTION.armor, 1 / 60, i / 60);
      peak = Math.max(peak, Math.abs(body.recoil));
    }
    check(
      "recoil and knock-back kicks move the body, then settle within 2 s",
      peak > 2 && Math.abs(body.recoil) < 0.3 && Math.abs(body.gy - 300) < 0.5 && Math.abs(pose.rot) < 0.03
    );
  }

  // Stability: random frame times (also 0, huge and NaN) on bumpy ground
  {
    const rng = makeRng(7);
    const bumpy = (x: number) => 300 + 40 * Math.sin(x * 0.05);
    let ok = true;
    for (const m of MOBILES) {
      const body = newBody(300, bumpy);
      let t = 0;
      for (let i = 0; i < 1200; i++) {
        const r = rng();
        const dt = r < 0.02 ? NaN : r < 0.04 ? 0 : r < 0.06 ? 5 : r * 0.05;
        t += Number.isFinite(dt) ? dt : 0;
        const target = 300 + Math.round(rng() * 120) * (i % 200 < 100 ? 1 : -1) + 120;
        const pose = stepBody(body, { x: target, groundAt: bumpy, alive: i < 1000 }, MOTION[m.id], dt, t);
        if (i % 97 === 0) kick(body, { recoil: (rng() - 0.5) * 300, liftv: rng() * 300, rotv: (rng() - 0.5) * 10 });
        const vals = [pose.x, pose.ground, pose.lift, pose.rot, pose.sx, pose.sy];
        if (!vals.every(Number.isFinite) || Math.abs(pose.rot) > 0.6 || pose.sy < 0.7 || pose.sy > 1.3) ok = false;
      }
    }
    check("motion stays finite and bounded with random frame times and kicks", ok);
  }
}

// --- 20. Ground contact (visual): smooth ground, two-point support, slope speed --
{
  const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

  // Smooth ground: column centers are exact, halfway between them is the mean
  const steps = Array.from({ length: COLS }, (_, i) => (i % 2 === 0 ? 300 : 340));
  const sm = smoothGround(steps);
  check(
    "smoothGround passes through column centers and blends between them",
    near(sm(2), 300) && near(sm(6), 340) && near(sm(4), 320) && near(sm(0), 300) && near(sm(1199.9), 340)
  );

  const flat = () => 300;
  const sFlat = support(flat, 600, 20);
  check("support on flat ground: height = ground, no tilt", near(sFlat.height, 300) && near(sFlat.tilt, 0));

  const ramp = (x: number) => 200 + 0.3 * x; // rises to the right
  const sRamp = support(ramp, 600, 20);
  check(
    "support on a ramp: height = ground at the center, tilt = −atan(slope)",
    near(sRamp.height, 380) && near(sRamp.tilt, -Math.atan(0.3), 1e-6)
  );

  // A narrow dip (8 units wide, 50 deep) under the center: the body bridges it
  const dip = (x: number) => (Math.abs(x - 600) < 4 ? 250 : 300);
  const sDip = support(dip, 600, 20);
  check("a mobile bridges a small dip instead of dropping into it", near(sDip.height, 300) && near(sDip.tilt, 0));

  // A peak just left of the center: the body rests on the peak and the right contact
  const peak = (x: number) => 300 - Math.abs(x - 595) * 1.2;
  const sPeak = support(peak, 600, 20);
  check(
    "on a peak the body pivots on the top and leans down toward the side of its center",
    near(sPeak.height, peak(600)) && sPeak.tilt > 0 &&
      near(support(peak, 590, 20).height, peak(590)) && support(peak, 590, 20).tilt < 0
  );

  // Center just past a crater edge: the body tips toward the hole
  const edge = (x: number) => (x < 597 ? 300 : 120);
  const sEdge = support(edge, 600, 20);
  check("past a crater edge the body tips toward the hole", sEdge.tilt >= 0.49 && sEdge.height < 300);

  // Slope feel: driving 60 units takes longer uphill than on flat ground, and less downhill
  const timeTo = (g: (x: number) => number, from: number, to: number) => {
    const body = newBody(from, g, 0, MOTION.armor.foot);
    for (let i = 1; i <= 600; i++) {
      stepBody(body, { x: to, groundAt: g, alive: true }, MOTION.armor, 1 / 60, i / 60);
      if (Math.abs(body.x - to) < 1) return i;
    }
    return 999;
  };
  const up = timeTo(ramp, 500, 560);
  const lvl = timeTo(flat, 500, 560);
  const down = timeTo(ramp, 560, 500);
  check(`uphill is slower, downhill faster (frames: up ${up}, flat ${lvl}, down ${down})`, up > lvl && down < lvl);

  // Driving across stepped ground: the shown height changes smoothly (no stair jumps)
  {
    const g = smoothGround(Array.from({ length: COLS }, (_, i) => 250 + 4 * Math.floor(i / 3)));
    const body = newBody(400, g, 0, MOTION.armor.foot);
    let maxJump = 0;
    let prev = body.gy;
    for (let i = 1; i <= 120; i++) {
      stepBody(body, { x: 400 + i, groundAt: g, alive: true }, MOTION.armor, 1 / 60, i / 60);
      maxJump = Math.max(maxJump, Math.abs(body.gy - prev));
      prev = body.gy;
    }
    check(`a mobile rolls smoothly over stepped ground (max ${maxJump.toFixed(2)} units per frame)`, maxJump < 1);
  }
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
