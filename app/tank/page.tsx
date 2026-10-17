"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onSnapshot, runTransaction } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe } from "@/lib/useMe";
import { gameRef } from "@/lib/tank/gameDoc";
import Field, { type ShotPlayback } from "./Field";
import Controls from "./Controls";
import {
  MAX_FUEL,
  MAX_HP,
  drive,
  fire,
  newGame,
  nextGame,
  other,
  resign,
  type Aim,
  type Player,
  type StateResult,
  type TankState,
} from "@/lib/tank/engine";

const FIRST_EVER_STARTER: Player = "linh"; // ladies first 💕

class GameRuleError extends Error {}

const NAME: Record<Player, string> = { nam: "🐻 Nam", linh: "🧸 Linh" };

function defaultAimFor(state: TankState, who: Player): Aim {
  const t = state.tanks[who];
  return {
    toX: t.x,
    facing: t.facing,
    angle: t.lastAngle,
    power: t.lastPower > 0 ? t.lastPower : 60,
    kind: "s1",
  };
}

function windLabel(wind: number): string {
  if (wind === 0) return "🌬️ 0";
  return wind > 0 ? `🌬️ → ${wind}` : `🌬️ ← ${Math.abs(wind)}`;
}

function endText(game: TankState): string {
  switch (game.endReason) {
    case "hp":
      return "Hết máu 💔";
    case "fell":
      return "Rơi xuống vực 🕳️";
    case "both":
      return "Cả hai cùng gục 🤝";
    case "resign":
      return game.winner ? `${NAME[other(game.winner)]} đầu hàng 🏳️` : "";
    default:
      return "";
  }
}

export default function TankPage() {
  const me = useMe();
  const [game, setGame] = useState<TankState | null>(null);
  const [hotseat] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("hotseat") === "1"
  );

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(gameRef, (snap) => {
        if (snap.exists()) {
          setGame(snap.data() as TankState);
        } else {
          runTransaction(db, async (tx) => {
            if (!(await tx.get(gameRef)).exists()) {
              tx.set(gameRef, newGame(FIRST_EVER_STARTER));
            }
          }).catch((err) => console.error("Could not create tank game:", err));
        }
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  if (me === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 text-center">
        <h1 className="text-2xl font-bold text-zinc-800">Bắn tăng 💥</h1>
        <Link href="/lock?next=/tank" className="py-12 text-rose-500 underline">
          Chưa biết máy của ai 🤔 Mở khoá lại nhé
        </Link>
      </main>
    );
  }

  if (!game || me === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 text-center">
        <h1 className="text-2xl font-bold text-zinc-800">Bắn tăng 💥</h1>
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      </main>
    );
  }

  return (
    <TankGame
      key={game.gameId}
      game={game}
      me={hotseat ? game.turn : me}
      hotseat={hotseat}
    />
  );
}

