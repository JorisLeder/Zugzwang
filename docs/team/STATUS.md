# Status

Owner: manager. Updated after every planning, integration, review and test round.

**Current phase:** Planning done. Next step: WP-00 Foundation (starts once `docs/team/DESIGN.md` exists).
**Target:** PRD V1 = P0-01 … P0-16 (CONSTRAINTS §1).
**Quality gates (CONSTRAINTS §5):** typecheck · lint · test · build · validate:content · e2e – not run yet (no code).

## Packages

| ID | Title | Wave | Depends on | PRD | State | Notes |
|---|---|---|---|---|---|---|
| WP-00 | Foundation | 0 | DESIGN.md | stack, IA, contracts, P0-03 (min.), P0-16 (shell) | planned | single coder; may run `npm install` |
| WP-01 | Board & Analysebrett | 1 | WP-00 | P0-03, P0-16, §6 Analysebrett | planned | e2e port 5201 |
| WP-02 | Engine & analysis core | 1 | WP-00 | P0-10, P0-11 (facts), P0-08 (assessMove) | planned | bench ≤ 30 s |
| WP-03 | Puzzles | 1 | WP-00 | P0-04, P0-05, P0-06, P0-01 (demo) | planned | e2e port 5203; seed bank ≥ 40 |
| WP-04 | Bots & play | 1 | WP-00 | P0-07, P0-08, P0-09, P0-03 (game rules) | planned | e2e port 5204; calibration report |
| WP-05 | Review, explanations, PGN import | 1 | WP-00 | P0-10 (UI), P0-11, P0-15, P2-01/02/06 | planned | e2e port 5205 |
| WP-06 | Lesson engine | 1 | WP-00 | P0-12, P2-04 | planned | e2e port 5206 |
| WP-07 | Lesson content | 1 | WP-00 | P0-13 | planned | validate:content must pass |
| WP-08 | Data layer, sync, auth (client) | 1 | WP-00 | P0-01, P0-02 | planned | e2e port 5208 |
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

## Requests to other roles
- designer: mark DESIGN.md §8.7 "Einfache Ansicht" (and its mentions in §2.3, §3.6, §4, §8.1, §11 item 9) as deferred per D-39.
- chess-rules-auditor: confirm with quotes in `RULES.md`: D-04 (automatic vs claimed draws, bot claim rule), D-05 (dead position subset), D-23 (German castling notation `0-0`), FIDE articles used by lesson content (WP-07).

## Open questions for the project owner (non-blocking)
- LLM model for explanations: `claude-opus-5-5` (PRD default, used) or `claude-haiku-5-5` (cheaper)? Refusal fallback is enabled (D-18) – keep?
- GPL obligations (Stockfish) if the app is ever shared with others (PRD open question).

## Risks being watched
- Analysis budget (≤ 30 s / 40 moves) with Stockfish lite single-threaded – measured by WP-02 bench and WP-05 e2e.
- Human-like bots without Maia – measured by WP-04 calibration report.
- Lesson content correctness (rules text, solutions) – validator (WP-07) + chess-rules-auditor review.
- Parallel work in one tree – strict path ownership, frozen WP-00 paths, per-package build dirs and e2e ports (D-22).
