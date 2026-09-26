import { NextResponse, type NextRequest } from "next/server";
import { verifyWho, WHO_COOKIE } from "@/lib/session";

// Front-door passcode gate (server-side). Protects ALL pages — including the
// server-rendered home & drink-prefs whose content would otherwise be baked
// into the static HTML — by redirecting anyone without a valid, signed
// "whose phone is this" cookie to /lock. (Next 16: formerly middleware.ts.)
const PROTECTED_PREFIX = "/lock"; // never protect the lock page itself

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip API routes, Next.js internals and static files (so assets always load).
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Allow the lock page itself.
  if (pathname === PROTECTED_PREFIX || pathname.startsWith(PROTECTED_PREFIX + "/")) {
    return NextResponse.next();
  }

  // Unlocked by Nam or Linh on this browser? Let them through.
  if (verifyWho(req.cookies.get(WHO_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Otherwise remember where they wanted to go, then send them to the lock.
  const url = req.nextUrl.clone();
  url.pathname = PROTECTED_PREFIX;
  url.search = `?next=${encodeURIComponent(pathname + (req.nextUrl.search || ""))}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
