import { NextResponse, type NextRequest } from "next/server";
import { passcodeOwner, signWho, WHO_COOKIE, WHO_MAX_AGE } from "@/lib/session";
import { clearFailures, lockRemaining, recordFailure } from "@/lib/unlockLimiter";

// Cookie from the old single-passcode gate; cleared so it doesn't linger.
const LEGACY_COOKIE = "app_wifey_unlocked";
const WRONG_CODE_DELAY_MS = 1000;

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function locked(ms: number) {
  const retryAfterSec = Math.ceil(ms / 1000);
  return NextResponse.json(
    { ok: false, error: "locked", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

// Fail closed: if the attempt counter can't be read or written, don't let
// guesses through uncounted.
function unavailable(err: unknown) {
  console.error("Unlock limiter unavailable:", err);
  return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
}

export async function POST(req: NextRequest) {
  let body: { passcode?: string; next?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const ip = clientIp(req);
  const attempted = (body.passcode ?? "").trim();
  const targetRaw =
    typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/";

  // Locked out? Refuse even a correct code, or the lock would be pointless.
  try {
    const wait = await lockRemaining(ip);
    if (wait > 0) return locked(wait);
  } catch (err) {
    return unavailable(err);
  }

  const who = passcodeOwner(attempted);
  if (!who) {
    await new Promise((res) => setTimeout(res, WRONG_CODE_DELAY_MS));
    try {
      const wait = await recordFailure(ip);
      if (wait > 0) return locked(wait);
    } catch (err) {
      return unavailable(err);
    }
    return NextResponse.json({ ok: false, error: "Sai passcode" }, { status: 401 });
  }

  const signed = signWho(who);
  if (!signed) {
    console.error("SESSION_SECRET is not set — cannot unlock.");
    return NextResponse.json({ ok: false, error: "Server chưa cấu hình" }, { status: 500 });
  }

  await clearFailures(ip).catch((err) => console.error("Could not clear failures:", err));

  const res = NextResponse.json({ ok: true, who, next: targetRaw });
  res.cookies.set(WHO_COOKIE, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WHO_MAX_AGE,
  });
  res.cookies.delete(LEGACY_COOKIE);
  return res;
}
