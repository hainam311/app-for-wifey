import type { MobileId } from "./engine"; // type-only: safe in client and Node
import { COLS, COL_W } from "./terrain";

// Bắn tăng — procedural motion for the mobiles (visual only).
// Each screen runs this locally to make a mobile move like a tank, a hovercraft,
// a dragon, a spider, a turtle or a cloud. Nothing here goes to Firestore and
// nothing here changes the game result: the engine's x is always the target.

export type Gait = "tracks" | "hover" | "hop" | "skitter" | "waddle" | "float";
export type Trail = "dust" | "smoke" | "sparkle";

export type MotionProfile = {
  gait: Gait;
  stride: number; // world units for one gait cycle
  bob: number; // vertical bob while moving (units)
  hop: number; // hop height (hop gait only)
  waddle: number; // side-to-side roll while moving (rad)
  rumble: number; // engine shake while moving (units)
  idleRumble: number; // engine shake while standing (units)
  hoverLift: number; // constant height above the ground (units)
  floatAmp: number; // idle float up and down (units)
  floatHz: number;
  breathe: number; // idle squash-and-stretch (fraction of size)
  terrainTilt: number; // 0..1, how much the body follows the slope
  foot: number; // half-width of the support (front and rear contact), units
  pitchK: number; // nose up on speed-up, nose down on brake (rad per unit/s²)
  leanK: number; // lean into the direction of travel (rad per unit/s)
  springW: number; // suspension stiffness (rad/s)
  springZ: number; // suspension damping ratio (< 1 bounces)
  squash: number; // squash on landing (fraction of size)
  trails: Trail[];
};

export const MOTION: Record<MobileId, MotionProfile> = {
  // Heavy tank: stiff treads, engine rumble, smoke and dust, rocks on stop
  armor: {
    gait: "tracks",
    stride: 10,
    bob: 0.4,
    hop: 0,
    waddle: 0,
    rumble: 0.7,
    idleRumble: 0.25,
    hoverLift: 0,
    floatAmp: 0,
    floatHz: 0,
    breathe: 0,
    terrainTilt: 1,
    foot: 24,
    pitchK: 0.00045,
    leanK: 0,
    springW: 16,
    springZ: 0.45,
    squash: 0,
    trails: ["dust", "smoke"],
  },
  // Hovercraft: floats above the ground, leans into travel, ignores small bumps
  mage: {
    gait: "hover",
    stride: 40,
    bob: 0,
    hop: 0,
    waddle: 0,
    rumble: 0,
    idleRumble: 0,
    hoverLift: 7,
    floatAmp: 2.5,
    floatHz: 0.8,
    breathe: 0,
    terrainTilt: 0.35,
    foot: 16,
    pitchK: 0,
    leanK: 0.0016,
    springW: 7,
    springZ: 0.6,
    squash: 0,
    trails: ["sparkle"],
  },
  // Baby dragon: small hops with a squash on each landing, breathes at rest
  dragon: {
    gait: "hop",
    stride: 22,
    bob: 0,
    hop: 9,
    waddle: 0.04,
    rumble: 0,
    idleRumble: 0,
    hoverLift: 0,
    floatAmp: 0,
    floatHz: 0,
    breathe: 0.025,
    terrainTilt: 0.8,
    foot: 12,
    pitchK: 0.0002,
    leanK: 0.0006,
    springW: 14,
    springZ: 0.5,
    squash: 0.14,
    trails: ["dust"],
  },
  // Spider robot: fast short steps, quick jitter, stays level
  spider: {
    gait: "skitter",
    stride: 7,
    bob: 1.3,
    hop: 0,
    waddle: 0.02,
    rumble: 0.35,
    idleRumble: 0.12,
    hoverLift: 0,
    floatAmp: 0,
    floatHz: 0,
    breathe: 0.01,
    terrainTilt: 0.6,
    foot: 22,
    pitchK: 0.00015,
    leanK: 0.0004,
    springW: 22,
    springZ: 0.7,
    squash: 0,
    trails: ["dust"],
  },
  // Turtle: slow heavy waddle from side to side
  turtle: {
    gait: "waddle",
    stride: 26,
    bob: 1.2,
    hop: 0,
    waddle: 0.09,
    rumble: 0,
    idleRumble: 0,
    hoverLift: 0,
    floatAmp: 0,
    floatHz: 0,
    breathe: 0.02,
    terrainTilt: 1,
    foot: 22,
    pitchK: 0.0003,
    leanK: 0,
    springW: 10,
    springZ: 0.55,
    squash: 0.04,
    trails: ["dust"],
  },
  // Cloud car: soft float, gentle lean, sparkles
  unicorn: {
    gait: "float",
    stride: 30,
    bob: 0.8,
    hop: 0,
    waddle: 0.03,
    rumble: 0,
    idleRumble: 0,
    hoverLift: 4,
    floatAmp: 2,
    floatHz: 0.6,
    breathe: 0.02,
    terrainTilt: 0.5,
    foot: 18,
    pitchK: 0,
    leanK: 0.001,
    springW: 8,
    springZ: 0.55,
    squash: 0,
    trails: ["sparkle"],
  },
};