function TankGame({
  game,
  me,
  hotseat = false,
}: {
  game: TankState;
  me: Player;
  hotseat?: boolean;
}) {
  const [aim, setAim] = useState<Aim>(() => defaultAimFor(game, me));
  const [fuelLeft, setFuelLeft] = useState<number>(MAX_FUEL);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<ShotPlayback[]>([]);
  const [finishedShotN, setFinishedShotN] = useState<number>(
    () => game.lastShot?.n ?? 0
  );

  const prevStateRef = useRef<TankState>(game);
  const seenShotNRef = useRef<number>(game.lastShot?.n ?? 0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }, []);

  useEffect(() => {
    const shot = game.lastShot;
    const prev = prevStateRef.current;
    if (shot && shot.n > seenShotNRef.current) {
      seenShotNRef.current = shot.n;
      const skipDrive = hotseat || shot.by === me;
      setQueue((q) => [
        ...q,
        {
          shot,
          preGround: prev.ground,
          preTanks: prev.tanks,
          postGround: game.ground,
          postTanks: game.tanks,
          skipDrive,
        },
      ]);
      setAim(defaultAimFor(game, me));
      setFuelLeft(MAX_FUEL);
    }
    prevStateRef.current = game;
  }, [game, hotseat, me]);

  const activePlayback = queue[0] ?? null;

  const displayTanks = activePlayback ? activePlayback.preTanks : game.tanks;
  const displayGround = activePlayback ? activePlayback.preGround : game.ground;
  const displayWind = activePlayback ? activePlayback.shot.wind : game.wind;

  const showOver = game.status === "over" && !activePlayback;
  const playing = game.status === "playing" && !activePlayback;
  const myTurn = playing && game.turn === me;
  const playable = myTurn && !busy;

  const myTank = displayTanks[me];
  const actualX = drive(displayGround, myTank.x, aim.toX, MAX_FUEL);

  const handleSpendFuel = useCallback((spent: number) => {
    setFuelLeft((prev) => Math.max(0, prev - spent));
  }, []);

  const run = useCallback(
    async (move: (state: TankState) => StateResult) => {
      if (busy) return;
      setBusy(true);
      try {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(gameRef);
          if (!snap.exists()) {
            throw new GameRuleError(
              "Ván này không còn nữa, tải lại trang nhé 🔄"
            );
          }
          const result = move(snap.data() as TankState);
          if (!result.ok) throw new GameRuleError(result.reason);
          tx.set(gameRef, result.state);
        });
      } catch (err) {
        if (err instanceof GameRuleError) say(err.message);
        else {
          console.error("Tank action failed:", err);
          say("Có lỗi gì đó, thử lại nhé 🥺");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, say]
  );

  const handleFire = useCallback(
    (power: number) => {
      if (!playable) return;
      const shotAim: Aim = { ...aim, power };
      run((s) => fire(s, me, shotAim, Math.random));
    },
    [aim, me, playable, run]
  );

  const handlePlaybackDone = useCallback((shotN: number) => {
    setFinishedShotN(shotN);
    setQueue((q) => q.filter((item) => item.shot.n !== shotN));
  }, []);

  const handleDragAim = useCallback((angle: number, facing: 1 | -1) => {
    setAim((prev) => ({ ...prev, angle, facing }));
  }, []);

  const giveUp = () => {
    if (!window.confirm("Đầu hàng ván này hả? 🏳️")) return;
    run((s) => resign(s, me));
  };

  const startNewGame = () =>
    run((s) =>
      s.status === "over" && s.gameId === game.gameId
        ? { ok: true, state: nextGame(s) }
        : { ok: false, reason: "Ván mới bắt đầu rồi nè 🎉" }
    );

  const nextStarter = other(game.startedBy);

  return (
    <main className="mx-auto flex h-[100svh] w-full max-w-5xl flex-col items-center justify-center p-1.5 sm:p-4">
      {/* Unified Mobile-Game Window: Canvas + Floating Top/Bottom/Center HUDs */}
      <div className="relative flex h-full max-h-[680px] w-full flex-col justify-between overflow-hidden rounded-3xl border-2 border-pink-300/70 bg-slate-950 shadow-2xl">
        {/* Background Battlefield Canvas */}
        <div className="absolute inset-0">
          <Field
            state={game}
            aim={aim}
            actualX={actualX}
            myTurn={myTurn}
            playable={playable}
            activePlayback={activePlayback}
            finishedShotN={finishedShotN}
            onPlaybackDone={handlePlaybackDone}
            onDragAim={handleDragAim}
          />
        </div>

        {/* TOP HUD OVERLAY (inside the game window) */}
        <div className="pointer-events-none relative z-10 flex flex-col gap-1.5 p-2.5 pl-12 sm:p-3.5 sm:pl-14">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/20 bg-zinc-950/55 px-3 py-1.5 text-white shadow-lg backdrop-blur-md">
            {/* Nam HP */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-bold sm:text-xs">
                <span className="truncate">🐻 Nam</span>
                <span data-testid="hp-nam" className="text-rose-300">
                  {displayTanks.nam.hp}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/50 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-400 transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, (displayTanks.nam.hp / MAX_HP) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Center: Wind + Turn Badge + Resign icon */}
            <div className="pointer-events-auto flex flex-col items-center gap-0.5 px-1">
              <div className="flex items-center gap-1.5">
                <span
                  data-testid="wind"
                  className="rounded-full border border-sky-300/40 bg-sky-500/25 px-2.5 py-0.5 text-[11px] font-extrabold text-sky-200 sm:text-xs"
                >
                  {windLabel(displayWind)}
                </span>

                {!showOver && (game.lastShot?.n ?? 0) > 0 && (
                  <button
                    type="button"
                    data-testid="resign-btn"
                    title="Đầu hàng"
                    disabled={busy || !!activePlayback}
                    onClick={giveUp}
                    className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-white/25 disabled:opacity-40"
                  >
                    🏳️
                  </button>
                )}
              </div>

              <p
                className="text-center text-[11px] font-semibold text-white/95 sm:text-xs"
                role="status"
              >
                {!showOver ? (
                  myTurn ? (
                    <b className="inline-block animate-pulse text-amber-300">
                      {hotseat ? `Lượt của ${NAME[me]}!` : "Lượt của em!"}
                    </b>
                  ) : (
                    <span className="text-zinc-200">
                      Đợi <b>{NAME[game.turn]}</b> bắn…
                    </span>
                  )
                ) : game.winner ? (
                  <b className="text-amber-300">
                    {game.winner === me
                      ? "Em thắng rồi! 🎉🎊"
                      : `${NAME[game.winner]} thắng! 🎉`}
                  </b>
                ) : (
                  <b className="text-amber-200">Hòa 🤝</b>
                )}
              </p>
            </div>

            {/* Linh HP */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-bold sm:text-xs">
                <span data-testid="hp-linh" className="text-sky-300">
                  {displayTanks.linh.hp}
                </span>
                <span className="truncate">Linh 🧸</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/50 p-0.5">
                <div
                  className="ml-auto h-full rounded-full bg-gradient-to-l from-sky-500 to-cyan-300 transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, (displayTanks.linh.hp / MAX_HP) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Floating Toast Notification */}
          {toast && (
            <div className="mx-auto rounded-full border border-pink-300/50 bg-zinc-950/80 px-4 py-1 text-xs font-bold text-pink-300 shadow-lg backdrop-blur">
              {toast}
            </div>
          )}
        </div>

        {/* CENTER GAME-OVER OVERLAY MODAL (inside the game window) */}
        {showOver && (
          <div className="pointer-events-auto relative z-20 mx-auto my-auto flex flex-col items-center gap-2.5 rounded-3xl border border-white/25 bg-zinc-950/80 px-7 py-5 text-center text-white shadow-2xl backdrop-blur-md">
            <p className="text-xl font-extrabold text-amber-300 sm:text-2xl">
              {game.winner
                ? game.winner === me
                  ? "Em thắng rồi! 🎉🎊"
                  : `${NAME[game.winner]} thắng! 🎉`
                : "Hòa 🤝"}
            </p>
            <p
              data-testid="end-reason"
              className="text-sm font-medium text-zinc-200"
            >
              {endText(game)}
            </p>
            <button
              type="button"
              data-testid="new-game-btn"
              disabled={busy}
              onClick={startNewGame}
              className="mt-1 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2 text-sm font-bold text-white shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              Ván mới · {NAME[nextStarter]} đi trước
            </button>
          </div>
        )}

        {/* BOTTOM HUD OVERLAY (Controls inside the game window) */}
        <div className="pointer-events-none relative z-10 p-2 sm:p-3">
          <Controls
            ground={displayGround}
            myTank={myTank}
            aim={aim}
            fuelLeft={fuelLeft}
            playable={playable}
            onChangeAim={setAim}
            onSpendFuel={handleSpendFuel}
            onFire={handleFire}
          />
        </div>
      </div>
    </main>
  );
}
