import { NextResponse, type NextRequest } from "next/server";
import { verifyWho, WHO_COOKIE } from "@/lib/session";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

// Whose phone is this? The identity cookie is httpOnly, so pages ask here.
export async function GET(req: NextRequest) {
  const who = verifyWho(req.cookies.get(WHO_COOKIE)?.value);
  if (!who) {
    return NextResponse.json(
      { who: null },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }
  return NextResponse.json({ who }, { headers: NO_STORE_HEADERS });
}
