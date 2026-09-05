import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "app_wifey_unlocked";
const PASSCODE = process.env.NEXT_PUBLIC_APP_PASSWORD || "";

export async function POST(req: NextRequest) {
  let body: { passcode?: string; next?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const attempted = (body.passcode ?? "").trim();
  const ok = PASSCODE.length > 0 && attempted === PASSCODE;
  const targetRaw =
    typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/";

  if (!ok) {
    return NextResponse.json({ ok: false, error: "Sai passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: targetRaw });
  res.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // stay unlocked ~7 days on this browser
  });
  return res;
}
