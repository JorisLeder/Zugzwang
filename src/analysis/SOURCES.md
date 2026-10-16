# Sources of the analysis formulas and data (WP-02)

Formulas are facts; they were re-implemented in TypeScript from the sources below (no Lichess code is copied).
All files were fetched from GitHub raw on 2026-10-16 at the pinned commits (`git ls-remote … HEAD`).

| Repository | Licence | Commit |
|---|---|---|
| [lichess-org/lila](https://github.com/lichess-org/lila) | AGPL-3.0 | `a747c3a12929641fa26d6d084c547059b6c310b3` |
| [lichess-org/scalachess](https://github.com/lichess-org/scalachess) (`WinPercent` and `Divider` moved here from lila) | MIT | `e3f7eb8f73a268f668d70e594e8f2426d8614881` |
| [lichess-org/scalalib](https://github.com/lichess-org/scalalib) (`Maths`) | MIT | `dc0924011e0b7a66ebdab381beab6629c1c15b71` |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | CC0-1.0 | `a6189a30dc273ccb21fc2536a9a2fefd5592a67a` |

## 1. Win percentage – `winPercent.ts`

Source: <https://raw.githubusercontent.com/lichess-org/scalachess/e3f7eb8f73a268f668d70e594e8f2426d8614881/core/src/main/scala/eval.scala>
(`object WinPercent`, `Eval.Cp.CEILING`, `Score.mated`).

- `winningChances(cp) = 2 / (1 + e^(−0.00368208 · cp)) − 1`, clamped to [−1, 1] (multiplier from lila PR #11148).
- `W(cp) = 50 + 50 · winningChances(cp)` with cp clamped to **±1000** (`Cp.CEILING`) – so W ∈ [2.456, 97.544].
- Mate: `fromMate(m) = fromCentiPawns(±1000)`, + when the side of the point of view mates; `Mate(0)` = the side to
  move is mated (a loss). Our contract has the same meaning for `{ type: 'mate', value: 0 }` (CONVENTIONS §15).
- Property from `test-kit/src/test/scala/ScoreTest.scala`: W(score) + W(inverted score) = 100.

Test values (`winPercent.test.ts`, computed independently in Python from the formula):

| cp | W |
|---|---|
| 0 | 50 |
| 15 | 51.380429102931544 |
| 100 | 59.10258971916128 |
| −100 | 40.89741028083871 |
| 300 | 75.11255009383484 |
| 1000 (and 5000) | 97.54474363414323 |
| −1000 | 2.4552563658567763 |

## 2. Move accuracy – `accuracy.ts` `moveAccuracy`

Source: <https://raw.githubusercontent.com/lichess-org/lila/a747c3a12929641fa26d6d084c547059b6c310b3/modules/analyse/src/main/AccuracyPercent.scala>
(`fromWinPercents`).

- If the mover's win% did not drop (after ≥ before): **100**.
- Otherwise `103.1668100711649 · e^(−0.04354415386753951 · (before − after)) − 3.166924740191411`, **+ 1**
  ("uncertainty bonus (due to imperfect analysis)" – confirmed in the source, therefore applied), clamped to 0–100.
  The PRD/BACKLOG values 103.1668 / 0.04354 / 3.1669 are these constants rounded.

Test values: (60 → 50) = 64.57982845372067, (55 → 54) = 96.60397651008962, (70 → 30) = 15.909002002130041,
(97.5 → 2.5) = 0, (50 → 50) = 100.

## 3. Game accuracy – `accuracy.ts` `gameAccuracy`

Sources: `AccuracyPercent.scala` (`gameAccuracy`, "a mean of volatility-weighted mean and harmonic mean") and
<https://raw.githubusercontent.com/lichess-org/scalalib/dc0924011e0b7a66ebdab381beab6629c1c15b71/lila/src/main/scala/Maths.scala>
(`standardDeviation` = population SD, `harmonicMean` with every value floored at 1 via `max(1, v)`,
`weightedMean`). Mate evaluations enter through `forceAsCp`
(<https://raw.githubusercontent.com/lichess-org/lila/a747c3a12929641fa26d6d084c547059b6c310b3/modules/tree/src/main/eval.scala>),
i.e. ±1000 cp after the ceiling – the same as `scoreWinPercent`.

Procedure: win% (White) of the start position and of the position after every ply; window size
`⌊plies / 10⌋` clamped to 2…8; the first `windowSize − 2` moves reuse the first window, then sliding windows; the
weight of a move = population SD of its window, clamped to 0.5…12; per side
`(weighted mean of move accuracies + harmonic mean of move accuracies) / 2`; `null` if a side has no move.

Test values = all cases of
<https://raw.githubusercontent.com/lichess-org/lila/a747c3a12929641fa26d6d084c547059b6c310b3/modules/analyse/src/test/AccuracyPercentTest.scala>
with their tolerances (initial eval +15 cp, `cps` = evaluation after each ply), plus the exact values of our port:

| Case (lila test name) | lila expects | ours |
|---|---|---|
| two good moves | 100 ± 1 / 100 ± 1 | 100 / 100 |
| white blunders on first move (−900, −900) | W 10 ± 5, B 100 ± 1 | 10.664056896199494 / 100 |
| black blunders on first move (15, 900) | W 100 ± 1, B 10 ± 5 | 100 / 12.303138647232768 |
| both blunder (−900, 0) | 10 ± 5 / 10 ± 5 | 10.664 / 11.459 |
| 20 perfect moves and a white blunder | W 50 ± 5 | 46.85340283303507 |
| 21 perfect moves and a black blunder | B 50 ± 5 | 49.387960289369005 |
| 5 and 50 average moves (−50, 15) | 76 ± 8 | 77.38304879688927 |
| 50 mediocre moves (−135, 15) | 54 ± 8 | 55.000662133465504 |
| 50 terrible moves (−435, 15) | 20 ± 8 | 20.694584448304802 |
| black moves first (four cases) | as above, colours swapped | as above |

**Documented difference in the pipeline:** lila uses a fixed +15 cp for the initial position. `analyseGame` passes
the engine evaluation of the actual start position instead (games may start from any FEN); the pure function
reproduces lila exactly when given +15 cp (the tests do).

## 4. Game phases – `phase.ts`

Sources: <https://raw.githubusercontent.com/lichess-org/scalachess/e3f7eb8f73a268f668d70e594e8f2426d8614881/core/src/main/scala/Divider.scala>
(MIT, Copyright (c) Thibault Duplessis) and the phase rule of `AccuracyPercent.phaseAccuracies` (lila).

- Middlegame: first position (before a move) with ≤ 10 minor + major pieces, or fewer than 4 White pieces on rank 1
  / Black pieces on rank 8, or "mixedness" > 150 (sum of a score table over the 49 overlapping 2×2 regions; the
  table is ported 1:1).
- Endgame (only after a middlegame was found): first position with ≤ 6 minor + major pieces; the middlegame index
  is dropped if it is not before the endgame index.
- A ply p is `opening` if p < middle, `endgame` if end ≤ p, otherwise `middlegame`.

Test values: the seven games of
<https://raw.githubusercontent.com/lichess-org/scalachess/e3f7eb8f73a268f668d70e594e8f2426d8614881/test-kit/src/test/scala/DividerTest.scala>
with their asserted ranges (e.g. game 1: middle 18–40, end 50–65; game 7: middle 19–25, no endgame).

## 5. Opening book – `openings/openings.json`

Source: `a.tsv` … `e.tsv` of <https://github.com/lichess-org/chess-openings/tree/a6189a30dc273ccb21fc2536a9a2fefd5592a67a>
("As a collection of facts, this data set is in the public domain … released under the CC0 Public Domain
Dedication", README). Built by `npm run openings:build` (`scripts/openings/build.ts`): 3,865 lines replayed with
chess.js via `@/lib/chess`, 7,982 book positions (3,865 named final positions plus every intermediate position of
a line, which carries the name of the deepest named position before it). Source, commit and licence are stored in
the JSON itself (`source`, `commit`, `license`).

Book rule (D-07): a move is "book" while every position the game reached after a move is a book position.

## 6. Lichess cloud-eval – `src/engine/cloudEval.ts`

lila `conf/routes` (`GET /api/cloud-eval` → `controllers.Api.cloudEval`), `app/controllers/Api.scala` (params `fen`,
`multiPv`; 404 "No cloud evaluation available for that position"; rate limit → 429) and
`modules/evalCache/src/main/JsonView.scala` (`{ fen, knodes, depth, pvs: [{ moves, cp | mate }] }`, scores from
`pv.score.white` – **White's point of view**), all at lila commit `a747c3a1…`. The endpoint itself is not reachable
from the build environment (CONSTRAINTS §2); the provider is tested with a mocked `fetch`.

## 7. Values chosen by WP-02 (not from Lichess)

- Classification thresholds and rules: D-07 (`classify.ts`). "Real piece sacrifice": the worst net SEE result for the
  mover's knights/bishops/rooks/queens after the move, counting the material the move captured (so an even trade is
  no sacrifice).
- Expected-points loss of the engine's own best move is 0 ("EP(played) = EP(best)").
- Key moments: the ≤ 5 largest losses ≥ 0.10, in game order (fewer only if the game has fewer).
- Search budget: see `service.ts` (`DEFAULT_ANALYSIS_OPTIONS`) and `src/engine/budget.ts`.
