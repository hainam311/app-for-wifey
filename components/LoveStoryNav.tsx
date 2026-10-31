"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const GAME_NAV = [
  { href: "/game", label: "Lật hình emoji 🐻" },
  { href: "/scrabble", label: "Scrabble with Love 💌" },
  { href: "/caro", label: "Cờ caro 🐻🧸" },
  { href: "/tank", label: "Bắn tăng 💥" },
  { href: "/ludo", label: "Cờ cá ngựa 🐴🎲" },
];

export const LOVE_STORY_NAV = [
  { href: "/food", label: "🍜 Món ăn" },
  { href: "/drink-prefs", label: "🧋 Đồ uống" },
  { href: "/journal", label: "💌 Nhật ký" },
  { href: "/todo", label: "✅ Việc làm" },
  { href: "/wishlist", label: "🎁 Ước mơ" },
  { href: "/trips", label: "🧳 Chuyến đi" },
];

export default function LoveStoryNav({
  tab = "game",
}: {
  tab?: "game" | "love-story";
}) {
  const pathname = usePathname();
  const items = tab === "game" ? GAME_NAV : LOVE_STORY_NAV;

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
              isActive
                ? "bg-pink-500 text-white shadow-xs shadow-pink-200"
                : "border border-pink-100 bg-white text-zinc-600 hover:bg-pink-50 hover:text-pink-600"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
