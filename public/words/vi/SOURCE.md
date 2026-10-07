# Vietnamese meanings — sources

The files in this folder (`a.json` … `z.json`) hold Vietnamese meanings for
the words in `../cel.txt`. One file per first letter, so a game only downloads
the letters it needs.

Two sources are mixed by `scripts/mix_vi_dict.py`:

1. **Anh–Việt textbook list** — exact `@word /pronunciation/` entries from
   https://github.com/manhminno/English-Vietnamese-Dictionary
   (`data/english-vietnamese.txt`). Phrases and the no-pronunciation technical
   glossary are not used. That repo has no license file; these glosses are
   kept for this private app and are not a claim that the list is free to
   republish.
2. **Vietnamese Wiktionary**, via Wiktextract
   (https://kaikki.org/dictionary/rawdata.html), for CEL words the textbook
   list does not have. Wiktionary text is **CC BY-SA 4.0**:
   https://creativecommons.org/licenses/by-sa/4.0/

A word with no entry of its own points at a base word (`cities` → `city`)
when that base has a meaning. About 14% of CEL still has neither source.

Rebuild:

    python3 scripts/mix_vi_dict.py /tmp/en-vi.txt
