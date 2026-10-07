"use client";
import { useSyncExternalStore } from "react";

// /scrabble?debug=1 — a small log in the corner showing when each update
// arrived and what the page was doing (asleep in the background, offline…),
// to find where slow updates come from. Off unless the URL asks for it.
// The log lives in this module, outside React, so Firestore and browser
// callbacks can write to it directly. It's kept on this device only
// (localStorage) for the whole game — phones sometimes reload a sleeping tab —
// and cleared when a new game starts. Never sent to Firestore.

export type DebugLine = { at: number; text: string };

export function debugOn(): boolean {
  try {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

// "850 ms", "2.3 s", "1 ph 4 s"
export function fmt(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} ph ${Math.round((ms % 60_000) / 1000)} s`;
}

const STORAGE_KEY = "scrabble-debug-log";
const MAX_LINES = 400; // a whole game is ~100–200 lines; this is just a safety cap
const EMPTY: DebugLine[] = [];

// The game the log belongs to: a new game has a new starter and starts at 0 moves.
type Saved = { startedBy: string; moves: number; lines: DebugLine[] };
let saved: Saved | null = null;
const listeners = new Set<() => void>();
const seen = { updatedAt: 0, hiddenAt: 0, visibleAt: 0 };

function load(): Saved {
  if (saved) return saved;
  saved = { startedBy: "", moves: 0, lines: [] };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Saved;
      if (Array.isArray(parsed.lines)) saved = parsed;
    }
  } catch {
    // storage blocked or broken: start an empty log for this visit
  }
  return saved;
}

function save(next: Saved) {
  saved = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // not kept across reloads, still shown for this visit
  }
  listeners.forEach((l) => l());
}

export function logDebug(text: string) {
  if (!debugOn()) return;
  const cur = load();
  save({ ...cur, lines: [...cur.lines, { at: Date.now(), text }].slice(-MAX_LINES) });
}

export function clearDebug() {
  const cur = load();
  save({ ...cur, lines: [] });
}

// One line per new game state. "tới sau" = now − the mover's updatedAt, so
// it includes the mover's save; the two phones' clocks may differ a little.
// A different starter or fewer moves than last seen = a new game → fresh log.
export function noteArrival(game: { updatedAt: number; startedBy: string; moves: number }, label: string, fromCache: boolean) {
  if (!debugOn() || game.updatedAt === seen.updatedAt) return;
  const { updatedAt } = game;
  const cur = load();
  if (cur.startedBy !== game.startedBy || game.moves < cur.moves) save({ startedBy: game.startedBy, moves: game.moves, lines: [] });
  else if (game.moves !== cur.moves) save({ ...cur, moves: game.moves });
  const now = Date.now();
  const first = seen.updatedAt === 0;
  seen.updatedAt = updatedAt;
  const source = fromCache ? " · từ bộ nhớ máy" : "";
  if (first) {
    logDebug(`📥 tải ván (nước cuối ${fmt(now - updatedAt)} trước)${source}`);
    return;
  }
  let wake = "";
  if (document.hidden) wake = " · trang đang ẩn";
  else if (seen.hiddenAt && seen.visibleAt > seen.hiddenAt && now - seen.visibleAt < 60_000)
    wake = ` · ${fmt(now - seen.visibleAt)} sau khi quay lại trang`;
  logDebug(`📨 ${label} → tới sau ${fmt(now - updatedAt)}${wake}${source}`);
}

// Logs the page going to sleep / waking up and the network dropping. Returns the cleanup.
export function watchPage(): () => void {
  if (!debugOn()) return () => {};
  const onVisibility = () => {
    const now = Date.now();
    if (document.hidden) {
      seen.hiddenAt = now;
      logDebug("💤 trang bị ẩn");
    } else {
      seen.visibleAt = now;
      logDebug(`👀 quay lại trang (đã ẩn ${fmt(now - seen.hiddenAt)})`);
    }
  };
  const onOnline = () => logDebug("📶 có mạng lại");
  const onOffline = () => logDebug("🚫 mất mạng");
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const clock = (t: number) => new Date(t).toLocaleTimeString("vi-VN", { hour12: false });

export default function DebugBadge() {
  const shown = useSyncExternalStore(
    subscribe,
    () => load().lines,
    () => EMPTY
  );
  return (
    // In the page flow at the very bottom (scroll down to read it), so it never covers a button.
    <div data-testid="debug-log" className="rounded-lg bg-black/80 px-2 py-1.5 font-mono text-[10px] leading-snug text-white">
      <div className="flex items-center justify-between gap-2 text-amber-300">
        <span>
          debug · ván này · {shown.length} dòng · mới nhất trên cùng · giờ 2 máy có thể lệch nhau chút
        </span>
        <button onClick={clearDebug} className="shrink-0 underline">
          xóa
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="text-gray-400">chưa có cập nhật</div>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          {shown
            .map((l, i) => (
              <div key={`${l.at}-${i}`}>
                <span className="text-gray-400">{clock(l.at)}</span> {l.text}
              </div>
            ))
            .reverse()}
        </div>
      )}
    </div>
  );
}
