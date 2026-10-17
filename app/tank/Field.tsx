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
  MAX_HP,
  type Aim,
  type LastShot,
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
};

type DamageFloat = {
  player: Player;
  amount: number;
  x: number;
  y: number;
  bornAt: number;
};

type Props = {
  state: TankState;
  aim: Aim;
  actualX: number; // shooter tank x after local drive
  playable: boolean;
  activePlayback: ShotPlayback | null;
  finishedShotN: number;
  onPlaybackDone: (shotN: number) => void;
  onDragAim?: (angle: number, facing: 1 | -1) => void;
};

export default function Field({
  state,
  aim,
  actualX,
  playable,
  activePlayback,
  finishedShotN,
  onPlaybackDone,
  onDragAim,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const floatsRef = useRef<DamageFloat[]>([]);
  const draggingRef = useRef(false);

  // Keep latest props in a ref so the requestAnimationFrame loop never reads stale closures
  const latestRef = useRef({
    state,
    aim,
    actualX,
    playable,
    activePlayback,
    onPlaybackDone,
  });
  useEffect(() => {
    latestRef.current = {
      state,
      aim,
      actualX,
      playable,
      activePlayback,
      onPlaybackDone,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let playbackStart = 0;
    let currentShotN: number | null = null;
    let completedShotN: number | null = null;

    const render = (now: number) => {
      const {
        state: curState,
        aim: curAim,
        actualX: curActualX,
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

      // Determine what ground & tanks to draw (pre-shot during animation, or current)
      let drawGround = curState.ground;
      let drawTanks: { nam: Tank; linh: Tank } = {
        nam: { ...curState.tanks.nam },
        linh: { ...curState.tanks.linh },
      };
      let shellPos: { x: number; y: number; kind: LastShot["kind"] } | null =
        null;
      let shellTrail: number[] | null = null;
      let boomCircle: {
        x: number;
        y: number;
        r: number;
        progress: number;
        kind: LastShot["kind"];
      } | null = null;

      if (pb) {
        if (currentShotN !== pb.shot.n) {
          currentShotN = pb.shot.n;
          playbackStart = now;
        }
        const shot = pb.shot;
        const startX = pb.preTanks[shot.by].x;
        const driveDist = Math.abs(shot.fromX - startX);
        const driveMs = driveDist > 0 ? Math.min(500, Math.max(180, driveDist * 4)) : 40;
        const numPoints = Math.floor(shot.path.length / 2);
        // Path saves every 2nd physics step (1/30s per point). Play slightly briskly (~45 pts/s).
        const flightMs = Math.max(160, (numPoints / 45) * 1000);
        const boomMs = shot.boom ? 400 : 60;
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
            kind: shot.kind,
          };
          shellTrail = shot.path.slice(0, (i0 + 1) * 2);
        } else if (elapsed < driveMs + flightMs + boomMs) {
          const bElapsed = elapsed - driveMs - flightMs;
          const bt = Math.min(1, bElapsed / boomMs);
          if (bt >= 0.45) {
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
          }
        } else {
          // Animation complete! Spawn floating damage numbers and notify parent once
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
                  y: Math.max(60, ty + 28),
                  bornAt: now,
                });
              }
            }
            doneCb(shot.n);
          }
        }
      } else {
        currentShotN = null;
        // Apply live local drive + angle on the active player's screen
        if (isPlayable && curState.status === "playing") {
          const active = curState.turn;
          drawTanks[active] = {
            ...drawTanks[active],
            x: curActualX,
            facing: curAim.facing,
            lastAngle: curAim.angle,
          };
        }
      }

      // --- 1. Draw sky gradient ---
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, "#e0f2fe"); // soft sky blue
      sky.addColorStop(0.55, "#fdf2f8"); // warm pink mist
      sky.addColorStop(1, "#fce7f3"); // light rose horizon
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Soft decorative clouds
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      const clouds = [
        [210, 500, 55, 18],
        [620, 530, 75, 22],
        [980, 485, 60, 19],
      ];
      for (const [cx, cy, rx, ry] of clouds) {
        ctx.beginPath();
        ctx.ellipse(wx(cx), wy(cy), rx * scaleX, ry * scaleY, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- 2. Draw terrain polygon ---
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

      const earth = ctx.createLinearGradient(0, wy(420), 0, canvas.height);
      earth.addColorStop(0, "#a16207");
      earth.addColorStop(0.35, "#854d0e");
      earth.addColorStop(1, "#5c3409");
      ctx.fillStyle = earth;
      ctx.fill();

      // Green grass cap along non-zero ground columns
      ctx.lineWidth = Math.max(2, 4 * scaleY);
      ctx.strokeStyle = "#22c55e";
      ctx.beginPath();
      let penDown = false;
      for (let i = 0; i < COLS; i++) {
        const h = drawGround[i] ?? 0;
        if (h <= 0) {
          penDown = false;
          continue;
        }
        const x0 = wx(i * COL_W);
        const x1 = wx((i + 1) * COL_W);
        const y = wy(h);
        if (!penDown) {
          ctx.moveTo(x0, y);
          penDown = true;
        } else {
          ctx.lineTo(x0, y);
        }
        ctx.lineTo(x1, y);
      }
      ctx.stroke();

      // --- 3. Draw tanks ---
      for (const p of ["nam", "linh"] as const) {
        const t = drawTanks[p];
        if (!t.alive && t.hp <= 0 && groundAt(drawGround, t.x) <= 0) {
          continue; // fell into the abyss
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
        const darkColor = !t.alive
          ? "#3f3f46"
          : isNam
            ? "#be123c"
            : "#0369a1";

        const angleToShow =
          !pb && isPlayable && curState.turn === p
            ? curAim.angle
            : t.lastAngle;
        const rad = (angleToShow * Math.PI) / 180;
        const dirX = Math.cos(rad) * t.facing;
        const dirY = Math.sin(rad);

        // Aim guide line for active player when aiming
        if (!pb && isPlayable && curState.status === "playing" && curState.turn === p && t.alive) {
          ctx.save();
          ctx.setLineDash([5 * scaleX, 5 * scaleX]);
          ctx.strokeStyle = isNam
            ? "rgba(244, 63, 94, 0.75)"
            : "rgba(14, 165, 233, 0.75)";
          ctx.lineWidth = Math.max(1.5, 2.2 * scaleX);
          ctx.beginPath();
          ctx.moveTo(cx + dirX * 18 * scaleX, cy - dirY * 18 * scaleY);
          ctx.lineTo(cx + dirX * 68 * scaleX, cy - dirY * 68 * scaleY);
          ctx.stroke();
          ctx.restore();
        }

        // Barrel
        ctx.save();
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = Math.max(2.5, 5 * scaleX);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 2 * scaleY);
        ctx.lineTo(
          cx + dirX * (TANK_R + 10) * scaleX,
          cy - 2 * scaleY - dirY * (TANK_R + 10) * scaleY
        );
        ctx.stroke();
        ctx.restore();

        // Tank dome & hull
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = darkColor;
        ctx.lineWidth = Math.max(1.5, 2 * scaleX);
        ctx.beginPath();
        ctx.arc(cx, cy - 2 * scaleY, 9 * scaleX, Math.PI, 0);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(
          cx - TANK_R * scaleX,
          cy - 3 * scaleY,
          TANK_R * 2 * scaleX,
          10 * scaleY,
          4 * scaleX
        );
        ctx.fill();
        ctx.stroke();

        // Treads
        ctx.fillStyle = darkColor;
        ctx.beginPath();
        ctx.roundRect(
          cx - (TANK_R - 2) * scaleX,
          cy + 5 * scaleY,
          (TANK_R - 2) * 2 * scaleX,
          5 * scaleY,
          2.5 * scaleX
        );
        ctx.fill();

        // Label + mini HP bar above tank
        const labelY = cy - (TANK_R + 18) * scaleY;
        const barW = 34 * scaleX;
        const barH = Math.max(3, 4.5 * scaleY);
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.fillRect(cx - barW / 2, labelY, barW, barH);
        ctx.fillStyle = isNam ? "#f43f5e" : "#0ea5e9";
        ctx.fillRect(
          cx - barW / 2,
          labelY,
          barW * Math.max(0, Math.min(1, t.hp / MAX_HP)),
          barH
        );

        ctx.font = `${Math.max(11, Math.round(14 * scaleX))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#18181b";
        ctx.fillText(isNam ? "🐻" : "🧸", cx, labelY - 4 * scaleY);
      }

      // --- 4. Draw shell trail & shell in flight ---
      if (shellTrail && shellTrail.length >= 4) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = Math.max(1.5, 2 * scaleX);
        ctx.setLineDash([3 * scaleX, 4 * scaleX]);
        ctx.beginPath();
        ctx.moveTo(wx(shellTrail[0]), wy(shellTrail[1]));
        for (let i = 2; i < shellTrail.length; i += 2) {
          ctx.lineTo(wx(shellTrail[i]), wy(shellTrail[i + 1]));
        }
        ctx.stroke();
        ctx.restore();
      }

      if (shellPos) {
        const sx = wx(shellPos.x);
        const sy = wy(shellPos.y);
        const r =
          (shellPos.kind === "ss" ? 7 : shellPos.kind === "s2" ? 5.5 : 4.5) *
          scaleX;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
        ctx.fillStyle =
          shellPos.kind === "ss"
            ? "rgba(250, 204, 21, 0.45)"
            : shellPos.kind === "s2"
              ? "rgba(20, 184, 166, 0.4)"
              : "rgba(249, 115, 22, 0.4)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle =
          shellPos.kind === "ss"
            ? "#eab308"
            : shellPos.kind === "s2"
              ? "#0d9488"
              : "#18181b";
        ctx.fill();
        ctx.restore();
      }

      // --- 5. Draw explosion circle ---
      if (boomCircle) {
        const bx = wx(boomCircle.x);
        const by = wy(boomCircle.y);
        const curR =
          boomCircle.r * (0.35 + 0.75 * Math.sin(boomCircle.progress * Math.PI)) * scaleX;
        const alpha = Math.max(0, 1 - boomCircle.progress * 0.85);
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, curR, 0, Math.PI * 2);
        ctx.fillStyle =
          boomCircle.kind === "ss"
            ? `rgba(250, 204, 21, ${alpha})`
            : boomCircle.kind === "s2"
              ? `rgba(45, 212, 191, ${alpha})`
              : `rgba(249, 115, 22, ${alpha})`;
        ctx.fill();
        ctx.lineWidth = Math.max(2, 3 * scaleX);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.stroke();
        ctx.restore();
      }

      // --- 6. Draw floating damage numbers (-250) for 1 s ---
      const activeFloats: DamageFloat[] = [];
      for (const f of floatsRef.current) {
        const age = now - f.bornAt;
        if (age < 1000) {
          activeFloats.push(f);
          const t = age / 1000;
          const fx = wx(f.x);
          const fy = wy(f.y + t * 36);
          ctx.save();
          ctx.font = `bold ${Math.max(13, Math.round(18 * scaleX))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.globalAlpha = 1 - t * 0.8;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = Math.max(2.5, 3.5 * scaleX);
          const label = `−${f.amount}`;
          ctx.strokeText(label, fx, fy);
          ctx.fillStyle = "#e11d48";
          ctx.fillText(label, fx, fy);
          ctx.restore();
        }
      }
      floatsRef.current = activeFloats;

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
    <div className="flex w-full justify-center">
      <canvas
        ref={canvasRef}
        aria-label="Chiến trường"
        data-testid="field"
        data-shot-n={finishedShotN}
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
        className="aspect-[2/1] w-[min(100%,calc(2*(100svh-16rem)))] min-w-[280px] touch-none rounded-2xl border-2 border-pink-200 bg-sky-100 shadow-inner"
      />
    </div>
  );
}
