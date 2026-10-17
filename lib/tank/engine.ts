import type { Who } from "@/lib/session"; // type-only: safe in client and Node
import {
  COL_W,
  TANK_R,
  WORLD_H,
  WORLD_W,
  groundAt,
  makeGround,
  tankY,
} from "./terrain";

// Bắn tăng — pure game rules & 2D artillery physics.
// No Firestore or DOM imports: the shooter's browser runs `fire` inside a
// Firestore transaction and writes the resulting state + trajectory so both
// screens replay the exact same outcome.

export type Player = Who;
export type ShotKind = "s1" | "s2" | "ss";
export type MobileId =
  | "armor"
  | "mage"
  | "dragon"
  | "spider"
  | "turtle"
  | "unicorn";

export const MOBILES: ReadonlyArray<{
  id: MobileId;
  name: string;
  subtitle: string;
  sprite: string;
}> = [
  {
    id: "armor",
    name: "Armor Bear",
    subtitle: "Đại bác hạng nặng",
    sprite: "/tanks/samples/01-armor-bear.png",
  },
  {
    id: "mage",
    name: "Mage Hover",
    subtitle: "Đĩa bay pha lê",
    sprite: "/tanks/samples/02-mage-hover.png",
  },
  {
    id: "dragon",
    name: "Baby Dragon",
    subtitle: "Rồng lửa GunBound",
    sprite: "/tanks/samples/03-baby-dragon.png",
  },
  {
    id: "spider",
    name: "Nak Spider",
    subtitle: "Nhện máy Plasma",
    sprite: "/tanks/samples/04-spider-mecha.png",
  },
  {
    id: "turtle",
    name: "Turtle Cannon",
    subtitle: "Rùa thần công",
    sprite: "/tanks/samples/05-turtle-cannon.png",
  },
  {
    id: "unicorn",
    name: "Unicorn Cloud",
    subtitle: "Mây kỳ lân hồng",
    sprite: "/tanks/samples/06-pink-cloud-unicorn.png",
  },
];

export const DEFAULT_MOBILE: Record<Player, MobileId> = {
  nam: "armor",
  linh: "unicorn",
};

export type Tank = {
  x: number; // world units, integer
  hp: number; // 0..1000
  facing: 1 | -1; // 1 = right, -1 = left
  shotsSinceSS: number; // SS is ready at 3
  alive: boolean; // false after 0 HP or a fall
  lastAngle: number; // aim of the last shot (GunBound-style marker)
  lastPower: number;
  mobile?: MobileId; // selected GunBound mobile sprite
};

export type Boom = {
  x: number;
  y: number;
  r: number;
};

export type LastShot = {
  n: number; // 1, 2, 3 ... — animation starts when this changes
  by: Player;
  kind: ShotKind;
  fromX: number; // tank x after driving
  angle: number;
  power: number;
  wind: number; // wind during this shot
  path: number[]; // flat [x0, y0, x1, y1, ...] (Firestore forbids nested arrays)
  boom?: Boom; // absent when the shot goes out of bounds
  damage: { nam: number; linh: number };
  fell: Player[];
};

export type Tally = { nam: number; linh: number; draws: number };

export type EndReason = "hp" | "fell" | "both" | "resign";

export type TankState = {
  gameId: number; // Date.now() at start; React key of the game view
  ground: number[]; // 300 integers
  tanks: { nam: Tank; linh: Tank };
  turn: Player;
  wind: number; // -10..10, for the current turn
  startedBy: Player;
  status: "playing" | "over";
  winner?: Player; // absent on a draw
  endReason?: EndReason;
  lastShot?: LastShot;
  tally: Tally;
  updatedAt: number;
};

export type Aim = {
  toX: number;
  facing: 1 | -1;
  angle: number;
  power: number;
  kind: ShotKind;
};

export type Result<T> = ({ ok: true } & T) | { ok: false; reason: string };
export type StateResult = Result<{ state: TankState }>;

export const MAX_HP = 1000;
export const MAX_FUEL = 120;
export const MAX_SLOPE = 6;
export const MIN_TANK_X = 10;
export const MAX_TANK_X = WORLD_W - 10;
export const GRAVITY = 400;
export const SPEED_PER_POWER = 7;
export const WIND_ACCEL = 6;
export const DT = 1 / 60;
export const MAX_STEPS = 600;
export const SS_CHARGE = 3;

export const SHOTS: Record<
  ShotKind,
  { label: string; damage: number; radius: number }
> = {
  s1: { label: "Đạn thường", damage: 250, radius: 35 },
  s2: { label: "Đạn khoan", damage: 150, radius: 70 },
  ss: { label: "Đạn siêu cấp", damage: 500, radius: 50 },
};

