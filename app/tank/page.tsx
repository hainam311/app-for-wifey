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

// One shared artillery game in tank_game/shared. Every action runs inside a
// Firestore transaction against the latest document; the shooter's browser
// simulates the shot and writes the resulting state + trajectory so both
// screens replay the exact same outcome.
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
  if (wind === 0) return "Gió 0 ·";
  return wind > 0 ? `→ ${wind}` : `← ${Math.abs(wind)}`;
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

const Title = () => (
  <h1 className="text-xl font-bold text-zinc-800 sm:text-2xl">Bắn tăng 💥</h1>
);

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
        <Title />
        <Link href="/lock?next=/tank" className="py-12 text-rose-500 underline">
          Chưa biết máy của ai 🤔 Mở khoá lại nhé
        </Link>
      </main>
    );
  }

  if (!game || me === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 text-center">
        <Title />
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      </main>
    );
  }

  // Keyed on gameId (not lastShot.n) so the canvas persists across turns and
  // animations smoothly transition from the previous turn's terrain/HP.
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

  // Enqueue shot animation whenever lastShot.n advances on a snapshot
  useEffect(() => {
    const shot = game.lastShot;
    const prev = prevStateRef.current;
    if (shot && shot.n > seenShotNRef.current) {
      seenShotNRef.current = shot.n;
      // On the shooter's own screen (or in hotseat mode), the tank was already
      // driven locally to shot.fromX before firing, so don't jump back and re-drive.
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

  // Hold pre-impact terrain, HP, and wind while an animation is playing
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

  // Both players may press "Ván mới" at once: only the first transaction wins.
  const startNewGame = () =>
    run((s) =>
      s.status === "over" && s.gameId === game.gameId
        ? { ok: true, state: nextGame(s) }
        : { ok: false, reason: "Ván mới bắt đầu rồi nè 🎉" }
    );

  const nextStarter = other(game.startedBy);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pl-11 sm:pl-0">
        <Title />

        <div className="flex flex-col items-end">
          <p className="text-sm font-medium text-zinc-700" role="status">
            {!showOver ? (
              myTurn ? (
                <b className="inline-block animate-pulse text-rose-500">
                  {hotseat ? `Lượt của ${NAME[me]}!` : "Lượt của em!"}
                </b>
              ) : (
                <>
                  Đợi <b>{NAME[game.turn]}</b> bắn…
                </>
              )
            ) : game.winner ? (
              <b className="inline-block animate-bounce text-base text-rose-500">
                {game.winner === me
                  ? "Em thắng rồi! 🎉🎊"
                  : `${NAME[game.winner]} thắng! 🎉`}
              </b>
            ) : (
              <b className="text-base">Hòa 🤝</b>
            )}
          </p>
          {showOver && (
            <p data-testid="end-reason" className="text-xs font-medium text-zinc-500">
              {endText(game)}
            </p>
          )}
        </div>
      </div>

      {/* Top bar: Nam HP, Wind, Linh HP */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-pink-200 bg-white/90 px-3 py-2 shadow-sm">
        {/* Nam HP */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 sm:text-sm">
            <span>🐻 Nam</span>
            <span data-testid="hp-nam" className="text-rose-600">
              {displayTanks.nam.hp}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-300"
              style={{
                width: `${Math.max(0, Math.min(100, (displayTanks.nam.hp / MAX_HP) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Wind indicator */}
        <div
          data-testid="wind"
          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-center text-xs font-bold text-sky-700 sm:text-sm"
        >
          {windLabel(displayWind)}
        </div>

        {/* Linh HP */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 sm:text-sm">
            <span data-testid="hp-linh" className="text-sky-600">
              {displayTanks.linh.hp}
            </span>
            <span>Linh 🧸</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="ml-auto h-full rounded-full bg-sky-500 transition-all duration-300"
              style={{
                width: `${Math.max(0, Math.min(100, (displayTanks.linh.hp / MAX_HP) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Battlefield Canvas */}
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

      {/* Controls */}
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

      {/* Footer: toast / hints / resign / new game */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 sm:text-sm">
        <span className="min-h-5">
          {toast ? (
            <b className="text-pink-500">{toast}</b>
          ) : !showOver ? (
            "Phím ← → lái · ↑ ↓ chỉnh góc · 1/2/3 chọn đạn · Giữ Space để bắn"
          ) : (
            endText(game)
          )}
        </span>

        {!showOver && (game.lastShot?.n ?? 0) > 0 && (
          <button
            type="button"
            data-testid="resign-btn"
            disabled={busy || !!activePlayback}
            onClick={giveUp}
            className="text-zinc-500 underline hover:text-zinc-700 disabled:opacity-45"
          >
            🏳️ Đầu hàng
          </button>
        )}

        {showOver && (
          <button
            type="button"
            data-testid="new-game-btn"
            disabled={busy}
            onClick={startNewGame}
            className="rounded-full bg-rose-500 px-5 py-1.5 font-semibold text-white shadow hover:bg-rose-600 disabled:opacity-60"
          >
            Ván mới · {NAME[nextStarter]} đi trước
          </button>
        )}
      </div>
    </main>
  );
}
