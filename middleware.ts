import { NextResponse, type NextRequest } from "next/server";

// Front-door passcode gate (server-side). Protects ALL pages — including the
// server-rendered home & drink-prefs whose content would otherwise be baked
// into the static HTML — by redirecting anyone without the unlock cookie to /lock.
const COOKIE = "app_wifey_unlocked";
const PROTECTED_PREFIX = "/lock"; // never protect the lock page itself

export function middleware(req: NextRequest) {
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

  // Already unlocked this session? Let them through.
  if (req.cookies.get(COOKIE)?.value === "1") {
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
