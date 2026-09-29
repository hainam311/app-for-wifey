# Vietnamese meanings — source and license

The files in this folder (`a.json` … `z.json`) hold Vietnamese meanings for
the words in `../cel.txt`. They are derived from the **Vietnamese Wiktionary**
(https://vi.wiktionary.org), as extracted by Wiktextract
(https://kaikki.org/dictionary/rawdata.html, file `vi-extract.jsonl.gz`).

Wiktionary content is licensed under the **Creative Commons
Attribution-ShareAlike 4.0 International License (CC BY-SA 4.0)**:
https://creativecommons.org/licenses/by-sa/4.0/

Changes made: only English entries whose word is in CEL were kept, trimmed to
at most 2 parts of speech and 3 meanings each; inflected forms point to their
base word. These files are shared under the same CC BY-SA 4.0 license.

Rebuild with `scripts/build_vi_dict.py`.
