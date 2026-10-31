"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { onSnapshot, runTransaction } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe } from "@/lib/useMe";
import { ludoGameRef } from "@/lib/ludo/gameDoc";
import {
  type GameMode,
  type LudoState,
  applyMove,
  changeMode,
  newGame,
  nextGame,
  resign,
  rollDice,
} from "@/lib/ludo/engine";
import {
  isMuted,
  onMuteChange,
  playDeploy,
  playDiceRoll,
  playHomeStep,
  playHop,
  playKick,
  playWin,
  toggleMute,
} from "@/lib/ludo/audio";
import Board from "./Board";

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function triggerHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(20);
    } catch {
      // Ignore vibration errors
    }
  }
}

function getCommentary(game: LudoState): { text: string; icon: string } {
  if (game.status === "over") {
    const winnerName = game.winner === "nam" ? "Anh Nam 🐻" : "Em Linh 🧸";
    return {
      text: `🏆 Chúc mừng ${winnerName} đã chiến thắng vang dội!`,
      icon: "🎉",
    };
  }

  const action = game.lastAction;
  if (action) {
    const playerName = action.by === "nam" ? "Anh 🐻" : "Em 🧸";
    const otherName = action.by === "nam" ? "Em 🧸" : "Anh 🐻";

    if (action.move) {
      const m = action.move;
      const horseNum = `#${m.horseId + 1}`;
      if (m.kicks) {
        return {
          text: `Á à! ${playerName} đá văng ngựa của ${otherName} về chuồng! 💥 (+1 lượt)`,
          icon: "💥",
        };
      }
      if (m.kind === "deploy") {
        return {
          text: `${playerName} tung ${action.dice} — Xuất quân ${horseNum} ra trận! 🚀`,
          icon: "🚀",
        };
      }
      if (m.kind === "climb_home" || m.kind === "enter_home") {
        return {
          text: `${playerName} leo thang bậc ${m.toPos}! Sắp về đích rồi 🌸`,
          icon: "🌸",
        };
      }
      return {
        text: `${playerName} tiến ${action.dice} bước trên đường đua 🏇`,
        icon: "🏇",
      };
    } else {
      if (action.gotExtraTurn) {
        return {
          text: `${playerName} tung 6! Được tung thêm một lượt nữa nè 🎉`,
          icon: "🎲",
        };
      }
      return {
        text: `${playerName} tung ${action.dice} nhưng bị cản đường 🥺 Chuyển lượt nha!`,
        icon: "⏳",
      };
    }
  }

  const currentName = game.turn === "nam" ? "Anh 🐻" : "Em 🧸";
  return {
    text: `Lượt của ${currentName} — Hãy tung xúc xắc nào! 🎲`,
    icon: "🎲",
  };
}

function LudoFallback() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-4 py-8">
      <div className="h-8 w-48 animate-pulse rounded-full bg-pink-100" />
      <div className="h-80 w-full animate-pulse rounded-3xl bg-pink-100/50" />
      <div className="h-16 w-full animate-pulse rounded-2xl bg-pink-100" />
    </main>
  );
}