// Local per-screen state of one mobile's body.
export type MotionBody = {
  x: number; // shown x (follows the engine x with inertia)
  vx: number;
  ax: number; // smoothed acceleration (for pitch)
  gy: number; // suspended ground height (follows the real ground with a spring)
  gyv: number;
  rot: number; // body rotation (rad, canvas: positive = clockwise)
  rotv: number;
  recoil: number; // x kick after a shot (units)
  recoilv: number;
  phase: number; // distance travelled (units), drives the gait
  moving: number; // 0..1, smoothed "is moving"
  landed: number; // 0..1, squash after a hop landing
  seed: number; // phase offset so two mobiles do not float in sync
};

export type Pose = {
  x: number; // world x to draw at
  ground: number; // suspended ground height
  lift: number; // height above `ground` (units)
  rot: number; // rad, canvas convention
  sx: number; // horizontal scale
  sy: number; // vertical scale
  moving: number; // 0..1
  speed: number; // |vx| in units/s
  contact: boolean; // a hop landed on this frame
  grade: number; // slope in the direction of travel (> 0 = climbing)
};

export type MotionTarget = {
  x: number; // engine x of the tank
  groundAt: (x: number) => number;
  alive: boolean;
};

const SNAP_DIST = 160; // farther than this → jump there (new game, first frame)
const FOLLOW_W = 16; // x follows the engine x with a critically damped spring
const MAX_SUBSTEP = 1 / 120;
const MAX_TILT = 0.5;
const FALL_G = 900; // visual gravity for falls (units/s²)

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// The engine ground is 300 flat steps (4 units each). For drawing and contact,
// blend linearly between column centers so a mobile rolls on a smooth surface.
export function smoothGround(ground: readonly number[]): (x: number) => number {
  return (x: number) => {
    const f = x / COL_W - 0.5;
    const i0 = clamp(Math.floor(f), 0, COLS - 1);
    const i1 = Math.min(COLS - 1, i0 + 1);
    const t = clamp(f - i0, 0, 1);
    return (ground[i0] ?? 0) * (1 - t) + (ground[i1] ?? 0) * t;
  };
}

export type Support = { height: number; tilt: number; slope: number };

const SUPPORT_SAMPLES = 9;

