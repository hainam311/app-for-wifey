// Vietnamese meanings for played words (the "Từ điển" page). Built from the
// Vietnamese Wiktionary by scripts/build_vi_dict.py into one file per first
// letter (public/words/vi/<letter>.json, CC BY-SA 4.0 — see SOURCE.md there),
// so a game only downloads the letters its words start with.

type Entry = {
  m?: [pos: string, meanings: string[]][]; // own meanings
  b?: string; // …or a form of this base word ("walked" → "walk")
  n?: string; // how it's related ("Quá khứ … của walk")
};

export type WordMeaning = {
  senses: [pos: string, meanings: string[]][];
  base?: string; // set when the senses are the base word's
  note?: string;
};

const shards = new Map<string, Promise<Record<string, Entry>>>();

function shard(letter: string): Promise<Record<string, Entry>> {
  let loading = shards.get(letter);
  if (!loading) {
    loading = fetch(`/words/vi/${letter}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Meanings ${letter}: HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        shards.delete(letter); // let the next lookup try again
        throw err;
      });
    shards.set(letter, loading);
  }
  return loading;
}

async function entries(words: string[]): Promise<Map<string, Entry>> {
  const letters = [...new Set(words.map((w) => w[0]).filter((l) => l >= "a" && l <= "z"))];
  const loaded = await Promise.all(letters.map(shard));
  const found = new Map<string, Entry>();
  for (const w of words) {
    const entry = loaded[letters.indexOf(w[0])]?.[w];
    if (entry) found.set(w, entry);
  }
  return found;
}

// Lowercase words in, their meanings out (null = not in the dictionary).
export async function lookupMeanings(words: string[]): Promise<Map<string, WordMeaning | null>> {
  const own = await entries(words);
  const bases = await entries([...new Set([...own.values()].flatMap((e) => (e.b ? [e.b] : [])))]);
  const result = new Map<string, WordMeaning | null>();
  for (const w of words) {
    const e = own.get(w);
    const baseSenses = e?.b ? bases.get(e.b)?.m : undefined;
    if (e?.m) result.set(w, { senses: e.m });
    else if (e?.b && baseSenses) result.set(w, { senses: baseSenses, base: e.b, note: e.n });
    else result.set(w, null);
  }
  return result;
}
