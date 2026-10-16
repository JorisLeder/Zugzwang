# Constraints and scope decisions (binding for all agents)

Set by the project owner / orchestrator. The manager may add decisions in DECISIONS.md but must not contradict this file.

## 1. Scope of this build
- **Target: PRD V1 = all P0 requirements (P0-01 … P0-16)**, fully working and tested.
- P1 items only after every P0 package is done, reviewed and tested. Cheap P1 items the PRD flags as daily-use
  (P1-02 Tagespuzzle, P1-03 Wiederholung) may be pulled in by the manager if P0 is green.
- P2 = architecture preparation only (e.g. `games.source`, external IDs, `POST /games/import`, deep link `/analysis/:gameId`).
- Mobile: V1 is a responsive PWA usable at 360 px (P0-16). The Capacitor app (P1-11) is out of scope for this build,
  but nothing may block it (no browser-only APIs without fallback in core logic).
- Lessons for V1 (P0-13): Stufe 0 (Neuling) complete + the first three courses of Stufe 1 (Einsteiger):
  "Keine Figuren verschenken", "Taktik-Grundlagen", "Grundmatts und Mattbilder" → 6 courses, about 30 lessons.
- The primary user is at ~200 Elo and knows the rules and basic tactics; complete newcomers must also be served.

## 2. Environment limits (verified)
Reachable: npm registry, GitHub (git clone of public repos, raw.githubusercontent.com), the WebSearch tool.
NOT reachable: lichess.org, database.lichess.org, chess.com, fide.com / handbook.fide.com, huggingface.co,
wikipedia, jsdelivr, unpkg, Stockfish release binaries. No Supabase project, no API keys.
Chromium for Playwright: `/opt/pw-browsers` (do not run `playwright install`).

Consequences:
- **Puzzles:** generate a seed set locally with Stockfish (npm `stockfish`, runs in Node) and validate every puzzle
  (legal FEN, side to move, unique best first move by a clear margin, or all mating moves accepted, correct themes).
  Target ≥ 600 puzzles covering ratings ~300–2000, with many easy ones (mate in 1, win a hanging piece) for beginners.
  Also ship `scripts/import-lichess-puzzles` that imports the official Lichess CSV (CC0) on a machine with access.
- **Bots:** Maia models are on Hugging Face (unreachable). Implement bots with Stockfish plus a human-like error model
  behind a `BotEngine` interface; add a documented Maia adapter stub so Maia can be plugged in later.
- **Backend:** implement local-first persistence (IndexedDB) with an outbox and a **Supabase sync adapter** that is active
  when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Ship SQL migrations with Row Level Security and
  the edge functions in `supabase/`. They cannot be deployed here: test the adapter against a fake/in-memory backend.
  Without env vars the app runs in local mode and says so clearly (cross-device sync needs the Supabase setup – document it).
- **Explanations (LLM):** edge function `explain` calls the Claude API with the official `@anthropic-ai/sdk`,
  model `claude-opus-5-5`, key only in the function's environment. The client must always fall back to
  rule-based explanations. Tests mock the function.
- **Lichess cloud-eval / explorer / tablebase:** optional accelerators with graceful failure; never required.

## 3. Chess correctness (non-negotiable)
- Rules only via **chess.js** (BSD-2-Clause). No hand-written move generation or legality checks.
- App-level rules on top of chess.js must follow the **FIDE Laws of Chess** (edition in force from 1 January 2023).
  Topics that must be checked (article numbers to be confirmed with quotes by the rules auditor in `docs/team/RULES.md`):
  castling conditions (king not in check, does not cross or land on an attacked square; the rook may cross an attacked
  square; neither piece has moved; squares between empty), en passant only on the move immediately after the
  two-square advance, promotion compulsory to Q/R/B/N of the same colour, stalemate = draw, dead position = draw,
  threefold repetition and 50-move rule are claims, fivefold repetition and 75-move rule end the game automatically,
  flag fall is a draw if the opponent cannot checkmate by any series of legal moves, a move that leaves the own king
  in check is illegal.
- Every position and move in content (lessons, puzzles, explanations) is validated by script (`npm run validate:content`):
  chess.js legality + Stockfish confirmation for "best move" and "mate in N" claims.
- German chess terms follow the DSB translation of the FIDE Laws (Schach, Matt, Patt, Rochade, en passant / im Vorbeigehen
  schlagen, Umwandlung, Remis, Remis durch dreimalige Stellungswiederholung, 50-Züge-Regel).

## 4. Tech stack (from the PRD)
React + TypeScript + Vite (PWA via vite-plugin-pwa), Tailwind CSS, accessible primitives from npm (Radix) instead of the
shadcn CLI (its registry is unreachable), Zustand, TanStack Query, react-chessboard, chess.js, Stockfish (npm `stockfish`,
lite single-threaded, in a Web Worker), Dexie (IndexedDB), Supabase JS client, Vitest, Playwright.
Default notation in the UI: German piece letters (K, D, T, L, S) with a setting for English letters.

## 5. Quality gates (all must pass before a package is "done")
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:content`, `npm run e2e`.
No secrets in the client bundle. Every table has RLS. No console errors on the main journeys.

## 6. Team process
- Parallel coders work in the same tree on disjoint paths. They do not run `npm install` and do not commit;
  the integration step installs dependencies and commits.
- Files: `docs/team/BACKLOG.md`, `STATUS.md`, `DECISIONS.md` (manager), `CONVENTIONS.md` (foundation),
  `DESIGN.md` (designer), `RULES.md` (rules auditor), `REVIEW-LOG.md` (reviewers), `test-reports/` (testers).
- Git: local repository only (no remote configured). Commit after each integrated round.