// A rigid body with its center of mass at `x` rests on the upper hull of the
// ground under its footprint (x − foot … x + foot): on two contacts that bracket
// the center. Thus it bridges small dips, balances on a peak between two
// contacts, and tips toward a crater edge when the center is past the edge.
export function support(
  groundAt: (x: number) => number,
  x: number,
  foot: number
): Support {
  const hull: Array<[number, number]> = [];
  for (let k = 0; k < SUPPORT_SAMPLES; k++) {
    const px = x - foot + (2 * foot * k) / (SUPPORT_SAMPLES - 1);
    const pt: [number, number] = [px, groundAt(px)];
    // Upper hull (monotone chain): drop points below the new chord
    while (hull.length >= 2) {
      const [ax, ay] = hull[hull.length - 2];
      const [bx, by] = hull[hull.length - 1];
      const cross = (bx - ax) * (pt[1] - ay) - (by - ay) * (pt[0] - ax);
      if (cross >= 0) hull.pop();
      else break;
    }
    hull.push(pt);
  }
  let i = 0;
  while (i < hull.length - 2 && hull[i + 1][0] < x) i++;
  const [ax, ay] = hull[i];
  const [bx, by] = hull[Math.min(i + 1, hull.length - 1)];
  const slope = bx > ax ? (by - ay) / (bx - ax) : 0;
  return {
    height: ay + slope * (x - ax),
    tilt: clamp(-Math.atan(slope), -MAX_TILT, MAX_TILT),
    slope,
  };
}

export function newBody(
  x: number,
  groundAt: (x: number) => number,
  seed = 0,
  foot = 16
): MotionBody {
  const sup = support(groundAt, x, foot);
  return {
    x,
    vx: 0,
    ax: 0,
    gy: sup.height,
    gyv: 0,
    rot: sup.tilt,
    rotv: 0,
    recoil: 0,
    recoilv: 0,
    phase: 0,
    moving: 0,
    landed: 0,
    seed,
  };
}

// Kicks from game events. `recoil` is a velocity in units/s along x,
// `liftv` pushes the body up (units/s), `rotv` spins it (rad/s).
export function kick(
  body: MotionBody,
  impulse: { recoil?: number; liftv?: number; rotv?: number }
): void {
  body.recoilv += impulse.recoil ?? 0;
  body.gyv += impulse.liftv ?? 0;
  body.rotv += impulse.rotv ?? 0;
}

// Damped spring toward `target`. Returns [value, velocity].
function spring(
  v: number,
  vel: number,
  target: number,
  w: number,
  z: number,
  dt: number
): [number, number] {
  const a = w * w * (target - v) - 2 * z * w * vel;
  const nextVel = vel + a * dt;
  return [v + nextVel * dt, nextVel];
}