export const other = (p: Player): Player => (p === "nam" ? "linh" : "nam");

function randomWind(rng: () => number): number {
  return Math.floor(rng() * 21) - 10; // integer in [-10, 10]
}

function makeTank(x: number, facing: 1 | -1, mobile: MobileId): Tank {
  return {
    x,
    hp: MAX_HP,
    facing,
    shotsSinceSS: 0,
    alive: true,
    lastAngle: 45,
    lastPower: 0,
    mobile,
  };
}

export function newGame(
  startedBy: Player,
  rng: () => number = Math.random,
  tally: Tally = { nam: 0, linh: 0, draws: 0 },
  now = Date.now(),
  mobiles: { nam?: MobileId; linh?: MobileId } = {}
): TankState {
  const ground = makeGround(rng);
  const leftX = Math.round(WORLD_W * 0.15 + (rng() - 0.5) * 40);
  const rightX = Math.round(WORLD_W * 0.85 + (rng() - 0.5) * 40);
  const namOnLeft = rng() < 0.5;
  const namMobile = mobiles.nam ?? DEFAULT_MOBILE.nam;
  const linhMobile = mobiles.linh ?? DEFAULT_MOBILE.linh;
  const tanks: { nam: Tank; linh: Tank } = namOnLeft
    ? {
        nam: makeTank(leftX, 1, namMobile),
        linh: makeTank(rightX, -1, linhMobile),
      }
    : {
        nam: makeTank(rightX, -1, namMobile),
        linh: makeTank(leftX, 1, linhMobile),
      };

  return {
    gameId: now,
    ground,
    tanks,
    turn: startedBy,
    wind: randomWind(rng),
    startedBy,
    status: "playing",
    tally: { ...tally },
    updatedAt: now,
  };
}

// "Ván mới": the other player starts, the tally & chosen mobiles carry over.
export function nextGame(
  state: TankState,
  rng: () => number = Math.random,
  now = Date.now()
): TankState {
  const nextId = Math.max(now, state.gameId + 1);
  return newGame(other(state.startedBy), rng, state.tally, nextId, {
    nam: state.tanks.nam.mobile,
    linh: state.tanks.linh.mobile,
  });
}

// Choose or switch your GunBound mobile for the match.
export function chooseMobile(
  state: TankState,
  me: Player,
  mobile: MobileId,
  now = Date.now()
): StateResult {
  if (!MOBILES.some((m) => m.id === mobile)) {
    return { ok: false, reason: "Xe này không hợp lệ 🤔" };
  }
  const next: TankState = {
    ...state,
    tanks: {
      ...state.tanks,
      [me]: {
        ...state.tanks[me],
        mobile,
      },
    },
    updatedAt: now,
  };
  return { ok: true, state: next };
}

// Moves 1 unit per unit of fuel toward `toX`.
// Stops at map edges (10..1190), holes (ground <= 0), slopes > 6 units/col, or 0 fuel.
export function drive(
  ground: readonly number[],
  x: number,
  toX: number,
  fuel: number = MAX_FUEL
): number {
  let curX = Math.round(x);
  const targetX = Math.round(toX);
  const dir = Math.sign(targetX - curX);
  if (dir === 0) return curX;

  const maxSteps = Math.min(
    Math.abs(targetX - curX),
    Math.max(0, Math.floor(fuel))
  );

  for (let s = 0; s < maxSteps; s++) {
    const nextX = curX + dir;
    if (nextX < MIN_TANK_X || nextX > MAX_TANK_X) break;
    const curG = groundAt(ground, curX);
    const nextG = groundAt(ground, nextX);
    if (nextG <= 0) break;
    if (nextG - curG > MAX_SLOPE) break;
    curX = nextX;
  }
  return curX;
}

export type ShotFrom =
  | Player
  | { x: number; y?: number; facing: 1 | -1; by?: Player };

export type SimulationResult =
  | {
      outcome: "hit";
      path: number[];
      boom: { x: number; y: number; directHit?: Player };
    }
  | {
      outcome: "lost";
      path: number[];
    };

