import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  deleteDoc,
  doc,
  getFirestore,
  runTransaction,
  type Firestore,
} from "firebase/firestore";

// Lockout for the front door (server-only). 4-digit passcodes are only 10,000
// guesses, so wrong attempts are counted in Firestore — Vercel's serverless
// functions don't keep memory between requests.
//   • per IP:  5 wrong tries in 10 min → that IP locked for 15 min
//   • global: 30 wrong tries in 1 h   → ALL new unlocks locked for 15 min
//     (stops an attacker rotating IPs; phones already unlocked are unaffected)
const COLLECTION = "unlock_attempts";
const GLOBAL_DOC = "global";
const IP_MAX = 5;
const IP_WINDOW_MS = 10 * 60_000;
const GLOBAL_MAX = 30;
const GLOBAL_WINDOW_MS = 60 * 60_000;
const LOCK_MS = 15 * 60_000;

type Counter = { count: number; windowStart: number; lockedUntil: number };

// Its own named Firebase app, so it never collides with lib/firebase.ts.
// Firestore rules require auth, so the server signs in anonymously too.
const APP_NAME = "unlock-limiter";
let dbReady: Promise<Firestore> | null = null;

function limiterDb(): Promise<Firestore> {
  dbReady ??= (async () => {
    const app =
      getApps().find((a) => a.name === APP_NAME) ??
      initializeApp(
        {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        },
        APP_NAME
      );
    await signInAnonymously(getAuth(app));
    return getFirestore(app);
  })().catch((err) => {
    dbReady = null; // retry sign-in on the next request
    throw err;
  });
  return dbReady;
}

// Hash the IP: no raw addresses stored, and always a valid doc id.
function ipDocId(ip: string): string {
  return "ip_" + createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function bump(c: Counter | undefined, now: number, max: number, windowMs: number): Counter {
  const fresh = !c || now - c.windowStart > windowMs;
  const count = fresh ? 1 : c.count + 1;
  const windowStart = fresh ? now : c.windowStart;
  const lockedUntil = count >= max ? now + LOCK_MS : c?.lockedUntil ?? 0;
  return { count, windowStart, lockedUntil };
}

// Milliseconds left on the longer of the IP/global locks; 0 = free to try.
export async function lockRemaining(ip: string): Promise<number> {
  const db = await limiterDb();
  const now = Date.now();
  return runTransaction(db, async (tx) => {
    const [ipSnap, globalSnap] = await Promise.all([
      tx.get(doc(db, COLLECTION, ipDocId(ip))),
      tx.get(doc(db, COLLECTION, GLOBAL_DOC)),
    ]);
    const until = Math.max(
      (ipSnap.data() as Counter | undefined)?.lockedUntil ?? 0,
      (globalSnap.data() as Counter | undefined)?.lockedUntil ?? 0
    );
    return Math.max(0, until - now);
  });
}

// Count a wrong passcode; returns ms left on a lock it triggered (0 if none).
export async function recordFailure(ip: string): Promise<number> {
  const db = await limiterDb();
  const now = Date.now();
  const ipRef = doc(db, COLLECTION, ipDocId(ip));
  const globalRef = doc(db, COLLECTION, GLOBAL_DOC);
  return runTransaction(db, async (tx) => {
    const [ipSnap, globalSnap] = await Promise.all([tx.get(ipRef), tx.get(globalRef)]);
    const ipNext = bump(ipSnap.data() as Counter | undefined, now, IP_MAX, IP_WINDOW_MS);
    const globalNext = bump(
      globalSnap.data() as Counter | undefined,
      now,
      GLOBAL_MAX,
      GLOBAL_WINDOW_MS
    );
    tx.set(ipRef, ipNext);
    tx.set(globalRef, globalNext);
    return Math.max(0, Math.max(ipNext.lockedUntil, globalNext.lockedUntil) - now);
  });
}

// A correct passcode wipes that IP's slate (the global counter is left alone).
export async function clearFailures(ip: string): Promise<void> {
  const db = await limiterDb();
  await deleteDoc(doc(db, COLLECTION, ipDocId(ip)));
}
