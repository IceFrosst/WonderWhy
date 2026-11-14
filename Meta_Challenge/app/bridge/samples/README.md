# samples/

Put test photos (`.jpg` / `.jpeg`) of the 6 library objects here (guitar, ball, bicycle, kettle, pendulum/keys, phone) plus a few unrelated ones.
The name up to the first `_` is the expected answer: `ball_1.jpg` expects `ball`, `other_stapler_1.jpg` expects `unknown`, `aim_*.jpg` is not scored.
`npm run bench` runs every photo at LOW/MEDIUM/HIGH size and prints accuracy and p50/p90. One cheap pass: `BENCH_N=1 BENCH_SIZES=MEDIUM npm run bench`. Add `BENCH_FOCUS=1` to send the centre crop as well.
Keep a `SOURCES.md` here with the licence and author of every downloaded photo.
Photos are git-ignored; only this README is tracked.