// Advances `body` by `dt` seconds toward `target` and returns the pose to draw.
// `t` is the time in seconds (for idle float and engine rumble).
export function stepBody(
  body: MotionBody,
  target: MotionTarget,
  p: MotionProfile,
  dt: number,
  t: number
): Pose {
  if (!Number.isFinite(dt) || dt <= 0) dt = 0;
  dt = Math.min(dt, 0.1);

  if (Math.abs(target.x - body.x) > SNAP_DIST) {
    Object.assign(body, newBody(target.x, target.groundAt, body.seed, p.foot));
  }

  const prevPhase = body.phase;
  const prevVx = body.vx;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(MAX_SUBSTEP, left);
    left -= h;

    // 1. x follows the engine x (critically damped: no overshoot past the target).
    //    Uphill the mobile is slower, downhill a little faster.
    const sup0 = support(target.groundAt, body.x, p.foot);
    const dir = Math.sign(target.x - body.x);
    const grade = sup0.slope * dir; // > 0 = climbing
    const followW = FOLLOW_W * clamp(1 - grade * 0.9, 0.55, 1.3);
    [body.x, body.vx] = spring(body.x, body.vx, target.x, followW, 1, h);
    if (Math.abs(target.x - body.x) < 0.05 && Math.abs(body.vx) < 1) {
      body.x = target.x;
      body.vx = 0;
    }
    body.phase += Math.abs(body.vx) * h;

    // 2. Height: walkers fall with gravity when the ground drops away (crater,
    //    kick) and land with a squash. Hovers ride a soft spring. A rise in the
    //    ground pushes every body up through the same spring (suspension).
    const sup = support(target.groundAt, body.x, p.foot);
    const ground = sup.height;
    const floaty = p.gait === "hover" || p.gait === "float";
    if (ground - body.gy > 60) {
      body.gy = ground;
      body.gyv = 0;
    } else if (!floaty && body.gy > ground + 0.5) {
      body.gyv -= FALL_G * h;
      body.gy += body.gyv * h;
      if (body.gy <= ground) {
        const impact = -body.gyv;
        body.gy = ground;
        body.gyv = impact > 60 ? impact * 0.18 : 0;
        if (impact > 90) body.landed = Math.max(body.landed, Math.min(1, impact / 350));
      }
    } else {
      [body.gy, body.gyv] = spring(body.gy, body.gyv, ground, p.springW, p.springZ, h);
    }

    // 3. Rotation: slope + pitch from acceleration + lean into travel
    const pitch = clamp(-body.ax * p.pitchK, -0.16, 0.16);
    const lean = clamp(body.vx * p.leanK, -0.22, 0.22);
    const rotTarget = target.alive
      ? sup.tilt * p.terrainTilt + pitch + lean
      : sup.tilt;
    [body.rot, body.rotv] = spring(body.rot, body.rotv, rotTarget, p.springW, p.springZ, h);

    // 4. Recoil: a bouncy spring back to 0
    body.recoilv += -body.recoil * 400 * h - body.recoilv * 14 * h;
    body.recoil += body.recoilv * h;
  }

  if (dt > 0) {
    const rawAx = (body.vx - prevVx) / dt;
    body.ax += (rawAx - body.ax) * Math.min(1, dt * 10);
  }
  const movingTarget = Math.abs(body.vx) > 4 ? 1 : 0;
  body.moving += (movingTarget - body.moving) * Math.min(1, dt * 8);

  // Hop landings: one per stride
  let contact = false;
  if (p.gait === "hop" && Math.floor(body.phase / p.stride) > Math.floor(prevPhase / p.stride)) {
    contact = true;
    body.landed = 1;
  }
  body.landed *= Math.exp(-dt * 9);

  const grade = support(target.groundAt, body.x, p.foot).slope * Math.sign(body.vx);
  return { ...pose(body, target.alive, p, t, contact), grade };
}

function pose(
  body: MotionBody,
  alive: boolean,
  p: MotionProfile,
  t: number,
  contact: boolean
): Omit<Pose, "grade"> {
  const m = body.moving;
  const cycle = body.phase / Math.max(1, p.stride);
  const frac = cycle - Math.floor(cycle);
  const tau = Math.PI * 2;

  let lift = 0;
  let rot = body.rot;
  let sx = 1;
  let sy = 1;

  if (alive) {
    lift += p.hoverLift;
    lift += p.floatAmp * Math.sin(tau * p.floatHz * t + body.seed);
    if (p.gait === "hop") {
      lift += m * p.hop * Math.sin(Math.PI * frac);
    } else {
      lift += m * p.bob * Math.abs(Math.sin(Math.PI * cycle));
    }
    const shake = p.rumble * m + p.idleRumble;
    lift += shake * 0.5 * (Math.sin(t * 83 + body.seed) + Math.sin(t * 127 + 1.3));
    rot += m * p.waddle * Math.sin(tau * cycle);

    const breath = p.breathe * (1 - m) * Math.sin(tau * 0.9 * t + body.seed);
    const sq = Math.max(p.squash, 0.08) * body.landed;
    sy = 1 + breath - sq;
    sx = 1 - breath * 0.5 + sq * 0.6;
  }

  return {
    x: body.x + body.recoil,
    ground: body.gy,
    lift,
    rot: clamp(rot, -0.6, 0.6),
    sx,
    sy,
    moving: m,
    speed: Math.abs(body.vx),
    contact,
  };
}
