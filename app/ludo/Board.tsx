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

export interface ActiveHopAnimation {
  actionN: number;
  horseId: number;
  owner: Player;
  kind: LegalMove["kind"];
  path: RouteStep[];
  stepIndex: number;
  kicks: { owner: Player; horseId: number } | null;
}

export interface KickFxState {
  owner: Player;
  horseId: number;
  coord: CellCoord;
  gIdx: number;
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
        <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center animate-ludo-kick-spin">
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
      className={`relative flex items-center justify-center w-full h-full p-0.5 rounded-full transition-transform duration-150 ${
        isHopping
          ? "animate-ludo-hop scale-120 z-50 drop-shadow-md ring-2 ring-amber-400 bg-amber-50"
          : isSelected
          ? "cursor-pointer scale-115 z-30 ring-3 ring-amber-400 ring-offset-1 bg-amber-100 shadow-md"
          : isLegal
          ? "cursor-pointer scale-110 z-20 ring-2 ring-amber-400 ring-offset-1 bg-amber-50/90 shadow-sm active:scale-95"
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
  const [kickFx, setKickFx] = useState<KickFxState | null>(null);

  const lastAnimatedN = useRef<number>(state.lastAction?.n ?? -1);
  const activeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stateRef = useRef<LudoState>(state);
  stateRef.current = state;

  const clearAnimationTimers = () => {
    activeTimersRef.current.forEach((t) => clearTimeout(t));
    activeTimersRef.current = [];
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearAnimationTimers();
    };
  }, []);

  // Reset animation tracker if state.lastAction is null (new game)
  useEffect(() => {
    if (!state.lastAction) {
      lastAnimatedN.current = -1;
      clearAnimationTimers();
      setAnimating(null);
      setKickFx(null);
    }
  }, [state.lastAction]);

  // Clear preview selection when turn or phase changes
  useEffect(() => {
    if (state.phase !== "move") {
      setHoveredHorseId(null);
      setSelectedHorseId(null);
    }
  }, [state.phase, state.turn]);

  // Paced Hop Step & Guaranteed Kick FX Animation Driver
  const actionN = state.lastAction?.n ?? -1;

  useEffect(() => {
    if (!state.lastAction) return;
    const action = state.lastAction;
    if (action.n <= lastAnimatedN.current) return;
    lastAnimatedN.current = action.n;

    if (!action.move) return;
    const move = action.move;
    const path = computeMovePath(move, action.by);
    if (path.length === 0) return;

    // Clear previous timers before starting fresh sequence
    clearAnimationTimers();

    const STEP_MS = 360;
    const KICK_MS = 700;
    const SETTLE_MS = 250;

    // Start with step 0
    setAnimating({
      actionN: action.n,
      horseId: move.horseId,
      owner: action.by,
      kind: move.kind,
      path,
      stepIndex: 0,
      kicks: move.kicks,
    });

    if (move.kind === "deploy") {
      playDeploy();
    } else {
      playHop();
    }
    triggerHaptic(14);

    // Single-step move (e.g. Deploy)
    if (path.length === 1) {
      const destStep = path[0];
      if (move.kicks) {
        const gIdx = destStep.globalTrackIndex ?? 0;
        setKickFx({
          owner: move.kicks.owner,
          horseId: move.kicks.horseId,
          coord: destStep.coord,
          gIdx,
        });
        playKick();
        triggerHaptic([35, 50, 70]);

        const tKick = setTimeout(() => {
          setKickFx(null);
          setAnimating(null);
        }, KICK_MS);
        activeTimersRef.current.push(tKick);
      } else {
        const tSettle = setTimeout(() => {
          setAnimating(null);
        }, SETTLE_MS);
        activeTimersRef.current.push(tSettle);
      }
      return;
    }

    // Multi-step hopping (path.length > 1)
    // Intermediate steps: 1 .. path.length - 2
    for (let i = 1; i < path.length - 1; i++) {
      const tStep = setTimeout(() => {
        setAnimating((prev) => (prev ? { ...prev, stepIndex: i } : null));
        playHop();
        triggerHaptic(14);
      }, i * STEP_MS);
      activeTimersRef.current.push(tStep);
    }

    // Destination step: path.length - 1
    const destIdx = path.length - 1;
    const destStep = path[destIdx];
    const destTime = destIdx * STEP_MS;

    const tDest = setTimeout(() => {
      setAnimating((prev) => (prev ? { ...prev, stepIndex: destIdx } : null));

      if (move.kicks) {
        const gIdx = destStep.globalTrackIndex ?? 0;
        setKickFx({
          owner: move.kicks.owner,
          horseId: move.kicks.horseId,
          coord: destStep.coord,
          gIdx,
        });
        playKick();
        triggerHaptic([35, 50, 70]);

        const tKickEnd = setTimeout(() => {
          setKickFx(null);
          setAnimating(null);
        }, KICK_MS);
        activeTimersRef.current.push(tKickEnd);
      } else {
        if (move.kind === "enter_home" || move.kind === "climb_home") {
          playHomeStep(move.toPos);
        } else {
          playHop();
        }
        triggerHaptic(14);

        if (stateRef.current.status === "over") {
          playWin();
        }

        const tEnd = setTimeout(() => {
          setAnimating(null);
        }, SETTLE_MS);
        activeTimersRef.current.push(tEnd);
      }
    }, destTime);
    activeTimersRef.current.push(tDest);

  }, [actionN]);

  const canControl = isHotseat || state.turn === me;
  const isMovePhase =
    state.status === "playing" &&
    state.phase === "move" &&
    canControl &&
    animating === null &&
    kickFx === null;
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

  // Click handlers
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
  let victimSittingGIdx: number | null = null;
  let victimHorse: Horse | null = null;

  if (animating) {
    // 1. Moving Horse: remove from static board, place at current step
    const mover = state.horses[animating.owner].find((h) => h.id === animating.horseId);
    if (mover) {
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

    // 2. Kicked Horse during hopping (before kickFx fires):
    // Still sits at the landing cell waiting to be kicked!
    if (animating.kicks && kickFx === null) {
      const destStep = animating.path[animating.path.length - 1];
      if (destStep && destStep.globalTrackIndex !== undefined) {
        victimSittingGIdx = destStep.globalTrackIndex;
        const kickedOwner = animating.kicks.owner;
        const kickedId = animating.kicks.horseId;
        const kHorse = state.horses[kickedOwner].find((h) => h.id === kickedId);
        if (kHorse) {
          victimHorse = { ...kHorse, zone: "track", pos: destStep.pos };
          // Remove from stable lookup while animation runs
          if (kickedOwner === "nam") {
            namStable = namStable.filter((h) => h.id !== kickedId);
          } else {
            linhStable = linhStable.filter((h) => h.id !== kickedId);
          }
        }
      }
    }
  }

  // 3. Kicked Horse during kickFx impact:
  if (kickFx) {
    // Ensure kicked horse is NOT rendered in stable during the 700ms kick spin
    if (kickFx.owner === "nam") {
      namStable = namStable.filter((h) => h.id !== kickFx.horseId);
    } else {
      linhStable = linhStable.filter((h) => h.id !== kickFx.horseId);
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

        {/* Top-Left Yard: Linh Status & Score */}
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

        {/* Top-Right Yard: Linh Stable */}
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

        {/* Bottom-Left Yard: Nam Stable */}
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

        {/* Bottom-Right Yard: Nam Status & Score */}
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

          // Kick collision FX on this cell
          const isKickCell = kickFx !== null && kickFx.gIdx === idx;

          // Victim sitting on cell waiting to be kicked
          const isVictimSitting = victimSittingGIdx === idx && victimHorse !== null;

          const horse: Horse | undefined = isVictimSitting && victimHorse ? victimHorse : trackHorses[idx];

          const isLegalHorse = Boolean(
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id)
          );

          const isSelectedHorse = Boolean(horse && activeHorseId === horse.id);

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
                isKickCell
                  ? "animate-ludo-shake ring-4 ring-rose-500 bg-rose-200 z-40"
                  : isPreviewDest
                  ? isKickTarget
                    ? "cursor-pointer ring-3 ring-rose-400 bg-rose-50/90 shadow-md z-30 border-rose-400"
                    : "cursor-pointer ring-2 ring-amber-400 bg-amber-50/90 shadow-sm z-30 border-amber-400"
                  : isPreviewPath
                  ? "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200 z-20"
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
              {isSafe && !horse && !isPreviewPath && !isPreviewDest && !isKickCell && (
                <span className="text-[10px] sm:text-xs select-none">⭐</span>
              )}
              {isNamStart && !horse && !isPreviewPath && !isPreviewDest && !isKickCell && (
                <span className="text-[9px] sm:text-[10px] font-black text-pink-500">
                  ↑
                </span>
              )}
              {isLinhStart && !horse && !isPreviewPath && !isPreviewDest && !isKickCell && (
                <span className="text-[9px] sm:text-[10px] font-black text-sky-500">
                  ↓
                </span>
              )}
              {isNamDoor && !horse && !isPreviewPath && !isPreviewDest && !isKickCell && (
                <span className="text-[9px] font-bold text-pink-400">▲</span>
              )}
              {isLinhDoor && !horse && !isPreviewPath && !isPreviewDest && !isKickCell && (
                <span className="text-[9px] font-bold text-sky-400">▼</span>
              )}

              {/* Path Preview Step Number Badge (Subtle, clean, zero lag) */}
              {isPreviewPath && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-300/90 text-amber-950 font-bold text-[9px] sm:text-[10px] shadow-2xs">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {/* Destination Target Preview (Lightweight, clean) */}
              {isPreviewDest && !isKickCell && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  {isKickTarget ? (
                    <span className="text-base sm:text-xl drop-shadow-sm select-none">
                      💥
                    </span>
                  ) : (
                    <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-500 bg-amber-300 flex items-center justify-center shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    </span>
                  )}
                </div>
              )}

              {/* Kick Impact Flash Overlay (💥 and golden flash) */}
              {isKickCell && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
                  <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-amber-300/80 animate-ludo-impact-flash" />
                  <span className="text-2xl sm:text-3xl select-none z-50">
                    💥
                  </span>
                </div>
              )}

              {/* Kicked Horse (Spins 720° and vanishes) */}
              {isKickCell && (
                <HorseToken
                  horse={{
                    id: kickFx.horseId,
                    owner: kickFx.owner,
                    zone: "track",
                    pos: -1,
                  }}
                  isKicking={true}
                />
              )}

              {/* Standing Horse on Track (or victim waiting to be kicked) */}
              {horse && !isKickCell && (
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
          const horse: Horse | undefined = homeHorses.nam[step];

          const previewStep = previewHomeMap.get(`nam:${step}`);
          const isPreviewPath = previewStep !== undefined && !previewStep.isDestination;
          const isPreviewDest = previewStep !== undefined && previewStep.isDestination;

          const isLegalHorse = Boolean(
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id)
          );

          const isSelectedHorse = Boolean(horse && activeHorseId === horse.id);

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
                  ? "cursor-pointer ring-2 ring-amber-400 bg-amber-50/90 shadow-sm z-30 border-amber-400"
                  : isPreviewPath
                  ? "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200 z-20"
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
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-300/90 text-amber-950 font-bold text-[9px] sm:text-[10px] shadow-2xs">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {isPreviewDest && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-500 bg-amber-300 flex items-center justify-center shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </span>
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
          const horse: Horse | undefined = homeHorses.linh[step];

          const previewStep = previewHomeMap.get(`linh:${step}`);
          const isPreviewPath = previewStep !== undefined && !previewStep.isDestination;
          const isPreviewDest = previewStep !== undefined && previewStep.isDestination;

          const isLegalHorse = Boolean(
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id)
          );

          const isSelectedHorse = Boolean(horse && activeHorseId === horse.id);

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
                  ? "cursor-pointer ring-2 ring-amber-400 bg-amber-50/90 shadow-sm z-30 border-amber-400"
                  : isPreviewPath
                  ? "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200 z-20"
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
                  <span className="flex items-center justify-center w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-300/90 text-amber-950 font-bold text-[9px] sm:text-[10px] shadow-2xs">
                    {previewStep?.stepNumber}
                  </span>
                </div>
              )}

              {isPreviewDest && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                  <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-amber-500 bg-amber-300 flex items-center justify-center shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  </span>
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
            key={`hop-${animating?.actionN}-${animating?.stepIndex}`}
            style={{
              gridRow: hoppingHorse.coord.r + 1,
              gridColumn: hoppingHorse.coord.c + 1,
            }}
            className="relative flex items-center justify-center z-50 pointer-events-none"
          >
            {/* Soft Shadow underneath hopping horse */}
            <div className="absolute -bottom-0.5 w-4 h-1.5 rounded-full bg-black/20 blur-[1px]" />
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
