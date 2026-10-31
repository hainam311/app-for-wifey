"use client";

import { useEffect, useRef } from "react";
import { playBoom, playFall } from "@/lib/tank/audio";
import {
  COLS,
  COL_W,
  TANK_OFFSET_Y,
  TANK_R,
  WORLD_H,
  WORLD_W,
  groundAt,
  tankY,
} from "@/lib/tank/terrain";
import {
  MOTION,
  kick,
  newBody,
  smoothGround,
  stepBody,
  type MotionBody,
} from "@/lib/tank/motion";
import {
  DEFAULT_MOBILE,
  MAX_HP,
  MOBILES,
  simulateShot,
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

type ChatBubble = {
  id: number;
  player: Player;
  text: string;
  bornAt: number;
  lifeMs: number;
};

type RosePetal = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpd: number;
  r: number;
  color: string;
  bornAt: number;
  lifeMs: number;
};

const NAM_HIT_LINH = [
  "Bách phát bách trúng nhé vợ yêu! 🎯",
  "Trúng đích rồi, thương vợ lắm cơ mà luật chơi! ❤️",
  "Một phát chuẩn chỉ tặng em bé! 😘",
  "Đừng giận anh nha vợ ơi! 🌹",
] as const;

const LINH_REACT_HIT = [
  "Á dám bắn em à, tối nay ra sofa ngủ! 😤",
  "Anh Nam biết tay em lượt sau nhé! 💣",
  "Huhu bắt nạt vợ là không tốt đâu nha! 😾",
  "Giỏi lắm, chuẩn bị tinh thần đi anh! ⚡",
] as const;

const LINH_HIT_NAM = [
  "Cho anh chừa thói láo nè! 💥",
  "Còn cãi lời vợ nữa thôi anh Nam! 💅",
  "Tối nay xác định rửa bát nhé cưng! 😼",
  "Tay nghề em gái mưa nào bắn được thế này! 👑",
] as const;

const NAM_REACT_HIT = [
  "Ui da đau quá vợ ơi tha anh! 🥺",
  "Á tha anh vợ ơi, tối anh đấm lưng bù! 😭",
  "Vợ bắn rát thế này ai chịu nổi! 💥",
  "Em bắn hiểm thế, anh xin hàng! 🏳️",
] as const;

const NAM_MISS = [
  "Gió to quá chứ anh ngắm chuẩn lắm... 💨",
  "Hụt rồi, chắc do chuột giật! 😅",
  "Anh cố tình bắn trượt nhường vợ đấy! 😉",
] as const;

const LINH_MISS = [
  "Huhu đạn bay đi đâu mất tiêu rùi? 🛸",
  "Gió vô duyên ghê á! 🌬️",
  "Ủa kì cục ghê, rõ ràng ngắm chuẩn mà! 🙈",
] as const;

