"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOVE_STORY_NAV } from "./LoveStoryNav";

export default function BackHome() {
  const pathname = usePathname();
  if (
    !pathname ||
    pathname === "/" ||
    pathname === "/lock" ||
    pathname.startsWith("/tank")
  )
    return null;

  const isLoveStoryRoute = LOVE_STORY_NAV.some((item) =>
    pathname.startsWith(item.href)
  );

  // Love Story Cross-Navigation Bar: Sleek, non-overlapping sticky top bar
  if (isLoveStoryRoute) {
    return (
      <header className="sticky top-0 z-40 w-full border-b border-pink-100/80 bg-[#fff9f5]/90 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-3 py-2">
          <Link
            href="/?tab=love-story"
            aria-label="Về trang chủ"
            title="Về menu Love Story"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pink-200 bg-white text-sm text-pink-500 shadow-sm transition-all hover:bg-pink-50 active:scale-95"
          >
            🏠
          </Link>
          <nav className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {LOVE_STORY_NAV.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
                    isActive
                      ? "bg-pink-500 text-white shadow-sm shadow-pink-200"
                      : "border border-pink-100 bg-white text-zinc-600 hover:bg-pink-50 hover:text-pink-600"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
    );
  }

  // Game Routes (/game, /scrabble, /caro): Floating back button returning to Game tab
  return (
    <Link
      href="/"
      aria-label="Về trang chủ"
      title="Về nhà"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-50 flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white/90 text-base text-pink-500 shadow-sm backdrop-blur transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
    >
      🏠
    </Link>
  );
}
