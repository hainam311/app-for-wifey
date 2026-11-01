"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  playDiceRoll,
  toggleMute,
} from "@/lib/ludo/audio";
import Board from "./Board";

const NAM_KICK_QUOTES = [
  "Bắt được ngựa của vợ yêu rồi nha! 🎯",
  "Thương vợ lắm cơ mà luật chơi anh phải đá nè! ❤️",
  "Ngựa em chạy nhanh quá anh bắt về chuồng chơi! 😘",
];

const LINH_KICK_QUOTES = [
  "Cho anh chừa thói chạy trước vợ nè! 💅",
  "Tối nay xác định rửa bát nhé cưng ơi! 😼",
  "Đá văng ngựa của anh Nam về chuồng ngủ! 💥",
];

function triggerHaptic(pattern: number | number[] = 20) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors
    }
  }
}

function Dice3D({
  value,
  size = 44,
  rolling = false,
  glow = false,
  className = "",
}: {
  value: number;
  size?: number;
  rolling?: boolean;
  glow?: boolean;
  className?: string;
}) {
  const safeVal = Math.min(6, Math.max(1, value || 1));
  return (
    <div
      className={`relative inline-flex items-center justify-center transition-all duration-150 ${
        glow
          ? "rounded-xl p-0.5 ring-2 ring-amber-400 ring-offset-2 ring-offset-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.7)]"
          : ""
      } ${
        rolling
          ? "animate-bounce scale-110 -rotate-12"
          : ""
      } ${className}`}
    >
      <Image
        src={`/ludo/dice-${safeVal}.png`}
        alt={`Xúc xắc ${safeVal}`}
        width={size}
        height={size}
        className={`drop-shadow-md rounded-lg select-none pointer-events-none transition-transform duration-100 ${
          rolling ? "rotate-45" : ""
        }`}
        priority
      />
    </div>
  );
}

