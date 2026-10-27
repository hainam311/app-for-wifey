/**
 * Seed script: reads JSON files produced by export_excel.py and writes
 * them into Firebase Firestore collections.
 *
 * Usage:
 *   node scripts/seed.mjs                 # append-only, NEVER deletes anything
 *   node scripts/seed.mjs --clear=foods   # clear ONLY named collection(s) first
 *
 * SAFETY: by default this script is append-only. "journal" is user-generated
 * (entries written inside the app) — never clear it without meaning to.
 * Live, app-made journal entries that are NOT in journal.json are backed up in
 * scripts/data/journal_live_backup_2026.json — keep that file safe too!
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  writeBatch,
} from "firebase/firestore";
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, "..");

// ---- Load .env.local (plain KEY=VALUE lines) ----
const env = {};
const envPath = join(APP_DIR, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} else {
  console.error("ERROR: .env.local not found at", envPath);
  process.exit(1);
}

const required = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error("ERROR: missing env vars in .env.local:", missing.join(", "));
  process.exit(1);
}

const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const DATA_DIR = join(__dirname, "data");

// collections to fill -> json file
const JOBS = [
  { collection: "foods", file: "foods.json" },
  { collection: "trips", file: "trips.json" },
  { collection: "wishlist", file: "wishlist.json" },
  { collection: "journal", file: "journal.json" },
  { collection: "shop_prefs", file: "shopPrefs.json" },
];

const BATCH_CHUNK_SIZE = 400;

async function seed(collectionName, items) {
  if (!items.length) {
    console.log(`  ${collectionName}: nothing to seed`);
    return;
  }
  const colRef = collection(db, collectionName);
  let ok = 0;
  for (let i = 0; i < items.length; i += BATCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(colRef), item);
    }
    await batch.commit();
    ok += chunk.length;
  }
  console.log(`  ${collectionName}: seeded ${ok} docs`);
}

async function clearCollection(collectionName) {
  if (collectionName === "journal") {
    console.warn("  SAFETY: refusing to clear 'journal' collection (protected user data).");
    return;
  }
  const ref = collection(db, collectionName);
  const snap = await getDocs(ref);
  if (snap.empty) return;
  let n = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_CHUNK_SIZE) {
    const chunk = snap.docs.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.delete(doc(db, collectionName, d.id));
    }
    await batch.commit();
    n += chunk.length;
  }
  if (n) console.log(`  ${collectionName}: cleared ${n} old docs`);
}

async function main() {
  // --clear only wipes the collections explicitly named, e.g. --clear=foods,trips.
  const clearFlag = process.argv.find((a) => a.startsWith("--clear"));
  const seedAll = process.argv.includes("--all");
  const clearSet = new Set(
    clearFlag
      ? (clearFlag.split("=")[1] ? clearFlag.split("=")[1].split(",").filter(Boolean) : [])
      : []
  );
  if (clearSet.has("journal")) {
    console.warn("SAFETY: removing 'journal' from --clear set (never clear journal).");
    clearSet.delete("journal");
  }

  console.log("Connecting to Firebase project:", env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  await signInAnonymously(getAuth(app));

  if (clearSet.size) {
    console.log("Will clear & re-seed collection(s):", [...clearSet].join(", "));
  }
  const activeJobs =
    clearSet.size > 0 && !seedAll
      ? JOBS.filter(({ collection: col }) => clearSet.has(col))
      : JOBS;

  for (const { collection, file } of activeJobs) {
    const path = join(DATA_DIR, file);
    if (!existsSync(path)) {
      console.log(`  (skip) ${file} not found`);
      continue;
    }
    const items = JSON.parse(readFileSync(path, "utf-8"));
    console.log(`Processing ${collection} (${items.length} items)...`);
    try {
      if (clearSet.has(collection)) await clearCollection(collection);
      await seed(collection, items);
    } catch (e) {
      console.error(`  FAILED ${collection}:`, e?.message || e);
    }
  }
  console.log("\nDone.");
  process.exit(0);
}

main();