export function simulateShot(
  ground: readonly number[],
  tanks: { nam: Tank; linh: Tank },
  from: ShotFrom,
  angle: number,
  power: number,
  wind: number
): SimulationResult {
  const shooterPlayer: Player | undefined =
    typeof from === "string" ? from : from.by;
  const startX = typeof from === "string" ? tanks[from].x : from.x;
  const startY =
    typeof from === "string"
      ? tankY(ground, tanks[from].x)
      : (from.y ?? tankY(ground, from.x));
  const facing: 1 | -1 =
    typeof from === "string" ? tanks[from].facing : from.facing;

  const rad = (angle * Math.PI) / 180;
  const speed = power * SPEED_PER_POWER;
  let vx = Math.cos(rad) * speed * facing;
  let vy = Math.sin(rad) * speed;
  let x = startX;
  let y = startY;

  const path: number[] = [Math.round(x), Math.round(y)];
  const pushFinalPoint = (fx: number, fy: number) => {
    const rx = Math.round(fx);
    const ry = Math.round(fy);
    if (path[path.length - 2] !== rx || path[path.length - 1] !== ry) {
      path.push(rx, ry);
    }
  };

  let leftShooter = shooterPlayer === undefined;

  for (let step = 1; step <= MAX_STEPS; step++) {
    vx += wind * WIND_ACCEL * DT;
    vy -= GRAVITY * DT;
    x += vx * DT;
    y += vy * DT;

    if (step % 2 === 0) {
      path.push(Math.round(x), Math.round(y));
    }

    // 2. Out of left, right, or bottom -> lost
    const worldW = ground.length * COL_W;
    if (x < 0 || x >= worldW || y <= 0) {
      pushFinalPoint(x, y);
      return { outcome: "lost", path };
    }

    // 3. Above top -> shell can come back down
    if (y > WORLD_H) {
      continue;
    }

    if (!leftShooter && shooterPlayer) {
      const st = tanks[shooterPlayer];
      const sy = tankY(ground, st.x);
      if (Math.hypot(x - st.x, y - sy) > TANK_R) {
        leftShooter = true;
      }
    }

    // 4. Direct hit on a tank circle
    for (const p of ["nam", "linh"] as const) {
      const t = tanks[p];
      if (!t.alive) continue;
      if (p === shooterPlayer && !leftShooter) continue;
      const ty = tankY(ground, t.x);
      if (Math.hypot(x - t.x, y - ty) <= TANK_R) {
        const bx = Math.round(x);
        const by = Math.round(y);
        pushFinalPoint(bx, by);
        return {
          outcome: "hit",
          path,
          boom: { x: bx, y: by, directHit: p },
        };
      }
    }

    // 5. Below ground at x -> explode at impact point
    const gy = ground[Math.max(0, Math.min(ground.length - 1, Math.floor(x / COL_W)))] ?? 0;
    if (y <= gy) {
      const bx = Math.round(x);
      const by = Math.round(Math.max(0, Math.min(y, gy)));
      pushFinalPoint(bx, by);
      return {
        outcome: "hit",
        path,
        boom: { x: bx, y: by },
      };
    }
  }

  return { outcome: "lost", path };
}

export type ExplosionResult = {
  ground: number[];
  damage: { nam: number; linh: number };
  fell: Player[];
  tanks: { nam: Tank; linh: Tank };
};

export function explode(
  state: Pick<TankState, "ground" | "tanks">,
  boom: { x: number; y: number; directHit?: Player },
  kind: ShotKind
): ExplosionResult {
  const { damage: maxDamage, radius } = SHOTS[kind];

  // 1. Crater: lower columns within `radius` down to the bottom of the circle.
  const ground = [...state.ground];
  for (let i = 0; i < ground.length; i++) {
    const colX = i * COL_W + COL_W / 2;
    const dx = Math.abs(colX - boom.x);
    if (dx <= radius) {
      const dy = Math.sqrt(radius * radius - dx * dx);
      const bottom = Math.floor(boom.y - dy);
      ground[i] = Math.max(0, Math.min(ground[i], bottom));
    }
  }

  // 2. Damage: d from explosion to tank center (before fall).
  const damage = { nam: 0, linh: 0 };
  const tanks: { nam: Tank; linh: Tank } = {
    nam: { ...state.tanks.nam },
    linh: { ...state.tanks.linh },
  };

  for (const p of ["nam", "linh"] as const) {
    const t = tanks[p];
    if (!t.alive) continue;
    const ty = tankY(state.ground, t.x);
    const rawD = Math.hypot(t.x - boom.x, ty - boom.y);
    const d = boom.directHit === p ? 0 : rawD;
    if (d < radius + TANK_R) {
      const dmg = Math.floor(maxDamage * (1 - (0.5 * d) / (radius + TANK_R)));
      damage[p] = dmg;
      t.hp = Math.max(0, t.hp - dmg);
      if (t.hp === 0) {
        t.alive = false;
      }
    }
  }

  // 3. Fall: if the new ground at tank.x is 0, the tank falls and dies.
  const fell: Player[] = [];
  for (const p of ["nam", "linh"] as const) {
    const t = tanks[p];
    if (groundAt(ground, t.x) <= 0) {
      fell.push(p);
      t.hp = 0;
      t.alive = false;
    }
  }

  return { ground, damage, fell, tanks };
}

