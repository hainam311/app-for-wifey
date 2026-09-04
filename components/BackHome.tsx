"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackHome() {
  const pathname = usePathname();
  if (!pathname || pathname === "/" || pathname === "/lock") return null;

  return (
    <Link
      href="/"
      aria-label="Về trang chủ"
      title="Về nhà"
      className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white/90 text-base text-pink-500 shadow-sm backdrop-blur transition-all hover:bg-pink-50 hover:shadow-md active:scale-95"
    >
      🏠
    </Link>
  );
}

