# Puzzle scripts

Puzzles use the **Lichess format** everywhere (D-24): `fen` is the position *before* the opponent's move, `moves[0]`
is that move (the app plays it automatically), then the solver and the opponent alternate in UCI. The line ends with a
solver move. Every immediately mating solver move is accepted at runtime (D-12).

The app loads the bank from `public/data/puzzles/manifest.json` and its chunk files into the local database on first
start and whenever the manifest `version` changes (D-25, `src/puzzles/bank.ts`).

| What | Command | Owner |
| --- | --- | --- |
| Hand-written seed bank (wave 1) + the 5 demo puzzles | `npx tsx scripts/puzzles/lib/seed/build.ts` | WP-03 |
| Import of the official Lichess puzzle database | `npm run puzzles:import-lichess -- …` | WP-03 |
| Generated bank (Stockfish self-play) | `npm run puzzles:generate -- …` | WP-10 |
| Validation of every bank chunk, the demo and the fixtures | `npm run validate:content -- --only puzzles` | WP-03 |

## Lichess importer

```
npm run puzzles:import-lichess -- --input <file.csv|file.csv.zst> --out <dir> [options]
```

Source: <https://database.lichess.org/#puzzles> – `lichess_db_puzzle.csv.zst`, licence **CC0** (public domain).
`database.lichess.org` is not reachable from the build machine; run the import on a machine with access and commit or
copy the output.

| Option | Default | Meaning |
| --- | --- | --- |
| `--input <file>` | – (required) | the CSV, plain or zstd-compressed (`.zst`, decompressed while streaming with `fzstd`) |
| `--out <dir>` | – (required) | output directory for `manifest.json` and `lichess-0001.json`, `lichess-0002.json` … |
| `--min-popularity <n>` | 80 | minimum Lichess popularity (−100 … 100) |
| `--min-plays <n>` | 300 | minimum number of plays |
| `--max <n>` | 500000 | stop after `n` imported puzzles |
| `--rating-min <n>` / `--rating-max <n>` | 0 / 3500 | inclusive rating range |
| `--chunk-size <n>` | 5000 | puzzles per chunk file |
| `--csv <file>` | `<out>/puzzles.csv` | CSV for the Supabase seed |
| `--append` | off | keep the non-Lichess chunks (e.g. `seed.json`) of an existing manifest in `<out>` |

Input columns, exactly and in this order (the header line is required):
`PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`.
The Lichess file never quotes fields, so the parser treats `"` as an ordinary character: every line is one row and a
broken line cannot swallow the following rows.

What happens to each row (cheap checks first):

1. **Shape** – 10 columns, id `[A-Za-z0-9_-]`, FEN with six fields, at least two UCI moves, integer rating (0–4000),
   numeric rating deviation, integer popularity (−100 … 100) and plays. Otherwise the row is *bad*.
2. **Filters** – popularity, plays and rating range from the options. Rows that fail are *filtered* (not bad).
3. **Chess legality** (chess.js through `@/lib/chess`) – strict FEN check (`validateFen`), an even number of moves
   (the line ends with a solver move), every move legal in sequence, no game end before the last move, mate themes
   consistent with the line (`mateInN` = N solver moves, `mateIn5` = 5 or more, the last move mates). Duplicate ids
   are bad too. Otherwise the row is *bad*.

Accepted rows become puzzles with `source: 'lichess'` and no stored explanation (the app shows the rule-based
explanation, `explain.explainRuleBased`). Themes that `PUZZLE_THEMES` (`src/core/puzzles.ts`) does not know are dropped
and counted, so the output passes the validator's theme check. `GameUrl` is kept when it is a valid http(s) URL.

The run prints a summary – rows read, imported, bad rows per reason, filtered rows per filter, dropped themes – and
exits with code 1 on a fatal problem (missing file, wrong header) and 2 on invalid arguments.

Outputs:

- `<out>/manifest.json` – `{ version: 'lichess-<hash>', chunks: [{ file, count, source, sha256 }] }`; the version is
  derived from the chunk hashes, so the app re-imports only when the content changes. Earlier `lichess-*.json` files
  in `<out>` are removed first.
- `<out>/lichess-0001.json` … – arrays of puzzles (`puzzleChunkSchema`).
- the seed CSV – header `id,fen,moves,rating,rating_deviation,themes,opening_tags,popularity,nb_plays,source,explanation,game_url`
  (the `puzzles` table, `PuzzleRow` in `src/core/tables.ts`); arrays as Postgres literals (`{e2e4,e7e5}`), `explanation`
  as JSON, an empty unquoted field is `NULL`. Load it with
  `\copy puzzles (id, fen, moves, rating, rating_deviation, themes, opening_tags, popularity, nb_plays, source, explanation, game_url) from 'puzzles.csv' with (format csv, header true)`.

Examples:

```
# 20 000 popular puzzles for beginners up to 1600, next to the seed bank of the app
npm run puzzles:import-lichess -- --input ~/Downloads/lichess_db_puzzle.csv.zst --out public/data/puzzles \
  --append --rating-min 100 --rating-max 1600 --max 20000 --csv supabase/seed/puzzles-lichess.csv
npm run validate:content -- --only puzzles
```

Notes:

- When `--out` is `public/data/puzzles`, pass `--csv` with a path outside `public/`, otherwise the seed CSV is shipped
  with the app.
- The validator accepts ratings 100–3000; use `--rating-min 100 --rating-max 3000` (or narrower) for the app bank.
- The validator checks every puzzle of the manifest with Stockfish (depth 18, results cached in `.cache/validate/`).
  For a large import that takes long; `-- --quick` runs only the structural checks. Lichess solutions follow Lichess's
  own uniqueness rule, so a few puzzles may fail our ≥ 0.10 expected-points margin – remove them or narrow the import.
- The app loads the whole bank into the local database (IndexedDB); keep the app bank to a size that loads quickly
  (BACKLOG WP-10: first start ≤ 3 s).

Tests: `npx vitest run scripts/puzzles` – the importer test uses `lib/__fixtures__/lichess-sample.csv` (real Lichess
rows plus malformed, illegal, duplicate and filtered rows) and the same data as a zstd stream.

## Seed bank and demo puzzles

`lib/seed/sources.ts` holds the hand-written puzzles in SAN with German explanations (`[[SAN]]` marks a move, D-19).
`lib/seed/build.ts` converts them (`lib/seedFormat.ts`), runs the structural checks and writes
`public/data/puzzles/seed.json` + `manifest.json` and `src/puzzles/demoPuzzles.json` (the 5 puzzles of `/puzzles/demo`).
After every change run the build and `npm run validate:content -- --only puzzles` (Stockfish confirms every solution).

## Validator

`scripts/validate/puzzles.ts` (checks in `lib/puzzleChecks.ts`) validates every chunk of the manifest (file present,
sha256 and count as in the manifest, source matches, no duplicate ids), the demo puzzles and `FIXTURE_PUZZLES`:
zod schema, legal FEN, all moves legal, solver to move after `moves[0]`, rating 100–3000, known themes, an explanation
of 1–3 sentences that names only solution moves (or other immediate mates) unless the source is `lichess`, and with
Stockfish (depth 18, MultiPV 2) at every solver move: an immediate mate, or the fastest forced mate with no equally
fast alternative, or the best move by ≥ 0.10 expected points; `mateInN` themes must match the engine's mate distance.
`--quick` skips the engine checks.
