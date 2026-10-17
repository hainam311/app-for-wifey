"use client";

import { useEffect, useRef } from "react";
import {
  COLS,
  COL_W,
  TANK_R,
  WORLD_H,
  WORLD_W,
  groundAt,
  tankY,
} from "@/lib/tank/terrain";
import {
  DEFAULT_MOBILE,
  MAX_HP,
  MOBILES,
  type Aim,
  type LastShot,
  type MobileId,
  type Player,
  type Tank,
  type TankState,
} from "@/lib/tank/engine";

export type ShotPlayback = {
  shot: LastShot;
  preGround: number[];
  preTanks: { nam: Tank; linh: Tank };
  postGround: number[];
  postTanks: { nam: Tank; linh: Tank };
  skipDrive?: boolean;
};

type DamageFloat = {
  player: Player;
  amount: number;
  x: number;
  y: number;
  bornAt: number;
};

type DebrisParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  bornAt: number;
  lifeMs: number;
};

type WindMote = {
  x: number;
  y: number;
  size: number;
  speedMul: number;
  driftY: number;
  phase: number;
};

type Props = {
  state: TankState;
  aim: Aim;
  actualX: number; // shooter tank x after local drive
  myTurn: boolean;
  playable: boolean;
  activePlayback: ShotPlayback | null;
  finishedShotN: number;
  onPlaybackDone: (shotN: number) => void;
  onDragAim?: (angle: number, facing: 1 | -1) => void;
};

const THEMES = [
  {
    // 0: Sakura Sunset
    skyTop: "#1e1b4b",
    skyMid: "#be185d",
    skyBot: "#fda4af",
    hillFar: "rgba(131, 24, 67, 0.35)",
    hillNear: "rgba(157, 23, 77, 0.48)",
    grassTop: "#4ade80",
    grassEdge: "#16a34a",
    topsoil: "#78350f",
    earthMid: "#451a03",
    earthDeep: "#270e02",
    moteColor: "rgba(255, 228, 230, 0.8)",
    stars: true,
  },
  {
    // 1: Sunny Meadow
    skyTop: "#0284c7",
    skyMid: "#7dd3fc",
    skyBot: "#fef9c3",
    hillFar: "rgba(56, 189, 248, 0.35)",
    hillNear: "rgba(14, 116, 144, 0.32)",
    grassTop: "#4ade80",
    grassEdge: "#15803d",
    topsoil: "#854d0e",
    earthMid: "#5c3409",
    earthDeep: "#3b1f04",
    moteColor: "rgba(255, 255, 255, 0.75)",
    stars: false,
  },
  {
    // 2: Starlight Night
    skyTop: "#090d16",
    skyMid: "#1e1b4b",
    skyBot: "#312e81",
    hillFar: "rgba(30, 27, 75, 0.6)",
    hillNear: "rgba(15, 23, 42, 0.7)",
    grassTop: "#2dd4bf",
    grassEdge: "#0d9488",
    topsoil: "#334155",
    earthMid: "#1e293b",
    earthDeep: "#0f172a",
    moteColor: "rgba(253, 224, 71, 0.85)",
    stars: true,
  },
] as const;

