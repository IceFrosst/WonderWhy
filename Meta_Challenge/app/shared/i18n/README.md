# i18n: translated explanation text

Translations of the text in [objects.json](../objects.json): `fi`, `sv`, `de`, `es`, `fr` (English is the source).
Format per file: `_note`, `lang`, `unknown_label`, `lens_names{}`, `objects{<id>: {label, answer, chapters{<lens>: {title, lead?, captions[]}}}}`.
Keys (object ids, lens kinds) are never translated. `lead` exists only where the English chapter has one.
Numbers, units and symbols are kept exactly as in English, decimal point included.
All five files are machine-translated (14 Nov 2026) and need a native-speaker check before they are shown to judges.
Check them: `node Meta_Challenge/app/shared/i18n/check.mjs` from the repo root (exit code 1 on any problem).
The checker compares with objects.json: missing or extra objects, lenses and captions, empty strings, lost numbers, captions over 40% longer, mojibake, `lang` vs file name.
Add a language: copy `fi.json` to `<code>.json`, set `lang`, translate every string, run the checker.
When objects.json changes, update all five files and run the checker again.
Not translated yet: text drawn inside scenes, stills and clips (labels in the drawings stay English).