const OVER = "Ván này xong rồi, chơi ván mới nhé 🎉";

export function fire(
  state: TankState,
  me: Player,
  aim: Aim,
  rng: () => number = Math.random,
  now = Date.now()
): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  if (state.turn !== me)
    return { ok: false, reason: "Chưa tới lượt em nha 😝" };
  if (
    typeof aim.angle !== "number" ||
    !Number.isInteger(aim.angle) ||
    aim.angle < 0 ||
    aim.angle > 90 ||
    typeof aim.power !== "number" ||
    Number.isNaN(aim.power) ||
    !Number.isFinite(aim.power) ||
    aim.power < 0 ||
    aim.power > 100
  ) {
    return { ok: false, reason: "Góc hoặc lực không hợp lệ" };
  }
  if (aim.kind !== "s1" && aim.kind !== "s2" && aim.kind !== "ss") {
    return { ok: false, reason: "Góc hoặc lực không hợp lệ" };
  }

  const myTank = state.tanks[me];
  if (aim.kind === "ss" && myTank.shotsSinceSS < SS_CHARGE) {
    return { ok: false, reason: "Chưa đủ lực cho SS ⚡" };
  }

  // 1. Drive & update shooter tank facing/charge/last markers
  const fromX = drive(state.ground, myTank.x, aim.toX, MAX_FUEL);
  const facing: 1 | -1 = aim.facing === -1 ? -1 : 1;
  const shotsSinceSS =
    aim.kind === "ss" ? 0 : myTank.shotsSinceSS + 1;

  const movedTanks: { nam: Tank; linh: Tank } = {
    nam: { ...state.tanks.nam },
    linh: { ...state.tanks.linh },
  };
  movedTanks[me] = {
    ...myTank,
    x: fromX,
    facing,
    shotsSinceSS,
    lastAngle: aim.angle,
    lastPower: Math.round(aim.power),
  };

  // 2. Simulate shell flight
  const sim = simulateShot(
    state.ground,
    movedTanks,
    me,
    aim.angle,
    aim.power,
    state.wind
  );

  let ground = [...state.ground];
  let tanks = movedTanks;
  let damage = { nam: 0, linh: 0 };
  let fell: Player[] = [];
  let boom: Boom | undefined;

  // 3. Explode if the shell hit
  if (sim.outcome === "hit") {
    const exp = explode({ ground, tanks }, sim.boom, aim.kind);
    ground = exp.ground;
    tanks = exp.tanks;
    damage = exp.damage;
    fell = exp.fell;
    boom = {
      x: sim.boom.x,
      y: sim.boom.y,
      r: SHOTS[aim.kind].radius,
    };
  }

  const shotN = (state.lastShot?.n ?? 0) + 1;
  const lastShot: LastShot = {
    n: shotN,
    by: me,
    kind: aim.kind,
    fromX,
    angle: aim.angle,
    power: Math.round(aim.power),
    wind: state.wind,
    path: sim.path,
    damage,
    fell,
  };
  if (boom) {
    lastShot.boom = boom;
  }

  const next: TankState = {
    gameId: state.gameId,
    ground,
    tanks,
    turn: other(me),
    wind: randomWind(rng),
    startedBy: state.startedBy,
    status: "playing",
    lastShot,
    tally: { ...state.tally },
    updatedAt: now,
  };

  // 4. Check game end conditions
  const namDead = !tanks.nam.alive || tanks.nam.hp <= 0;
  const linhDead = !tanks.linh.alive || tanks.linh.hp <= 0;

  if (namDead && linhDead) {
    next.status = "over";
    next.endReason = "both";
    next.tally.draws += 1;
    delete next.winner;
  } else if (namDead || linhDead) {
    const dead: Player = namDead ? "nam" : "linh";
    const winner: Player = other(dead);
    next.status = "over";
    next.winner = winner;
    next.endReason = fell.includes(dead) ? "fell" : "hp";
    next.tally[winner] += 1;
  }

  return { ok: true, state: next };
}

// "🏳️ Đầu hàng" — allowed during either turn while the game is playing.
export function resign(
  state: TankState,
  me: Player,
  now = Date.now()
): StateResult {
  if (state.status === "over") return { ok: false, reason: OVER };
  const winner = other(me);
  const next: TankState = {
    ...state,
    status: "over",
    winner,
    endReason: "resign",
    tally: { ...state.tally, [winner]: state.tally[winner] + 1 },
    updatedAt: now,
  };
  return { ok: true, state: next };
}
