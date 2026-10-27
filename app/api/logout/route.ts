import { NextResponse } from "next/server";
import { WHO_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } }
  );
  res.cookies.delete(WHO_COOKIE);
  return res;
}
