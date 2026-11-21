# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Daniikhwan/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Daniikhwan/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free CSV reader that returns exactly what csv-reader 1.0.0
returns for every input — including its broken-row policy (stray CRs,
unterminated quotes, quote junk, short and long rows) — only faster.

`solve.js` exports `run(input)`, where `input` is `{text, header}` and the
answer is `{columns, rows, errors}`. `main.ts` is the house driver: it reads
every case from `/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Why it is fast

The reference reads one character at a time and builds every field with
`value += c`. This reader instead jumps with `indexOf` between delimiters and
takes each field with one `slice`, so the common paths do no per-character
work at all. A record with no quote and no stray CR is split in one C++ pass,
and the line's end is cached per record instead of searched per field. Stray
CRs, line breaks inside quotes and doubled quotes are the only cases that
build a string piece by piece, and they are rare in drawn files.

On the practice set (6 cases, ~11 MB of CSV) the entry's `run` takes ~115 ms
against the reference's ~600 ms on this machine — about 5x faster — and its
answers are identical on all 6 practice cases, on 180 freshly drawn cases,
and on 196 hand-built edge cases.

## Run it

```sh
# grade locally against the practice set (needs the competition kit)
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```

Or run the driver directly on a cases file:

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<out dir> node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=vnsny7za&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
