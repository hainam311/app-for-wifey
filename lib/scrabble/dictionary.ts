import type { IsWord } from "./engine";

// Scrabble with Love's word list: CEL, the Common English Lexicon
// (github.com/Fj00/CEL, MIT — see public/words/CEL-LICENSE.md). 2–15 letters,
// lowercase, one word per line, ~68k words. Common words only, so every word
// played is one worth learning.
export const WORDS_URL = "/words/cel.txt";

let loading: Promise<Set<string>> | null = null;

// Fetched once per page session and shared by every caller. The file is
// public (proxy.ts lets dotted paths through) — it's an open word list.
export function loadDictionary(): Promise<Set<string>> {
  loading ??= fetch(WORDS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Word list: HTTP ${res.status}`);
      return res.text();
    })
    .then((text) => new Set(text.split("\n").map((w) => w.trim()).filter(Boolean)))
    .catch((err) => {
      loading = null; // let the next call try again
      throw err;
    });
  return loading;
}

// The engine's `isWord` for a loaded word list (it passes lowercase words).
export const isWordIn =
  (words: Set<string>): IsWord =>
  (word) =>
    words.has(word);
