"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  type Horse,
  type LegalMove,
  type LudoState,
  type Player,
  SAFE_CELLS,
  getLegalMoves,
  toGlobalTrackIndex,
} from "@/lib/ludo/engine";
import {
  playDeploy,
  playHomeStep,
  playHop,
  playKick,
  playWin,
} from "@/lib/ludo/audio";

export interface BoardProps {
  state: LudoState;
  me: Player;
  isHotseat: boolean;
  onMove: (horseId: number) => void;
}

export interface CellCoord {
  r: number; // 0..10
  c: number; // 0..10
}

export const PERIMETER_CELLS: Record<number, CellCoord> = {
  0: { r: 10, c: 4 }, // Nam start
  1: { r: 9, c: 4 },
  2: { r: 8, c: 4 },
  3: { r: 7, c: 4 },
  4: { r: 6, c: 3 },
  5: { r: 6, c: 2 },
  6: { r: 6, c: 1 },
  7: { r: 6, c: 0 },
  8: { r: 5, c: 0 },
  9: { r: 4, c: 0 }, // SAFE STAR ⭐
  10: { r: 4, c: 1 },
  11: { r: 4, c: 2 },
  12: { r: 4, c: 3 },
  13: { r: 3, c: 4 },
  14: { r: 2, c: 4 },
  15: { r: 1, c: 4 },
  16: { r: 0, c: 4 },
  17: { r: 0, c: 5 }, // Linh home door
  18: { r: 0, c: 6 }, // Linh start
  19: { r: 1, c: 6 },
  20: { r: 2, c: 6 },
  21: { r: 3, c: 6 },
  22: { r: 4, c: 7 },
  23: { r: 4, c: 8 },
  24: { r: 4, c: 9 },
  25: { r: 4, c: 10 },
  26: { r: 5, c: 10 },
  27: { r: 6, c: 10 }, // SAFE STAR ⭐
  28: { r: 6, c: 9 },
  29: { r: 6, c: 8 },
  30: { r: 6, c: 7 },
  31: { r: 7, c: 6 },
  32: { r: 8, c: 6 },
  33: { r: 9, c: 6 },
  34: { r: 10, c: 6 },
  35: { r: 10, c: 5 }, // Nam home door
};

export const NAM_HOME_CELLS: Record<number, CellCoord> = {
  1: { r: 9, c: 5 },
  2: { r: 8, c: 5 },
  3: { r: 7, c: 5 },
  4: { r: 6, c: 5 },
  5: { r: 6, c: 4 },
  6: { r: 5, c: 4 },
};

export const LINH_HOME_CELLS: Record<number, CellCoord> = {
  1: { r: 1, c: 5 },
  2: { r: 2, c: 5 },
  3: { r: 3, c: 5 },
  4: { r: 4, c: 5 },
  5: { r: 4, c: 6 },
  6: { r: 5, c: 6 },
};

export const CENTER_GOAL_CELL: CellCoord = { r: 5, c: 5 };

export const DECORATIVE_CELLS: CellCoord[] = [
  { r: 4, c: 4 },
  { r: 5, c: 1 },
  { r: 5, c: 2 },
  { r: 5, c: 3 },
  { r: 5, c: 7 },
  { r: 5, c: 8 },
  { r: 5, c: 9 },
  { r: 6, c: 6 },
];

export interface RouteStep {
  zone: "track" | "home";
  owner: Player;
  pos: number;
  globalTrackIndex?: number;
  coord: CellCoord;
  isDestination: boolean;
  isKick: boolean;
  stepNumber: number;
}

