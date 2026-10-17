"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_FUEL,
  SS_CHARGE,
  drive,
  type Aim,
  type ShotKind,
  type Tank,
} from "@/lib/tank/engine";

type Props = {
  ground: readonly number[];
  myTank: Tank;
  aim: Aim;
  fuelLeft: number;
  playable: boolean;
  onChangeAim: (updater: (prev: Aim) => Aim) => void;
  onSpendFuel: (spent: number) => void;
  onFire: (power: number) => void;
};

const SHORT_SHOT: Record<ShotKind, { tag: string; name: string }> = {
  s1: { tag: "1", name: "Thường" },
  s2: { tag: "2", name: "Khoan" },
  ss: { tag: "3", name: "SS" },
};

export default function Controls({
  ground,
  myTank,
  aim,
  fuelLeft,
  playable,
  onChangeAim,
  onSpendFuel,
  onFire,
}: Props) {
  const [charging, setCharging] = useState(false);
  const chargeStartRef = useRef<number | null>(null);
  const chargeRafRef = useRef<number>(0);
  const currentPowerRef = useRef<number>(aim.power);
  const manualPowerRef = useRef<boolean>(false);
  const fuelLeftRef = useRef<number>(fuelLeft);

  useEffect(() => {
    currentPowerRef.current = aim.power;
  }, [aim.power]);

  useEffect(() => {
    fuelLeftRef.current = fuelLeft;
  }, [fuelLeft]);

  const ssReady = myTank.shotsSinceSS >= SS_CHARGE;

  const stepDrive = useCallback(
    (dir: 1 | -1, step = 6) => {
      if (!playable) return;
      const avail = fuelLeftRef.current;
      if (avail <= 0) {
        onChangeAim((prev) => ({ ...prev, facing: dir }));
        return;
      }
      const allowStep = Math.min(step, avail);
      onChangeAim((prev) => {
        const curX = prev.toX;
        const nextX = drive(ground, curX, curX + dir * allowStep, allowStep);
        const spent = Math.abs(nextX - curX);
        if (spent > 0) {
          fuelLeftRef.current = Math.max(0, fuelLeftRef.current - spent);
          onSpendFuel(spent);
        }
        return {
          ...prev,
          facing: dir,
          toX: nextX,
        };
      });
    },
    [ground, onChangeAim, onSpendFuel, playable]
  );

  const stepAngle = useCallback(
    (delta: number) => {
      if (!playable) return;
      onChangeAim((prev) => ({
        ...prev,
        angle: Math.max(0, Math.min(90, prev.angle + delta)),
      }));
    },
    [onChangeAim, playable]
  );

  const selectKind = useCallback(
    (kind: ShotKind) => {
      if (!playable) return;
      if (kind === "ss" && !ssReady) return;
      onChangeAim((prev) => ({ ...prev, kind }));
    },
    [onChangeAim, playable, ssReady]
  );

  const startCharge = useCallback(() => {
    if (!playable || chargeStartRef.current !== null) return;
    const t0 = performance.now();
    chargeStartRef.current = t0;
    setCharging(true);

    const tick = (now: number) => {
      if (chargeStartRef.current === null) return;
      const elapsedSec = (now - chargeStartRef.current) / 1000;
      const cycle = elapsedSec % 4;
      const rawPower = cycle <= 2 ? cycle * 50 : (4 - cycle) * 50;
      const p = Math.max(1, Math.min(100, Math.round(rawPower)));
      currentPowerRef.current = p;
      onChangeAim((prev) => ({ ...prev, power: p }));
      chargeRafRef.current = requestAnimationFrame(tick);
    };
    chargeRafRef.current = requestAnimationFrame(tick);
  }, [onChangeAim, playable]);

  const finishChargeAndFire = useCallback(() => {
    if (chargeStartRef.current === null) return;
    const heldMs = performance.now() - chargeStartRef.current;
    chargeStartRef.current = null;
    cancelAnimationFrame(chargeRafRef.current);
    setCharging(false);

    if (!playable) return;
    let finalPower = currentPowerRef.current;
    if (heldMs < 90 && manualPowerRef.current && aim.power > 0) {
      finalPower = aim.power;
    } else {
      const cycle = (heldMs / 1000) % 4;
      const rawPower = cycle <= 2 ? cycle * 50 : (4 - cycle) * 50;
      finalPower = Math.max(5, Math.min(100, Math.round(rawPower)));
    }
    manualPowerRef.current = false;
    onFire(finalPower);
  }, [aim.power, onFire, playable]);

  useEffect(() => {
    return () => cancelAnimationFrame(chargeRafRef.current);
  }, []);

  // Keyboard controls (GunBound style)
  useEffect(() => {
    if (!playable) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepDrive(-1, 6);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepDrive(1, 6);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        stepAngle(e.shiftKey ? 5 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        stepAngle(e.shiftKey ? -5 : -1);
      } else if (e.key === "1") {
        e.preventDefault();
        selectKind("s1");
      } else if (e.key === "2") {
        e.preventDefault();
        selectKind("s2");
      } else if (e.key === "3") {
        e.preventDefault();
        selectKind("ss");
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) startCharge();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        finishChargeAndFire();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [finishChargeAndFire, playable, selectKind, startCharge, stepAngle, stepDrive]);

  const ssDots = Array.from({ length: SS_CHARGE }, (_, i) =>
    i < Math.min(SS_CHARGE, myTank.shotsSinceSS) ? "●" : "○"
  ).join("");

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-1 rounded-2xl border border-white/15 bg-zinc-950/65 px-2.5 py-1.5 text-white shadow-xl backdrop-blur-md sm:gap-1.5 sm:px-3.5 sm:py-2">
      {/* Power bar row (GunBound style gauge) */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] font-bold tracking-wide text-amber-300 sm:text-xs">
          ⚡ {aim.power}
        </span>

        <div
          onClick={(e) => {
            if (!playable || charging) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            // When container is rotated 90deg clockwise on portrait screens, rect.height > rect.width
            const ratio =
              rect.height > rect.width
                ? (e.clientY - rect.top) / rect.height
                : (e.clientX - rect.left) / rect.width;
            const pct = Math.max(1, Math.min(100, Math.round(ratio * 100)));
            manualPowerRef.current = true;
            currentPowerRef.current = pct;
            onChangeAim((prev) => ({ ...prev, power: pct }));
          }}
          className="relative h-3.5 flex-1 cursor-pointer overflow-hidden rounded-full border border-white/25 bg-black/60 shadow-inner sm:h-4"
        >
          {/* Quarter tick marks (25, 50, 75) */}
          <div className="pointer-events-none absolute inset-0 flex justify-evenly">
            <span className="h-full w-px bg-white/15" />
            <span className="h-full w-px bg-white/25" />
            <span className="h-full w-px bg-white/15" />
          </div>

          <div
            className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 transition-[width] duration-75"
            style={{ width: `${aim.power}%` }}
          />

          {myTank.lastPower > 0 && (
            <div
              title={`Lực trước: ${myTank.lastPower}`}
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-yellow-300 shadow-[0_0_6px_#fde047]"
              style={{ left: `${myTank.lastPower}%` }}
            />
          )}
        </div>

        {myTank.lastPower > 0 && (
          <div className="hidden shrink-0 items-center gap-1.5 text-[11px] text-zinc-300 sm:flex">
            <span data-testid="last-angle">Trước: {myTank.lastAngle}°</span>
            <span>·</span>
            <span data-testid="last-power">Lực trước: {myTank.lastPower}</span>
          </div>
        )}
      </div>

      {/* Mobile-only compact last-shot markers (kept in DOM for all viewports) */}
      {myTank.lastPower > 0 && (
        <div className="flex justify-between text-[10px] text-zinc-300 sm:hidden">
          <span>Góc trước: {myTank.lastAngle}°</span>
          <span>Lực trước: {myTank.lastPower}</span>
        </div>
      )}

      {/* Main arcade controls row: Drive + Fuel | Angle | Shots | Big Fire Button */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5">
        {/* Left cluster: Drive D-pad + Fuel + Angle */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Drive buttons + mini fuel bar */}
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 p-1">
            <button
              type="button"
              aria-label="Lái trái"
              disabled={!playable}
              onClick={() => stepDrive(-1, 12)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white active:scale-90 disabled:opacity-35 sm:h-8 sm:w-8"
            >
              ◀
            </button>
            <div className="flex w-11 flex-col items-center px-0.5 sm:w-14">
              <span className="text-[9px] font-semibold text-amber-300 sm:text-[10px]">
                ⛽ {fuelLeft}
              </span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${(fuelLeft / MAX_FUEL) * 100}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              aria-label="Lái phải"
              disabled={!playable}
              onClick={() => stepDrive(1, 12)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-bold text-white active:scale-90 disabled:opacity-35 sm:h-8 sm:w-8"
            >
              ▶
            </button>
          </div>

          {/* Angle controls */}
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/10 p-1">
            <button
              type="button"
              aria-label="Giảm góc"
              disabled={!playable}
              onClick={() => stepAngle(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white active:scale-90 disabled:opacity-35 sm:h-8 sm:w-8"
            >
              −
            </button>
            <div className="flex min-w-11 flex-col items-center px-1 text-center">
              <span className="text-[11px] font-extrabold text-sky-300 sm:text-xs">
                {aim.angle}° {aim.facing === 1 ? "→" : "←"}
              </span>
              <input
                type="range"
                aria-label="Góc bắn"
                min={0}
                max={90}
                value={aim.angle}
                disabled={!playable}
                onChange={(e) => {
                  const nextAngle = Number(e.target.value);
                  onChangeAim((prev) => ({ ...prev, angle: nextAngle }));
                }}
                className="h-1 w-12 accent-sky-400 disabled:opacity-40 sm:w-16"
              />
            </div>
            <button
              type="button"
              aria-label="Tăng góc"
              disabled={!playable}
              onClick={() => stepAngle(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white active:scale-90 disabled:opacity-35 sm:h-8 sm:w-8"
            >
              +
            </button>
          </div>
        </div>

        {/* Center cluster: Shot selector pills */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {(["s1", "s2", "ss"] as const).map((k) => {
            const info = SHORT_SHOT[k];
            const selected = aim.kind === k;
            const disabled = !playable || (k === "ss" && !ssReady);
            return (
              <button
                key={k}
                type="button"
                data-testid={`shot-${k}`}
                disabled={disabled}
                onClick={() => selectKind(k)}
                className={`rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-all sm:px-2.5 sm:text-xs ${
                  selected
                    ? k === "ss"
                      ? "border-yellow-300 bg-gradient-to-b from-yellow-400 to-amber-500 text-zinc-950 shadow-[0_0_12px_rgba(250,204,21,0.5)]"
                      : "border-rose-300 bg-gradient-to-b from-rose-500 to-pink-600 text-white shadow-[0_0_10px_rgba(244,63,94,0.45)]"
                    : "border-white/15 bg-white/10 text-zinc-200 hover:bg-white/20"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span>
                  {info.tag}·{info.name}
                </span>
                {k === "ss" && (
                  <span
                    data-testid="ss-counter"
                    className="ml-1 font-mono text-[10px]"
                  >
                    {ssReady ? "⚡" : ssDots}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right cluster: Arcade Fire button */}
        <button
          type="button"
          data-testid="fire-btn"
          disabled={!playable}
          onPointerDown={(e) => {
            if (!playable) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            startCharge();
          }}
          onPointerUp={() => finishChargeAndFire()}
          onPointerCancel={() => finishChargeAndFire()}
          className={`select-none rounded-2xl border-2 px-4 py-1.5 text-xs font-extrabold tracking-wide text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 sm:px-5 sm:py-2 sm:text-sm ${
            charging
              ? "animate-pulse border-yellow-200 bg-gradient-to-b from-amber-500 to-rose-600 shadow-[0_0_18px_rgba(251,191,36,0.8)]"
              : "border-pink-300/60 bg-gradient-to-b from-rose-500 to-pink-600 shadow-rose-950/50 hover:brightness-110"
          }`}
        >
          {charging ? `THẢ! (${aim.power})` : "BẮN 💥"}
        </button>
      </div>
    </div>
  );
}
