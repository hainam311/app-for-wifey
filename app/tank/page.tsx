"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type TankState,
} from "@/lib/tank/engine";

const FIRST_EVER_STARTER: Player = "linh";
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
  return wind > 0 ? `Gió → ${wind}` : `Gió ← ${Math.abs(wind)}`;
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
  const [game, setGame] = useState<TankState>(() => newGame(FIRST_EVER_STARTER));

  return <TankGame key={game.gameId} game={game} onUpdateGame={setGame} />;
}

function TankGame({
  game,
  onUpdateGame,
}: {
  game: TankState;
  onUpdateGame: (next: TankState) => void;
}) {
  const activePlayer = game.turn;
  const [aim, setAim] = useState<Aim>(() => defaultAimFor(game, activePlayer));
  const [toast, setToast] = useState("");
  const [queue, setQueue] = useState<ShotPlayback[]>([]);
  const [finishedShotN, setFinishedShotN] = useState<number>(
    () => game.lastShot?.n ?? 0
  );

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }, []);

  const activePlayback = queue[0] ?? null;

  // Displayed HP & wind hold pre-impact values while an animation is playing
  const displayTanks = activePlayback ? activePlayback.preTanks : game.tanks;
  const displayGround = activePlayback ? activePlayback.preGround : game.ground;
  const displayWind = activePlayback ? activePlayback.shot.wind : game.wind;
  const playing = game.status === "playing" && !activePlayback;
  const playable = playing;

  const myTank = displayTanks[activePlayer];
  const actualX = drive(displayGround, myTank.x, aim.toX, MAX_FUEL);

  const handleFire = useCallback(
    (power: number) => {
      if (!playable) return;
      const res = fire(game, activePlayer, { ...aim, power });
      if (!res.ok) {
        say(res.reason);
        return;
      }
      const next = res.state;
      if (next.lastShot) {
        setQueue((q) => [
          ...q,
          {
            shot: next.lastShot!,
            preGround: game.ground,
            preTanks: game.tanks,
            postGround: next.ground,
            postTanks: next.tanks,
          },
        ]);
      }
      onUpdateGame(next);
      setAim(defaultAimFor(next, next.turn));
    },
    [activePlayer, aim, game, onUpdateGame, playable, say]
  );

  const handlePlaybackDone = useCallback((shotN: number) => {
    setFinishedShotN(shotN);
    setQueue((q) => q.filter((item) => item.shot.n !== shotN));
  }, []);

  const handleDragAim = useCallback((angle: number, facing: 1 | -1) => {
    setAim((prev) => ({ ...prev, angle, facing }));
  }, []);

  const handleResign = () => {
    if (!window.confirm("Đầu hàng ván này hả? 🏳️")) return;
    const res = resign(game, activePlayer);
    if (!res.ok) return say(res.reason);
    onUpdateGame(res.state);
  };

  const handleNewGame = () => {
    onUpdateGame(nextGame(game));
  };

  const nextStarter = other(game.startedBy);
  const showOver = game.status === "over" && !activePlayback;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2 pl-11 sm:pl-0">
        <h1 className="text-xl font-bold text-zinc-800 sm:text-2xl">
          Bắn tăng 💥
        </h1>

        <p className="text-sm font-medium text-zinc-700" role="status">
          {!showOver ? (
            <b className="inline-block animate-pulse text-rose-500">
              Lượt của {NAME[activePlayer]}!
            </b>
          ) : game.winner ? (
            <b className="inline-block animate-bounce text-base text-rose-500">
              {NAME[game.winner]} thắng! 🎉
            </b>
          ) : (
            <b className="text-base">Hòa 🤝</b>
          )}
        </p>
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
        actualX={actualX}
        playable={playable}
        onChangeAim={setAim}
        onFire={handleFire}
      />

      {/* Footer status / toast / resign / new game */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 sm:text-sm">
        <span className="min-h-5">
          {toast ? (
            <b className="text-pink-500">{toast}</b>
          ) : showOver ? (
            <b className="text-zinc-700">{endText(game)}</b>
          ) : (
            "Phím ← → lái · ↑ ↓ chỉnh góc · 1/2/3 chọn đạn · Giữ Space để bắn"
          )}
        </span>

        {!showOver && (game.lastShot?.n ?? 0) > 0 && (
          <button
            type="button"
            onClick={handleResign}
            className="text-zinc-500 underline hover:text-zinc-700"
          >
            🏳️ Đầu hàng
          </button>
        )}

        {showOver && (
          <button
            type="button"
            onClick={handleNewGame}
            className="rounded-full bg-rose-500 px-5 py-1.5 font-semibold text-white shadow hover:bg-rose-600"
          >
            Ván mới · {NAME[nextStarter]} đi trước
          </button>
        )}
      </div>
    </main>
  );
}
