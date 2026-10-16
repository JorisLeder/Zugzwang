# Status

Owner: manager. Updated after every planning, integration, review and test round.

**Current phase:** Wave 0 integrated (WP-00 + manager fixes, commit "WP-00 manager fixes"). Next step: **wave 1 –
WP-01 … WP-08 start in parallel**; in parallel the wave-0 review round (reviewer, chess-rules-auditor, designer) on the
frozen WP-00 paths.
**Target:** PRD V1 = P0-01 … P0-16 (CONSTRAINTS §1).
**Quality gates (CONSTRAINTS §5), manager run after the fixes:** typecheck 0 errors · lint 0 problems · test 29 files /
319 passed · build ok (main chunk 543 kB / 175 kB gzip, placeholders) · no `service_role`/`sk-ant` in `dist/` ·
validate:content exit 0 (no validators yet) · e2e (preview) 77 passed, 1 skipped (skip link test is desktop-only) ·
e2e dev mode (`E2E_SERVER=dev E2E_PORT=5231 --workers=2`) 77 passed, 1 skipped.

## Packages

| ID | Title | Wave | Depends on | PRD | State | Notes |
|---|---|---|---|---|---|---|
| WP-00 | Foundation | 0 | DESIGN.md | stack, IA, contracts, P0-03 (min.), P0-16 (shell) | integrated | commits c3bb5b6 + "WP-00 manager fixes"; all 12 acceptance criteria verified; review round pending (frozen paths) |
| WP-01 | Board & Analysebrett | 1 | WP-00 ✓ | P0-03, P0-16, §6 Analysebrett | ready | e2e port 5201 |
| WP-02 | Engine & analysis core | 1 | WP-00 ✓ | P0-10, P0-11 (facts), P0-08 (assessMove) | ready | bench ≤ 30 s; lazy workers (D-51) |
| WP-03 | Puzzles | 1 | WP-00 ✓ | P0-04, P0-05, P0-06, P0-01 (demo) | ready | e2e port 5203; seed bank ≥ 40 |
| WP-04 | Bots & play | 1 | WP-00 ✓ | P0-07, P0-08, P0-09, P0-03 (game rules) | ready | e2e port 5204; calibration report |
| WP-05 | Review, explanations, PGN import | 1 | WP-00 ✓ | P0-10 (UI), P0-11, P0-15, P2-01/02/06 | ready | e2e port 5205 |
| WP-06 | Lesson engine | 1 | WP-00 ✓ | P0-12, P2-04 | ready | e2e port 5206; fixture course in e2e (D-52) |
| WP-07 | Lesson content | 1 | WP-00 ✓ | P0-13 | ready | `validate:content -- --only lessons` must pass |
| WP-08 | Data layer, sync, auth (client) | 1 | WP-00 ✓ | P0-01, P0-02 | ready | e2e port 5208 |
| WP-09 | Dashboard, profile, stats, settings, onboarding, PWA | 2 | WP-01…WP-08 | P0-14, P0-16, §5, §6 | planned | e2e port 5209/5219 |
| WP-10 | Puzzle bank (generator, ≥ 600) | 2 | WP-02, WP-03, WP-05, WP-07 | P0-04, P0-05, P0-06 | planned | e2e port 5210 |
| WP-11 | Backend (Supabase) | 2 | WP-05, WP-08 | P0-01, P0-02, P0-11, P0-15, NFR security | planned | PGlite tests |
| WP-12 | Core journeys, performance, quality sweep | 3 | all | DoD, P0-16, NFR performance | planned | e2e port 5212; Lighthouse ≥ 85 |

States: planned → in progress → implemented (coder report) → integrated (gates green) → reviewed → tested → done.
A package is done only when its acceptance criteria are met, all gates pass and no blocker/major finding is open.

## P0 coverage

