"""Build the Vietnamese meanings for Scrabble with Love's "Từ điển" page.

Source: Vietnamese Wiktionary (vi.wiktionary.org, CC BY-SA 4.0), as extracted
by Wiktextract at kaikki.org. Download it first (~33 MB, not committed):

    curl -o /tmp/vi-extract.jsonl.gz https://kaikki.org/dictionary/downloads/vi/vi-extract.jsonl.gz
    python3 scripts/build_vi_dict.py /tmp/vi-extract.jsonl.gz

Writes public/words/vi/<a-z>.json — one file per first letter, so the page
only downloads the letters it needs. Each maps a CEL word to:
    {"m": [[part_of_speech, [meaning, ...]], ...]}   own meanings, or
    {"b": "walk", "n": "Quá khứ ... của walk"}         a form of a base word
                                                      (the page shows the base's meanings)
"""

import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CEL = ROOT / "public/words/cel.txt"
OUT = ROOT / "public/words/vi"
MAX_POS = 2  # parts of speech kept per word
MAX_GLOSSES = 3  # meanings kept per part of speech

# Glosses that only say "past tense of walk" / "plural of cat".
FORM_GLOSS = re.compile(r"(?:của|of)\s+([a-z]+)\s*\.?\s*$", re.IGNORECASE)


def guess_bases(word: str) -> list[str]:
    """Simple English inflection guesses: cats→cat, tried→try, running→run."""
    c = []
    if word.endswith("ies"):
        c.append(word[:-3] + "y")
    if word.endswith("es"):
        c.append(word[:-2])
    if word.endswith("s"):
        c.append(word[:-1])
    if word.endswith("ied"):
        c.append(word[:-3] + "y")
    if word.endswith("ed"):
        c += [word[:-2], word[:-1]]
        if len(word) > 4 and word[-3] == word[-4]:
            c.append(word[:-3])  # stopped → stop
    if word.endswith("ing"):
        c += [word[:-3], word[:-3] + "e"]
        if len(word) > 5 and word[-4] == word[-5]:
            c.append(word[:-4])  # running → run
    if word.endswith("ier"):
        c.append(word[:-3] + "y")
    if word.endswith("iest"):
        c.append(word[:-4] + "y")
    if word.endswith("er"):
        c += [word[:-2], word[:-1]]
    if word.endswith("est"):
        c += [word[:-3], word[:-2]]
    return c


def main(source: str) -> None:
    cel = set(CEL.read_text().split())
    meanings: dict[str, list] = defaultdict(list)  # word -> [[pos, [glosses]]]
    form_of: dict[str, str] = {}  # word -> base word Wiktionary names
    form_note: dict[str, str] = {}  # word -> "Quá khứ ... của walk"

    with gzip.open(source, "rt", encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line)
            if entry.get("lang_code") != "en":
                continue
            word = entry.get("word", "").lower()
            if word not in cel:
                continue
            glosses = []
            for sense in entry.get("senses", []):
                for fo in sense.get("form_of") or []:
                    if fo.get("word"):
                        form_of.setdefault(word, fo["word"].lower())
                for g in sense.get("glosses", []):
                    g = g.strip()
                    if not g:
                        continue
                    m = FORM_GLOSS.search(g)
                    if m and len(g) < 80:
                        form_note.setdefault(word, g)
                        form_of.setdefault(word, m.group(1).lower())
                    else:
                        glosses.append(g)
            if glosses:
                pos = entry.get("pos_title") or entry.get("pos") or ""
                meanings[word].append([pos, glosses[:MAX_GLOSSES]])

    out: dict[str, dict] = {}
    counts = {"own": 0, "base": 0, "none": 0}
    for word in sorted(cel):
        base = form_of.get(word)
        if base and base != word and base in meanings:
            # A form of another word: point at the base (its meanings are richer
            # than e.g. the acronym sense Wiktionary lists for "cats").
            out[word] = {"b": base, **({"n": form_note[word]} if word in form_note else {})}
            counts["base"] += 1
        elif word in meanings:
            out[word] = {"m": meanings[word][:MAX_POS]}
            counts["own"] += 1
        else:
            guess = next((b for b in guess_bases(word) if b != word and b in meanings), None)
            if guess:
                out[word] = {"b": guess}
                counts["base"] += 1
            else:
                counts["none"] += 1

    OUT.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict] = defaultdict(dict)
    for word, value in out.items():
        shards[word[0]][word] = value
    total = 0
    for letter in "abcdefghijklmnopqrstuvwxyz":
        data = json.dumps(shards.get(letter, {}), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        (OUT / f"{letter}.json").write_text(data, encoding="utf-8")
        total += len(data.encode())
    print(
        f"{len(cel)} CEL words: {counts['own']} with meanings, {counts['base']} via a base word, "
        f"{counts['none']} without — {total / 1e6:.1f} MB in {OUT.relative_to(ROOT)}/"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