export function computeMovePath(move: LegalMove, owner: Player): RouteStep[] {
  const steps: RouteStep[] = [];

  if (move.kind === "deploy") {
    const gIdx = toGlobalTrackIndex(owner, 0);
    steps.push({
      zone: "track",
      owner,
      pos: 0,
      globalTrackIndex: gIdx,
      coord: PERIMETER_CELLS[gIdx],
      isDestination: true,
      isKick: move.kicks !== null,
      stepNumber: 1,
    });
    return steps;
  }

  if (move.kind === "advance") {
    let stepNum = 1;
    for (let p = move.fromPos + 1; p <= move.toPos; p++) {
      const isDest = p === move.toPos;
      const gIdx = toGlobalTrackIndex(owner, p);
      steps.push({
        zone: "track",
        owner,
        pos: p,
        globalTrackIndex: gIdx,
        coord: PERIMETER_CELLS[gIdx],
        isDestination: isDest,
        isKick: isDest && move.kicks !== null,
        stepNumber: stepNum++,
      });
    }
    return steps;
  }

  if (move.kind === "enter_home") {
    let stepNum = 1;
    for (let s = 1; s <= move.toPos; s++) {
      const isDest = s === move.toPos;
      const coord = owner === "nam" ? NAM_HOME_CELLS[s] : LINH_HOME_CELLS[s];
      steps.push({
        zone: "home",
        owner,
        pos: s,
        coord,
        isDestination: isDest,
        isKick: false,
        stepNumber: stepNum++,
      });
    }
    return steps;
  }

  if (move.kind === "climb_home") {
    let stepNum = 1;
    for (let s = move.fromPos + 1; s <= move.toPos; s++) {
      const isDest = s === move.toPos;
      const coord = owner === "nam" ? NAM_HOME_CELLS[s] : LINH_HOME_CELLS[s];
      steps.push({
        zone: "home",
        owner,
        pos: s,
        coord,
        isDestination: isDest,
        isKick: false,
        stepNumber: stepNum++,
      });
    }
    return steps;
  }

  return steps;
}

interface ActiveHopAnimation {
  actionN: number;
  horseId: number;
  owner: Player;
  kind: LegalMove["kind"];
  path: RouteStep[];
  stepIndex: number;
  phase: "hop" | "impact";
  kicks: { owner: Player; horseId: number } | null;
}

function triggerHaptic(pattern: number | number[] = 18) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration error
    }
  }
}

function HorseAvatar({
  owner,
  className = "w-full h-full",
}: {
  owner: Player;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const src = owner === "nam" ? "/ludo/nam-horse.png" : "/ludo/linh-horse.png";
  const emoji = owner === "nam" ? "🐻" : "🧸";

  if (imgError) {
    return <span className="select-none text-base sm:text-xl leading-none">{emoji}</span>;
  }

  return (
    <Image
      src={src}
      alt={owner === "nam" ? "Nam Horse" : "Linh Horse"}
      width={28}
      height={28}
      unoptimized
      className={`${className} object-contain select-none pointer-events-none drop-shadow-xs`}
      onError={() => setImgError(true)}
    />
  );
}

function TrophyAvatar({ className = "w-full h-full" }: { className?: string }) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <span className="select-none text-xl sm:text-2xl leading-none">🏆</span>;
  }

  return (
    <Image
      src="/ludo/trophy.png"
      alt="Ludo Trophy"
      width={32}
      height={32}
      unoptimized
      className={`${className} object-contain select-none pointer-events-none drop-shadow-md`}
      onError={() => setImgError(true)}
    />
  );
}