| Req | Packages |
|---|---|
| P0-01 Konto und Login | WP-08 (client, AuthGate, demo gating), WP-03 (demo), WP-11 (auth config) |
| P0-02 Speichern und Sync | WP-08 (outbox, adapter, fake backend), WP-11 (tables, triggers, realtime) |
| P0-03 Schachbrett | WP-00 (lib/chess, minimal board), WP-01 (board), WP-04 (game-level draw rules) |
| P0-04 Bewertete Puzzles | WP-03, WP-10 (bank), WP-07 (easy puzzles from lessons), WP-08 (rating) |
| P0-05 Lernmodus | WP-03, WP-05 (rule-based puzzle explanations), WP-10 (stored explanations) |
| P0-06 Themen-Training | WP-03, WP-10 (≥ 20 themes with content) |
| P0-07 Bots | WP-04 |
| P0-08 Hilfe-Stufen | WP-04, WP-02 (assessMove), WP-05 (warning text) |
| P0-09 Partie fortsetzen | WP-04, WP-08 |
| P0-10 Partieanalyse | WP-02 (pipeline), WP-05 (UI) |
| P0-11 Erklärung von Fehlern | WP-02 (facts), WP-05 (rule-based + LLM client), WP-11 (`explain`) |
| P0-12 Lektions-Engine | WP-06 |
| P0-13 Lektionsinhalte | WP-07 |
| P0-14 Dashboard | WP-09 |
| P0-15 PGN-Import | WP-05, WP-11 (`games-import`) |
| P0-16 Responsive Web-App | WP-00 (shell), WP-01, WP-09 (PWA), WP-12 (Lighthouse, responsive sweep) |

## Rounds

| Round | Scope | Result |
|---|---|---|
| 0 | Planning | BACKLOG, DECISIONS (D-01…D-42), STATUS written; DESIGN.md v1.0 reconciled (routes `/learn`, `/settings`, breakpoints, primitives, Inter font; "Einfache Ansicht" deferred D-39; coach latency D-41) |
| 0 | WP-00 Foundation | Coder report accepted; gates re-run by the manager (all green). |
| 1 (check) | Manager check of WP-00 for wave-1 readiness | Fixes: `lib/chess` board inspection helpers (D-44), `createFakeAppServices` + fake-indexeddb in dom tests (D-45), isolated e2e dev servers (D-46), piece licence confirmed (D-47), no "System" theme (D-43). BACKLOG instructions updated for WP-01…WP-09 (D-50…D-52). Decisions D-43…D-53. |

## Requests to other roles
- designer: mark DESIGN.md §8.7 "Einfache Ansicht" (and its mentions in §2.3, §3.6, §4, §8.1, §11 item 9) as deferred per D-39;
  DESIGN §3.6 already lists Design (Dunkel/Hell) – consistent with D-43.
- chess-rules-auditor: confirm with quotes in `RULES.md`: D-04 (automatic vs claimed draws, bot claim rule), D-05 (dead position subset), D-23 (German castling notation `0-0`), FIDE articles used by lesson content (WP-07).
  New: upgrade §2.5 (5.1.2 resignation exception) using rcc.fide.com/article5 (D-53); review `src/lib/chess/board.ts`
  (attacks incl. pinned pieces, e.p. excluded, `nullMoveFen`) and the 65 fixtures in `rules-fixtures.test.ts`.
- reviewer + designer (wave-0 review round, runs in parallel with wave 1): frozen WP-00 paths only (`src/core`, `src/lib`,
  `src/app`, `src/ui/primitives`, `src/ui/layout`, `src/styles`, `src/i18n`, `scripts/lib`, `e2e/support`, `e2e/smoke`,
  root configs). Findings there become FIX packages applied by the manager between waves, so wave-1 ownership is untouched.

## Open questions for the project owner (non-blocking)
- LLM model for explanations: `claude-opus-5-5` (PRD default, used) or `claude-haiku-5-5` (cheaper)? Refusal fallback is enabled (D-18) – keep?
- GPL obligations (Stockfish) if the app is ever shared with others (PRD open question).

## Risks being watched
- Main bundle 543 kB (placeholders pull fakes + chess.js into the main chunk); must shrink once owners replace the
  factories – WP-12 measures (budget: Lighthouse mobile ≥ 85).
- CPU: 4 cores for up to eight coders plus Stockfish validators – e2e with `--workers=1`, validators with `--only`.
- Analysis budget (≤ 30 s / 40 moves) with Stockfish lite single-threaded – measured by WP-02 bench and WP-05 e2e.
- Human-like bots without Maia – measured by WP-04 calibration report.
- Lesson content correctness (rules text, solutions) – validator (WP-07) + chess-rules-auditor review.
- Parallel work in one tree – strict path ownership, frozen WP-00 paths, per-package build dirs and e2e ports (D-22).
