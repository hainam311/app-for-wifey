// Bắn tăng — world dimensions and 1D heightmap terrain.
// Pure functions only (no Firestore, no DOM).

export const WORLD_W = 1200;
export const WORLD_H = 600;
export const COLS = 300;
export const COL_W = WORLD_W / COLS; // 4 world units per column
export const MIN_GROUND = 150;
export const MAX_GROUND = 420;
export const TANK_R = 14;
export const TANK_OFFSET_Y = 12; // tank center is 12 units above ground at its x

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Sum of 3 sine waves with random phases. Returns 300 integers in [150, 420].
export function makeGround(rng: () => number = Math.random): number[] {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const ground: number[] = [];
  for (let i = 0; i < COLS; i++) {
    const t = i / COLS;
    const h =
      275 +
      70 * Math.sin(t * Math.PI * 2 * 1.2 + p1) +
      35 * Math.sin(t * Math.PI * 2 * 2.7 + p2) +
      20 * Math.sin(t * Math.PI * 2 * 5.3 + p3);
    ground.push(clamp(Math.round(h), MIN_GROUND, MAX_GROUND));
  }
  return ground;
}

export function colAt(x: number): number {
  return clamp(Math.floor(x / COL_W), 0, COLS - 1);
}

export function groundAt(ground: readonly number[], x: number): number {
  return ground[colAt(x)] ?? 0;
}

export function tankY(ground: readonly number[], x: number): number {
  return groundAt(ground, x) + TANK_OFFSET_Y;
}