function HorseToken({
  horse,
  isLegal,
  isSelected,
  isHopping,
  isKicking,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  horse: Horse;
  isLegal?: boolean;
  isSelected?: boolean;
  isHopping?: boolean;
  isKicking?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const isNam = horse.owner === "nam";

  if (isKicking) {
    return (
      <div className="relative flex items-center justify-center w-full h-full pointer-events-none z-50">
        <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center animate-ludo-kick-spin">
          <HorseAvatar owner={horse.owner} />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={isLegal ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      disabled={!isLegal && !isHopping}
      title={`${isNam ? "Anh Nam" : "Em Linh"} - Ngựa #${horse.id + 1}${
        isLegal ? " (Chạm để đi)" : ""
      }`}
      className={`relative flex items-center justify-center w-full h-full p-0.5 rounded-full transition-all duration-150 ${
        isHopping
          ? "animate-ludo-hop scale-120 z-50 drop-shadow-lg ring-3 ring-amber-400 bg-amber-50"
          : isSelected
          ? "cursor-pointer scale-115 z-30 ring-4 ring-amber-400 ring-offset-1 bg-amber-100 shadow-md animate-pulse"
          : isLegal
          ? "cursor-pointer scale-110 z-20 animate-bounce ring-3 ring-amber-400 ring-offset-1 bg-amber-50/90 shadow-md active:scale-95"
          : "cursor-default"
      }`}
    >
      <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
        <HorseAvatar owner={horse.owner} />
      </div>
      <span
        className={`absolute -bottom-1 -right-1 text-[8px] sm:text-[9px] font-black rounded-full px-1 leading-tight shadow-xs ${
          isNam ? "bg-pink-600 text-white" : "bg-sky-600 text-white"
        }`}
      >
        #{horse.id + 1}
      </span>
    </button>
  );
}

export default function Board({ state, me, isHotseat, onMove }: BoardProps) {
  const [hoveredHorseId, setHoveredHorseId] = useState<number | null>(null);
  const [selectedHorseId, setSelectedHorseId] = useState<number | null>(null);
  const [animating, setAnimating] = useState<ActiveHopAnimation | null>(null);

  const lastAnimatedN = useRef<number>(state.lastAction?.n ?? -1);

  // Clear preview selection when turn or phase changes
  useEffect(() => {
    if (state.phase !== "move") {
      setHoveredHorseId(null);
      setSelectedHorseId(null);
    }
  }, [state.phase, state.turn]);

  // Hop Step & Kick FX Animation Driver
  useEffect(() => {
    if (!state.lastAction) return;
    const action = state.lastAction;
    if (action.n <= lastAnimatedN.current) return;
    lastAnimatedN.current = action.n;

    if (!action.move) return;
    const move = action.move;
    const path = computeMovePath(move, action.by);
    if (path.length === 0) return;

    // Start hopping animation sequence
    setAnimating({
      actionN: action.n,
      horseId: move.horseId,
      owner: action.by,
      kind: move.kind,
      path,
      stepIndex: 0,
      phase: "hop",
      kicks: move.kicks,
    });

    playHop();
    triggerHaptic(14);

    let curStep = 0;
    const hopInterval = setInterval(() => {
      curStep++;
      if (curStep < path.length) {
        setAnimating((prev) => (prev ? { ...prev, stepIndex: curStep } : null));
        playHop();
        triggerHaptic(14);
      } else {
        // Destination cell reached!
        clearInterval(hopInterval);

        if (move.kicks) {
          // Trigger Kick Impact FX
          setAnimating((prev) =>
            prev ? { ...prev, stepIndex: path.length - 1, phase: "impact" } : null
          );
          playKick();
          triggerHaptic([35, 45, 60]);

          setTimeout(() => {
            setAnimating(null);
          }, 420);
        } else {
          // Landing sound effects
          if (move.kind === "deploy") {
            playDeploy();
          } else if (move.kind === "enter_home" || move.kind === "climb_home") {
            playHomeStep(move.toPos);
          }
          if (state.status === "over") {
            playWin();
          }
          setTimeout(() => {
            setAnimating(null);
          }, 120);
        }
      }
    }, 100);

    return () => clearInterval(hopInterval);
  }, [state.lastAction, state.status]);

  const canControl = isHotseat || state.turn === me;
  const isMovePhase =
    state.status === "playing" &&
    state.phase === "move" &&
    canControl &&
    animating === null;
  const dice = state.dice ?? 0;

  // Compute legal moves
  const legalMoves: LegalMove[] = useMemo(() => {
    return isMovePhase && dice >= 1 && dice <= 6
      ? getLegalMoves(state, state.turn, dice)
      : [];
  }, [isMovePhase, dice, state]);

  const legalHorsesMap = useMemo(() => {
    const m = new Map<number, LegalMove>();
    for (const lm of legalMoves) m.set(lm.horseId, lm);
    return m;
  }, [legalMoves]);

  // Determine which horse's path to preview (hover > selected > single legal)
  const activeHorseId = useMemo(() => {
    if (!isMovePhase) return null;
    if (hoveredHorseId !== null && legalHorsesMap.has(hoveredHorseId)) {
      return hoveredHorseId;
    }
    if (selectedHorseId !== null && legalHorsesMap.has(selectedHorseId)) {
      return selectedHorseId;
    }
    if (legalMoves.length === 1) {
      return legalMoves[0].horseId;
    }
    return null;
  }, [isMovePhase, hoveredHorseId, selectedHorseId, legalHorsesMap, legalMoves]);

  // Compute preview route
  const previewRoute = useMemo(() => {
    if (activeHorseId === null) return [];
    const move = legalHorsesMap.get(activeHorseId);
    if (!move) return [];
    return computeMovePath(move, state.turn);
  }, [activeHorseId, legalHorsesMap, state.turn]);

  const previewTrackMap = useMemo(() => {
    const m = new Map<number, RouteStep>();
    for (const s of previewRoute) {
      if (s.zone === "track" && s.globalTrackIndex !== undefined) {
        m.set(s.globalTrackIndex, s);
      }
    }
    return m;
  }, [previewRoute]);

  const previewHomeMap = useMemo(() => {
    const m = new Map<string, RouteStep>();
    for (const s of previewRoute) {
      if (s.zone === "home") {
        m.set(`${s.owner}:${s.pos}`, s);
      }
    }
    return m;
  }, [previewRoute]);

  // Click & hover handlers
  const handleHorseSelect = (horseId: number) => {
    if (!isMovePhase || !legalHorsesMap.has(horseId)) return;
    if (activeHorseId === horseId) {
      onMove(horseId);
    } else {
      setSelectedHorseId(horseId);
      triggerHaptic(12);
    }
  };

  const handleCellClick = (horseId: number) => {
    if (!isMovePhase || !legalHorsesMap.has(horseId)) return;
    onMove(horseId);
  };

  // Build horse lookups with animation overrides
  const trackHorses: Record<number, Horse> = {};
  for (const p of ["nam", "linh"] as const) {
    for (const h of state.horses[p]) {
      if (h.zone === "track") {
        const gIdx = toGlobalTrackIndex(p, h.pos);
        trackHorses[gIdx] = h;
      }
    }
  }

  const homeHorses: Record<Player, Record<number, Horse>> = {
    nam: {},
    linh: {},
  };
  for (const p of ["nam", "linh"] as const) {
    for (const h of state.horses[p]) {
      if (h.zone === "home") {
        homeHorses[p][h.pos] = h;
      }
    }
  }

  // Waiting horses in stable
  let namStable = state.horses.nam.filter((h) => h.zone === "stable");
  let linhStable = state.horses.linh.filter((h) => h.zone === "stable");

  // Animate Override: Adjust horse positions while hopping or kicking
  let hoppingHorse: { horse: Horse; coord: CellCoord; zone: "track" | "home"; pos: number } | null = null;
  let kickedHorseRender: { horse: Horse; gIdx: number; isKicking: boolean } | null = null;
  let collisionCellGIdx: number | null = null;

  if (animating) {
    // 1. Moving Horse: remove from static board, place at current step
    const mover = state.horses[animating.owner].find((h) => h.id === animating.horseId);
    if (mover) {
      // Remove from track / home / stable
      for (const idx in trackHorses) {
        if (trackHorses[idx].owner === mover.owner && trackHorses[idx].id === mover.id) {
          delete trackHorses[idx];
        }
      }
      for (const p of ["nam", "linh"] as const) {
        for (const pos in homeHorses[p]) {
          if (homeHorses[p][pos].owner === mover.owner && homeHorses[p][pos].id === mover.id) {
            delete homeHorses[p][pos];
          }
        }
      }
      if (mover.owner === "nam") {
        namStable = namStable.filter((h) => h.id !== mover.id);
      } else {
        linhStable = linhStable.filter((h) => h.id !== mover.id);
      }

      const step = animating.path[animating.stepIndex];
      if (step) {
        hoppingHorse = {
          horse: mover,
          coord: step.coord,
          zone: step.zone,
          pos: step.pos,
        };
      }
    }

    // 2. Kicked Horse: While hopping, still sits on landing cell; during impact, spins and scales down
    if (animating.kicks) {
      const destStep = animating.path[animating.path.length - 1];
      if (destStep && destStep.globalTrackIndex !== undefined) {
        const destGIdx = destStep.globalTrackIndex;
        collisionCellGIdx = destGIdx;
        const kickedOwner = animating.kicks.owner;
        const kickedId = animating.kicks.horseId;
        const kickedH = state.horses[kickedOwner].find((h) => h.id === kickedId);

        if (kickedH) {
          // Remove from stable during animation
          if (kickedOwner === "nam") {
            namStable = namStable.filter((h) => h.id !== kickedId);
          } else {
            linhStable = linhStable.filter((h) => h.id !== kickedId);
          }

          kickedHorseRender = {
            horse: kickedH,
            gIdx: destGIdx,
            isKicking: animating.phase === "impact",
          };
        }
      }
    }
  }

  // Home progress count
  const namInHome = state.horses.nam.filter((h) => h.zone === "home").length;
  const linhInHome = state.horses.linh.filter((h) => h.zone === "home").length;
  const totalHorses = state.horses.nam.length;

  return (
    <div className="w-full max-w-md mx-auto aspect-square select-none p-1.5 sm:p-2 bg-gradient-to-br from-amber-50/60 via-pink-50/40 to-sky-50/60 rounded-3xl border-2 border-pink-200/80 shadow-xl backdrop-blur-sm">
      <div className="grid grid-cols-11 grid-rows-11 gap-1 w-full h-full relative">
        {/* ================= 1. CORNER YARDS ================= */}

        {/* Top-Left Yard (rows 0..3, cols 0..3): Linh Status & Score */}
        <div
          style={{ gridRow: "1 / span 4", gridColumn: "1 / span 4" }}
          className={`flex flex-col justify-between p-2 rounded-2xl border transition-all ${
            state.turn === "linh" && state.status === "playing"
              ? "bg-gradient-to-br from-sky-100 to-sky-200/80 border-sky-400 shadow-md ring-2 ring-sky-300"
              : "bg-white/80 border-sky-200/70 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs sm:text-sm text-sky-800 flex items-center gap-1">
              <span>🧸 Linh</span>
              {state.turn === "linh" && state.status === "playing" && (
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping inline-block" />
              )}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
              {state.scores.linh} 🏆
            </span>
          </div>

          <div className="flex flex-col gap-1 text-[10px] sm:text-xs text-sky-700">
            <div className="flex items-center justify-between">
              <span>Về đích:</span>
              <span className="font-bold">
                {linhInHome}/{totalHorses} 🌸
              </span>
            </div>
            {state.turn === "linh" && state.status === "playing" && (
              <div className="text-[10px] font-bold text-sky-600 bg-sky-50/90 rounded-md py-0.5 px-1 text-center">
                {state.phase === "roll" ? "Đang tung xúc xắc" : "Chọn ngựa đi 🐴"}
              </div>
            )}
          </div>
        </div>

        {/* Top-Right Yard (rows 0..3, cols 7..10): Linh Stable */}
        <div
          style={{ gridRow: "1 / span 4", gridColumn: "8 / span 4" }}
          className="flex flex-col justify-between p-2 rounded-2xl border border-sky-300/80 bg-gradient-to-br from-sky-50 via-sky-100/50 to-blue-100/70 shadow-inner"
        >
          <div className="text-[11px] sm:text-xs font-bold text-sky-800 text-center flex items-center justify-center gap-1">
            <span>Chuồng Em 🧸</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 justify-items-center items-center my-auto">
            {state.horses.linh.map((h) => {
              const inStable = linhStable.some((sh) => sh.id === h.id);
              const isLegal = isMovePhase && state.turn === "linh" && legalHorsesMap.has(h.id);
              const isSelected = activeHorseId === h.id;

              return (
                <div
                  key={h.id}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                    inStable
                      ? isSelected
                        ? "border-amber-500 bg-amber-100 shadow-md ring-2 ring-amber-400"
                        : isLegal
                        ? "border-amber-400 bg-amber-50 shadow-xs"
                        : "border-sky-300 bg-white shadow-2xs"
                      : "border-dashed border-sky-200 bg-sky-50/40"
                  }`}
                >
                  {inStable ? (
                    <HorseToken
                      horse={h}
                      isLegal={isLegal}
                      isSelected={isSelected}
                      onClick={() => handleHorseSelect(h.id)}
                      onMouseEnter={() => isLegal && setHoveredHorseId(h.id)}
                      onMouseLeave={() => setHoveredHorseId((prev) => (prev === h.id ? null : prev))}
                    />
                  ) : (
                    <span className="text-[9px] text-sky-300 font-semibold">
                      #{h.id + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-sky-600/80 text-center">
            {linhStable.length > 0 ? `${linhStable.length} ngựa đang chờ` : "Đã xuất quân hết ✨"}
          </div>
        </div>

        {/* Bottom-Left Yard (rows 7..10, cols 0..3): Nam Stable */}
        <div
          style={{ gridRow: "8 / span 4", gridColumn: "1 / span 4" }}
          className="flex flex-col justify-between p-2 rounded-2xl border border-pink-300/80 bg-gradient-to-br from-pink-50 via-rose-100/50 to-pink-100/70 shadow-inner"
        >
          <div className="text-[11px] sm:text-xs font-bold text-pink-800 text-center flex items-center justify-center gap-1">
            <span>Chuồng Anh 🐻</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 justify-items-center items-center my-auto">
            {state.horses.nam.map((h) => {
              const inStable = namStable.some((sh) => sh.id === h.id);
              const isLegal = isMovePhase && state.turn === "nam" && legalHorsesMap.has(h.id);
              const isSelected = activeHorseId === h.id;

              return (
                <div
                  key={h.id}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                    inStable
                      ? isSelected
                        ? "border-amber-500 bg-amber-100 shadow-md ring-2 ring-amber-400"
                        : isLegal
                        ? "border-amber-400 bg-amber-50 shadow-xs"
                        : "border-pink-300 bg-white shadow-2xs"
                      : "border-dashed border-pink-200 bg-pink-50/40"
                  }`}
                >
                  {inStable ? (
                    <HorseToken
                      horse={h}
                      isLegal={isLegal}
                      isSelected={isSelected}
                      onClick={() => handleHorseSelect(h.id)}
                      onMouseEnter={() => isLegal && setHoveredHorseId(h.id)}
                      onMouseLeave={() => setHoveredHorseId((prev) => (prev === h.id ? null : prev))}
                    />
                  ) : (
                    <span className="text-[9px] text-pink-300 font-semibold">
                      #{h.id + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-pink-600/80 text-center">
            {namStable.length > 0 ? `${namStable.length} ngựa đang chờ` : "Đã xuất quân hết ✨"}
          </div>
        </div>

        {/* Bottom-Right Yard (rows 7..10, cols 7..10): Nam Status & Score */}
        <div
          style={{ gridRow: "8 / span 4", gridColumn: "8 / span 4" }}
          className={`flex flex-col justify-between p-2 rounded-2xl border transition-all ${
            state.turn === "nam" && state.status === "playing"
              ? "bg-gradient-to-br from-pink-100 to-rose-200/80 border-pink-400 shadow-md ring-2 ring-pink-300"
              : "bg-white/80 border-pink-200/70 shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs sm:text-sm text-pink-800 flex items-center gap-1">
              <span>🐻 Nam</span>
              {state.turn === "nam" && state.status === "playing" && (
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping inline-block" />
              )}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700">
              {state.scores.nam} 🏆
            </span>
          </div>

          <div className="flex flex-col gap-1 text-[10px] sm:text-xs text-pink-700">
            <div className="flex items-center justify-between">
              <span>Về đích:</span>
              <span className="font-bold">
                {namInHome}/{totalHorses} 🌸
              </span>
            </div>
            {state.turn === "nam" && state.status === "playing" && (
              <div className="text-[10px] font-bold text-pink-600 bg-pink-50/90 rounded-md py-0.5 px-1 text-center">
                {state.phase === "roll" ? "Đang tung xúc xắc" : "Chọn ngựa đi 🐴"}
              </div>
            )}
          </div>
        </div>

        {/* ================= 2. PERIMETER CELLS (36 cells, 0..35) ================= */}
        {Object.entries(PERIMETER_CELLS).map(([idxStr, coord]) => {
          const idx = Number(idxStr);
          const horse = trackHorses[idx];
          const isSafe = SAFE_CELLS.includes(idx);
          const isNamStart = idx === 0;
          const isLinhStart = idx === 18;
          const isNamDoor = idx === 35;
          const isLinhDoor = idx === 17;

          // Preview info
          const previewStep = previewTrackMap.get(idx);
          const isPreviewPath = previewStep !== undefined && !previewStep.isDestination;
          const isPreviewDest = previewStep !== undefined && previewStep.isDestination;
          const isKickTarget = previewStep?.isKick === true;

          // Collision Shake during kick impact
          const isCollisionCell = collisionCellGIdx === idx && animating?.phase === "impact";

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          const isSelectedHorse = horse && activeHorseId === horse.id;

          // Kicked horse rendering on landing cell
          const kickingHorseOnThisCell =
            kickedHorseRender && kickedHorseRender.gIdx === idx ? kickedHorseRender : null;

          return (
            <div
              key={`perimeter-${idx}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={
                isPreviewDest && activeHorseId !== null
                  ? () => handleCellClick(activeHorseId)
                  : undefined
              }
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isCollisionCell
                  ? "animate-ludo-shake ring-4 ring-rose-500 bg-rose-200 z-40"
                  : isPreviewDest
                  ? isKickTarget
                    ? "cursor-pointer ring-4 ring-rose-500 bg-rose-100/90 shadow-lg shadow-rose-300 animate-pulse z-30 border-rose-500"
                    : "cursor-pointer ring-3 ring-amber-400 bg-gradient-to-br from-amber-100 via-yellow-100 to-amber-200 shadow-md animate-pulse z-30 border-amber-500"
                  : isPreviewPath
                  ? "border-amber-400 bg-amber-100/60 shadow-inner ring-2 ring-amber-300/80 z-20"
                  : isSafe
                  ? "border-amber-400 bg-gradient-to-tr from-amber-100 to-yellow-50 shadow-inner"
                  : isNamStart
                  ? "border-pink-400 bg-pink-50"
                  : isLinhStart
                  ? "border-sky-400 bg-sky-50"
                  : isNamDoor
                  ? "border-pink-300 bg-pink-100/50"
                  : isLinhDoor
                  ? "border-sky-300 bg-sky-100/50"
                  : "border-zinc-200/90 bg-white/90 shadow-2xs"
              }`}
            >
              {/* Static Badges / Directions */}
              {isSafe && !horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[10px] sm:text-xs select-none">⭐</span>
              )}
              {isNamStart && !horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[9px] sm:text-[10px] font-black text-pink-500">
                  ↑
                </span>
              )}
              {isLinhStart && !horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[9px] sm:text-[10px] font-black text-sky-500">
                  ↓
                </span>
              )}
              {isNamDoor && !horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[9px] font-bold text-pink-400">▲</span>
              )}
              {isLinhDoor && !horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[9px] font-bold text-sky-400">▼</span>
              )}

              {/* Path Preview Step Number Badge */}
              {isPreviewPath && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-amber-950 font-black text-[9px] sm:text-[10px] shadow-xs ring-1 ring-amber-200 animate-pulse">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {/* Destination Target Preview */}
              {isPreviewDest && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  {isKickTarget ? (
                    <div className="relative flex items-center justify-center w-full h-full">
                      <div className="absolute inset-0 rounded-lg sm:rounded-xl ring-2 ring-rose-500 animate-ping" />
                      <span className="text-base sm:text-xl animate-bounce drop-shadow-md select-none z-40">
                        💥
                      </span>
                    </div>
                  ) : (
                    <div className="relative flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6">
                      <span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" />
                      <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-600 bg-amber-400 flex items-center justify-center shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Kick Impact Flash Overlay */}
              {isCollisionCell && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                  <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-amber-300 animate-ludo-impact-flash" />
                  <span className="text-2xl sm:text-3xl animate-bounce drop-shadow-lg select-none z-50">
                    💥
                  </span>
                </div>
              )}

              {/* Kicked Horse (Spins away during impact) */}
              {kickingHorseOnThisCell && (
                <HorseToken
                  horse={kickingHorseOnThisCell.horse}
                  isKicking={kickingHorseOnThisCell.isKicking}
                />
              )}

              {/* Standing Horse on Track */}
              {horse && !kickingHorseOnThisCell && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  isSelected={isSelectedHorse}
                  onClick={() => handleHorseSelect(horse.id)}
                  onMouseEnter={() => isLegalHorse && setHoveredHorseId(horse.id)}
                  onMouseLeave={() => setHoveredHorseId((prev) => (prev === horse.id ? null : prev))}
                />
              )}
            </div>
          );
        })}

        {/* ================= 3. HOME STRETCH STAIRS (1..6) ================= */}

        {/* Nam Home Stairs (1..6) */}
        {Object.entries(NAM_HOME_CELLS).map(([stepStr, coord]) => {
          const step = Number(stepStr);
          const horse = homeHorses.nam[step];

          const previewStep = previewHomeMap.get(`nam:${step}`);
          const isPreviewPath = previewStep !== undefined && !previewStep.isDestination;
          const isPreviewDest = previewStep !== undefined && previewStep.isDestination;

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          const isSelectedHorse = horse && activeHorseId === horse.id;

          return (
            <div
              key={`nam-home-${step}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={
                isPreviewDest && activeHorseId !== null
                  ? () => handleCellClick(activeHorseId)
                  : undefined
              }
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isPreviewDest
                  ? "cursor-pointer ring-3 ring-amber-400 bg-gradient-to-br from-amber-100 via-pink-100 to-amber-200 shadow-md animate-pulse z-30 border-amber-500"
                  : isPreviewPath
                  ? "border-amber-400 bg-amber-100/60 shadow-inner ring-2 ring-amber-300/80 z-20"
                  : "border-pink-300/80 bg-gradient-to-br from-pink-100/90 to-rose-100/90 shadow-2xs"
              }`}
            >
              {!horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[10px] sm:text-xs font-bold text-pink-500">
                  {step}
                </span>
              )}

              {isPreviewPath && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-amber-950 font-black text-[9px] sm:text-[10px] shadow-xs ring-1 ring-amber-200 animate-pulse">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {isPreviewDest && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <div className="relative flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6">
                    <span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" />
                    <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-600 bg-amber-400 flex items-center justify-center shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    </span>
                  </div>
                </div>
              )}

              {horse && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  isSelected={isSelectedHorse}
                  onClick={() => handleHorseSelect(horse.id)}
                  onMouseEnter={() => isLegalHorse && setHoveredHorseId(horse.id)}
                  onMouseLeave={() => setHoveredHorseId((prev) => (prev === horse.id ? null : prev))}
                />
              )}
            </div>
          );
        })}

        {/* Linh Home Stairs (1..6) */}
        {Object.entries(LINH_HOME_CELLS).map(([stepStr, coord]) => {
          const step = Number(stepStr);
          const horse = homeHorses.linh[step];

          const previewStep = previewHomeMap.get(`linh:${step}`);
          const isPreviewPath = previewStep !== undefined && !previewStep.isDestination;
          const isPreviewDest = previewStep !== undefined && previewStep.isDestination;

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          const isSelectedHorse = horse && activeHorseId === horse.id;

          return (
            <div
              key={`linh-home-${step}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={
                isPreviewDest && activeHorseId !== null
                  ? () => handleCellClick(activeHorseId)
                  : undefined
              }
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isPreviewDest
                  ? "cursor-pointer ring-3 ring-amber-400 bg-gradient-to-br from-amber-100 via-sky-100 to-amber-200 shadow-md animate-pulse z-30 border-amber-500"
                  : isPreviewPath
                  ? "border-amber-400 bg-amber-100/60 shadow-inner ring-2 ring-amber-300/80 z-20"
                  : "border-sky-300/80 bg-gradient-to-br from-sky-100/90 to-blue-100/90 shadow-2xs"
              }`}
            >
              {!horse && !isPreviewPath && !isPreviewDest && (
                <span className="text-[10px] sm:text-xs font-bold text-sky-500">
                  {step}
                </span>
              )}

              {isPreviewPath && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-400 text-amber-950 font-black text-[9px] sm:text-[10px] shadow-xs ring-1 ring-amber-200 animate-pulse">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {isPreviewDest && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <div className="relative flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6">
                    <span className="absolute inset-0 rounded-full bg-amber-400/50 animate-ping" />
                    <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-600 bg-amber-400 flex items-center justify-center shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    </span>
                  </div>
                </div>
              )}

              {horse && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  isSelected={isSelectedHorse}
                  onClick={() => handleHorseSelect(horse.id)}
                  onMouseEnter={() => isLegalHorse && setHoveredHorseId(horse.id)}
                  onMouseLeave={() => setHoveredHorseId((prev) => (prev === horse.id ? null : prev))}
                />
              )}
            </div>
          );
        })}

        {/* ================= 4. CENTER GOAL (5, 5) ================= */}
        <div
          style={{
            gridRow: CENTER_GOAL_CELL.r + 1,
            gridColumn: CENTER_GOAL_CELL.c + 1,
          }}
          className={`relative flex items-center justify-center rounded-xl sm:rounded-2xl border-2 border-amber-300 bg-gradient-to-tr from-amber-100 via-yellow-100 to-rose-100 shadow-md ${
            state.status === "over" ? "animate-pulse ring-4 ring-amber-400" : ""
          }`}
        >
          <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center">
            <TrophyAvatar />
          </div>
        </div>

        {/* ================= 5. DECORATIVE INTERIOR CELLS ================= */}
        {DECORATIVE_CELLS.map((coord, idx) => (
          <div
            key={`deco-${idx}`}
            style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
            className="flex items-center justify-center rounded-lg bg-pink-100/20 text-[9px] text-pink-300/40 select-none"
          >
            ♥
          </div>
        ))}

        {/* ================= 6. HOPPING HORSE OVERLAY ================= */}
        {hoppingHorse && (
          <div
            style={{
              gridRow: hoppingHorse.coord.r + 1,
              gridColumn: hoppingHorse.coord.c + 1,
            }}
            className="relative flex items-center justify-center z-50 pointer-events-none"
          >
            {/* Soft Shadow underneath hopping horse */}
            <div className="absolute -bottom-0.5 w-4 h-1.5 rounded-full bg-black/20 blur-[1px] animate-pulse" />
            <HorseToken
              horse={hoppingHorse.horse}
              isHopping={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
