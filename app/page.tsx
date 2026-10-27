"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

type TabType = "love-story" | "game";

function HomeMenu() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");

  // Single source of truth derived directly during render — Game 🎮 is default
  const activeTab: TabType = tabParam === "love-story" ? "love-story" : "game";

  const handleTabChange = (newTab: TabType) => {
    const newUrl = newTab === "love-story" ? "/?tab=love-story" : "/?tab=game";
    router.replace(newUrl, { scroll: false });
  };

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {/* Master Tabs Switcher */}
      <div className="flex w-full max-w-xs rounded-full border border-pink-200 bg-pink-100/70 p-1.5 shadow-inner backdrop-blur">
        <button
          type="button"
          onClick={() => handleTabChange("game")}
          className={`flex-1 rounded-full py-2.5 text-center text-sm font-bold transition-all active:scale-95 ${
            activeTab === "game"
              ? "bg-white text-pink-600 shadow-md shadow-pink-200/50"
              : "text-pink-400 hover:text-pink-600"
          }`}
        >
          Game 🎮
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("love-story")}
          className={`flex-1 rounded-full py-2.5 text-center text-sm font-bold transition-all active:scale-95 ${
            activeTab === "love-story"
              ? "bg-white text-pink-600 shadow-md shadow-pink-200/50"
              : "text-pink-400 hover:text-pink-600"
          }`}
        >
          Love Story ❤️
        </button>
      </div>

      {/* Tab 1: Love Story Content */}
      {activeTab === "love-story" && (
        <div className="flex w-full max-w-md flex-col gap-3 animate-in fade-in duration-200">
          <Link
            href="/food"
            className="rounded-full bg-pink-500 px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 hover:shadow-xl active:scale-95"
          >
            Hôm nay mình ăn gì? 🍜
          </Link>
          <Link
            href="/drink-prefs"
            className="rounded-full border-2 border-pink-200 bg-pink-50 px-8 py-4 text-center text-lg font-semibold text-pink-500 transition-all hover:bg-pink-100 active:scale-95"
          >
            Bí kíp thức uống của em 🧋
          </Link>
          <Link
            href="/journal"
            className="rounded-full bg-gradient-to-r from-pink-500 to-rose-400 px-8 py-4 text-center text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:shadow-xl hover:brightness-105 active:scale-95"
          >
            Nhật ký tình yêu 💌
          </Link>
          <Link
            href="/todo"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 transition-all hover:bg-pink-50 active:scale-95"
          >
            Việc cần làm ✅
          </Link>
          <Link
            href="/wishlist"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 transition-all hover:bg-pink-50 active:scale-95"
          >
            Ước mơ của em 🎁
          </Link>
          <Link
            href="/trips"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 transition-all hover:bg-pink-50 active:scale-95"
          >
            Mình đi đâu đây? 🧳
          </Link>

          {/* Food Category Footer */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-400">
            <span>🍳 Sáng</span>
            <span>🍜 Trưa &amp; Tối</span>
            <span>☕ Đồ uống</span>
            <span>🍨 Tráng miệng</span>
          </div>
        </div>
      )}

      {/* Tab 2: Game Content */}
      {activeTab === "game" && (
        <div className="flex w-full max-w-md flex-col gap-3 animate-in fade-in duration-200">
          <Link
            href="/game"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 shadow-sm transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
          >
            Lật hình emoji 🐻
          </Link>
          <Link
            href="/scrabble"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 shadow-sm transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
          >
            Scrabble with Love 💌
          </Link>
          <Link
            href="/caro"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 shadow-sm transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
          >
            Cờ caro 🐻🧸
          </Link>
          <Link
            href="/tank"
            className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-center text-lg font-semibold text-pink-500 shadow-sm transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
          >
            Bắn tăng 💥
          </Link>
        </div>
      )}
    </div>
  );
}

function HomeFallback() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="h-12 w-64 animate-pulse rounded-full bg-pink-100" />
      <div className="h-14 w-full animate-pulse rounded-full bg-pink-200" />
      <div className="h-14 w-full animate-pulse rounded-full bg-pink-100" />
      <div className="h-14 w-full animate-pulse rounded-full bg-pink-100" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-widest text-pink-400">
        Dành riêng cho hai đứa mình
      </p>

      <h1 className="text-4xl font-bold text-zinc-800 sm:text-5xl">
        Eat với người yêu <span className="text-pink-500">❤️</span>
      </h1>

      <p className="max-w-md text-lg text-gray-500">
        Một góc nhỏ của riêng tụi mình — bắt đầu từ nhà hàng quen thuộc nhất.
      </p>

      <Suspense fallback={<HomeFallback />}>
        <HomeMenu />
      </Suspense>
    </main>
  );
}
