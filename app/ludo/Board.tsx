"use client";

import { useState } from "react";
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
  onClick,
}: {
  horse: Horse;
  isLegal?: boolean;
  onClick?: () => void;
}) {
  const isNam = horse.owner === "nam";
  return (
    <button
      type="button"
      onClick={isLegal ? onClick : undefined}
      disabled={!isLegal}
      title={`${isNam ? "Anh Nam" : "Em Linh"} - Ngựa #${horse.id + 1}${
        isLegal ? " (Chạm để đi)" : ""
      }`}
      className={`relative flex items-center justify-center w-full h-full p-0.5 rounded-full transition-all duration-150 ${
        isLegal
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
  const canControl = isHotseat || state.turn === me;
  const isMovePhase = state.status === "playing" && state.phase === "move" && canControl;
  const dice = state.dice ?? 0;

  // Compute legal moves
  const legalMoves: LegalMove[] =
    isMovePhase && dice >= 1 && dice <= 6
      ? getLegalMoves(state, state.turn, dice)
      : [];

  const legalHorsesMap = new Map<number, LegalMove>();
  const targetCellsMap = new Map<string, { horseId: number; kicks: boolean }>();

  for (const m of legalMoves) {
    legalHorsesMap.set(m.horseId, m);
    if (m.toZone === "track") {
      const gCell = toGlobalTrackIndex(state.turn, m.toPos);
      targetCellsMap.set(`track:${gCell}`, {
        horseId: m.horseId,
        kicks: m.kicks !== null,
      });
    } else if (m.toZone === "home") {
      targetCellsMap.set(`home:${state.turn}:${m.toPos}`, {
        horseId: m.horseId,
        kicks: false,
      });
    }
  }

  // Map horses on track
  const trackHorses: Record<number, Horse> = {};
  for (const p of ["nam", "linh"] as const) {
    for (const h of state.horses[p]) {
      if (h.zone === "track") {
        const gIdx = toGlobalTrackIndex(p, h.pos);
        trackHorses[gIdx] = h;
      }
    }
  }

  // Map horses inside home stairs
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
  const namStable = state.horses.nam.filter((h) => h.zone === "stable");
  const linhStable = state.horses.linh.filter((h) => h.zone === "stable");

  // Home progress count
  const namInHome = state.horses.nam.filter((h) => h.zone === "home").length;
  const linhInHome = state.horses.linh.filter((h) => h.zone === "home").length;
  const totalHorses = state.horses.nam.length;

  return (
    <div className="w-full max-w-md mx-auto aspect-square select-none p-1.5 sm:p-2 bg-gradient-to-br from-amber-50/60 via-pink-50/40 to-sky-50/60 rounded-3xl border-2 border-pink-200/80 shadow-xl backdrop-blur-sm">
      <div className="grid grid-cols-11 grid-rows-11 gap-1 w-full h-full">
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
              const inStable = h.zone === "stable";
              const isLegal = isMovePhase && state.turn === "linh" && legalHorsesMap.has(h.id);
              return (
                <div
                  key={h.id}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 ${
                    inStable
                      ? isLegal
                        ? "border-amber-400 bg-amber-50"
                        : "border-sky-300 bg-white shadow-2xs"
                      : "border-dashed border-sky-200 bg-sky-50/40"
                  }`}
                >
                  {inStable ? (
                    <HorseToken
                      horse={h}
                      isLegal={isLegal}
                      onClick={() => onMove(h.id)}
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
              const inStable = h.zone === "stable";
              const isLegal = isMovePhase && state.turn === "nam" && legalHorsesMap.has(h.id);
              return (
                <div
                  key={h.id}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 ${
                    inStable
                      ? isLegal
                        ? "border-amber-400 bg-amber-50"
                        : "border-pink-300 bg-white shadow-2xs"
                      : "border-dashed border-pink-200 bg-pink-50/40"
                  }`}
                >
                  {inStable ? (
                    <HorseToken
                      horse={h}
                      isLegal={isLegal}
                      onClick={() => onMove(h.id)}
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

          const target = targetCellsMap.get(`track:${idx}`);
          const isTarget = target !== undefined;
          const isKickTarget = target?.kicks === true;

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          return (
            <div
              key={`perimeter-${idx}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={
                isTarget ? () => onMove(target.horseId) : undefined
              }
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isTarget
                  ? "cursor-pointer ring-2 ring-emerald-500 bg-emerald-100/90 shadow-md animate-pulse z-20"
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
              {/* Cell Badges / Hints */}
              {isSafe && !horse && (
                <span className="text-[10px] sm:text-xs select-none">⭐</span>
              )}
              {isNamStart && !horse && (
                <span className="text-[9px] sm:text-[10px] font-black text-pink-500">
                  ↑
                </span>
              )}
              {isLinhStart && !horse && (
                <span className="text-[9px] sm:text-[10px] font-black text-sky-500">
                  ↓
                </span>
              )}
              {isNamDoor && !horse && (
                <span className="text-[9px] font-bold text-pink-400">▲</span>
              )}
              {isLinhDoor && !horse && (
                <span className="text-[9px] font-bold text-sky-400">▼</span>
              )}

              {/* Target Preview Overlay */}
              {isTarget && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                  {isKickTarget ? (
                    <span className="text-xs sm:text-sm font-black animate-ping text-rose-600">
                      💥
                    </span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  )}
                </div>
              )}

              {/* Horse Token on Track */}
              {horse && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  onClick={() => onMove(horse.id)}
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
          const target = targetCellsMap.get(`home:nam:${step}`);
          const isTarget = target !== undefined;

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          return (
            <div
              key={`nam-home-${step}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={isTarget ? () => onMove(target.horseId) : undefined}
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isTarget
                  ? "cursor-pointer ring-2 ring-emerald-500 bg-emerald-100 shadow-md animate-pulse z-20"
                  : "border-pink-300/80 bg-gradient-to-br from-pink-100/90 to-rose-100/90 shadow-2xs"
              }`}
            >
              {!horse && (
                <span className="text-[10px] sm:text-xs font-bold text-pink-500">
                  {step}
                </span>
              )}
              {isTarget && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
              )}
              {horse && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  onClick={() => onMove(horse.id)}
                />
              )}
            </div>
          );
        })}

        {/* Linh Home Stairs (1..6) */}
        {Object.entries(LINH_HOME_CELLS).map(([stepStr, coord]) => {
          const step = Number(stepStr);
          const horse = homeHorses.linh[step];
          const target = targetCellsMap.get(`home:linh:${step}`);
          const isTarget = target !== undefined;

          const isLegalHorse =
            horse &&
            isMovePhase &&
            horse.owner === state.turn &&
            legalHorsesMap.has(horse.id);

          return (
            <div
              key={`linh-home-${step}`}
              style={{ gridRow: coord.r + 1, gridColumn: coord.c + 1 }}
              onClick={isTarget ? () => onMove(target.horseId) : undefined}
              className={`relative flex items-center justify-center rounded-lg sm:rounded-xl border transition-all ${
                isTarget
                  ? "cursor-pointer ring-2 ring-emerald-500 bg-emerald-100 shadow-md animate-pulse z-20"
                  : "border-sky-300/80 bg-gradient-to-br from-sky-100/90 to-blue-100/90 shadow-2xs"
              }`}
            >
              {!horse && (
                <span className="text-[10px] sm:text-xs font-bold text-sky-500">
                  {step}
                </span>
              )}
              {isTarget && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                </div>
              )}
              {horse && (
                <HorseToken
                  horse={horse}
                  isLegal={isLegalHorse}
                  onClick={() => onMove(horse.id)}
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
      </div>
    </div>
  );
}