export default function Field({
  state,
  aim,
  actualX,
  myTurn,
  playable,
  activePlayback,
  finishedShotN,
  onPlaybackDone,
  onDragAim,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const floatsRef = useRef<DamageFloat[]>([]);
  const debrisRef = useRef<DebrisParticle[]>([]);
  const motesRef = useRef<WindMote[]>([]);
  const spritesRef = useRef<Partial<Record<MobileId, HTMLImageElement>>>({});
  const draggingRef = useRef(false);

  // Keep latest props in a ref so the requestAnimationFrame loop never reads stale closures
  const latestRef = useRef({
    state,
    aim,
    actualX,
    myTurn,
    playable,
    activePlayback,
    onPlaybackDone,
  });
  useEffect(() => {
    latestRef.current = {
      state,
      aim,
      actualX,
      myTurn,
      playable,
      activePlayback,
      onPlaybackDone,
    };
  });

  useEffect(() => {
    for (const m of MOBILES) {
      if (!spritesRef.current[m.id]) {
        const img = new Image();
        img.src = m.sprite;
        spritesRef.current[m.id] = img;
      }
    }

    if (motesRef.current.length === 0) {
      for (let i = 0; i < 28; i++) {
        motesRef.current.push({
          x: (i * 47) % WORLD_W,
          y: 160 + ((i * 73) % (WORLD_H - 170)),
          size: 2 + (i % 3) * 1.2,
          speedMul: 0.7 + (i % 5) * 0.2,
          driftY: 8 + (i % 4) * 4,
          phase: i * 1.3,
        });
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let playbackStart = 0;
    let currentShotN: number | null = null;
    let completedShotN: number | null = null;
    let spawnedDebrisForN: number | null = null;
    let lastFrameTime = performance.now();
    let cloudOffset = 0;

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const {
        state: curState,
        aim: curAim,
        actualX: curActualX,
        myTurn: isMyTurn,
        playable: isPlayable,
        activePlayback: pb,
        onPlaybackDone: doneCb,
      } = latestRef.current;

      // Sync canvas backing resolution with CSS size * devicePixelRatio
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const scaleX = canvas.width / WORLD_W;
      const scaleY = canvas.height / WORLD_H;
      const wx = (x: number) => x * scaleX;
      const wy = (y: number) => (WORLD_H - y) * scaleY;

      const theme = THEMES[Math.abs(curState.gameId) % THEMES.length];
      const activeWind = pb ? pb.shot.wind : curState.wind;

      // Determine what ground & tanks to draw (pre-shot during animation, or current)
      let drawGround = curState.ground;
      let drawTanks: { nam: Tank; linh: Tank } = {
        nam: { ...curState.tanks.nam },
        linh: { ...curState.tanks.linh },
      };
      let shellPos: {
        x: number;
        y: number;
        vx: number;
        vy: number;
        kind: LastShot["kind"];
      } | null = null;
      let shellTrail: number[] | null = null;
      let muzzleFlash: { x: number; y: number; alpha: number } | null = null;
      let boomCircle: {
        x: number;
        y: number;
        r: number;
        progress: number;
        kind: LastShot["kind"];
      } | null = null;
      let shakeX = 0;
      let shakeY = 0;

      if (pb) {
        if (currentShotN !== pb.shot.n) {
          currentShotN = pb.shot.n;
          playbackStart = now;
        }
        const shot = pb.shot;
        const startX = pb.preTanks[shot.by].x;
        const driveDist = pb.skipDrive ? 0 : Math.abs(shot.fromX - startX);
        const driveMs =
          driveDist > 0 ? Math.min(500, Math.max(180, driveDist * 4)) : 0;
        const numPoints = Math.floor(shot.path.length / 2);
        const flightMs = Math.max(160, (numPoints / 45) * 1000);
        const boomMs = shot.boom ? 440 : 60;
        const elapsed = now - playbackStart;

        drawGround = pb.preGround;
        drawTanks = {
          nam: { ...pb.preTanks.nam },
          linh: { ...pb.preTanks.linh },
        };

        if (elapsed < driveMs) {
          const t = driveMs > 0 ? elapsed / driveMs : 1;
          const interpX = Math.round(startX + (shot.fromX - startX) * t);
          drawTanks[shot.by] = {
            ...drawTanks[shot.by],
            x: interpX,
            facing:
              shot.fromX !== startX
                ? shot.fromX > startX
                  ? 1
                  : -1
                : drawTanks[shot.by].facing,
            lastAngle: shot.angle,
          };
        } else if (elapsed < driveMs + flightMs) {
          drawTanks[shot.by] = {
            ...drawTanks[shot.by],
            x: shot.fromX,
            lastAngle: shot.angle,
          };
          const fElapsed = elapsed - driveMs;
          const ft = Math.min(1, fElapsed / flightMs);
          const exactIdx = ft * Math.max(0, numPoints - 1);
          const i0 = Math.floor(exactIdx);
          const i1 = Math.min(numPoints - 1, i0 + 1);
          const frac = exactIdx - i0;
          const x0 = shot.path[i0 * 2] ?? shot.fromX;
          const y0 = shot.path[i0 * 2 + 1] ?? tankY(drawGround, shot.fromX);
          const x1 = shot.path[i1 * 2] ?? x0;
          const y1 = shot.path[i1 * 2 + 1] ?? y0;
          shellPos = {
            x: x0 + (x1 - x0) * frac,
            y: y0 + (y1 - y0) * frac,
            vx: x1 - x0,
            vy: y1 - y0,
            kind: shot.kind,
          };
          shellTrail = shot.path.slice(0, (i0 + 1) * 2);

          // Muzzle flash during first 110ms of flight
          if (fElapsed < 110) {
            const rad = (shot.angle * Math.PI) / 180;
            const shooterFacing = drawTanks[shot.by].facing;
            const ty = tankY(drawGround, shot.fromX);
            muzzleFlash = {
              x: shot.fromX + Math.cos(rad) * shooterFacing * (TANK_R + 12),
              y: ty + 2 + Math.sin(rad) * (TANK_R + 12),
              alpha: 1 - fElapsed / 110,
            };
          }
        } else if (elapsed < driveMs + flightMs + boomMs) {
          const bElapsed = elapsed - driveMs - flightMs;
          const bt = Math.min(1, bElapsed / boomMs);
          if (bt >= 0.35) {
            drawGround = pb.postGround;
            drawTanks = {
              nam: { ...pb.postTanks.nam },
              linh: { ...pb.postTanks.linh },
            };
          } else {
            drawTanks[shot.by] = {
              ...drawTanks[shot.by],
              x: shot.fromX,
              lastAngle: shot.angle,
            };
          }
          if (shot.boom) {
            boomCircle = {
              x: shot.boom.x,
              y: shot.boom.y,
              r: shot.boom.r,
              progress: bt,
              kind: shot.kind,
            };
            // Screen shake decaying over the explosion
            const mag = (1 - bt) * (shot.kind === "ss" ? 9 : shot.kind === "s2" ? 7 : 5);
            shakeX = (Math.sin(now * 0.09) * mag) * scaleX;
            shakeY = (Math.cos(now * 0.11) * mag) * scaleY;

            // Spawn flying dirt & spark particles once at explosion start
            if (spawnedDebrisForN !== shot.n) {
              spawnedDebrisForN = shot.n;
              const count = shot.kind === "ss" ? 28 : 20;
              for (let k = 0; k < count; k++) {
                const ang = (Math.PI * k) / count + (k % 3) * 0.18;
                const spd = 90 + ((k * 53) % 190);
                const isSpark = k % 2 === 0;
                debrisRef.current.push({
                  x: shot.boom.x,
                  y: shot.boom.y,
                  vx: Math.cos(ang) * spd * (k % 4 === 0 ? -0.6 : 1),
                  vy: Math.abs(Math.sin(ang)) * spd + 60,
                  r: isSpark ? 2.5 : 3.5,
                  color: isSpark
                    ? shot.kind === "ss"
                      ? "#fde047"
                      : shot.kind === "s2"
                        ? "#2dd4bf"
                        : "#fb923c"
                    : theme.topsoil,
                  bornAt: now,
                  lifeMs: 550 + ((k * 37) % 350),
                });
              }
            }
          }
        } else {
          drawGround = pb.postGround;
          drawTanks = {
            nam: { ...pb.postTanks.nam },
            linh: { ...pb.postTanks.linh },
          };
          if (completedShotN !== shot.n) {
            completedShotN = shot.n;
            for (const p of ["nam", "linh"] as const) {
              const dmg = shot.damage[p];
              if (dmg > 0) {
                const tx = pb.postTanks[p].x;
                const ty = tankY(pb.postGround, tx);
                floatsRef.current.push({
                  player: p,
                  amount: dmg,
                  x: tx,
                  y: Math.max(70, ty + 32),
                  bornAt: now,
                });
              }
            }
            doneCb(shot.n);
          }
        }
      } else {
        currentShotN = null;
        if (isMyTurn && curState.status === "playing") {
          const active = curState.turn;
          drawTanks[active] = {
            ...drawTanks[active],
            x: curActualX,
            facing: curAim.facing,
            lastAngle: curAim.angle,
          };
        }
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // --- 1. Sky gradient + Stars/Moon/Sun + Parallax hills ---
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, theme.skyTop);
      sky.addColorStop(0.58, theme.skyMid);
      sky.addColorStop(1, theme.skyBot);
      ctx.fillStyle = sky;
      ctx.fillRect(-16, -16, canvas.width + 32, canvas.height + 32);

      if (theme.stars) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        for (let s = 0; s < 26; s++) {
          const sx = ((s * 97 + 31) % WORLD_W) * scaleX;
          const sy = wy(360 + ((s * 53) % 220));
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.002 + s));
          ctx.globalAlpha = twinkle;
          ctx.beginPath();
          ctx.arc(sx, sy, (1.1 + (s % 2) * 0.7) * scaleX, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Glowing moon / sun disc
      const orbX = wx(960);
      const orbY = wy(495);
      const orbGrad = ctx.createRadialGradient(
        orbX,
        orbY,
        4 * scaleX,
        orbX,
        orbY,
        54 * scaleX
      );
      orbGrad.addColorStop(0, "rgba(255, 255, 240, 0.92)");
      orbGrad.addColorStop(0.4, "rgba(254, 240, 138, 0.35)");
      orbGrad.addColorStop(1, "rgba(254, 240, 138, 0)");
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(orbX, orbY, 54 * scaleX, 0, Math.PI * 2);
      ctx.fill();

      // Parallax background mountains
      ctx.fillStyle = theme.hillFar;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= WORLD_W; x += 40) {
        const mh =
          230 +
          55 * Math.sin(x * 0.0055 + 1.1) +
          30 * Math.cos(x * 0.012 + 0.4);
        ctx.lineTo(wx(x), wy(mh));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = theme.hillNear;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= WORLD_W; x += 30) {
        const mh =
          185 +
          40 * Math.sin(x * 0.008 + 2.5) +
          22 * Math.sin(x * 0.017 + 0.9);
        ctx.lineTo(wx(x), wy(mh));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();

      // Drifting fluffy clouds pushed by wind
      cloudOffset = (cloudOffset + activeWind * 3.2 * dt + WORLD_W) % WORLD_W;
      ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
      const baseClouds = [
        [180, 505, 58, 17],
        [540, 535, 76, 21],
        [890, 485, 64, 18],
      ];
      for (const [bx, cy, rx, ry] of baseClouds) {
        const cx = ((bx + cloudOffset) % WORLD_W);
        ctx.beginPath();
        ctx.ellipse(wx(cx), wy(cy), rx * scaleX, ry * scaleY, 0, 0, Math.PI * 2);
        ctx.ellipse(
          wx(cx - rx * 0.45),
          wy(cy - 4),
          rx * 0.65 * scaleX,
          ry * 0.8 * scaleY,
          0,
          0,
          Math.PI * 2
        );
        ctx.ellipse(
          wx(cx + rx * 0.45),
          wy(cy - 3),
          rx * 0.6 * scaleX,
          ry * 0.75 * scaleY,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Drifting wind motes / petals showing wind direction & speed
      ctx.fillStyle = theme.moteColor;
      for (const m of motesRef.current) {
        const windVx = activeWind === 0 ? 4 : activeWind * 9 * m.speedMul;
        m.x = (m.x + windVx * dt + WORLD_W) % WORLD_W;
        m.y -= m.driftY * dt;
        if (m.y < 140) m.y = WORLD_H - 10;
        const swayX = m.x + Math.sin(now * 0.003 + m.phase) * 6;
        ctx.beginPath();
        ctx.ellipse(
          wx(swayX),
          wy(m.y),
          m.size * scaleX,
          m.size * 0.65 * scaleY,
          Math.sin(now * 0.004 + m.phase),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // --- 2. Multi-layer Terrain ---
      // Deep earth body
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let i = 0; i < COLS; i++) {
        const x0 = i * COL_W;
        const x1 = (i + 1) * COL_W;
        const h = drawGround[i] ?? 0;
        ctx.lineTo(wx(x0), wy(h));
        ctx.lineTo(wx(x1), wy(h));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();

      const earthGrad = ctx.createLinearGradient(0, wy(420), 0, canvas.height);
      earthGrad.addColorStop(0, theme.topsoil);
      earthGrad.addColorStop(0.32, theme.earthMid);
      earthGrad.addColorStop(1, theme.earthDeep);
      ctx.fillStyle = earthGrad;
      ctx.fill();

      // Topsoil band & grass cap along non-zero ground columns
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, 7 * scaleY);
      ctx.strokeStyle = theme.grassEdge;
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i < COLS; i++) {
        const h = drawGround[i] ?? 0;
        if (h <= 0) {
          penDown = false;
          continue;
        }
        const cx = wx(i * COL_W + COL_W / 2);
        const cy = wy(h - 2);
        if (!penDown) {
          ctx.moveTo(cx, cy);
          penDown = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();

      ctx.lineWidth = Math.max(2, 4 * scaleY);
      ctx.strokeStyle = theme.grassTop;
      ctx.beginPath();
      penDown = false;
      for (let i = 0; i < COLS; i++) {
        const h = drawGround[i] ?? 0;
        if (h <= 0) {
          penDown = false;
          continue;
        }
        const cx = wx(i * COL_W + COL_W / 2);
        const cy = wy(h);
        if (!penDown) {
          ctx.moveTo(cx, cy);
          penDown = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();

      // --- 3. Chibi GunBound-style Tanks ---
      for (const p of ["nam", "linh"] as const) {
        const t = drawTanks[p];
        if (!t.alive && t.hp <= 0 && groundAt(drawGround, t.x) <= 0) {
          continue;
        }
        const tx = t.x;
        const ty = tankY(drawGround, tx);
        const cx = wx(tx);
        const cy = wy(ty);
        const isNam = p === "nam";

        const bodyColor = !t.alive
          ? "#71717a"
          : isNam
            ? "#f43f5e"
            : "#0ea5e9";
        const hiColor = !t.alive
          ? "#a1a1aa"
          : isNam
            ? "#fda4af"
            : "#7dd3fc";
        const darkColor = !t.alive
          ? "#3f3f46"
          : isNam
            ? "#9f1239"
            : "#075985";

        const angleToShow =
          !pb && isMyTurn && curState.turn === p ? curAim.angle : t.lastAngle;
        const rad = (angleToShow * Math.PI) / 180;
        const dirX = Math.cos(rad) * t.facing;
        const dirY = Math.sin(rad);

        // Subtle SS ready aura around active tank when SS is selected
        if (
          !pb &&
          isMyTurn &&
          curState.turn === p &&
          curAim.kind === "ss" &&
          t.alive
        ) {
          const auraR = (TANK_R + 18 + Math.sin(now * 0.01) * 3) * scaleX;
          const aura = ctx.createRadialGradient(
            cx,
            cy - 6 * scaleY,
            4 * scaleX,
            cx,
            cy - 6 * scaleY,
            auraR
          );
          aura.addColorStop(0, "rgba(250, 204, 21, 0.55)");
          aura.addColorStop(1, "rgba(250, 204, 21, 0)");
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(cx, cy - 6 * scaleY, auraR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Aim arc & guide line for active player
        if (
          !pb &&
          isPlayable &&
          curState.status === "playing" &&
          curState.turn === p &&
          t.alive
        ) {
          ctx.save();
          // Faint angle arc
          ctx.beginPath();
          const startAng = t.facing === 1 ? 0 : Math.PI;
          const endAng =
            t.facing === 1 ? -rad : Math.PI + rad;
          ctx.arc(
            cx,
            cy - 6 * scaleY,
            38 * scaleX,
            startAng,
            endAng,
            t.facing === 1
          );
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = Math.max(1.2, 1.8 * scaleX);
          ctx.stroke();

          // Aim sight line
          ctx.setLineDash([5 * scaleX, 4 * scaleX]);
          ctx.strokeStyle = isNam
            ? "rgba(255, 228, 230, 0.95)"
            : "rgba(224, 242, 254, 0.95)";
          ctx.lineWidth = Math.max(2, 2.6 * scaleX);
          ctx.beginPath();
          ctx.moveTo(cx + dirX * 22 * scaleX, cy - 6 * scaleY - dirY * 22 * scaleY);
          ctx.lineTo(cx + dirX * 78 * scaleX, cy - 6 * scaleY - dirY * 78 * scaleY);
          ctx.stroke();
          ctx.restore();
        }

        // Calculate terrain slope under treads for natural tank tilt
        const hL = groundAt(drawGround, tx - 8);
        const hR = groundAt(drawGround, tx + 8);
        const tilt = Math.max(
          -0.38,
          Math.min(0.38, Math.atan2(hL - hR, 16))
        );

        const mobileId: MobileId = t.mobile ?? DEFAULT_MOBILE[p];
        const spriteImg = spritesRef.current[mobileId];
        const hasSprite =
          spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0;

        if (hasSprite) {
          ctx.save();
          // Anchor at bottom of treads on terrain surface
          ctx.translate(cx, cy + TANK_R * scaleY);
          ctx.rotate(tilt);
          ctx.scale(t.facing, 1);
          if (!t.alive) {
            ctx.filter = "grayscale(100%) brightness(65%)";
          }
          const spriteW = 58 * scaleX;
          const spriteH = 58 * scaleY;
          ctx.drawImage(
            spriteImg,
            -spriteW / 2,
            -spriteH + 4 * scaleY,
            spriteW,
            spriteH
          );
          ctx.restore();
        } else {
          // Fallback vector tank while sprite image loads
          ctx.save();
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = Math.max(3, 6 * scaleX);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(cx, cy - 3 * scaleY);
          ctx.lineTo(
            cx + dirX * (TANK_R + 11) * scaleX,
            cy - 3 * scaleY - dirY * (TANK_R + 11) * scaleY
          );
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(tilt);
          ctx.fillStyle = bodyColor;
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = Math.max(1.5, 2 * scaleX);
          ctx.beginPath();
          ctx.arc(0, -2 * scaleY, 9.5 * scaleX, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.roundRect(
            -TANK_R * scaleX,
            -3 * scaleY,
            TANK_R * 2 * scaleX,
            10 * scaleY,
            5 * scaleX
          );
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = hiColor;
          ctx.restore();
        }

        // Pilot badge & mini HP bar above tank
        const labelY = cy - (TANK_R + 36) * scaleY;
        const barW = 40 * scaleX;
        const barH = Math.max(4, 5.5 * scaleY);
        ctx.fillStyle = "rgba(9, 13, 22, 0.75)";
        ctx.beginPath();
        ctx.roundRect(cx - barW / 2 - 1, labelY - 1, barW + 2, barH + 2, 3);
        ctx.fill();

        ctx.fillStyle = isNam ? "#fb7185" : "#38bdf8";
        ctx.beginPath();
        ctx.roundRect(
          cx - barW / 2,
          labelY,
          barW * Math.max(0, Math.min(1, t.hp / MAX_HP)),
          barH,
          2
        );
        ctx.fill();

        ctx.font = `${Math.max(12, Math.round(15 * scaleX))}px sans-serif`;
        ctx.textAlign = "center";
        const emoji = !t.alive ? "😵" : isNam ? "🐻" : "🧸";
        ctx.fillText(emoji, cx, labelY - 4 * scaleY);
      }

      // --- 4. Muzzle flash, shell smoke puffs & shell in flight ---
      if (muzzleFlash) {
        const mx = wx(muzzleFlash.x);
        const my = wy(muzzleFlash.y);
        ctx.save();
        ctx.globalAlpha = muzzleFlash.alpha;
        ctx.fillStyle = "#fef08a";
        ctx.beginPath();
        ctx.arc(mx, my, 12 * scaleX, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (shellTrail && shellTrail.length >= 4) {
        const totalPts = shellTrail.length / 2;
        for (let i = 0; i < shellTrail.length; i += 4) {
          const idx = i / 2;
          const ageRatio = idx / totalPts;
          const px = wx(shellTrail[i]);
          const py = wy(shellTrail[i + 1]);
          const puffR = (2 + (1 - ageRatio) * 3.5) * scaleX;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + ageRatio * 0.45})`;
          ctx.beginPath();
          ctx.arc(px, py, puffR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (shellPos) {
        const sx = wx(shellPos.x);
        const sy = wy(shellPos.y);
        const r =
          (shellPos.kind === "ss" ? 7.5 : shellPos.kind === "s2" ? 6 : 5) *
          scaleX;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.9, 0, Math.PI * 2);
        ctx.fillStyle =
          shellPos.kind === "ss"
            ? "rgba(250, 204, 21, 0.55)"
            : shellPos.kind === "s2"
              ? "rgba(45, 212, 191, 0.5)"
              : "rgba(251, 146, 60, 0.5)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle =
          shellPos.kind === "ss"
            ? "#fef08a"
            : shellPos.kind === "s2"
              ? "#14b8a6"
              : "#fff7ed";
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 2 * scaleX);
        ctx.strokeStyle =
          shellPos.kind === "ss"
            ? "#ca8a04"
            : shellPos.kind === "s2"
              ? "#0f766e"
              : "#ea580c";
        ctx.stroke();
        ctx.restore();
      }

      // --- 5. Multi-stage explosion & flying debris ---
      if (boomCircle) {
        const bx = wx(boomCircle.x);
        const by = wy(boomCircle.y);
        const p = boomCircle.progress;
        const maxR = boomCircle.r * scaleX;
        const curR = maxR * (0.3 + 0.8 * Math.sin(p * Math.PI));
        const alpha = Math.max(0, 1 - p * 0.85);

        ctx.save();
        // Expanding shockwave ring
        ctx.beginPath();
        ctx.arc(bx, by, maxR * (0.4 + p * 0.85), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 0.8 - p)})`;
        ctx.lineWidth = Math.max(2, 3.5 * scaleX);
        ctx.stroke();

        // Outer fireball
        const fireGrad = ctx.createRadialGradient(bx, by, curR * 0.1, bx, by, curR);
        if (boomCircle.kind === "ss") {
          fireGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          fireGrad.addColorStop(0.45, `rgba(250, 204, 21, ${alpha})`);
          fireGrad.addColorStop(1, `rgba(234, 88, 12, 0)`);
        } else if (boomCircle.kind === "s2") {
          fireGrad.addColorStop(0, `rgba(240, 253, 250, ${alpha})`);
          fireGrad.addColorStop(0.5, `rgba(45, 212, 191, ${alpha})`);
          fireGrad.addColorStop(1, `rgba(15, 118, 110, 0)`);
        } else {
          fireGrad.addColorStop(0, `rgba(254, 249, 195, ${alpha})`);
          fireGrad.addColorStop(0.5, `rgba(249, 115, 22, ${alpha})`);
          fireGrad.addColorStop(1, `rgba(220, 38, 38, 0)`);
        }
        ctx.fillStyle = fireGrad;
        ctx.beginPath();
        ctx.arc(bx, by, curR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Flying debris particles
      const liveDebris: DebrisParticle[] = [];
      for (const d of debrisRef.current) {
        const age = now - d.bornAt;
        if (age < d.lifeMs) {
          liveDebris.push(d);
          d.vy -= 360 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          const alpha = 1 - age / d.lifeMs;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(wx(d.x), wy(d.y), d.r * scaleX, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      debrisRef.current = liveDebris;

      // --- 6. Floating damage numbers (-250) ---
      const activeFloats: DamageFloat[] = [];
      for (const f of floatsRef.current) {
        const age = now - f.bornAt;
        if (age < 1100) {
          activeFloats.push(f);
          const t = age / 1100;
          const fx = wx(f.x);
          const fy = wy(f.y + t * 42);
          ctx.save();
          ctx.font = `900 ${Math.max(14, Math.round(20 * scaleX))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.globalAlpha = 1 - t * 0.75;
          ctx.strokeStyle = "#18181b";
          ctx.lineWidth = Math.max(3, 4.5 * scaleX);
          const label = `−${f.amount}`;
          ctx.strokeText(label, fx, fy);
          ctx.fillStyle = "#fde047";
          ctx.fillText(label, fx, fy);
          ctx.restore();
        }
      }
      floatsRef.current = activeFloats;

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const updateAngleFromPointer = (clientX: number, clientY: number) => {
    const {
      state: curState,
      actualX: curActualX,
      playable: isPlayable,
      activePlayback: pb,
    } = latestRef.current;
    if (!isPlayable || pb || !onDragAim || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = ((clientX - rect.left) / rect.width) * WORLD_W;
    const py = (1 - (clientY - rect.top) / rect.height) * WORLD_H;

    const ty = tankY(curState.ground, curActualX);
    const dx = px - curActualX;
    const dy = py - ty;
    if (Math.hypot(dx, dy) < 8) return;

    const facing: 1 | -1 = dx >= 0 ? 1 : -1;
    const rawDeg = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
    const angle = Math.max(0, Math.min(90, Math.round(rawDeg)));
    onDragAim(angle, facing);
  };

  return (
    <canvas
      ref={canvasRef}
      aria-label="Chiến trường"
      data-testid="field"
      data-shot-n={finishedShotN}
      data-animating-shot-n={activePlayback?.shot.n ?? 0}
      onPointerDown={(e) => {
        if (!playable || activePlayback) return;
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateAngleFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        updateAngleFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      className="block h-full w-full touch-none select-none"
    />
  );
}
