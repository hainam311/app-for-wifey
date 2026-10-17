"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BackHome() {
  const pathname = usePathname();
  if (
    !pathname ||
    pathname === "/" ||
    pathname === "/lock" ||
    pathname.startsWith("/tank")
  )
    return null;

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