function pickCoupleText(list: readonly string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

type TrailParticle = {
  kind: "dust" | "smoke" | "sparkle";
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
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
  const bubblesRef = useRef<ChatBubble[]>([]);
  const bubbleIdCounter = useRef(0);
  const petalsRef = useRef<RosePetal[]>([]);
  const motesRef = useRef<WindMote[]>([]);
  // Local visual motion of each mobile (lib/tank/motion.ts) and its trail
  const bodiesRef = useRef<Partial<Record<Player, MotionBody>>>({});
  const trailRef = useRef<TrailParticle[]>([]);
  const trailDistRef = useRef<Record<Player, number>>({ nam: 0, linh: 0 });
  const spritesRef = useRef<Partial<Record<MobileId, HTMLImageElement>>>({});
  const draggingRef = useRef(false);
  const ghostShotByPlayerRef = useRef<
    Partial<
      Record<
        Player,
        {
          path: number[];
          boom?: { x: number; y: number };
        }
      >
    >
  >({});
  const lastGameIdRef = useRef(state.gameId);
  if (lastGameIdRef.current !== state.gameId) {
    lastGameIdRef.current = state.gameId;
    ghostShotByPlayerRef.current = {};
    bubblesRef.current = [];
    petalsRef.current = [];
  }

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
    let playedFallForN: number | null = null;
    let recoilForN: number | null = null;
    let hitForN: number | null = null;
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

      // Sync canvas backing resolution with untransformed CSS layout size * devicePixelRatio
      const cssW = canvas.clientWidth || canvas.getBoundingClientRect().width;
      const cssH = canvas.clientHeight || canvas.getBoundingClientRect().height;
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(cssW * dpr));
      const targetH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const scaleX = canvas.width / WORLD_W;
      const scaleY = canvas.height / WORLD_H;
      // Uniform 1:1 pixel scale so tank sprites, circles, and UI badges never distort
      const unit = Math.min(scaleX, scaleY);
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
      let hitStopFlash: { x: number; y: number } | null = null;
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
        // Cache this shot for player's ghost trajectory
        ghostShotByPlayerRef.current[shot.by] = {
          path: shot.path,
          boom: shot.boom ? { x: shot.boom.x, y: shot.boom.y } : undefined,
        };

        const startX = pb.preTanks[shot.by].x;
        const driveDist = pb.skipDrive ? 0 : Math.abs(shot.fromX - startX);
        const driveMs =
          driveDist > 0 ? Math.min(500, Math.max(180, driveDist * 4)) : 0;
        const numPoints = Math.floor(shot.path.length / 2);
        const flightMs = Math.max(160, (numPoints / 45) * 1000);
        // Hit-stop: micro-freeze ~48ms right on impact before explosion expands
        const hitStopMs = shot.boom ? 48 : 0;
        const boomMs = shot.boom ? 440 : 60;
        const elapsed = now - playbackStart;

        drawGround = pb.preGround;
        drawTanks = {
          nam: { ...pb.preTanks.nam },
          linh: { ...pb.preTanks.linh },
        };

        if (elapsed < driveMs) {
          const lin = driveMs > 0 ? elapsed / driveMs : 1;
          const t = lin * lin * (3 - 2 * lin); // ease in & out: speed up, then brake
          const interpX = startX + (shot.fromX - startX) * t;
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

          // Recoil kick on the shooter once, at the start of the flight
          // Phản lực lùi nòng/nhún thân xe theo hướng ngược lại vector bắn: -facing * (power / 100) * 12px
          if (recoilForN !== shot.n) {
            recoilForN = shot.n;
            const body = bodiesRef.current[shot.by];
            if (body) {
              const facing = drawTanks[shot.by].facing;
              const powerRatio = Math.max(0.15, (shot.power ?? 50) / 100);
              const kindMult =
                shot.kind === "ss" ? 1.5 : shot.kind === "s2" ? 1.25 : 1.0;
              const recoilDist = -facing * powerRatio * 12 * kindMult;
              const shotRad = (shot.angle * Math.PI) / 180;
              // Nhún thân xe (suspension compression downward from upward shell flight)
              const liftKick = -Math.sin(shotRad) * 65 * powerRatio * kindMult;
              // Pitch reaction kick
              const rotKick =
                -facing * Math.cos(shotRad) * 1.8 * powerRatio * kindMult;

              // Body squash/compression
              body.landed = Math.min(1, 0.5 * powerRatio * kindMult);

              kick(body, {
                recoil: recoilDist,
                liftv: liftKick,
                rotv: rotKick,
              });
            }
          }

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
        } else if (elapsed < driveMs + flightMs + hitStopMs) {
          // Hit-Stop: micro-freeze 48ms right on impact
          drawTanks[shot.by] = {
            ...drawTanks[shot.by],
            x: shot.fromX,
            lastAngle: shot.angle,
          };
          const endX = shot.boom
            ? shot.boom.x
            : (shot.path[numPoints * 2 - 2] ?? shot.fromX);
          const endY = shot.boom
            ? shot.boom.y
            : (shot.path[numPoints * 2 - 1] ?? tankY(drawGround, endX));
          shellPos = {
            x: endX,
            y: endY,
            vx: 0,
            vy: 0,
            kind: shot.kind,
          };
          shellTrail = shot.path;
          hitStopFlash = { x: endX, y: endY };
        } else if (elapsed < driveMs + flightMs + hitStopMs + boomMs) {
          const bElapsed = elapsed - driveMs - flightMs - hitStopMs;
          const bt = Math.min(1, bElapsed / boomMs);
          if (bt >= 0.35) {
            drawGround = pb.postGround;
            drawTanks = {
              nam: { ...pb.postTanks.nam },
              linh: { ...pb.postTanks.linh },
            };
            // Knock the damaged mobiles away from the explosion, once
            if (hitForN !== shot.n && shot.boom) {
              hitForN = shot.n;
              for (const hp of ["nam", "linh"] as const) {
                const dmg = shot.damage[hp];
                const body = bodiesRef.current[hp];
                if (dmg <= 0 || !body) continue;
                const away = Math.sign(body.x - shot.boom.x) || 1;
                const power = Math.min(1.6, dmg / 250);
                kick(body, {
                  liftv: 160 * power,
                  rotv: away * 4 * power,
                  recoil: away * 90 * power,
                });
              }
            }
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

            // Trauma-Based Screenshake (Trauma^2)
            // + Đạn SS hoặc Direct Hit trúng xe: trauma = 1.0
            // + Đạn S2 khoan hoặc nổ gần (<50px): trauma = 0.75
            // + Đạn thường S1 hoặc nổ xa: trauma = 0.5
            const boomX = shot.boom.x;
            const boomY = shot.boom.y;
            const namX = pb.preTanks.nam.x;
            const namY = tankY(pb.preGround, namX);
            const linhX = pb.preTanks.linh.x;
            const linhY = tankY(pb.preGround, linhX);
            const distNam = Math.hypot(boomX - namX, boomY - namY);
            const distLinh = Math.hypot(boomX - linhX, boomY - linhY);
            const minDist = Math.min(distNam, distLinh);
            const isDirectHit =
              shot.damage.nam > 0 ||
              shot.damage.linh > 0 ||
              minDist <= TANK_R + 6;

            let trauma = 0.5;
            const shooterMobile =
              pb.preTanks[shot.by]?.mobile ?? DEFAULT_MOBILE[shot.by];
            const isNamSSExplosion =
              shot.kind === "ss" &&
              (shot.by === "nam" || shooterMobile === "armor");
            const isLinhSSExplosion =
              shot.kind === "ss" &&
              (shot.by === "linh" || shooterMobile === "unicorn");

            if (isNamSSExplosion) {
              // Bear Paw Stomp cực đại trauma rung chuyển chiến trường
              trauma = 1.35;
            } else if (shot.kind === "ss" || isDirectHit) {
              trauma = 1.0;
            } else if (shot.kind === "s2" || minDist < 50) {
              trauma = 0.75;
            }

            // Cường độ rung: shake = trauma * trauma * 14 * unit, giảm chấn dần theo thời gian nổ (1 - bt)
            const decay = Math.max(0, 1 - bt);
            const shakeMag =
              trauma *
              trauma *
              14 *
              unit *
              decay *
              (isNamSSExplosion ? 1.3 : 1.0);
            shakeX =
              (Math.sin(now * 0.09) * 0.8 + Math.sin(now * 0.23) * 0.2) *
              shakeMag;
            shakeY =
              (Math.cos(now * 0.11) * 0.8 + Math.cos(now * 0.27) * 0.2) *
              shakeMag;

            // Spawn flying dirt & spark particles once at explosion start
            if (spawnedDebrisForN !== shot.n) {
              spawnedDebrisForN = shot.n;

              // Audio boom & mobile haptics on explosion impact
              playBoom(shot.kind);
              if (
                (shot.fell && shot.fell.length > 0) ||
                (shot as unknown as { endReason?: string }).endReason === "fell" ||
                (["nam", "linh"] as const).some(
                  (p) =>
                    !pb.postTanks[p].alive &&
                    groundAt(pb.postGround, pb.postTanks[p].x) <= 0
                )
              ) {
                if (playedFallForN !== shot.n) {
                  playedFallForN = shot.n;
                  playFall();
                }
              }
              if (typeof navigator !== "undefined" && navigator.vibrate) {
                try {
                  navigator.vibrate([40, 30, 80]);
                } catch {
                  // Safe fallback
                }
              }

              // Bung 18-24 cánh hoa hồng (rose petals) xoay rơi trong gió cho Linh SS
              if (isLinhSSExplosion) {
                const petalColors = [
                  "#f43f5e",
                  "#fb7185",
                  "#fda4af",
                  "#f472b6",
                  "#ec4899",
                  "#ffe4e6",
                ];
                for (let k = 0; k < 22; k++) {
                  const ang = (Math.PI * 2 * k) / 22 + (k % 3) * 0.2;
                  const spd = 65 + ((k * 31) % 115);
                  petalsRef.current.push({
                    x: shot.boom.x,
                    y: shot.boom.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd + 40,
                    rot: (k * 45 * Math.PI) / 180,
                    rotSpd: (k % 2 === 0 ? 1 : -1) * (2.4 + (k % 3) * 1.6),
                    r: 4.8 + (k % 4) * 1.4,
                    color: petalColors[k % petalColors.length],
                    bornAt: now,
                    lifeMs: 1900 + ((k * 73) % 900),
                  });
                }
              }

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
            if (
              playedFallForN !== shot.n &&
              ((shot.fell && shot.fell.length > 0) ||
                (shot as unknown as { endReason?: string }).endReason === "fell" ||
                (["nam", "linh"] as const).some(
                  (p) =>
                    !pb.postTanks[p].alive &&
                    groundAt(pb.postGround, pb.postTanks[p].x) <= 0
                ))
            ) {
              playedFallForN = shot.n;
              playFall();
            }
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

            // Kích hoạt Bong Bóng Hội Thoại Tương Tác Cặp Đôi (Couple Speech Bubbles)
            const addBubble = (player: Player, text: string, delayMs = 0) => {
              bubblesRef.current.push({
                id: ++bubbleIdCounter.current,
                player,
                text,
                bornAt: now + delayMs,
                lifeMs: 2800,
              });
            };

            const fellPlayers: Player[] = [];
            for (const p of ["nam", "linh"] as const) {
              if (
                (shot.fell && shot.fell.includes(p)) ||
                (!pb.postTanks[p].alive &&
                  groundAt(pb.postGround, pb.postTanks[p].x) <= 0)
              ) {
                fellPlayers.push(p);
              }
            }

            if (fellPlayers.length > 0) {
              for (const fp of fellPlayers) {
                if (fp === "nam") {
                  addBubble("nam", "Áaaaa cứu anh vợ ơiii! 🌊", 80);
                } else {
                  addBubble("linh", "Áaaaa cứu em anh ơiii! 🪂", 80);
                }
              }
            } else if (shot.by === "nam" && shot.damage.linh > 0) {
              addBubble("nam", pickCoupleText(NAM_HIT_LINH), 0);
              addBubble("linh", pickCoupleText(LINH_REACT_HIT), 350);
            } else if (shot.by === "linh" && shot.damage.nam > 0) {
              addBubble("linh", pickCoupleText(LINH_HIT_NAM), 0);
              addBubble("nam", pickCoupleText(NAM_REACT_HIT), 350);
            } else if (
              (shot.damage.nam === 0 && shot.damage.linh === 0) ||
              !shot.boom
            ) {
              if (shot.by === "nam") {
                addBubble("nam", pickCoupleText(NAM_MISS), 0);
              } else {
                addBubble("linh", pickCoupleText(LINH_MISS), 0);
              }
            }

            doneCb(shot.n);
          }
        }
      } else {
        currentShotN = null;
        if (
          curState.lastShot &&
          curState.lastShot.path &&
          curState.lastShot.path.length >= 4
        ) {
          ghostShotByPlayerRef.current[curState.lastShot.by] = {
            path: curState.lastShot.path,
            boom: curState.lastShot.boom
              ? { x: curState.lastShot.boom.x, y: curState.lastShot.boom.y }
              : undefined,
          };
        }
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
      // Smooth surface through the column centers (same as the mobiles' contact)
      ctx.lineTo(wx(0), wy(drawGround[0] ?? 0));
      for (let i = 0; i < COLS; i++) {
        ctx.lineTo(wx(i * COL_W + COL_W / 2), wy(drawGround[i] ?? 0));
      }
      ctx.lineTo(wx(WORLD_W), wy(drawGround[COLS - 1] ?? 0));
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

      // Dải nước biển bập bềnh ở đáy bản đồ (Ocean Water Surface)
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= WORLD_W; x += 15) {
        const wyWater =
          16 +
          Math.sin(now * 0.004 + x * 0.035) * 3.2 +
          Math.cos(now * 0.008 + x * 0.075) * 1.6;
        ctx.lineTo(wx(x), wy(wyWater));
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      const oceanGrad = ctx.createLinearGradient(0, wy(24), 0, canvas.height);
      oceanGrad.addColorStop(0, "rgba(56, 189, 248, 0.75)");
      oceanGrad.addColorStop(0.35, "rgba(14, 165, 233, 0.85)");
      oceanGrad.addColorStop(1, "rgba(3, 105, 161, 0.95)");
      ctx.fillStyle = oceanGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
      ctx.lineWidth = Math.max(1.5, 2 * scaleY);
      ctx.stroke();
      ctx.restore();

      // --- 2b. Ghost Trajectory Arc of Previous Shot (GunBound style) ---
      if (!pb && isMyTurn && curState.status === "playing") {
        const active = curState.turn;
        const activeTank = curState.tanks[active];
        let ghost = ghostShotByPlayerRef.current[active];

        // If no cached ghost shot yet, check if player has previously fired
        if (!ghost) {
          if (
            curState.lastShot &&
            curState.lastShot.by === active &&
            curState.lastShot.path?.length >= 4
          ) {
            ghost = {
              path: curState.lastShot.path,
              boom: curState.lastShot.boom
                ? { x: curState.lastShot.boom.x, y: curState.lastShot.boom.y }
                : undefined,
            };
            ghostShotByPlayerRef.current[active] = ghost;
          } else if (activeTank.lastAngle > 0 && activeTank.lastPower > 0) {
            // Simulate trajectory of previous shot
            const sim = simulateShot(
              drawGround,
              curState.tanks,
              active,
              activeTank.lastAngle,
              activeTank.lastPower,
              curState.wind
            );
            ghost = {
              path: sim.path,
              boom:
                sim.outcome === "hit"
                  ? { x: sim.boom.x, y: sim.boom.y }
                  : undefined,
            };
            ghostShotByPlayerRef.current[active] = ghost;
          }
        }

        if (ghost && ghost.path && ghost.path.length >= 4) {
          ctx.save();
          // GunBound dotted trajectory line
          ctx.setLineDash([5 * scaleX, 5 * scaleX]);
          // Opacity ~0.25–0.35: soft warm yellow for Nam, soft cyan for Linh
          const ghostColor =
            active === "nam"
              ? "rgba(253, 224, 71, 0.32)"
              : "rgba(56, 189, 248, 0.32)";
          ctx.strokeStyle = ghostColor;
          ctx.lineWidth = Math.max(1.5, 2.2 * scaleX);
          ctx.beginPath();
          ctx.moveTo(wx(ghost.path[0]), wy(ghost.path[1]));
          for (let i = 2; i < ghost.path.length; i += 2) {
            ctx.lineTo(wx(ghost.path[i]), wy(ghost.path[i + 1]));
          }
          ctx.stroke();

          // Previous landing / impact marker
          if (ghost.boom) {
            const bx = wx(ghost.boom.x);
            const by = wy(ghost.boom.y);
            // Outer marker ring
            ctx.beginPath();
            ctx.arc(bx, by, 5.5 * scaleX, 0, Math.PI * 2);
            ctx.strokeStyle = ghostColor;
            ctx.lineWidth = Math.max(1.2, 1.8 * scaleX);
            ctx.stroke();

            // Center target crosshair (+)
            ctx.beginPath();
            ctx.moveTo(bx - 7 * scaleX, by);
            ctx.lineTo(bx + 7 * scaleX, by);
            ctx.moveTo(bx, by - 7 * scaleX);
            ctx.lineTo(bx, by + 7 * scaleX);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // --- 3a. Movement trails (dust, exhaust smoke, sparkles) behind the mobiles ---
      const liveTrail: TrailParticle[] = [];
      for (const q of trailRef.current) {
        const age = now - q.bornAt;
        if (age >= q.lifeMs) continue;
        liveTrail.push(q);
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vx *= Math.exp(-dt * 2.5);
        const k = age / q.lifeMs;
        ctx.save();
        if (q.kind === "sparkle") {
          ctx.globalAlpha = (1 - k) * (0.6 + 0.4 * Math.sin(age * 0.03));
          ctx.fillStyle = "#fff7fb";
          const r = q.r * (1 - k * 0.5) * unit;
          const px = wx(q.x);
          const py = wy(q.y);
          ctx.beginPath();
          ctx.moveTo(px, py - r * 2);
          ctx.lineTo(px + r * 0.6, py);
          ctx.lineTo(px, py + r * 2);
          ctx.lineTo(px - r * 0.6, py);
          ctx.closePath();
          ctx.moveTo(px - r * 2, py);
          ctx.lineTo(px, py + r * 0.6);
          ctx.lineTo(px + r * 2, py);
          ctx.lineTo(px, py - r * 0.6);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.globalAlpha = (1 - k) * (q.kind === "smoke" ? 0.45 : 0.55);
          ctx.fillStyle = q.kind === "smoke" ? "#e4e4e7" : theme.topsoil;
          ctx.beginPath();
          ctx.arc(wx(q.x), wy(q.y), q.r * (1 + k * 1.4) * unit, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      trailRef.current = liveTrail;

      const spawnTrail = (
        kind: TrailParticle["kind"],
        x: number,
        y: number,
        back: number
      ) => {
        const r = Math.random;
        if (kind === "dust") {
          trailRef.current.push({
            kind, x: x + (r() - 0.5) * 6, y: y + 2,
            vx: back * (20 + r() * 30), vy: 18 + r() * 24,
            r: 2.6 + r() * 2.2, bornAt: now, lifeMs: 450 + r() * 300,
          });
        } else if (kind === "smoke") {
          trailRef.current.push({
            kind, x, y,
            vx: back * (8 + r() * 10), vy: 22 + r() * 16,
            r: 3 + r() * 1.5, bornAt: now, lifeMs: 800 + r() * 400,
          });
        } else {
          trailRef.current.push({
            kind, x: x + (r() - 0.5) * 26, y: y + r() * 22,
            vx: back * (10 + r() * 15), vy: -6 + r() * 18,
            r: 1.6 + r() * 1.2, bornAt: now, lifeMs: 500 + r() * 300,
          });
        }
      };

      // --- 3. Chibi GunBound-style Tanks ---
      const smoothFn = smoothGround(drawGround);
      for (const p of ["nam", "linh"] as const) {
        const t = drawTanks[p];
        const isFell =
          groundAt(drawGround, t.x) <= 0 ||
          (!t.alive &&
            ((pb?.shot?.fell && pb.shot.fell.includes(p)) ||
              (curState.endReason === "fell" && curState.winner !== p) ||
              (t.hp <= 0 && groundAt(drawGround, t.x) <= 0)));

        const mobileId: MobileId = t.mobile ?? DEFAULT_MOBILE[p];

        // 3. Phao Vịt Vàng Cứu Hộ Khi Rơi Vực (Yellow Duck Rescue Float)
        if (isFell) {
          const isNam = p === "nam";
          const waveY =
            16 + Math.sin(now * 0.005 + t.x * 0.1) * 3.5;
          const waveTilt = Math.cos(now * 0.005 + t.x * 0.1) * 0.08;
          const cx = wx(t.x);
          const cy = wy(waveY);

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(waveTilt);

          // 1. Thân phao tròn màu vàng tươi viền cam sọc trắng cứu hộ
          const floatW = 34 * unit;
          const floatH = 15 * unit;
          ctx.beginPath();
          ctx.ellipse(0, 4 * unit, floatW, floatH, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#facc15";
          ctx.fill();
          ctx.strokeStyle = "#ea580c";
          ctx.lineWidth = Math.max(2, 2.5 * unit);
          ctx.stroke();

          // Các vệt sọc cứu hộ màu trắng
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          for (const sx of [-22, -8, 8, 22]) {
            ctx.beginPath();
            ctx.ellipse(
              sx * unit,
              4 * unit,
              4 * unit,
              10 * unit,
              sx > 0 ? 0.2 : -0.2,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }

          // 2. Đầu chú vịt vàng đáng yêu với mỏ cam ngộ nghĩnh
          const duckDir = t.facing;
          const duckHeadX = duckDir * 28 * unit;
          const duckHeadY = -8 * unit;

          // Cổ vịt
          ctx.beginPath();
          ctx.fillStyle = "#fde047";
          ctx.roundRect(
            duckHeadX - duckDir * 4 * unit - 5 * unit,
            -3 * unit,
            10 * unit,
            8 * unit,
            4 * unit
          );
          ctx.fill();

          // Đầu vịt
          ctx.beginPath();
          ctx.arc(duckHeadX, duckHeadY, 9 * unit, 0, Math.PI * 2);
          ctx.fillStyle = "#fde047";
          ctx.fill();
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = Math.max(1, 1.5 * unit);
          ctx.stroke();

          // Mắt vịt long lanh
          ctx.beginPath();
          ctx.arc(
            duckHeadX + duckDir * 3 * unit,
            duckHeadY - 2 * unit,
            2.2 * unit,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = "#1e293b";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(
            duckHeadX + duckDir * 3.5 * unit,
            duckHeadY - 2.8 * unit,
            0.8 * unit,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = "#ffffff";
          ctx.fill();

          // Má hồng phớt
          ctx.beginPath();
          ctx.arc(duckHeadX, duckHeadY + 3 * unit, 2.5 * unit, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 114, 182, 0.7)";
          ctx.fill();

          // Mỏ cam ngộ nghĩnh
          ctx.beginPath();
          const beakTipX = duckHeadX + duckDir * 16 * unit;
          ctx.moveTo(duckHeadX + duckDir * 6 * unit, duckHeadY);
          ctx.lineTo(beakTipX, duckHeadY + 2 * unit);
          ctx.lineTo(duckHeadX + duckDir * 6 * unit, duckHeadY + 5 * unit);
          ctx.closePath();
          ctx.fillStyle = "#f97316";
          ctx.fill();
          ctx.strokeStyle = "#c2410c";
          ctx.lineWidth = 1;
          ctx.stroke();

          // 3. Cạnh phao có cột cờ & lá cờ trắng SOS bay phấp phới
          const flagX = -duckDir * 24 * unit;
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = Math.max(1.2, 1.8 * unit);
          ctx.beginPath();
          ctx.moveTo(flagX, 2 * unit);
          ctx.lineTo(flagX, -28 * unit);
          ctx.stroke();

          const waveFlag = Math.sin(now * 0.01) * 3 * unit;
          ctx.beginPath();
          ctx.moveTo(flagX, -28 * unit);
          ctx.quadraticCurveTo(
            flagX - duckDir * 10 * unit,
            -28 * unit + waveFlag,
            flagX - duckDir * 18 * unit,
            -22 * unit
          );
          ctx.quadraticCurveTo(
            flagX - duckDir * 10 * unit,
            -16 * unit + waveFlag,
            flagX,
            -16 * unit
          );
          ctx.closePath();
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.fill();
          ctx.strokeStyle = "#cbd5e1";
          ctx.stroke();

          ctx.font = "bold " + Math.max(8, Math.round(9 * unit)) + "px sans-serif";
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "center";
          ctx.fillText(
            "SOS",
            flagX - duckDir * 9 * unit,
            -20 * unit + waveFlag * 0.5
          );

          // 4. Chiếc xe ngồi lắc lư trên phao
          ctx.save();
          ctx.translate(0, -6 * unit);
          ctx.scale(t.facing, 1);
          ctx.filter = "grayscale(70%) brightness(80%)";
          const spriteImg = spritesRef.current[mobileId];
          if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {
            const spriteSize = 54 * unit;
            ctx.drawImage(
              spriteImg,
              -spriteSize / 2,
              -spriteSize + 8 * unit,
              spriteSize,
              spriteSize
            );
          } else {
            ctx.fillStyle = isNam ? "#f43f5e" : "#0ea5e9";
            ctx.beginPath();
            ctx.roundRect(
              -TANK_R * 0.8 * unit,
              -14 * unit,
              TANK_R * 1.6 * unit,
              10 * unit,
              3 * unit
            );
            ctx.fill();
          }
          ctx.restore();

          // Pilot badge
          ctx.font = Math.max(13, Math.round(16 * unit)) + "px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("😵", 0, -42 * unit);

          ctx.restore();
          continue;
        }
        const prof = MOTION[mobileId];

        // Procedural motion: the body follows the engine x with inertia, suspension and a gait
        const groundFn = smoothFn;
        let body = bodiesRef.current[p];
        if (!body) {
          body = newBody(t.x, groundFn, p === "nam" ? 0 : 2.1, prof.foot);
          bodiesRef.current[p] = body;
        }
        const pose = stepBody(
          body,
          { x: t.x, groundAt: groundFn, alive: t.alive },
          prof,
          dt,
          now / 1000
        );
        const liftPx = pose.lift * scaleY;

        const tx = pose.x;
        const ty = pose.ground + TANK_OFFSET_Y;
        const cx = wx(tx);
        const cy = wy(ty);
        const isNam = p === "nam";

        // Trails while moving, a dust puff on each hop landing, idle exhaust
        if (t.alive) {
          const back = -Math.sign(body.vx) || -t.facing;
          if (pose.moving > 0.3) {
            trailDistRef.current[p] += pose.speed * dt;
            const floaty = prof.gait === "hover" || prof.gait === "float";
            // More dust when a walker works hard uphill
            const every = floaty ? 9 : pose.grade > 0.25 ? 3.5 : 6;
            while (trailDistRef.current[p] >= every) {
              trailDistRef.current[p] -= every;
              for (const kind of prof.trails) {
                if (kind === "smoke") {
                  spawnTrail(kind, tx - t.facing * 16, pose.ground + 34, back);
                } else if (kind === "sparkle") {
                  spawnTrail(kind, tx + back * 10, pose.ground + pose.lift, back);
                } else {
                  spawnTrail(kind, tx + back * 12, pose.ground, back);
                }
              }
            }
          }
          if (pose.contact) {
            for (let k = 0; k < 4; k++) spawnTrail("dust", tx, pose.ground, k % 2 ? 1 : -1);
          }
          if (prof.trails.includes("smoke") && Math.random() < dt * 1.2) {
            spawnTrail("smoke", tx - t.facing * 16, pose.ground + 34, -t.facing);
          }
        }

        // Soft ground shadow (shrinks as the mobile rises), glow under hovers
        {
          const up = Math.max(0, pose.lift);
          const k = Math.max(0.35, 1 - up / 45);
          ctx.save();
          ctx.globalAlpha = 0.28 * k;
          ctx.fillStyle = "#0a0a0a";
          ctx.beginPath();
          ctx.ellipse(wx(tx), wy(pose.ground), 24 * k * unit, 4.5 * k * unit, 0, 0, Math.PI * 2);
          ctx.fill();
          if (t.alive && prof.gait === "hover") {
            const glowR = (20 + Math.sin(now * 0.008) * 3) * unit;
            const glow = ctx.createRadialGradient(cx, wy(pose.ground + 2), 1, cx, wy(pose.ground + 2), glowR);
            glow.addColorStop(0, "rgba(125, 211, 252, 0.65)");
            glow.addColorStop(1, "rgba(125, 211, 252, 0)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, wy(pose.ground + 2), glowR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

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

          // Subtle 3-dot initial launch vector preview biased by wind
          ctx.setLineDash([]);
          ctx.fillStyle = isNam
            ? "rgba(254, 205, 211, 0.85)"
            : "rgba(186, 230, 253, 0.85)";
          const launchP = Math.max(20, curAim.power);
          const launchSpd = launchP * 2.2;
          const launchVx = dirX * launchSpd;
          const launchVy = dirY * launchSpd;
          for (let step = 1; step <= 3; step++) {
            const dtPreview = step * 0.1;
            const predX = tx + launchVx * dtPreview + 0.5 * activeWind * 2.5 * dtPreview * dtPreview;
            const predY = ty + 6 + launchVy * dtPreview - 0.5 * 240 * dtPreview * dtPreview;
            ctx.beginPath();
            ctx.arc(wx(predX), wy(predY), (3 - step * 0.5) * scaleX, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        // Body rotation = slope + pitch + lean + waddle (from the motion pose)
        const tilt = pose.rot;

        const spriteImg = spritesRef.current[mobileId];
        const hasSprite =
          spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0;

        if (hasSprite) {
          ctx.save();
          // Anchor at bottom of treads on terrain surface
          ctx.translate(cx, cy + TANK_R * scaleY - liftPx);
          ctx.rotate(tilt);
          // Squash & stretch stays uniform at rest (sx = sy = 1): no distortion
          ctx.scale(t.facing * pose.sx, pose.sy);
          if (!t.alive) {
            ctx.filter = "grayscale(100%) brightness(65%)";
          }
          // Strictly 1:1 uniform square dimensions so sprite is NEVER stretched or squished
          const spriteSize = 68 * unit;
          ctx.drawImage(
            spriteImg,
            -spriteSize / 2,
            -spriteSize + 5 * unit,
            spriteSize,
            spriteSize
          );
          ctx.restore();
        } else {
          // Fallback vector tank while sprite image loads
          ctx.save();
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = Math.max(3, 6 * unit);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(cx, cy - 3 * unit - liftPx);
          ctx.lineTo(
            cx + dirX * (TANK_R + 11) * unit,
            cy - 3 * unit - liftPx - dirY * (TANK_R + 11) * unit
          );
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.translate(cx, cy - liftPx);
          ctx.rotate(tilt);
          ctx.fillStyle = bodyColor;
          ctx.strokeStyle = darkColor;
          ctx.lineWidth = Math.max(1.5, 2 * unit);
          ctx.beginPath();
          ctx.arc(0, -2 * unit, 9.5 * unit, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.roundRect(
            -TANK_R * unit,
            -3 * unit,
            TANK_R * 2 * unit,
            10 * unit,
            5 * unit
          );
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = hiColor;
          ctx.restore();
        }

        // Pilot badge & mini HP bar above tank (positioned with uniform unit scale)
        const labelY = cy + TANK_R * scaleY - 68 * unit - liftPx;
        const barW = 42 * unit;
        const barH = Math.max(4, 5.5 * unit);
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

        ctx.font = `${Math.max(12, Math.round(15 * unit))}px sans-serif`;
        ctx.textAlign = "center";
        const emoji = !t.alive ? "😵" : isNam ? "🐻" : "🧸";
        ctx.fillText(emoji, cx, labelY - 4 * unit);
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
        const shooter = pb?.shot.by;
        const shooterMobile = shooter
          ? (pb?.preTanks[shooter]?.mobile ?? DEFAULT_MOBILE[shooter])
          : undefined;
        const isLinhSS =
          shellPos.kind === "ss" &&
          (shooter === "linh" || shooterMobile === "unicorn");
        const isNamSS =
          shellPos.kind === "ss" &&
          (shooter === "nam" || shooterMobile === "armor");

        if (isLinhSS) {
          // Trái tim cầu vồng tỏa hào quang ngũ sắc (Rainbow Heart SS)
          ctx.save();
          const rainbowHue = (now * 0.35) % 360;
          const glowGrad = ctx.createRadialGradient(
            sx,
            sy,
            2 * scaleX,
            sx,
            sy,
            24 * scaleX
          );
          glowGrad.addColorStop(0, "hsla(" + rainbowHue + ", 100%, 75%, 0.85)");
          glowGrad.addColorStop(
            0.5,
            "hsla(" + ((rainbowHue + 120) % 360) + ", 100%, 70%, 0.45)"
          );
          glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(sx, sy, 24 * scaleX, 0, Math.PI * 2);
          ctx.fill();

          const hs = 9.5 * scaleX;
          ctx.translate(sx, sy - 2 * scaleX);
          ctx.beginPath();
          ctx.moveTo(0, hs * 0.45);
          ctx.bezierCurveTo(-hs * 1.25, -hs * 0.6, -hs * 1.35, -hs * 1.55, 0, -hs * 0.85);
          ctx.bezierCurveTo(hs * 1.35, -hs * 1.55, hs * 1.25, -hs * 0.6, 0, hs * 0.45);
          const heartGrad = ctx.createLinearGradient(-hs, -hs, hs, hs);
          heartGrad.addColorStop(0, "#f43f5e");
          heartGrad.addColorStop(0.35, "#ec4899");
          heartGrad.addColorStop(0.7, "#a855f7");
          heartGrad.addColorStop(1, "#38bdf8");
          ctx.fillStyle = heartGrad;
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, 2 * scaleX);
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.restore();
        } else if (isNamSS) {
          // Đại bác bọc gai sấm sét tia lửa đỏ cam rực rỡ
          ctx.save();
          const fireGrad = ctx.createRadialGradient(
            sx,
            sy,
            3 * scaleX,
            sx,
            sy,
            24 * scaleX
          );
          fireGrad.addColorStop(0, "rgba(254, 240, 138, 0.95)");
          fireGrad.addColorStop(0.45, "rgba(249, 115, 22, 0.7)");
          fireGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
          ctx.fillStyle = fireGrad;
          ctx.beginPath();
          ctx.arc(sx, sy, 24 * scaleX, 0, Math.PI * 2);
          ctx.fill();

          const spin = now * 0.009;
          const mainR = 8.5 * scaleX;
          ctx.fillStyle = "#f59e0b";
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = Math.max(1, 1.6 * scaleX);
          for (let k = 0; k < 8; k++) {
            const ang = spin + (k * Math.PI) / 4;
            const spikeTipX = sx + Math.cos(ang) * (mainR + 6 * scaleX);
            const spikeTipY = sy + Math.sin(ang) * (mainR + 6 * scaleX);
            ctx.beginPath();
            ctx.moveTo(sx + Math.cos(ang - 0.28) * mainR, sy + Math.sin(ang - 0.28) * mainR);
            ctx.lineTo(spikeTipX, spikeTipY);
            ctx.lineTo(sx + Math.cos(ang + 0.28) * mainR, sy + Math.sin(ang + 0.28) * mainR);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(sx, sy, mainR, 0, Math.PI * 2);
          ctx.fillStyle = "#ea580c";
          ctx.fill();
          ctx.strokeStyle = "#fef08a";
          ctx.stroke();

          ctx.strokeStyle = "#fef08a";
          ctx.lineWidth = Math.max(1.3, 2 * scaleX);
          for (let k = 0; k < 3; k++) {
            const sa = (k * 2.1 + now * 0.025) % (Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(sx + Math.cos(sa) * mainR, sy + Math.sin(sa) * mainR);
            const midR = mainR + 6 * scaleX;
            ctx.lineTo(sx + Math.cos(sa + 0.25) * midR, sy + Math.sin(sa + 0.25) * midR);
            ctx.lineTo(sx + Math.cos(sa + 0.1) * (mainR + 13 * scaleX), sy + Math.sin(sa + 0.1) * (mainR + 13 * scaleX));
            ctx.stroke();
          }
          ctx.restore();
        } else {
          const r = (shellPos.kind === "ss" ? 7.5 : shellPos.kind === "s2" ? 6 : 5) * scaleX;
          ctx.save();
          ctx.beginPath();
          ctx.arc(sx, sy, r * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = shellPos.kind === "ss" ? "rgba(250, 204, 21, 0.55)" : shellPos.kind === "s2" ? "rgba(45, 212, 191, 0.5)" : "rgba(251, 146, 60, 0.5)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = shellPos.kind === "ss" ? "#fef08a" : shellPos.kind === "s2" ? "#14b8a6" : "#fff7ed";
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, 2 * scaleX);
          ctx.strokeStyle = shellPos.kind === "ss" ? "#ca8a04" : shellPos.kind === "s2" ? "#0f766e" : "#ea580c";
          ctx.stroke();
          ctx.restore();
        }
      }

      // --- 4b. Hit-stop micro-freeze impact crunch flash ---
      if (hitStopFlash) {
        const fx = wx(hitStopFlash.x);
        const fy = wy(hitStopFlash.y);
        ctx.save();
        ctx.beginPath();
        ctx.arc(fx, fy, 14 * scaleX, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fx, fy, 24 * scaleX, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(254, 240, 138, 0.5)";
        ctx.fill();
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

      // Cánh hoa hồng xoay rơi trong gió cho Linh SS (Rose Petals)
      const livePetals: RosePetal[] = [];
      for (const p of petalsRef.current) {
        const age = now - p.bornAt;
        if (age < p.lifeMs) {
          livePetals.push(p);
          p.vx += activeWind * 15 * dt;
          p.x += (p.vx + Math.sin(now * 0.005 + p.rot) * 16) * dt;
          p.vy -= 75 * dt;
          p.y += p.vy * dt;
          p.rot += p.rotSpd * dt;
          const alpha = Math.max(0, 1 - age / p.lifeMs);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(wx(p.x), wy(p.y));
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          const pr = p.r * unit;
          ctx.ellipse(0, 0, pr * 1.35, pr * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
      petalsRef.current = livePetals;

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

      // --- 7. Bong Bóng Hội Thoại Tương Tác Cặp Đôi (Couple Speech Bubbles) ---
      const liveBubbles: ChatBubble[] = [];
      for (const b of bubblesRef.current) {
        const age = now - b.bornAt;
        if (age >= 0 && age < b.lifeMs) {
          liveBubbles.push(b);
          const isNam = b.player === "nam";
          const tank = drawTanks[b.player];
          const bx = wx(tank.x);
          const isFell =
            groundAt(drawGround, tank.x) <= 0 ||
            (!tank.alive &&
              ((pb?.shot?.fell && pb.shot.fell.includes(b.player)) ||
                (curState.endReason === "fell" && curState.winner !== b.player) ||
                (tank.hp <= 0 && groundAt(drawGround, tank.x) <= 0)));
          const ty = isFell
            ? 16 + Math.sin(now * 0.005 + tank.x * 0.1) * 3.5
            : tankY(drawGround, tank.x);
          const by = wy(ty + 54);

          // Pop-in spring-damper: vọt lố 1.15 tại 110ms rồi về 1.0 ở 180ms
          let currentScale = 1.0;
          if (age < 180) {
            const expTerm = Math.exp(-0.5169 * 0.03336 * age);
            const dampedAngle = 0.02856 * age;
            currentScale =
              1.0 - expTerm * (Math.cos(dampedAngle) + 0.6039 * Math.sin(dampedAngle));
          } else {
            currentScale = 1.0 + Math.sin(age * 0.005) * 0.025;
          }

          // Fade-out mờ dần ở 500ms cuối
          const alpha =
            age > b.lifeMs - 500
              ? Math.max(0, (b.lifeMs - age) / 500)
              : 1;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = "bold " + Math.max(11, Math.round(13 * scaleX)) + "px sans-serif";
          const textMetrics = ctx.measureText(b.text);
          const padX = 12 * scaleX;
          const bw = textMetrics.width + padX * 2;
          const bh = Math.max(25 * scaleY, 27 * unit);
          const bubbleBottom = by - 8 * scaleY;
          const bubbleTop = bubbleBottom - bh;
          const bubbleLeft = bx - bw / 2;

          ctx.translate(bx, by);
          ctx.scale(currentScale, currentScale);
          ctx.translate(-bx, -by);

          // Drop shadow nhẹ nhàng
          ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
          ctx.shadowBlur = 6 * unit;
          ctx.shadowOffsetY = 2 * unit;

          // Thân bong bóng rounded rect + đuôi tam giác trỏ xuống đầu xe
          ctx.beginPath();
          ctx.roundRect(bubbleLeft, bubbleTop, bw, bh, 8 * unit);
          ctx.moveTo(bx - 6 * unit, bubbleBottom);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + 6 * unit, bubbleBottom);

          ctx.fillStyle = isNam
            ? "rgba(255, 255, 255, 0.96)"
            : "rgba(255, 241, 242, 0.96)";
          ctx.fill();

          ctx.shadowColor = "transparent";
          ctx.lineWidth = Math.max(1.5, 2 * unit);
          ctx.strokeStyle = isNam
            ? "rgba(59, 130, 246, 0.85)"
            : "rgba(244, 114, 182, 0.85)";
          ctx.stroke();

          // Chữ hội thoại
          ctx.fillStyle = isNam ? "#1e3a8a" : "#831843";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.text, bx, bubbleTop + bh / 2);

          ctx.restore();
        } else if (age < 0) {
          liveBubbles.push(b);
        }
      }
      bubblesRef.current = liveBubbles;

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
    // Support both normal landscape and 90deg clockwise rotated portrait container
    const rotated = rect.height > rect.width;
    const u = rotated
      ? (clientY - rect.top) / rect.height
      : (clientX - rect.left) / rect.width;
    const v = rotated
      ? (rect.right - clientX) / rect.width
      : (clientY - rect.top) / rect.height;
    const px = u * WORLD_W;
    const py = (1 - v) * WORLD_H;

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
