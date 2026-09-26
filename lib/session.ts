import { createHmac, timingSafeEqual } from "node:crypto";

// Per-person front door (server-only: uses node:crypto + secret env vars).
// Each of us has our own passcode; the phone then carries a signed cookie
// saying whose it is, so editing the cookie by hand doesn't switch people.
export type Who = "nam" | "linh";

export const WHO_COOKIE = "app_wifey_who";
export const WHO_MAX_AGE = 60 * 60 * 24 * 7; // stay unlocked ~7 days on this browser

const PASSCODES: Record<Who, string | undefined> = {
  nam: process.env.NAM_PASSCODE,
  linh: process.env.LINH_PASSCODE,
};

// Which person does this passcode belong to? Empty/unset codes never match.
export function passcodeOwner(attempt: string): Who | null {
  for (const who of Object.keys(PASSCODES) as Who[]) {
    const code = PASSCODES[who];
    if (code && attempt === code) return who;
  }
  return null;
}

function signature(who: Who, secret: string): string {
  return createHmac("sha256", secret).update(who).digest("hex");
}

// "nam" -> "nam.<hmac>"; null if SESSION_SECRET is missing.
export function signWho(who: Who): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return `${who}.${signature(who, secret)}`;
}

// Cookie value -> the person it proves, or null if missing/forged.
export function verifyWho(value: string | undefined): Who | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !value) return null;
  const [who, sig] = value.split(".");
  if (who !== "nam" && who !== "linh") return null;
  const expected = Buffer.from(signature(who, secret));
  const given = Buffer.from(sig ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return who;
}
