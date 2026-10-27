# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # local dev server
npm run build    # production build (also the type-check — there is no separate tsc script)
npm run lint     # eslint (flat config, next core-web-vitals + typescript)

python3 scripts/export_excel.py    # Excel workbook → scripts/data/{foods,trips,wishlist,journal}.json
node scripts/seed.mjs              # append JSON in scripts/data/ into Firestore (never deletes)
node scripts/seed.mjs --clear=foods,trips   # wipe ONLY the named collections first, then seed
python3 scripts/build_vi_dict.py <vi-extract.jsonl.gz>  # rebuild public/words/vi/*.json (Scrabble Từ điển meanings; download URL in the script)
```

There is no test framework or test script; `node_modules/.bin/jiti scripts/caro-check.ts` and `node_modules/.bin/jiti scripts/tank-check.ts` run the Cờ caro and Bắn tăng rules checks. Deploys happen via `git push` (Vercel auto-builds from GitHub).

## Architecture

A small private 2-person Next.js 16 (App Router, React 19, Tailwind v4) app. **There is no backend of our own**: client pages talk directly to Firebase Firestore via the JS SDK, and Vercel only serves the frontend. UI copy is Vietnamese.

**Two security layers — keep both intact when adding pages:**
1. **Page gate + identity** — `proxy.ts` (Next 16's renamed middleware) redirects every request without a valid signed `app_wifey_who` cookie to `/lock` (except `/lock`, `/api/*`, `/_next/*`, and paths containing a `.`). Nam and Linh each have their own passcode: `/lock` POSTs to `app/api/unlock/route.ts`, which uses `lib/session.ts` to find whose code it is and set a 180-day httpOnly cookie `nam|linh.<HMAC>` (`WHO_MAX_AGE`). Client code gets the current person from the `useMe()` hook (`lib/useMe.ts` → `GET /api/me`); `lib/session.ts` is server-only (`node:crypto`), so client files import only its `Who` type. Wrong passcodes are rate-limited by `lib/unlockLimiter.ts` (5 per IP / 10 min, 30 app-wide / 1 h → 15 min lock, counters in Firestore `unlock_attempts` via a separate server-side anonymous Firebase app; fails closed with 503 if Firestore is unreachable). Identity is app-level only: Firestore still sees anonymous users. New routes are gated automatically.
2. **Data gate** — Firestore Security Rules require `request.auth != null`. `lib/firebase.ts` signs every browser in anonymously and exports `authReady`.

**Page pattern** (every data page under `app/*/page.tsx` follows it; `app/drink-prefs/page.tsx` is the fullest example with add/edit): `"use client"`, then in `useEffect` await `authReady` (guarding with a `cancelled` flag), then subscribe via `onSnapshot(query(collection(db, "<name>"), ...))` and return the unsubscribe. Writes go straight to Firestore (`addDoc`/`updateDoc`/`increment`), not local state — realtime sync between the two phones depends on this. Skipping `authReady` causes `permission-denied` on a device's first visit.

**Firestore collections:** `foods`, `todos`, `wishlist`, `trips`, `journal`, `shop_prefs` (drink-prefs page), `memory_game` (single doc `shared` for the `/game` memory match; rules are pure functions in `lib/memoryGame.ts` and every move is a `runTransaction` so two phones can't race), `scrabble_game` (single doc `shared` for `/scrabble`, same pattern: pure rules in `lib/scrabble/engine.ts`, word list `public/words/cel.txt`; `/scrabble/tu-dien` reads it to show Vietnamese meanings from `public/words/vi/`, CC BY-SA), `caro_game` (single doc `shared` for `/caro`, same pattern: pure rules in `lib/caro/engine.ts`), `tank_game` (single doc `shared` for `/tank`, same pattern: pure rules and physics in `lib/tank/engine.ts` and `lib/tank/terrain.ts`; the shooter's browser is the referee and writes the result + flat shell `path`, the other screen only replays it; mobiles are cosmetic sprites in `public/tanks/samples/`; `?hotseat=1` plays both sides on one screen **against the live doc**), plus server-only `unlock_attempts` (lockout counters; never read or written from pages). New collections need no rule changes. `lib/foodData.ts` holds the `Food` type + `CATEGORIES`; `lib/drinkPrefs.ts` is a legacy static backup that no page reads.

**Home-screen web app:** `app/manifest.ts` + `appleWebApp`/`viewport` metadata in `app/layout.tsx` (`viewportFit: "cover"`, no zoom) and `env(safe-area-inset-*)` padding in `app/globals.css`. Full-screen pages (like `/tank`, which hides `BackHome` and rotates itself to landscape on portrait screens) must handle safe areas themselves.

**Env:** `.env.local` (gitignored) holds the six `NEXT_PUBLIC_FIREBASE_*` keys plus the server-only `NAM_PASSCODE`, `LINH_PASSCODE` and `SESSION_SECRET` (rotating the secret logs every phone out); `seed.mjs` parses it directly. Production values live in Vercel env settings.

## Data seeding — caution

- `journal` is user-generated in the app and exists only in Firestore. **Never `--clear=journal`** without first backing up live entries — a blanket clear once destroyed real posts. `scripts/data/journal_live_backup_2026.json` holds app-made posts not in `journal.json`.
- `export_excel.py` walks up to find `Bản sao của Eat.xlsx` (in the parent workspace dir). Drinks need a separate extractor because numeric place names are valid there, while numeric cells in Breakfast/Lunch are junk subtotals.
- `shopPrefs.json` is hand-maintained (not produced by the export script).

## Architecture docs (parent directory)

`../love-story.md` is the detailed, maintained architecture doc covering the overall architecture, authentication gate (`proxy.ts`, `/api/unlock`, `/api/me`), Home Master Tabs (`Love Story ❤️` and `Game 🎮`), and the 6 Love Story sub-features (Food, Drink Prefs, Journal, Todo, Wishlist, and Trips) across Frontend and Backend — update it when architecture or features change.
