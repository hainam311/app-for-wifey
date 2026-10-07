"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { onSnapshot } from "firebase/firestore";
import { authReady } from "@/lib/firebase";
import { gameRef } from "@/lib/scrabble/gameDoc";
import { lookupMeanings, type WordMeaning } from "@/lib/scrabble/meanings";
import type { Player, ScrabbleState } from "@/lib/scrabble/engine";

// Từ điển: every word placed in the current game, newest first, with its
// Vietnamese meaning. Live — a word the other phone plays shows up here too.

const NAME: Record<Player, string> = { nam: "Nam", linh: "Linh" };
const ICON: Record<Player, string> = { nam: "🐻", linh: "🧸" };

type Played = { word: string; by: Player; score: number };

// Unique words from the game's plays (main + cross words), newest first.
function playedWords(game: ScrabbleState): Played[] {
  const seen = new Set<string>();
  const list: Played[] = [];
  for (const move of [...game.history].reverse()) {
    for (const w of move.words ?? []) {
      const word = w.word.toLowerCase();
      if (seen.has(word)) continue;
      seen.add(word);
      list.push({ word, by: move.by, score: w.score });
    }
  }
  return list;
}

export default function TuDienPage() {
  const [game, setGame] = useState<ScrabbleState | null | undefined>(undefined); // null = no game yet
  const [meanings, setMeanings] = useState<Map<string, WordMeaning | null>>(new Map());
  const [error, setError] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(gameRef, (snap) => setGame(snap.exists() ? (snap.data() as ScrabbleState) : null));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const words = game ? playedWords(game) : [];
  const wordKey = words.map((w) => w.word).join(",");

  // Look up meanings whenever new words appear (downloads only the needed letters).
  useEffect(() => {
    if (!wordKey) return;
    let cancelled = false;
    lookupMeanings(wordKey.split(","))
      .then((found) => {
        if (!cancelled) setMeanings(found);
      })
      .catch((err) => {
        console.error("Could not load meanings:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wordKey]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
      <Link
        href="/scrabble"
        className="self-end rounded-full border border-pink-200 bg-white px-4 py-1.5 text-sm text-pink-500 active:scale-95"
      >
        ← Quay lại ván
      </Link>
      <h1 className="text-center text-3xl font-bold text-zinc-800">Từ điển 📖</h1>
      <p className="-mt-2 text-center text-sm text-gray-500">Nghĩa của các từ trên bàn, mới nhất trước</p>

      {game === undefined ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : words.length === 0 ? (
        <p className="py-12 text-center text-gray-400">Chưa có từ nào trên bàn. Đánh chữ đầu tiên đi nè 💌</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {words.map(({ word, by, score }) => {
            const meaning = meanings.get(word);
            return (
              <li key={word} className="rounded-2xl border border-pink-100 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold tracking-wide text-zinc-800">{word.toUpperCase()}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {ICON[by]} {NAME[by]} · +{score}
                  </span>
                </div>
                {meaning === undefined ? (
                  <p className="mt-1 text-sm text-gray-400">
                    {error ? "Không tải được nghĩa, thử mở lại trang nhé 🥺" : "Đang tra..."}
                  </p>
                ) : meaning === null ? (
                  <p className="mt-1 text-sm text-gray-400">
                    Chưa có nghĩa trong từ điển 🥺 ·{" "}
                    <a
                      href={`https://translate.google.com/?sl=en&tl=vi&text=${encodeURIComponent(word)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-500 underline"
                    >
                      Tra Google Dịch ↗
                    </a>
                  </p>
                ) : (
                  <div className="mt-1 flex flex-col gap-1.5 text-sm text-zinc-700">
                    {meaning.base && (
                      // e.g. "Quá khứ và phân từ quá khứ của walk. Nghĩa của WALK:"
                      <p className="text-gray-500 italic">
                        {meaning.note ? meaning.note.replace(/\.?\s*$/, ".") : "Một dạng khác của từ gốc."} Nghĩa
                        của <span className="font-semibold not-italic">{meaning.base.toUpperCase()}</span>:
                      </p>
                    )}
                    {/* A word can have the same part of speech twice (two unrelated nouns) */}
                    {meaning.senses.map(([pos, glosses], i) => (
                      <div key={i}>
                        {pos && <span className="text-xs font-semibold text-pink-500">{pos}</span>}
                        <ol className="list-inside list-decimal">
                          {glosses.map((g, j) => (
                            <li key={j}>{g}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="pt-2 text-center text-xs text-gray-400">
        Nghĩa từ từ điển Anh-Việt và{" "}
        <a href="https://vi.wiktionary.org" target="_blank" rel="noopener noreferrer" className="underline">
          Wiktionary tiếng Việt
        </a>{" "}
        (
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          CC BY-SA 4.0
        </a>
        )
      </p>
    </main>
  );
}
