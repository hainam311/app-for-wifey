"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_FUEL,
  SHOTS,
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
  actualX: number;
  playable: boolean;
  onChangeAim: (updater: (prev: Aim) => Aim) => void;
  onFire: (power: number) => void;
};

export default function Controls({
  ground,
  myTank,
  aim,
  actualX,
  playable,
  onChangeAim,
  onFire,
}: Props) {
  const [charging, setCharging] = useState(false);
  const chargeStartRef = useRef<number | null>(null);
  const chargeRafRef = useRef<number>(0);
  const currentPowerRef = useRef<number>(aim.power);
  const manualPowerRef = useRef<boolean>(false);

  useEffect(() => {
    currentPowerRef.current = aim.power;
  }, [aim.power]);

  const fuelUsed = Math.min(MAX_FUEL, Math.abs(actualX - myTank.x));
  const fuelLeft = Math.max(0, MAX_FUEL - fuelUsed);
  const ssReady = myTank.shotsSinceSS >= SS_CHARGE;

  const stepDrive = useCallback(
    (dir: 1 | -1, step = 6) => {
      if (!playable) return;
      onChangeAim((prev) => {
        const curX = drive(ground, myTank.x, prev.toX, MAX_FUEL);
        const candidateToX = curX + dir * step;
        const clampedToX =
          Math.abs(candidateToX - myTank.x) <= MAX_FUEL
            ? drive(ground, myTank.x, candidateToX, MAX_FUEL)
            : curX;
        return {
          ...prev,
          facing: dir,
          toX: clampedToX,
        };
      });
    },
    [ground, myTank.x, onChangeAim, playable]
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
      // 0 -> 100 in 2.0s, then 100 -> 0 in 2.0s (period 4.0s)
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
    // If the user explicitly set a power on the bar and tapped briefly, honor it;
    // otherwise use the charged power from the hold duration.
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
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-pink-200 bg-white/90 p-3 shadow-sm">
      {/* Row 1: Drive buttons + Fuel bar + Angle controls */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Drive & Fuel */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Lái trái"
            disabled={!playable}
            onClick={() => stepDrive(-1, 12)}
            className="flex h-9 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 active:scale-95 disabled:opacity-40"
          >
            ◀
          </button>
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Nhiên liệu</span>
              <span>
                {fuelLeft}/{MAX_FUEL}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
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
            className="flex h-9 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 active:scale-95 disabled:opacity-40"
          >
            ▶
          </button>
        </div>

        {/* Angle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Giảm góc"
            disabled={!playable}
            onClick={() => stepAngle(-1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 active:scale-95 disabled:opacity-40"
          >
            −
          </button>
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex justify-between text-xs text-zinc-600">
              <span>
                Góc: <b className="text-zinc-900">{aim.angle}°</b>{" "}
                <span className="text-zinc-400">
                  ({aim.facing === 1 ? "→" : "←"})
                </span>
              </span>
              {myTank.lastPower > 0 && (
                <span
                  data-testid="last-angle"
                  className="text-zinc-400"
                >
                  Trước: {myTank.lastAngle}°
                </span>
              )}
            </div>
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
              className="h-2 w-full accent-rose-500 disabled:opacity-40"
            />
          </div>
          <button
            type="button"
            aria-label="Tăng góc"
            disabled={!playable}
            onClick={() => stepAngle(1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-700 active:scale-95 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Row 2: Power bar with last-shot marker */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-zinc-600">
          <span>
            Lực bắn: <b className="text-rose-600">{aim.power}</b>/100
          </span>
          {myTank.lastPower > 0 && (
            <span data-testid="last-power" className="text-zinc-400">
              Lực trước: {myTank.lastPower}
            </span>
          )}
        </div>
        <div
          onClick={(e) => {
            if (!playable || charging) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            const pct = Math.max(
              1,
              Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100))
            );
            manualPowerRef.current = true;
            currentPowerRef.current = pct;
            onChangeAim((prev) => ({ ...prev, power: pct }));
          }}
          className="relative h-5 w-full cursor-pointer overflow-hidden rounded-full border border-pink-200 bg-zinc-100"
        >
          <div
            className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 transition-[width] duration-75"
            style={{ width: `${aim.power}%` }}
          />
          {myTank.lastPower > 0 && (
            <div
              title={`Lực trước: ${myTank.lastPower}`}
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-zinc-900"
              style={{ left: `${myTank.lastPower}%` }}
            />
          )}
        </div>
      </div>

      {/* Row 3: Shot buttons (1 / 2 / SS) + Hold-to-Shoot button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["s1", "s2", "ss"] as const).map((k, idx) => {
            const info = SHOTS[k];
            const selected = aim.kind === k;
            const disabled = !playable || (k === "ss" && !ssReady);
            return (
              <button
                key={k}
                type="button"
                data-testid={`shot-${k}`}
                disabled={disabled}
                onClick={() => selectKind(k)}
                className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  selected
                    ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                    : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <span>
                  {idx + 1}. {info.label}
                </span>
                {k === "ss" && (
                  <span
                    data-testid="ss-counter"
                    className="ml-1.5 font-mono text-[11px]"
                  >
                    {ssReady ? "⚡" : ssDots}
                  </span>
                )}
              </button>
            );
          })}
        </div>

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
          className={` select-none rounded-full px-5 py-2 text-sm font-bold text-white shadow transition-transform active:scale-95 disabled:opacity-45 ${
            charging
              ? "animate-pulse bg-rose-600 ring-4 ring-rose-200"
              : "bg-gradient-to-r from-rose-500 to-pink-500 hover:brightness-105"
          }`}
        >
          {charging ? `Thả để bắn! (${aim.power})` : "Bắn 💥 (Giữ Space)"}
        </button>
      </div>
    </div>
  );
}