function getCommentary(game: LudoState): { text: string; icon: string } {
  if (game.status === "over") {
    const winnerName = game.winner === "nam" ? "Anh Nam 🐻" : "Em Linh 🧸";
    return {
      text: `🏆 Chúc mừng ${winnerName} đã chiến thắng vang dội!`,
      icon: "🎉",
    };
  }

  // When rolling 6 and currently choosing a horse
  if (game.phase === "move" && game.dice === 6) {
    return {
      text: "Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉",
      icon: "🎉",
    };
  }

  const action = game.lastAction;
  if (action) {
    const playerName = action.by === "nam" ? "Anh 🐻" : "Em 🧸";

    if (action.move) {
      const m = action.move;
      const horseNum = `#${m.horseId + 1}`;
      if (m.kicks) {
        const quotes = action.by === "nam" ? NAM_KICK_QUOTES : LINH_KICK_QUOTES;
        const quote = quotes[(action.n + (action.at || 0)) % quotes.length];
        return {
          text: `${playerName}: "${quote}" (+1 lượt)`,
          icon: action.by === "nam" ? "🎯" : "💅",
        };
      }
      if (m.toZone === "home" && m.toPos === 6) {
        return {
          text: "Đỉnh chóp! Ngựa đã về đích an toàn rực rỡ 🌸🏆",
          icon: "🏆",
        };
      }
      if (m.kind === "deploy") {
        if (action.dice === 6) {
          return {
            text: `Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉 — Xuất quân ${horseNum} ra trận! 🚀`,
            icon: "🚀",
          };
        }
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
      if (action.gotExtraTurn || action.dice === 6) {
        return {
          text: "Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉",
          icon: "🎉",
        };
      }
      return {
        text: `${playerName} tiến ${action.dice} bước trên đường đua 🏇`,
        icon: "🏇",
      };
    } else {
      if (action.gotExtraTurn || action.dice === 6) {
        return {
          text: "Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉",
          icon: "🎉",
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
  const [tumbleNum, setTumbleNum] = useState<number>(6);
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

  // Real-time reactions and sounds for remote actions
  useEffect(() => {
    if (!displayGame?.lastAction) return;
    const action = displayGame.lastAction;
    if (action.n !== lastActionN.current) {
      lastActionN.current = action.n;

      // Couple Delight Reactions for events from opponent
      if (action.move?.kicks) {
        const quotes = action.by === "nam" ? NAM_KICK_QUOTES : LINH_KICK_QUOTES;
        const quote = quotes[(action.n + (action.at || 0)) % quotes.length];
        say(quote);
      } else if (action.move?.toZone === "home" && action.move?.toPos === 6) {
        say("Đỉnh chóp! Ngựa đã về đích an toàn rực rỡ 🌸🏆");
      } else if (action.dice === 6 && !action.move) {
        say("Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉");
      }

      // Play audio if move came from other device in 2-device mode and was pure roll (no move)
      if (!isHotseat && me && action.by !== me) {
        if (!action.move) {
          playDiceRoll();
        }
      }
    }
  }, [displayGame?.lastAction, isHotseat, me]);

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

    // Tumbling animation (6 frames * 45ms = 270ms)
    setRolling(true);
    let tumbleCount = 0;
    let prevNum = 6;
    const interval = setInterval(() => {
      tumbleCount++;
      let nextNum = Math.floor(Math.random() * 6) + 1;
      if (nextNum === prevNum) {
        nextNum = (nextNum % 6) + 1;
      }
      prevNum = nextNum;
      setTumbleNum(nextNum);

      if (tumbleCount >= 6) {
        clearInterval(interval);
        setTumbleNum(rawDice);
        setRolling(false);
        setOptimistic(res.state);

        // Instant couple reaction on landing
        const lastMove = res.state.lastAction?.move;
        if (lastMove?.kicks) {
          const quotes = activeWho === "nam" ? NAM_KICK_QUOTES : LINH_KICK_QUOTES;
          const quote = quotes[Math.floor(Math.random() * quotes.length)];
          say(quote);
        } else if (lastMove?.toZone === "home" && lastMove?.toPos === 6) {
          say("Đỉnh chóp! Ngựa đã về đích an toàn rực rỡ 🌸🏆");
        } else if (rawDice === 6) {
          say("Tung được 6! Vận may đôi lứa mỉm cười rồi nè 🎉");
        }
      }
    }, 45);

    // Commit to Firestore in background after dice lands
    const commitRoll = async () => {
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

    setTimeout(commitRoll, 280);
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

    triggerHaptic(14);
    setOptimistic(res.state);

    // Instant couple reaction for local player move
    const m = res.state.lastAction?.move;
    if (m?.kicks) {
      const quotes = activeWho === "nam" ? NAM_KICK_QUOTES : LINH_KICK_QUOTES;
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      say(quote);
    } else if (m?.toZone === "home" && m?.toPos === 6) {
      say("Đỉnh chóp! Ngựa đã về đích an toàn rực rỡ 🌸🏆");
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
          ? "Đã đổi sang chế độ Đấu nhanh (2 ngựa) ⚡"
          : "Đã đổi sang chế độ Truyền thống (4 ngựa) 🏇"
      );
    } catch (err) {
      console.error(err);
      say("Có lỗi khi đổi chế độ 🥺");
    }
  };

  // 4. Next Game / Reset
  const handleNextGame = async () => {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        const current = snap.exists() ? (snap.data() as LudoState) : newGame();
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
    const activeWho = displayGame.turn;
    const confirmResign = window.confirm(
      "Bạn có chắc muốn chịu thua và nhường phần thắng cho người thương? 💕"
    );
    if (!confirmResign) return;

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ludoGameRef);
        if (!snap.exists()) return;
        const res = resign(snap.data() as LudoState, activeWho);
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
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded-full bg-zinc-800/95 text-white px-4 py-2 text-xs sm:text-sm font-bold shadow-xl backdrop-blur animate-in fade-in zoom-in-95 duration-200 border border-white/20">
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
      <div
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3.5 py-2 text-xs sm:text-sm shadow-xs backdrop-blur transition-all duration-300 ${
          commentary.icon === "🎯" || commentary.icon === "💅" || commentary.icon === "💥"
            ? "border-rose-300 bg-rose-50/95 text-rose-900 font-bold"
            : commentary.icon === "🎉" || commentary.icon === "🏆"
            ? "border-amber-300 bg-amber-50/95 text-amber-900 font-bold"
            : "border-pink-100 bg-white/90 text-zinc-700 font-semibold"
        }`}
      >
        <span className="text-base select-none">{commentary.icon}</span>
        <span className="text-center leading-snug line-clamp-2">
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
              <Dice3D
                value={rolling ? tumbleNum : 6}
                size={36}
                rolling={rolling}
              />
              <span>
                {canAct
                  ? rolling
                    ? "Đang tung..."
                    : `Tung xúc xắc (${displayGame.turn === "nam" ? "Anh 🐻" : "Em 🧸"})`
                  : `Đợi ${displayGame.turn === "nam" ? "Anh 🐻" : "Em 🧸"} tung...`}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 px-4 py-2.5 text-xs sm:text-sm font-bold text-amber-900 shadow-md animate-in fade-in zoom-in-95">
              <Dice3D
                value={displayGame.dice ?? 1}
                size={44}
                glow={true}
              />
              <div className="flex flex-col text-left">
                <span className="text-sm font-black text-amber-900">
                  {displayGame.dice === 6 ? "Tung được 6! 🎉" : `Tung được ${displayGame.dice}!`}
                </span>
                <span className="text-xs font-semibold text-amber-800">
                  {displayGame.dice === 6
                    ? "Vận may đôi lứa mỉm cười rồi nè! Chạm vào chú ngựa để đi 🐴"
                    : "Chạm vào chú ngựa đang nhảy để đi nhé 🐴"}
                </span>
              </div>
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
