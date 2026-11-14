# i18n: translated explanation text

Translations of the text in [objects.json](../objects.json): `fi`, `sv`, `de`, `es`, `fr` (English is the source).
Format per file: `_note`, `lang`, `unknown_label`, `lens_names{}`, `objects{<id>: {label, answer, tagline, short, chapters{...}}}`.
Object text adds `tagline` and the one-word everyday name `short` after `answer`.
Every chapter mirrors English `knobs[]`; entries are translated labels or `null` in the same positions.
Data-driven chapters add a text-only `spec` containing translated drawing labels, units and names.
Text-only `spec` arrays preserve the English keys, lengths and order; language-neutral units stay unchanged.
Keys (object ids, lens kinds) are never translated. `lead` exists only where the English chapter has one.
Numbers, units and symbols are kept exactly as in English, decimal point included.
All five files are machine-translated (14 Nov 2026) and need a native-speaker check before they are shown to judges.
Check them: `node Meta_Challenge/app/shared/i18n/check.mjs` from the repo root (exit code 1 on any problem).
The checker compares with objects.json: object and chapter shape, captions, `tagline`, `short`, `knobs`, text-only `spec`, empty strings, lost numbers, captions over 30% longer, compact-label warnings, mojibake, and `lang` vs file name.
Add a language: copy `fi.json` to `<code>.json`, set `lang`, translate every string, run the checker.
When objects.json changes, update all five files and run the checker again.