function LudoGameView() {
  const me = useMe();
  const searchParams = useSearchParams();
  const hotseatParam = searchParams.get("hotseat") === "1";

  const [game, setGame] = useState<LudoState | null>(null);
  const [optimistic, setOptimistic] = useState<LudoState | null>(null);
  const [isHotseat, setIsHotseat] = useState(hotseatParam);
  const [muted, setMuted] = useState(isMuted);
  const [rolling, setRolling] = useState(false);
  const [tumbleFace, setTumbleFace] = useState<string>("🎲");
  const [toast, setToast] = useState("");

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastActionN = useRef<number>(-1);

  const say = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3000);
  };

  // Sync mute state
  useEffect(() => {
    return onMuteChange(() => setMuted(isMuted()));
  }, []);

  // Firestore realtime sync
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(ludoGameRef, (snap) => {
        if (snap.exists()) {
          const remote = snap.data() as LudoState;
          setGame(remote);
          setOptimistic((prev) => {
            if (!prev) return null;
            if (
              remote.updatedAt >= prev.updatedAt ||
              remote.lastAction?.n === prev.lastAction?.n
            ) {
              return null;
            }
            return prev;
          });
        } else {
          // Initialize new game doc if not found
          runTransaction(db, async (tx) => {
            if (!(await tx.get(ludoGameRef)).exists()) {
              tx.set(ludoGameRef, newGame("linh", { nam: 0, linh: 0 }, "quick"));
            }
          }).catch((err) => console.error("Could not create game doc:", err));
        }
      });
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const displayGame = optimistic ?? game;

  // Real-time sound effect for remote opponent actions
  useEffect(() => {
    if (!displayGame?.lastAction) return;
    const action = displayGame.lastAction;
    if (action.n !== lastActionN.current) {
      lastActionN.current = action.n;
      // Play audio if move came from other device in 2-device mode
      if (!isHotseat && me && action.by !== me) {
        if (displayGame.status === "over") {
          playWin();
        } else if (action.move) {
          if (action.move.kicks) playKick();
          else if (action.move.kind === "deploy") playDeploy();
          else if (
            action.move.kind === "climb_home" ||
            action.move.kind === "enter_home"
          ) {
            playHomeStep(action.move.toPos);
          } else {
            playHop();
          }
        } else {
          playDiceRoll();
        }
      }
    }
  }, [displayGame?.lastAction, displayGame?.status, isHotseat, me]);

  if (me === null) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-zinc-800">Cờ cá ngựa đôi lứa 🐴🎲</h1>
        <Link href="/lock?next=/ludo" className="py-8 text-rose-500 font-semibold underline">
          Chưa biết máy của ai 🤔 Mở khoá lại nhé
        </Link>
      </main>
    );
  }

  if (!displayGame || me === undefined) {
    return <LudoFallback />;
  }

  const isPlaying = displayGame.status === "playing";
  const isMyTurn = displayGame.turn === me;
  const canAct = isPlaying && (isHotseat || isMyTurn);
  const commentary = getCommentary(displayGame);

  // 1. Zero-Delay Optimistic Roll Dice
  const handleRollDice = async () => {
    if (!canAct || displayGame.phase !== "roll" || rolling) return;

    const activeWho = displayGame.turn;
    const rawDice = Math.floor(Math.random() * 6) + 1;
    const rng = () => (rawDice - 0.5) / 6;

    // Apply locally at 0ms
    const res = rollDice(displayGame, activeWho, rng);
    if (!res.ok) {
      say(res.reason);
      return;
    }

    triggerHaptic();
    playDiceRoll();

    // Tumbling animation
    setRolling(true);
    let tumbleCount = 0;
    const interval = setInterval(() => {
      tumbleCount++;
      setTumbleFace(DICE_FACES[Math.floor(Math.random() * 6)]);
      if (tumbleCount >= 6) {
        clearInterval(interval);
        setTumbleFace(DICE_FACES[rawDice - 1]);
        setRolling(false);
      }
    }, 45);

    setOptimistic(res.state);

    if (res.autoMoved && res.state.lastAction?.move) {
      const m = res.state.lastAction.move;
      if (m.kicks) playKick();
      else if (m.kind === "deploy") playDeploy();
      else if (m.kind === "climb_home" || m.kind === "enter_home") {
        playHomeStep(m.toPos);
      } else {
        playHop();
      }

      if (res.state.status === "over") playWin();
    }

    // Commit to Firestore in background
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        const current = snap.exists() ? (snap.data() as LudoState) : newGame();
        const txRes = rollDice(current, activeWho, rng);
        if (txRes.ok) {
          tx.set(ludoGameRef, txRes.state);
        }
      });
    } catch (err) {
      console.error("Roll transaction failed:", err);
    }
  };

  // 2. Zero-Delay Optimistic Move Horse
  const handleMoveHorse = async (horseId: number) => {
    if (!canAct || displayGame.phase !== "move") return;

    const activeWho = displayGame.turn;
    // Apply locally at 0ms
    const res = applyMove(displayGame, activeWho, horseId);
    if (!res.ok) {
      say(res.reason);
      return;
    }

    triggerHaptic();
    setOptimistic(res.state);

    if (res.state.lastAction?.move) {
      const m = res.state.lastAction.move;
      if (m.kicks) playKick();
      else if (m.kind === "deploy") playDeploy();
      else if (m.kind === "climb_home" || m.kind === "enter_home") {
        playHomeStep(m.toPos);
      } else {
        playHop();
      }
    }

    if (res.state.status === "over") {
      playWin();
    }

    // Commit to Firestore in background
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        if (!snap.exists()) return;
        const current = snap.data() as LudoState;
        const txRes = applyMove(current, activeWho, horseId);
        if (txRes.ok) {
          tx.set(ludoGameRef, txRes.state);
        }
      });
    } catch (err) {
      console.error("Move transaction failed:", err);
    }
  };

  // 3. Game Mode Switcher
  const handleModeChange = async (mode: GameMode) => {
    if (displayGame.mode === mode) return;
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        if (!snap.exists()) return;
        const res = changeMode(snap.data() as LudoState, mode);
        if (res.ok) {
          tx.set(ludoGameRef, res.state);
        }
      });
      say(
        mode === "quick"
          ? "Đã đổi sang Đấu nhanh 2 ngựa ⚡"
          : "Đã đổi sang Truyền thống 4 ngựa 🏇"
      );
    } catch (err) {
      console.error(err);
      say("Có lỗi khi đổi chế độ 🥺");
    }
  };

  // 4. Next Game
  const handleNextGame = async () => {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        if (!snap.exists()) return;
        const current = snap.data() as LudoState;
        tx.set(ludoGameRef, nextGame(current));
      });
      say("Đã khởi tạo ván mới! Chúc hai bạn chơi vui vẻ 💕");
    } catch (err) {
      console.error(err);
      say("Có lỗi khi tạo ván mới 🥺");
    }
  };

  // 5. Resign
  const handleResign = async () => {
    if (!isPlaying) return;
    const confirm = window.confirm("Bạn có chắc muốn đầu hàng không? 🏳️");
    if (!confirm) return;

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        if (!snap.exists()) return;
        const res = resign(snap.data() as LudoState, me);
        if (res.ok) {
          tx.set(ludoGameRef, res.state);
        }
      });
      say("Đã nhận đầu hàng 🏳️");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center gap-3 px-3 py-4 sm:py-6">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-zinc-800/90 text-white px-4 py-1.5 text-xs font-semibold shadow-lg backdrop-blur animate-in fade-in duration-200">
          {toast}
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-lg sm:text-xl font-black text-zinc-800 flex items-center gap-1">
            <span>Cờ cá ngựa</span>
            <span className="text-pink-500">🐴🎲</span>
          </h1>
          <button
            type="button"
            onClick={() => {
              const nowMuted = toggleMute();
              setMuted(nowMuted);
              say(nowMuted ? "Đã tắt âm 🔇" : "Đã bật âm 🔊");
            }}
            title={muted ? "Bật âm thanh" : "Tắt âm thanh"}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-pink-200 bg-white/80 text-xs text-zinc-600 shadow-2xs hover:bg-pink-50 active:scale-95 transition-all cursor-pointer"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>

        {/* Hotseat Toggle Button */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setIsHotseat(!isHotseat);
              say(!isHotseat ? "Chế độ: Chơi chung 1 máy 📱" : "Chế độ: Chơi 2 máy riêng 🌐");
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
              isHotseat
                ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {isHotseat ? "Chung 1 máy 📱" : "2 máy 🌐"}
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex w-full max-w-xs rounded-full border border-pink-200 bg-pink-100/60 p-1 shadow-inner backdrop-blur">
        <button
          type="button"
          onClick={() => handleModeChange("quick")}
          className={`flex-1 rounded-full py-1 text-center text-xs font-bold transition-all cursor-pointer ${
            displayGame.mode === "quick"
              ? "bg-white text-pink-600 shadow-xs"
              : "text-pink-400 hover:text-pink-600"
          }`}
        >
          Đấu nhanh 2 ngựa ⚡
        </button>
        <button
          type="button"
          onClick={() => handleModeChange("classic")}
          className={`flex-1 rounded-full py-1 text-center text-xs font-bold transition-all cursor-pointer ${
            displayGame.mode === "classic"
              ? "bg-white text-pink-600 shadow-xs"
              : "text-pink-400 hover:text-pink-600"
          }`}
        >
          Truyền thống 4 ngựa 🏇
        </button>
      </div>

      {/* Commentary & Action Feed Banner */}
      <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-pink-100 bg-white/90 px-3.5 py-2 text-xs sm:text-sm text-zinc-700 shadow-xs backdrop-blur">
        <span className="text-base select-none">{commentary.icon}</span>
        <span className="font-semibold text-center leading-snug line-clamp-2">
          {commentary.text}
        </span>
      </div>

      {/* The 11x11 Ludo Board */}
      <Board
        state={displayGame}
        me={me}
        isHotseat={isHotseat}
        onMove={handleMoveHorse}
      />

      {/* Bottom Controls: Dice Roller & Action Buttons */}
      <div className="flex w-full flex-col items-center gap-3 mt-1">
        {/* Dice Roller Section */}
        {isPlaying ? (
          displayGame.phase === "roll" ? (
            <button
              type="button"
              disabled={!canAct || rolling}
              onClick={handleRollDice}
              className={`w-full max-w-xs flex items-center justify-center gap-3 py-3 px-6 rounded-2xl text-base sm:text-lg font-black shadow-lg transition-all duration-150 cursor-pointer ${
                canAct
                  ? displayGame.turn === "nam"
                    ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-pink-200 active:scale-95 active:shadow-sm"
                    : "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-sky-200 active:scale-95 active:shadow-sm"
                  : "bg-zinc-200 text-zinc-400 cursor-not-allowed shadow-none"
              }`}
            >
              <span className={`text-2xl sm:text-3xl leading-none ${rolling ? "animate-spin" : ""}`}>
                {rolling ? tumbleFace : "🎲"}
              </span>
              <span>
                {canAct
                  ? rolling
                    ? "Đang tung..."
                    : `Tung xúc xắc (${displayGame.turn === "nam" ? "Anh 🐻" : "Em 🧸"})`
                  : `Đợi ${displayGame.turn === "nam" ? "Anh 🐻" : "Em 🧸"} tung...`}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs sm:text-sm font-bold text-amber-900 shadow-xs animate-in fade-in">
              <span className="text-2xl">
                {DICE_FACES[(displayGame.dice ?? 1) - 1]}
              </span>
              <span>
                Tung được {displayGame.dice}! Chạm vào chú ngựa đang nhảy để đi nhé 🐴
              </span>
            </div>
          )
        ) : (
          /* Game Over Modal / Celebration Card */
          <div className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-pink-50 p-4 text-center shadow-lg animate-in zoom-in-95 duration-200">
            <span className="text-4xl">🏆</span>
            <h2 className="text-xl font-black text-amber-900">
              {displayGame.winner === "nam" ? "Anh Nam 🐻" : "Em Linh 🧸"} chiến thắng!
            </h2>
            <p className="text-xs text-amber-800">
              Tỉ số hiện tại: Nam {displayGame.scores.nam} — {displayGame.scores.linh} Linh
            </p>
            <button
              type="button"
              onClick={handleNextGame}
              className="mt-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-pink-200 hover:brightness-105 active:scale-95 cursor-pointer"
            >
              Chơi ván tiếp theo 💕
            </button>
          </div>
        )}

        {/* Secondary Buttons: New Game / Resign */}
        {isPlaying && (
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <button
              type="button"
              onClick={handleNextGame}
              className="hover:text-pink-600 transition-colors cursor-pointer"
            >
              🔄 Ván mới
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={handleResign}
              className="hover:text-rose-600 transition-colors cursor-pointer"
            >
              🏳️ Đầu hàng
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function LudoPage() {
  return (
    <Suspense fallback={<LudoFallback />}>
      <LudoGameView />
    </Suspense>
  );
}
