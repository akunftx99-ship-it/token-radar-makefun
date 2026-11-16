# token-radar-makefun

A token launch radar for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty
([token-radar-01](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)).

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/akunftx99-ship-it/token-radar-makefun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/akunftx99-ship-it/token-radar-makefun/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Every protocol on DefiLlama's list that records no token yet, ranked by the value a token would imply if the
protocol's record stayed as it is, and a farm plan for each: what to do, what it costs, how long it takes.

The board is one function of the snapshot's own figures (TVL, seven-day growth, age, reach and the
category's own multiple), so no protocol name is hand-picked and a protocol the snapshot adds tomorrow is
scored the moment it appears. A frozen copy of the 758-protocol snapshot, the ranked 198-row board and the
dashboard that reads it are handed in together.

## Run it

```sh
# write the board, the dashboard's data and the dossier (Node 22 or later, no dependencies)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json

# serve the dashboard, then open http://localhost:8099/dashboard/index.html
cd out && python3 -m http.server 8099
```

`main.ts` reads `/input/snapshot.json` (or `--input`), scores the board with `lib/model.ts`, writes
`out/board.json` and `out/data.js`, copies `dashboard/` and `screenshots/` into `/output` and writes
`/output/dossier.json` with the kit's own `vendor/makefun-board.ts`.

## Layout

- `lib/model.ts`: the model, the category table and the farm plan (one function per row).
- `dashboard/index.html`, `app.css`, `app.js`: the page. Three routes (`#/`, `#/live`, `#/model`) plus
  `#/p/<slug>` for one protocol, no framework, no network request, and the implied value recomputed in the
  page from the same constants the board used.
- `shots.mjs`: takes the three screenshots with the local Chrome.
