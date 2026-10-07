"""Mix two Vietnamese dictionaries so more CEL words have a meaning.

Sources, in order:
  1. Textbook Anh–Việt list (exact "@word /pronunciation/" entries only).
     Default path: /tmp/en-vi.txt
     https://github.com/manhminno/English-Vietnamese-Dictionary
  2. The Wiktionary files already in public/words/vi/ (CC BY-SA 4.0).
  3. A stem guess (cities → city) when the base has its own meanings.

Phrases ("@left wing") and the no-pronunciation technical glossary are skipped,
so they cannot overwrite "left" or "number".

    python3 scripts/mix_vi_dict.py /tmp/en-vi.txt

Writes public/words/vi/<a-z>.json in the same shape the page already reads.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CEL_PATH = ROOT / "public/words/cel.txt"
OUT = ROOT / "public/words/vi"
MAX_POS = 4
MAX_GLOSSES = 2
MAX_GLOSS_CHARS = 180

XEM = re.compile(r"^Xem\s+([a-z]+)\.?$", re.IGNORECASE)
VI_LETTER = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.IGNORECASE)


def guess_bases(word: str) -> list[str]:
    c = []
    if word.endswith("ies") and len(word) > 4:
        c.append(word[:-3] + "y")
    if word.endswith("es") and len(word) > 3:
        c.append(word[:-2])
    if word.endswith("s") and len(word) > 2:
        c.append(word[:-1])
    if word.endswith("ied") and len(word) > 4:
        c.append(word[:-3] + "y")
    if word.endswith("ed") and len(word) > 3:
        c += [word[:-2], word[:-1]]
        if len(word) > 4 and word[-3] == word[-4]:
            c.append(word[:-3])
    if word.endswith("ing") and len(word) > 4:
        c += [word[:-3], word[:-3] + "e"]
        if len(word) > 5 and word[-4] == word[-5]:
            c.append(word[:-4])
    if word.endswith("ier") and len(word) > 4:
        c.append(word[:-3] + "y")
    if word.endswith("iest") and len(word) > 5:
        c.append(word[:-4] + "y")
    if word.endswith("er") and len(word) > 3:
        c += [word[:-2], word[:-1]]
    if word.endswith("est") and len(word) > 4:
        c += [word[:-3], word[:-2]]
    seen = []
    for base in c:
        if base != word and base not in seen:
            seen.append(base)
    return seen


def stem_note(word: str, base: str) -> str:
    if word.endswith(("ies", "es", "s")) and not word.endswith("ss"):
        return f"Số nhiều của {base}"
    if word.endswith("ing"):
        return f"Dạng -ing của {base}"
    if word.endswith("ed"):
        return f"Quá khứ của {base}"
    return f"Một dạng của {base}"


def clean_gloss(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip(" -;")
    if len(text) > MAX_GLOSS_CHARS:
        text = text[: MAX_GLOSS_CHARS - 1].rstrip() + "…"
    return text


def usable_gloss(text: str) -> str:
    text = clean_gloss(text)
    if not text or XEM.match(text) or "/" in text:
        return ""
    # A leftover pronunciation line ("ɔ:'gʌst/") is not a meaning.
    if not VI_LETTER.search(text) and re.search(r"[ɪɛæɑɒɔʊʌəː']", text):
        return ""
    return text


def extra_bases(word: str, own: set[str]) -> str | None:
    """Strip a real suffix only when the base is a prefix of the word."""
    suffixes = (
        "ization", "isation", "izing", "ising", "ized", "ised",
        "ingly", "edly", "ally", "ily", "ness", "ments", "ment",
        "tions", "tion", "ings", "ers", "or", "ly", "ing", "es", "ed", "s",
    )
    for suf in suffixes:
        if not word.endswith(suf) or len(word) <= len(suf) + 3:
            continue
        stem = word[: -len(suf)]
        for base in (stem, stem + "e"):
            if len(base) >= 4 and word.startswith(base) and base in own:
                return base
    return None


def parse_ev(path: Path, wanted: set[str]) -> dict[str, list]:
    """Exact @word /pron/ headings only. First one wins."""
    found: dict[str, list] = {}
    word = None
    pos = ""
    groups: list[list] = []
    glosses: list[str] = []

    def flush():
        nonlocal word, pos, groups, glosses
        if glosses:
            groups.append([pos, glosses[:MAX_GLOSSES]])
        groups = [g for g in groups if g[1]]
        if word and word not in found and groups:
            found[word] = groups[:MAX_POS]
        word = None
        pos = ""
        groups = []
        glosses = []

    with path.open(encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("@"):
                flush()
                head = line[1:].strip()
                parts = head.split()
                if not parts:
                    continue
                token = parts[0].split("/")[0].lower()
                rest = head[len(parts[0]) :].lstrip()
                # "@left /left/" yes. "@left wing" and "@number" (no pron) no.
                if token not in wanted or not rest.startswith("/"):
                    continue
                word = token
                pos = ""
                groups = []
                glosses = []
                continue
            if word is None:
                continue
            if line.startswith("*"):
                if glosses:
                    groups.append([pos, glosses[:MAX_GLOSSES]])
                    glosses = []
                pos = re.sub(r"\s+", " ", line[1:]).strip()
                continue
            if line.startswith("-") and not line.startswith("--"):
                gloss = usable_gloss(line[1:])
                if gloss:
                    glosses.append(gloss)
                continue
            # "=", "!" examples and phrasal verbs: skip
    flush()
    return found


def load_wiki() -> dict[str, dict]:
    entries = {}
    for path in sorted(OUT.glob("*.json")):
        if path.name == "SOURCE.md":
            continue
        if path.suffix != ".json":
            continue
        entries.update(json.loads(path.read_text(encoding="utf-8")))
    return entries


def wiki_senses(entry: dict) -> list | None:
    groups = entry.get("m")
    if not groups:
        return None
    kept = []
    for pos, glosses in groups:
        real = [g for g in glosses if g and not XEM.match(g.strip())]
        if real:
            kept.append([pos, real[:MAX_GLOSSES]])
    return kept[:MAX_POS] or None


def main(ev_path: str) -> None:
    cel = set(CEL_PATH.read_text().split())
    ev = parse_ev(Path(ev_path), cel)
    wiki = load_wiki()

    own: dict[str, list] = {}
    for word in cel:
        if word in ev:
            own[word] = ev[word]
        else:
            senses = wiki_senses(wiki.get(word, {}))
            if senses:
                own[word] = senses

    # "Xem walk" with no real gloss: point at walk once walk has meanings.
    xem_of: dict[str, str] = {}
    for word, entry in wiki.items():
        if word in own or word not in cel:
            continue
        for _pos, glosses in entry.get("m") or []:
            for gloss in glosses:
                m = XEM.match(gloss.strip())
                if m and m.group(1) in own:
                    xem_of[word] = m.group(1)
                    break

    own_keys = set(own)
    out: dict[str, dict] = {}
    counts = {"ev": 0, "wiki": 0, "base": 0, "stem": 0, "none": 0}
    for word in sorted(cel):
        if word in ev:
            out[word] = {"m": own[word]}
            counts["ev"] += 1
            continue
        if word in own:
            out[word] = {"m": own[word]}
            counts["wiki"] += 1
            continue
        base = (wiki.get(word) or {}).get("b")
        note = (wiki.get(word) or {}).get("n")
        kind = "base"
        if not (isinstance(base, str) and base in own_keys):
            base = xem_of.get(word)
            note = f"Xem {base}" if base else None
        if not (isinstance(base, str) and base in own_keys):
            base = next((b for b in guess_bases(word) if b in own_keys), None)
            note = stem_note(word, base) if base else None
            kind = "stem"
        if not (isinstance(base, str) and base in own_keys):
            base = extra_bases(word, own_keys)
            note = stem_note(word, base) if base else None
            kind = "stem"
        if isinstance(base, str) and base in own_keys:
            item = {"b": base}
            if note:
                item["n"] = note
            out[word] = item
            counts[kind] += 1
        else:
            counts["none"] += 1

    shards: dict[str, dict] = defaultdict(dict)
    for word, value in out.items():
        shards[word[0]][word] = value
    total = 0
    for letter in "abcdefghijklmnopqrstuvwxyz":
        data = json.dumps(shards.get(letter, {}), ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        (OUT / f"{letter}.json").write_text(data, encoding="utf-8")
        total += len(data.encode())

    covered = len(cel) - counts["none"]
    print(
        f"{len(cel)} CEL words: {counts['ev']} from Anh–Việt, {counts['wiki']} from Wiktionary, "
        f"{counts['base']} via a saved base, {counts['stem']} via a stem guess, "
        f"{counts['none']} with no meaning — {covered / len(cel) * 100:.1f}% covered, "
        f"{total / 1e6:.1f} MB"
    )
    for sample in ["left", "number", "polish", "august", "cities", "qi", "za", "love"]:
        print(sample, json.dumps(out.get(sample), ensure_ascii=False)[:240])


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
