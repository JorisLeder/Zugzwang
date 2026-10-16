# Zugzwang – Backlog

Owner: manager. Scope: **PRD V1 = P0-01 … P0-16** (CONSTRAINTS §1). State of each package: `STATUS.md`.
Decisions are referenced as `D-xx` (see `DECISIONS.md`). Requirement IDs (P0-xx, P1-xx, P2-xx) refer to `docs/PRD.md`.

---

## 0. Rules for every package

**Waves.** Wave 0 = WP-00 Foundation (one coder, runs first, after `docs/team/DESIGN.md` exists).
Wave 1 = WP-01 … WP-08 (8 coders in parallel). Wave 2 = WP-09 … WP-11 (3 in parallel). Wave 3 = WP-12.
After every wave: integration (orchestrator installs dependencies if needed, runs all quality gates, commits), then a
review round (reviewer, chess-rules-auditor, designer) and a test round (tester-beginner, tester-intermediate,
tester-advanced). The manager triages findings into FIX-xx packages. The next wave starts when the previous wave has no
open blocker. V1 is done when every package is done (CONSTRAINTS §5 gates green, no open blocker/major finding).

**Ownership.** A coder edits only its owned paths (globs below). Placeholder files that WP-00 creates inside another
package's paths become that package's property when its wave starts. Everything WP-00 owns is **frozen** afterwards
(`src/core/**`, `src/lib/**`, `src/app/**`, `src/ui/primitives/**`, `src/ui/layout/**`, `src/styles/**`, `src/i18n/**`,
root config files, `package.json`, `scripts/validate-content.ts`, `scripts/lib/**`, `e2e/support/**`, `e2e/smoke/**`).
If you need a change there, do not make it: list it under `needs` in your report and the manager creates a FIX package.

**Interfaces.** Packages talk to each other only through the contracts in `src/core` and the public `index.ts` of a
package folder. Never import another package's internal files. Until a dependency is integrated, test against the fakes
in `src/core/testing` (e.g. `FakeEngineService` with scripted lines). Acceptance criteria that need the real
implementation of another package of the same wave (real engine, real data layer, real board) are re-verified by the
manager in the integration round; in your wave prove them with fakes and say so in your report.

**Parallel-safe commands** (all coders share one working tree, D-22):
- Never run `npm install`/`npm add`, never `git commit`, never write to `dist/`.
- Type check: `npm run typecheck`. Your own paths must be error-free; list errors in foreign paths in your report, do not fix them.
- Lint: `npx eslint <your paths>`.
- Unit tests: `npx vitest run <your paths>`.
- Build: `npx vite build --outDir .build/<WP-id> --emptyOutDir`.
- E2E: `E2E_SERVER=dev E2E_PORT=<your port> npx playwright test e2e/<your area> --output test-results/<WP-id>`.
  Ports: WP-01 5201, WP-03 5203, WP-04 5204, WP-05 5205, WP-06 5206, WP-08 5208, WP-09 5209 (PWA preview 5219),
  WP-10 5210, WP-12 5212, FIX packages 5230–5299 (assigned per FIX).
- Content: `npm run validate:content` (uses a result cache in `.cache/validate/`).

**Chess correctness.** Rules only via chess.js and `src/lib/chess` (FIDE Laws 2023, see CONSTRAINTS §3 and
`docs/team/RULES.md` once written by the rules auditor). Every FEN, move and claim in content must be validated by script.

**Design.** All UI follows `docs/team/DESIGN.md` (tokens, layouts, components, motion, sound, accessibility, learning
design, microcopy) – except §8.7 "Einfache Ansicht", which is deferred (D-39). Use only tokens, no raw colour values.

**Language.** UI and content German, addressing the learner with "du"; DSB terminology. Code, comments, identifiers English.
UI strings live in `strings.de.ts` files per feature folder (i18n prepared, D-35), not inline in components.

**Report.** Per coder role: implemented acceptance criteria (by number), files, tests, commands run with pass/fail counts,
open problems, `needs`.

---

## 1. Ownership map

| Package | Wave | Owned paths |
|---|---|---|
| WP-00 Foundation | 0 | root configs (`package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`, `vitest.setup.ts`, `index.html`, `.env.example`, `.env.e2e`, `.gitignore`, `README.md`, `THIRD_PARTY_NOTICES.md`), `src/main.tsx`, `src/app/**`, `src/core/**`, `src/lib/**`, `src/ui/primitives/**`, `src/ui/layout/**`, `src/styles/**`, `src/i18n/**`, `scripts/copy-engine.mjs`, `scripts/validate-content.ts`, `scripts/lib/**`, `e2e/support/**`, `e2e/smoke/**`, `public/favicon.svg`, `docs/team/CONVENTIONS.md`; initial placeholders in all package folders |
| WP-01 Board & Analysebrett | 1 | `src/ui/board/**`, `src/ui/chess/**`, `src/ui/sound/**`, `src/features/analysis-board/**`, `e2e/board/**` |
| WP-02 Engine & analysis core | 1 | `src/engine/**`, `src/analysis/**`, `scripts/openings/**`, `scripts/bench/**` |
| WP-03 Puzzles | 1 | `src/puzzles/**`, `src/features/puzzles/**`, `public/data/puzzles/**` (wave 1 only), `scripts/puzzles/import-lichess.ts`, `scripts/puzzles/lib/**`, `scripts/puzzles/README.md`, `scripts/validate/puzzles.ts`, `e2e/puzzles/**` |
| WP-04 Bots & play | 1 | `src/bots/**`, `src/features/play/**`, `public/avatars/bots/**`, `scripts/bots/**`, `scripts/validate/bots.ts`, `docs/team/bot-calibration.md`, `e2e/play/**` |
| WP-05 Review, explanations, PGN import | 1 | `src/explain/**`, `src/pgn/**`, `src/features/review/**`, `src/features/pgn-import/**`, `e2e/review/**` |
| WP-06 Lesson engine | 1 | `src/lessons/**`, `src/features/lessons/**`, `e2e/lessons/**` |
| WP-07 Lesson content | 1 | `content/lessons/**`, `scripts/validate/lessons.ts`, `scripts/content/**`, `docs/content/LESSON-STYLE.md` |
| WP-08 Data layer, sync, auth (client) | 1 | `src/data/**`, `src/features/auth/**`, `src/features/sync/**`, `docs/setup/SYNC.md`, `e2e/auth-sync/**` |
| WP-09 Dashboard, profile, stats, settings, onboarding, PWA | 2 | `src/features/dashboard/**`, `src/features/profile/**`, `src/features/settings/**`, `src/features/onboarding/**`, `src/features/pwa/**`, `src/stats/**`, `pwa.config.ts`, `public/icons/**`, `e2e/dashboard/**`, `e2e/pwa/**` |
| WP-10 Puzzle bank | 2 | `scripts/puzzles/generate/**`, `public/data/puzzles/**` (from wave 2), `supabase/seed/puzzles*`, `docs/content/PUZZLES.md` |
| WP-11 Backend (Supabase) | 2 | `supabase/**` except `supabase/seed/puzzles*`, `scripts/supabase/**`, `docs/setup/SUPABASE.md` |
| WP-12 Core journeys, performance, quality sweep | 3 | `e2e/journeys/**`, `e2e/responsive/**`, `scripts/lighthouse.ts`, `docs/team/lighthouse/**` |

---

## 2. WP-00 Foundation (wave 0, one coder)

**PRD refs:** Tech-Stack, UX und Informationsarchitektur, Datenmodell, P0-03 (minimal board), P0-16 (shell), P2-01/02/04/05/06 (contracts).
**Depends on:** `docs/team/DESIGN.md` (designer). Read `docs/team/RULES.md` too if it exists.
**May:** run `npm install` (only coder allowed to). Do not commit.

### 2.1 Scaffold and dependencies
Vite + React + TypeScript app at the repo root (`package.json` at `/home/user/zugzwang`). Node 22.22 is installed.
Install with exact resolved versions in the lockfile, no `--force`/`--legacy-peer-deps`; `npm ls` must report no errors.

Runtime dependencies: `react`, `react-dom`, `react-router` (7.x, data router, D-21), `chess.js` (1.4.x), `react-chessboard`
(5.x; v5 API uses an `options` prop and @dnd-kit – read its README/types in node_modules), `stockfish` (19.0.1), `dexie`,
`dexie-react-hooks`, `zustand`, `@tanstack/react-query`, `@supabase/supabase-js`, `radix-ui` (umbrella package of Radix
primitives), `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `@fontsource-variable/inter`, `zod`, `workbox-window`.

Dev dependencies: `vite` (8.x), `@vitejs/plugin-react`, `typescript` (~5.9.3 – typescript-eslint requires < 6.1),
`@types/react`, `@types/react-dom`, `@types/node` (22.x), `tailwindcss` (4.x), `@tailwindcss/vite`, `vite-plugin-pwa`,
`workbox-build`, `vitest` (5.x), `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, **`@playwright/test` pinned exactly `1.56.1`** (its Chromium revision 1194 is the one in
`/opt/pw-browsers`; never run `playwright install`), `eslint` (9.39.x – eslint-plugin-jsx-a11y does not support 10),
`@eslint/js` (9.x), `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`,
`eslint-plugin-jsx-a11y`, `globals`, `tsx`, `fake-indexeddb`, `@electric-sql/pglite` (SQL/RLS tests of WP-11),
`csv-parse` and `fzstd` (Lichess importer of WP-03), `@anthropic-ai/sdk` (types/tests for the explain function of WP-11),
`lighthouse` (WP-12).

### 2.2 npm scripts (all must exist; placeholders print "not implemented yet (WP-xx)" and exit 0)
| Script | Command / behaviour |
|---|---|
| `dev` | `node scripts/copy-engine.mjs && vite` |
| `build` | `node scripts/copy-engine.mjs && vite build` |
| `preview` | `vite preview` |
| `typecheck` | `tsc` over app, scripts, tests and `supabase/**/handler.ts` + `supabase/**/*.test.ts` (no emit); Deno entry files `supabase/functions/*/index.ts` are excluded |
| `lint` | `eslint .` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `e2e` | `playwright test` (production preview server, see 2.9) |
| `validate:content` | `tsx scripts/validate-content.ts` (aggregator, see 2.8) |
| `openings:build` | `tsx scripts/openings/build.ts` (placeholder → WP-02) |
| `bench:analysis` | `tsx scripts/bench/analysis.ts` (placeholder → WP-02) |
| `puzzles:import-lichess` | `tsx scripts/puzzles/import-lichess.ts` (placeholder → WP-03) |
| `bots:calibrate` | `tsx scripts/bots/calibrate.ts` (placeholder → WP-04) |
| `puzzles:generate` | `tsx scripts/puzzles/generate/index.ts` (placeholder → WP-10) |
| `supabase:seed-content` | `tsx scripts/supabase/seed-content.ts` (placeholder → WP-11) |
| `lighthouse` | `tsx scripts/lighthouse.ts` (placeholder → WP-12) |

Placeholder files for the owner-specific scripts above are created at exactly those paths (they belong to the owning
package). `vite.config.ts` registers `vite-plugin-pwa` with options imported from `pwa.config.ts` (placeholder: minimal
German manifest, service worker not active in dev; owned by WP-09 from wave 2).
`scripts/copy-engine.mjs` copies `node_modules/stockfish/bin/stockfish-19-lite-single.js` and `.wasm` to `public/engine/`
(skip if identical; `public/engine/` is git-ignored). Add `.build/`, `.cache/`, `public/engine/` to `.gitignore`.
Vitest: two projects – `node` (`**/*.test.ts` in `src`, `scripts`, `supabase`) and `dom` (`src/**/*.test.tsx`, jsdom,
jest-dom matchers); default timeout 20 s. Path alias `@/` → `src/` in Vite, Vitest, tsconfig and tsx.
`.env.example`: only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUD_EVAL` (comments explain local mode).
`.env.e2e`: `VITE_E2E=1` (bots skip artificial think time, animations off).

### 2.3 App shell and routes (German labels, D-01)
Six areas (D-01, DESIGN.md §3.2 icons): **Start** `/`, **Puzzles** `/puzzles`, **Spielen** `/play`,
**Lernen** `/learn` (page title "Lernpfad"), **Analyse** `/analysis`, **Profil** `/profile` (Einstellungen at `/settings`,
reachable from Profil and the sidebar footer gear). Breakpoints exactly as DESIGN.md §3.1: phone 360–767 px bottom tab bar
(6 tabs, labels always visible; on active board screens replaced by the action bar, D-40), tablet 768–1023 px icon rail,
desktop ≥ 1024 px rail (1024–1279) or labelled sidebar (≥ 1280); sidebar footer: sync status slot, "Einstellungen", avatar.
No horizontal scroll at 360 px. Skip link, visible focus, active state, `aria-current="page"`. Dark theme default,
light selectable (via settings store).

`src/app/paths.ts` – the only place that builds URLs (other packages must use it):
`/` dashboard · `/onboarding` · `/login` · `/auth/callback` · `/puzzles` · `/puzzles/rated` · `/puzzles/learn` ·
`/puzzles/themes` · `/puzzles/themes/:themeId` · `/puzzles/demo` · `/play` · `/play/game/:gameId` ·
`/play/position?fen=` · `/learn` · `/learn/:courseId` · `/learn/:courseId/:lessonId` · `/analysis` ·
`/analysis/import` · `/analysis/board?fen=&pgn=` · `/analysis/:gameId` (deep link, P2-02) · `/profile` ·
`/profile/stats` · `/settings` · `*` not found.
Builder names (binding): `paths.home()`, `onboarding()`, `login()`, `authCallback()`, `puzzles()`, `puzzlesRated()`,
`puzzlesLearn()`, `puzzleThemes()`, `puzzleTheme(themeId)`, `puzzlesDemo()`, `play()`, `playGame(gameId)`,
`playFromPosition(fen)`, `learn()`, `course(courseId)`, `lesson(courseId, lessonId)`, `analysis()`,
`analysisImport()`, `analysisBoard({ fen?, pgn? })`, `analysisGame(gameId)`, `profile()`, `stats()`, `settings()`.

Each feature folder exports `routes.tsx` with `RouteObject[]` (pages lazy-loaded); the root router statically imports
these arrays. Placeholders ("Dieser Bereich ist in Arbeit") are created in: `src/features/{dashboard,onboarding,puzzles,
play,lessons,review,pgn-import,analysis-board,profile,settings,auth}/routes.tsx`. `/analysis/board` comes from
`analysis-board`, `/analysis/import` from `pgn-import`, `/analysis` and `/analysis/:gameId` from `review`.
Shell slots imported from fixed placeholder modules: `@/features/auth/AuthGate` (wraps all routes except `/login`,
`/auth/callback`, `/puzzles/demo`; placeholder passes through), `@/features/sync/SyncStatusIndicator`
(placeholder renders nothing), `@/features/pwa/OfflineBanner` (placeholder renders nothing).

### 2.4 Design system
Tokens from `docs/team/DESIGN.md` §2 verbatim as CSS custom properties (dark default, light; board tokens Moos default
and Holz) in `src/styles/tokens.css`, Tailwind v4 mapping per DESIGN §2.10 in `src/styles/app.css`; font Inter via
`@fontsource-variable/inter` (self-hosted, OFL). Move-classification colours/symbols exactly per DESIGN §2.3; the
contrast test `tokens.contrast.test.ts` recomputes DESIGN §2.4 and fails below target.
`src/ui/primitives/` (generic components of DESIGN §5): Button, IconButton, Card, Tabs, Dialog/Sheet, Tooltip, Toast,
ProgressBar, ProgressRing, Spinner, Badge, Chip, Switch, SegmentedControl, RadioGroup, Select, Banner, EmptyState,
ErrorState, Stars, RatingDelta, StreakBadge, **CoachBubble** (avatar + speech bubble, max 3 sentences visible,
"Mehr erfahren" expands details), **ClassificationBadge** (reads `CLASSIFICATION_META`: symbol/icon, fill and ink tokens,
German label, `aria-label`). Built on `radix-ui` (umbrella package = the Radix primitives DESIGN §11 lists) and
`lucide-react`. Ignore DESIGN §8.7 "Einfache Ansicht" (deferred, D-39).
`src/ui/layout/BoardLayout.tsx`: one layout for all board screens – desktop: board as large as the viewport height
allows, right panel with tabs (slots: `board`, `panelTabs`, `actions`); phone: board full width on top, panel below,
actions in a fixed bottom bar. Prop/slot contract documented in a JSDoc header.

### 2.5 Minimal board (handed over to WP-01)
`src/ui/board/Board.tsx` (owned by WP-01 from wave 1) – functional minimal version on react-chessboard: renders `fen`,
`orientation`; moves by drag-and-drop and click-click; only legal moves (via `src/lib/chess`); promotion opens a dialog
with Dame/Turm/Läufer/Springer (no auto-queen); calls `onMove(move: MoveRecord)`; `interactive` prop.
**Selector contract** (WP-01 must keep it, e2e helpers depend on it): root `data-testid="board"` with
`data-orientation="white|black"` and `data-fen`; every square element `data-square="e4"`; every piece `data-piece="wP"`;
promotion buttons `data-testid="promotion-q|r|b|n"`. `src/ui/board/index.ts` exports `Board` and `BoardProps`
(final prop names as listed in WP-01, unimplemented props may be ignored by the minimal version).
Also create simple working placeholders with the **final signatures** (owned by WP-01 from wave 1) so that wave-1
packages compile against them: `src/ui/chess/index.ts` (`MoveList`, `EvalBar`, `NavigationControls`,
`usePlyNavigation`) and `src/ui/sound/index.ts` (`playSound(kind: 'move'|'capture'|'check'|'success'|'error')`, no-op).

### 2.6 Shared domain contracts – `src/core/` (most important deliverable)
Types-only modules plus zod schemas, constants and fakes. JSDoc on every exported member. Barrel `src/core/index.ts`.
Names below are binding; you may add fields if you document them, but do not remove or rename.

`chess.ts`
```ts
type Color = 'w' | 'b'; type PieceSymbol = 'p'|'n'|'b'|'r'|'q'|'k'; type PromotionPiece = 'q'|'r'|'b'|'n';
type Square = /* re-export chess.js Square */; type Fen = string; type Uci = string; type San = string; // San = English SAN
type Notation = 'de' | 'en';
interface MoveInput { from: Square; to: Square; promotion?: PromotionPiece }
interface MoveRecord { ply: number /*1-based half-move index from the game's start position*/; moveNumber: number; color: Color;
  san: San; uci: Uci; from: Square; to: Square; piece: PieceSymbol; captured?: PieceSymbol; promotion?: PromotionPiece;
  isCheck: boolean; isCheckmate: boolean; isCastle: boolean; isEnPassant: boolean; fenBefore: Fen; fenAfter: Fen }
type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
type GameEndReason = 'checkmate'|'stalemate'|'insufficient_material'|'fivefold_repetition'|'seventyfive_moves'
  |'threefold_repetition_claim'|'fifty_moves_claim'|'resignation'|'timeout'|'timeout_vs_insufficient_material'|'aborted';
type DrawClaim = 'threefold_repetition' | 'fifty_moves';
interface GameStatus { isOver: boolean; result: GameResult; reason: GameEndReason | null; turn: Color; inCheck: boolean;
  claimableDraws: DrawClaim[] }
interface Arrow { from: Square; to: Square; kind: 'user'|'best'|'threat'|'hint'|'played' }
interface SquareMark { square: Square; kind: 'user'|'hint-piece'|'hint-target'|'danger'|'selected'|'last-move'|'check' }
```

`engine.ts` – all scores **from White's point of view** (D-08).
```ts
type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number /* >0 White mates in n, <0 Black mates */ };
interface EngineLine { multipv: number; depth: number; seldepth?: number; score: Score; bound?: 'lower'|'upper';
  pv: Uci[]; nodes?: number; nps?: number; timeMs?: number }
interface AnalyseOptions { depth?: number; multiPv?: number; movetimeMs?: number; signal?: AbortSignal;
  onUpdate?: (lines: EngineLine[]) => void }
interface BestMoveOptions { depth?: number; movetimeMs?: number; skillLevel?: number /*0–20*/;
  limitStrengthElo?: number /*UCI_LimitStrength+UCI_Elo*/; multiPv?: number; signal?: AbortSignal }
interface EngineAnalysis { fen: Fen; lines: EngineLine[]; depth: number; bestMove: Uci | null; source: 'local'|'cloud'; engineId: string }
type EngineStatus = { state: 'idle'|'loading'|'ready'|'busy'|'error'; progress?: number; error?: string };
interface EngineService { readonly id: string; init(): Promise<void>; status(): EngineStatus;
  onStatus(cb: (s: EngineStatus) => void): () => void;
  analyse(fen: Fen, opts?: AnalyseOptions): Promise<EngineAnalysis>;
  bestMove(fen: Fen, opts?: BestMoveOptions): Promise<{ move: Uci | null; lines: EngineLine[] }>;
  stop(): Promise<void>; dispose(): void }  // calls are serialised; options set per call are restored afterwards
interface UciTransport { send(cmd: string): void; onLine(cb: (line: string) => void): () => void; terminate(): void }
```

`analysis.ts`
```ts
type MoveClassification = 'brilliant'|'great'|'best'|'excellent'|'good'|'book'|'inaccuracy'|'mistake'|'miss'|'blunder';
const CLASSIFICATION_META: Record<MoveClassification, { labelDe: string; symbol?: string; icon?: string /* lucide name */;
  fillVar: string; inkVar: string; plainDe: string /* one-line meaning, DESIGN §2.3/§8.7, shown as legend/tooltip */ }>;
type GamePhase = 'opening'|'middlegame'|'endgame';
interface AnalysedMove { ply: number; color: Color; san: San; uci: Uci; fenBefore: Fen; fenAfter: Fen;
  evalBefore: Score; evalAfter: Score; bestMove: Uci | null; bestMoveSan: San | null; bestLine: Uci[]; playedLine: Uci[];
  winPctBefore: number; winPctAfter: number /* mover's POV, 0–100 */; expectedPointsLoss: number /* 0–1 */;
  accuracy: number /* 0–100 */; classification: MoveClassification; phase: GamePhase; opening?: { eco: string; name: string };
  facts?: ExplanationFacts; explanation?: ExplanationText }
interface GameAnalysis { gameId: string; engineId: string; engineVersion: string; depth: number; createdAt: string;
  accuracy: { w: number; b: number }; counts: Record<Color, Record<MoveClassification, number>>;
  moves: AnalysedMove[]; keyMoments: number[] /* plies */; evalGraph: Array<{ ply: number; winPctWhite: number }> }
interface AnalyseGameInput { gameId: string; startFen: Fen; moves: Uci[] }
interface AnalysisProgress { done: number; total: number; phase: 'book'|'engine'|'facts' }
interface MoveAssessment { expectedPointsLoss: number; classification: MoveClassification; bestMove: Uci | null;
  bestLine: Uci[]; playedLine: Uci[]; evalBefore: Score; evalAfter: Score; facts: ExplanationFacts }
interface ThreatInfo { move: Uci; san: San; line: Uci[]; materialGain: number /* pawns */; mateIn?: number; facts: ExplanationFacts }
interface AnalysisService {
  prepare(fen: Fen): void;  // warm the cache for a position (coach: called when the user's turn starts, D-41)
  analyseGame(input: AnalyseGameInput, opts?: { onProgress?: (p: AnalysisProgress) => void; signal?: AbortSignal }): Promise<GameAnalysis>;
  assessMove(fenBefore: Fen, move: Uci, opts?: { signal?: AbortSignal }): Promise<MoveAssessment>;
  findThreats(fen: Fen, opts?: { signal?: AbortSignal }): Promise<ThreatInfo | null> }
```

`explain.ts`
```ts
type MotifId = 'hanging_piece'|'fork'|'pin'|'skewer'|'discovered_attack'|'double_check'|'mate_threat'|'mate'
  |'back_rank'|'material_loss'|'missed_win'|'trapped_piece'|'promotion'|'stalemate_trap';
const MOTIF_LABELS_DE: Record<MotifId, string>;
interface MotifInstance { id: MotifId; squares: Square[]; pieces: Array<{ square: Square; piece: PieceSymbol; color: Color }>; gain?: number }
interface ExplanationFacts { kind: 'mistake'|'coach_warning'|'threat'|'praise'|'puzzle'; mover: Color; fenBefore: Fen;
  playedMove?: { uci: Uci; san: San }; bestMove?: { uci: Uci; san: San }; bestLine: San[]; refutation: San[];
  expectedPointsLoss?: number; materialSwing?: number /* pawns, mover POV, after the refutation */;
  mateIn?: number; motifs: MotifInstance[]; themes?: string[] /* puzzle themes */ }
type ExplanationSegment = { type: 'text'; text: string } | { type: 'move'; san: San /* English SAN */ };
interface ExplanationText { plain: string /* German notation, for storage and TTS (P2-06) */; segments: ExplanationSegment[];
  source: 'rule'|'llm'; motifs: MotifId[] }
interface ExplanationService { explain(facts: ExplanationFacts, opts?: { allowLlm?: boolean; signal?: AbortSignal; cacheKey?: string }): Promise<ExplanationText>;
  explainRuleBased(facts: ExplanationFacts): ExplanationText }
interface ExplainRequest { context: 'analysis'|'coach'|'puzzle'; facts: ExplanationFacts; language: 'de' }
type ExplainResponse = { ok: true; segments: ExplanationSegment[]; model: string } | { ok: false; error: 'rate_limited'|'invalid'|'unavailable'|'refused' };
interface ExplanationFeedback { id: string; context: 'analysis'|'coach'|'puzzle'; ref: string; vote: 1 | -1; createdAt: string }
```

`bots.ts`
```ts
type BotStyle = 'random'|'cautious'|'aggressive'|'solid'|'gambit'|'tactical'|'positional'|'endgame';
interface BotProfile { id: string; name: string; elo: number; avatar: string /* public path */; style: BotStyle;
  styleLabelDe: string; descriptionDe: string; engine: 'stockfish-skill'|'stockfish-human'|'stockfish-elo'|'maia';
  repertoire: { white: San[][]; black: San[][] }; chat: { greeting: string[]; onCapture: string[]; onCheck: string[];
  onWin: string[]; onLoss: string[]; onDraw: string[] } }
interface BotMoveRequest { bot: BotProfile; startFen: Fen; moves: Uci[] /* full history */; signal?: AbortSignal }
interface BotMove { uci: Uci; source: 'book'|'engine'|'human-model'; thinkTimeMs: number /* suggested artificial delay */; computeMs: number; chat?: string }
interface BotEngine { chooseMove(req: BotMoveRequest): Promise<BotMove>; shouldClaimDraw(fen: Fen, bot: BotProfile): Promise<boolean> }
```

`puzzles.ts` – Lichess format (D-24): `fen` is the position **before** the opponent's first move; `moves[0]` is the
opponent's move, then user, opponent, … (UCI).
```ts
type PuzzleThemeId = string; // Lichess theme keys
interface PuzzleTheme { id: PuzzleThemeId; labelDe: string; descriptionDe: string; group: 'motif'|'mate'|'phase'|'endgame'|'special'|'meta'; trainable: boolean }
const PUZZLE_THEMES: PuzzleTheme[]; // ≥ 30 entries, ≥ 20 trainable – at least: fork, pin, skewer, discoveredAttack,
// doubleCheck, hangingPiece, trappedPiece, deflection, attraction, capturingDefender, sacrifice, intermezzo, clearance,
// interference, xRayAttack, exposedKing, backRankMate, smotheredMate, mateIn1…mateIn5, promotion, underPromotion,
// advancedPawn, zugzwang, enPassant, castling, endgame, pawnEndgame, rookEndgame, queenEndgame, opening, middlegame;
// meta (not trainable): oneMove, short, long, veryLong, mate, crushing, advantage, equality
interface Puzzle { id: string; fen: Fen; moves: Uci[]; rating: number; ratingDeviation: number; themes: PuzzleThemeId[];
  openingTags: string[]; popularity?: number; nbPlays?: number; source: 'lichess'|'generated'|'lesson'|'seed';
  explanation?: ExplanationText; gameUrl?: string }
type PuzzleMode = 'rated'|'learning'|'theme'|'demo'|'daily'|'review'|'rush_3'|'rush_5'|'survival';
interface PuzzleAttempt { id: string /* client UUID */; puzzleId: string; mode: PuzzleMode; solved: boolean;
  firstTry: boolean; hintsUsed: 0|1|2|3; solutionShown: boolean; timeMs: number; themes: PuzzleThemeId[];
  puzzleRating: number; ratingBefore?: number; ratingAfter?: number; createdAt: string }
interface PuzzleQuery { ratingMin?: number; ratingMax?: number; themes?: PuzzleThemeId[]; openingTag?: string;
  excludeIds?: Iterable<string>; limit: number; shuffle?: boolean }
interface PuzzleBankManifest { version: string; chunks: Array<{ file: string; count: number; source: Puzzle['source']; sha256: string }> }
```

`rating.ts`
```ts
type RatingKind = 'puzzle'|'bot'|'rush_3'|'rush_5'|'survival';
interface Glicko2Rating { rating: number; rd: number; volatility: number }
interface GlickoResult { opponentRating: number; opponentRd: number; score: 0 | 0.5 | 1 }
interface RatingRecord extends Glicko2Rating { kind: RatingKind; gamesCount: number; updatedAt: string; provisional: boolean /* client value not yet confirmed by server */ }
const RATING_DEFAULTS = { rd: 350, volatility: 0.06, tau: 0.5, minRd: 45, maxRd: 350, puzzleRd: 80, botRd: 50 }; // D-09
```

`games.ts`
```ts
type GameSource = 'bot'|'pgn'|'chesscom'|'lichess';   // P2-01
type AssistanceLevel = 'competition'|'training'|'coach';
type TimeControl = { kind: 'none' } | { kind: 'clock'; initialSec: number; incrementSec: number }; // V1 always none (D-06)
type GameOrigin = { type: 'new' } | { type: 'fen'|'lesson'|'puzzle'|'analysis'; ref?: string };
interface Game { id: string; source: GameSource; externalId: string | null; botId: string | null; userColor: Color | null;
  assistance: AssistanceLevel | null; timeControl: TimeControl; startFen: Fen; pgn: string; headers: Record<string,string>;
  status: 'active'|'finished'|'aborted'; result: GameResult; endReason: GameEndReason | null; origin: GameOrigin;
  activeDeviceId: string | null; activeHeartbeatAt: string | null; ratingBefore: number | null; ratingAfter: number | null;
  createdAt: string; updatedAt: string; finishedAt: string | null }
// Append-only event log per game (takebacks are events, never deletes – D-29):
interface GameMoveEvent { id: string; gameId: string; seq: number; kind: 'move'|'takeback'; ply: number;
  uci?: Uci; san?: San; fenAfter?: Fen; plies?: number /* takeback: plies removed */; createdAt: string }
interface GameImportRequest { pgn?: string; source?: GameSource; externalId?: string }   // POST /games/import (P2-02)
type GameImportResponse = { ok: true; gameId: string; duplicate: boolean } | { ok: false; error: string; line?: number };
```

`lessons.ts` – content contract for WP-06 (engine) and WP-07 (content).
```ts
type StageId = 0|1|2|3|4;
interface CourseMeta { id: string; stage: StageId; order: number; version: number; titleDe: string; descriptionDe: string;
  status: 'available'|'planned'; lessonIds: string[]; testLessonId?: string }
interface MoveTreeNode { move: Uci; comment?: string; children: MoveTreeNode[] } // P2-04: variations
type QuizAssert = { kind: 'isCheckmate'|'isStalemate'|'isCheck'|'isInsufficientMaterial'; fen: Fen; expect: boolean }
  | { kind: 'isLegalMove'; fen: Fen; move: Uci; expect: boolean } | { kind: 'bestMove'; fen: Fen; move: Uci };
type LessonStep =
  | { id: string; type: 'explanation'; textDe: string; fen?: Fen; orientation?: Color; arrows?: Arrow[]; marks?: SquareMark[] }
  | { id: string; type: 'demo'; introDe?: string; startFen: Fen; orientation?: Color;
      moves: Array<{ uci: Uci; commentDe?: string; arrows?: Arrow[]; marks?: SquareMark[] }> }
  | { id: string; type: 'find_move'; promptDe: string; fen: Fen; orientation?: Color; solution: MoveTreeNode[] /* accepted first user moves */;
      acceptAnyMate: boolean; claim: { kind: 'best' } | { kind: 'mate'; mateIn: number } | { kind: 'rule' /* rule exercise, legality only */ };
      hintsDe: string[] /* 1–2 text hints; then piece/target highlight */; explanationDe: string;
      puzzle?: { rating: number; themes: PuzzleThemeId[] } /* export as easy puzzle (P0-04) */ }
  | { id: string; type: 'quiz'; questionDe: string; fen?: Fen; options: Array<{ id: string; textDe: string; correct: boolean; feedbackDe?: string }>;
      asserts?: QuizAssert[] /* machine-checked facts behind the correct answer */ }
  | { id: string; type: 'play_out'; promptDe: string; fen: Fen; userColor: Color; goal: 'checkmate'|'promote'|'draw';
      maxMoves: number; botElo: number | 'max'; successDe: string; failDe: string };
interface Lesson { id: string; courseId: string; order: number; version: number; kind: 'lesson'|'course_test'|'skip_test';
  titleDe: string; summaryDe: string; steps: LessonStep[]; practiceThemes: PuzzleThemeId[]; passThreshold?: number; sources?: string[] }
interface LessonProgress { lessonId: string; lessonVersion: number; currentStep: number; completed: boolean; stars: 0|1|2|3;
  mistakes: number; hintsUsed: number; score?: number /* tests, 0–1 */; updatedAt: string; completedAt: string | null }
```

`profile.ts`
```ts
interface Settings { theme: 'dark'|'light'|'system'; boardTheme: 'moos'|'holz'; pieceSet: 'default'; sound: boolean;
  animations: boolean; moveConfirmation: boolean; language: 'de'|'en'; notation: Notation; showCoordinates: boolean;
  showLegalMoves: boolean; updatedAt: string }
const DEFAULT_SETTINGS: Settings; // dark, moos, de notation, sound on, animations on, coordinates on, legal moves on, moveConfirmation off
type SelfAssessment = 'newcomer'|'beginner'|'club'|'advanced';
const SELF_ASSESSMENT_OPTIONS: Array<{ id: SelfAssessment; labelDe: string; descriptionDe: string; puzzleRating: number;
  botRating: number; startStage: StageId }>; // newcomer 400/200/0, beginner 600/400/1, club 1000/1000/1, advanced 1500/1600/1 (D-10)
interface Profile { id: string; displayName: string; settings: Settings; dailyGoalMinutes: number; selfAssessment: SelfAssessment | null;
  onboardingCompleted: boolean; stageZeroSkipped: boolean; createdAt: string; updatedAt: string }
interface DailyActivity { date: string /* YYYY-MM-DD in the user's time zone */; minutes: number; puzzles: number; games: number; lessons: number; goalReached: boolean }
interface ThemeStat { theme: PuzzleThemeId; attempts: number; successes: number }
interface ReviewQueueItem { id: string; itemType: 'puzzle'|'own_mistake'; objectId: string; dueAt: string; intervalDays: number } // P1-03 prep
```

`storage.ts`
```ts
interface Subscribable<T> { subscribe(cb: (value: T) => void): () => void } // Dexie liveQuery-compatible
// One repository per entity; every list/get has an observe… variant returning Subscribable.
interface ProfileRepository { get(): Promise<Profile | null>; observe(): Subscribable<Profile | null>; save(p: Profile): Promise<void>; updateSettings(patch: Partial<Settings>): Promise<Settings> }
interface RatingRepository { get(kind: RatingKind): Promise<RatingRecord | null>; observe(kind: RatingKind): Subscribable<RatingRecord | null>;
  history(kind: RatingKind): Promise<Array<{ at: string; rating: number }>> }
interface PuzzleRepository { get(id: string): Promise<Puzzle | null>; query(q: PuzzleQuery): Promise<Puzzle[]>; count(q?: Omit<PuzzleQuery,'limit'>): Promise<number>;
  bulkUpsert(p: Puzzle[]): Promise<void>; bankVersion(): Promise<string | null>; setBankVersion(v: string): Promise<void> }
interface PuzzleAttemptRepository { list(q?: { mode?: PuzzleMode; since?: string; limit?: number }): Promise<PuzzleAttempt[]>;
  ratedPuzzleIds(): Promise<Set<string>>; observeRecent(limit: number): Subscribable<PuzzleAttempt[]> }   // writes only via ProgressService
interface GameRepository { get(id: string): Promise<Game | null>; observe(id: string): Subscribable<Game | null>;
  list(q?: { status?: Game['status']; source?: GameSource; limit?: number }): Promise<Game[]>; observeList(q?: {...}): Subscribable<Game[]>;
  findByExternalId(source: GameSource, externalId: string): Promise<Game | null>; heartbeat(id: string, deviceId: string): Promise<void>;
  takeOver(id: string, deviceId: string): Promise<void> }
interface GameMoveRepository { list(gameId: string): Promise<GameMoveEvent[]>; observe(gameId: string): Subscribable<GameMoveEvent[]> }
interface GameAnalysisRepository { get(gameId: string): Promise<GameAnalysis | null>; save(a: GameAnalysis): Promise<void>; list(): Promise<GameAnalysis[]> }
interface LessonProgressRepository { get(lessonId: string): Promise<LessonProgress | null>; list(): Promise<LessonProgress[]>; observeAll(): Subscribable<LessonProgress[]> }
interface DailyActivityRepository { get(date: string): Promise<DailyActivity | null>; range(from: string, to: string): Promise<DailyActivity[]>; observe(date: string): Subscribable<DailyActivity | null> }
interface ThemeStatsRepository { list(): Promise<ThemeStat[]>; observe(): Subscribable<ThemeStat[]> }
interface ReviewQueueRepository { due(at: string): Promise<ReviewQueueItem[]>; upsert(i: ReviewQueueItem): Promise<void> }
interface ExplanationFeedbackRepository { add(f: ExplanationFeedback): Promise<void>; get(context: string, ref: string): Promise<ExplanationFeedback | null> }
interface Repositories { profile; ratings; puzzles; puzzleAttempts; games; gameMoves; gameAnalyses; lessonProgress;
  dailyActivity; themeStats; reviewQueue; explanationFeedback }
// All writes that create progress go through ProgressService (local transaction + outbox):
interface ProgressService {
  initializeFromSelfAssessment(choice: SelfAssessment): Promise<void>;
  recordPuzzleAttempt(a: Omit<PuzzleAttempt,'id'|'createdAt'|'ratingBefore'|'ratingAfter'> & { puzzleRd: number }): Promise<{ attempt: PuzzleAttempt; rating: RatingRecord | null }>;
  recordLessonProgress(p: LessonProgress): Promise<LessonProgress>;            // furthest progress wins
  createGame(g: Omit<Game,'id'|'createdAt'|'updatedAt'>): Promise<Game>;
  appendGameEvent(e: Omit<GameMoveEvent,'id'|'createdAt'>): Promise<GameMoveEvent>;
  finishGame(id: string, result: GameResult, reason: GameEndReason, pgn: string): Promise<{ game: Game; rating: RatingRecord | null }>; // bot rating only for competition bot games
  saveAnalysis(a: GameAnalysis): Promise<void>; recordExplanationFeedback(f: Omit<ExplanationFeedback,'id'|'createdAt'>): Promise<void>;
  saveProfile(p: Partial<Profile>): Promise<Profile> }
interface ActivityTracker { useTracking(area: 'puzzles'|'play'|'lessons'|'analysis'): void /* React hook: counts visible, active minutes */ }
interface OutboxEntry { id: string; table: TableName; op: 'insert'|'upsert'|'rpc'; payload: unknown; enqueuedAt: string; attempts: number; lastError?: string }
interface PushResult { id: string; ok: boolean; duplicate?: boolean; error?: string; retryable?: boolean }
type RemoteChange = { table: TableName; row: unknown; op: 'insert'|'update'|'delete' };
interface SyncAdapter { readonly kind: 'none'|'supabase'|'memory'; push(entries: OutboxEntry[]): Promise<PushResult[]>;
  pullAll(): Promise<RemoteChange[]>; subscribe(onChange: (c: RemoteChange) => void): () => void }
interface SyncState { mode: 'local'|'cloud'; online: boolean; pending: number; status: 'local-only'|'synced'|'pending'|'offline'|'error'; lastSyncedAt?: string; error?: string }
interface SyncService { state(): SyncState; observe(): Subscribable<SyncState>; flush(): Promise<void> }
interface AuthSession { userId: string; email?: string; provider: 'email'|'google'|'local'; expiresAt?: string }
interface AuthService { readonly mode: 'local'|'cloud'; session(): AuthSession | null; observe(): Subscribable<AuthSession | null>;
  signInWithEmailLink(email: string): Promise<void>; signInWithGoogle(): Promise<void>; handleCallback(url: string): Promise<void>; signOut(): Promise<void>; accessToken(): Promise<string | null> }
interface AccountService { exportData(): Promise<Blob>; deleteAccount(): Promise<void> }
interface DataServices { repos: Repositories; progress: ProgressService; sync: SyncService; auth: AuthService;
  account: AccountService; activity: ActivityTracker; deviceId: string }
```

`tables.ts` – DB contract (snake_case rows) used by the Supabase adapter (WP-08) and the migrations (WP-11). Tables
(PRD Datenmodell + D-29 extras): `profiles`, `ratings`, `puzzles`, `puzzle_attempts`, `review_queue`, `games`,
`game_moves` (event log, unique `(game_id, seq)`, carries `user_id`), `game_analyses`, `bots`, `courses`, `lessons`,
`lesson_steps`, `lesson_progress`, `daily_activity`, `theme_stats`, `explanation_usage`, `explanation_feedback`.
Export `TableName`, one `…Row` type per table, `USER_TABLES` (tables with `user_id`), `APPEND_ONLY_TABLES`
(`puzzle_attempts`, `game_moves`, `explanation_feedback`), and mapping helpers `toRow`/`fromRow` per entity.

`services.ts`
```ts
interface AppConfig { mode: 'local'|'cloud'; supabaseUrl?: string; supabaseAnonKey?: string; explainUrl?: string;
  cloudEvalEnabled: boolean; e2e: boolean }
interface AppServices { config: AppConfig; data: DataServices; engines: { play: EngineService; analysis: EngineService };
  analysis: AnalysisService; bots: BotEngine; botRoster: BotProfile[]; explain: ExplanationService }
```

`schemas/` (zod): `puzzleSchema`, `puzzleBankManifestSchema`, `courseMetaSchema`, `lessonSchema` (all five step types,
recursive move tree), `settingsSchema`, `explainRequestSchema`, `explainResponseSchema`, `gameImportRequestSchema`.

`testing/` (frozen, used by everyone in wave 1): `createMemoryDataServices()` (fully functional in-memory repositories
with `observe`, ProgressService using `lib/rating`, no-op sync/local auth), `FakeEngineService` (scriptable: map
FEN → lines; default: first legal move, cp 0), `FakeAnalysisService`, `FakeBotEngine` (random legal move, seeded),
`FakeExplanationService` (returns facts as plain text), fixtures: a 40-move game (PGN + UCI list, includes a known blunder),
5 legal sample puzzles (incl. one with two mating moves), one sample course with one lesson using all 5 step types.
Contract tests in `src/core/testing/*.test.ts` prove the fakes behave as documented.

**Service wiring with ownership transfer (D-03).** `src/app/services.tsx` builds `AppServices` once and provides it via
React context (`useServices()`, `useSettings()`); it imports these factories from fixed module paths. WP-00 writes each
as a placeholder returning the fake; the owning package replaces the implementation **without changing the signature**:
- `src/data/index.ts` → `createDataServices(config: AppConfig): DataServices` (WP-08)
- `src/engine/index.ts` → `createEngineService(role: 'play'|'analysis', config: AppConfig): EngineService` (WP-02)
- `src/analysis/index.ts` → `createAnalysisService(engine: EngineService, config: AppConfig): AnalysisService` (WP-02)
- `src/bots/index.ts` → `createBotEngine(engine: EngineService, config: AppConfig): BotEngine` and `BOT_ROSTER: BotProfile[]` (WP-04)
- `src/explain/index.ts` → `createExplanationService(config: AppConfig, data: DataServices): ExplanationService` (WP-05)
Settings store: zustand store seeded with `DEFAULT_SETTINGS`, loaded from and saved through `data.repos.profile`
(`updateSettings`), applies theme class to `<html>`.

### 2.7 Shared runtime libraries – `src/lib/` (frozen, tested)
- `lib/chess/` – thin wrappers over chess.js, the **only** rules layer (no own move generation):
  `ChessGame` class: `static fromFen(fen)`, `static fromMoves(startFen, uciMoves)` (replay, keeps repetition history –
  used for resume), `static fromPgn(pgn)`, `legalMoves(square?)`, `move(input: Uci | San | MoveInput): MoveRecord | null`
  (never throws), `undo()`, `fen()`, `history(): MoveRecord[]`, `status(): GameStatus`, `claimDraw(kind)`, `resign(color)`,
  `pgn(headers)`, `repetitionCount()`.
  `status()` per FIDE (D-04): checkmate; stalemate → draw; insufficient material (chess.js, D-05) → draw;
  **fivefold repetition** (FIDE 9.6.1) and **75-move rule** (9.6.2, halfmove clock ≥ 150, checkmate on the last move takes
  precedence) end the game automatically; threefold repetition (9.2) and 50-move rule (9.3, halfmove clock ≥ 100) only
  appear in `claimableDraws`. **Never use chess.js `isGameOver()`/`isDraw()` for termination** (they end the game on
  threefold/50-move). Repetition key = first four FEN fields (chess.js only writes an en-passant square when a capture is
  possible – verify in a test).
  `validateFen(fen): { ok: true } | { ok: false; errorDe: string }` – chess.js `validateFen` plus: exactly one king per
  side, side not to move not in check, no pawns on rank 1/8, castling rights consistent with king/rook squares,
  en-passant square consistent; German messages.
  Notation: `uciToSan(fen, uci)`, `sanToUci(fen, san)`, `formatSan(san, notation)` (de: K D T L S, promotion `=D`,
  castling `0-0`/`0-0-0` (D-23); en: unchanged), `pieceNameDe(piece)`, `PIECE_VALUES`, `materialBalance(fen)`.
- `lib/rating/glicko2.ts` – Glicko-2 (Glickman, "Example of the Glicko-2 system"): `updateGlicko2(r, results, opts)`,
  RD clamp `[minRd, maxRd]`, τ 0.5 (D-09). Test reproduces the worked example: 1500/200/0.06 vs (1400,30) win,
  (1550,100) loss, (1700,300) loss → 1464.06 / 151.52 / 0.05999 (±0.01).
- `lib/uci/` – UCI line parser (`id`, `uciok`, `readyok`, `info` with depth/seldepth/multipv/score cp|mate +
  lowerbound/upperbound/nodes/nps/time/pv, `bestmove` incl. `(none)`), conversion to White-POV `Score`, and
  `createUciEngineService(transport: UciTransport, id: string): EngineService` (queue, `isready` sync, per-call options
  restored, abort via `stop`). `lib/uci/node.ts`: Node transport using `require('stockfish')('lite-single', …)`
  (`processCommand`/`terminate`) and `createNodeEngineService()` – used by tests and scripts (verified to work: depth 12
  on the start position ≈ 0.2 s).
- `lib/ids.ts` (`newId()` = `crypto.randomUUID()`), `lib/time.ts` (`localDateKey(date, timeZone)`), `lib/observable.ts`
  (`useSubscribable` React hook), `lib/cn.ts`.

### 2.8 Content validation aggregator
`scripts/validate-content.ts` discovers every `scripts/validate/*.ts` module (default export
`async (ctx: ValidationContext) => ValidationReport`), runs them, prints a summary table and exits 1 on any error.
`ValidationContext` (in `scripts/lib/validation.ts`): shared Node `EngineService` (lazy), `cache` (JSON files in
`.cache/validate/`, key = sha256(content + engine id + validator version)), `quick` flag (`--quick` skips engine checks),
logger. With zero validators it prints "no validators" and exits 0.

### 2.9 Playwright
`playwright.config.ts`: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (env already set; keep default), Chromium only;
projects `desktop` (1440×900) and `mobile` (390×844, `hasTouch`, `isMobile`); `E2E_PORT` (default 4173);
`E2E_SERVER=dev` → `node scripts/copy-engine.mjs && vite --mode e2e --port $E2E_PORT --strictPort`; default (preview) →
`node scripts/copy-engine.mjs && vite build --mode e2e --outDir .build/e2e && vite preview --outDir .build/e2e --port $E2E_PORT --strictPort`.
`e2e/support/fixtures.ts`: `test` that fails on any console error or page error; `e2e/support/board.ts`:
`clickMove(page, from, to, promotion?)`, `dragMove(...)`, `readFen(page)` using the selector contract;
`e2e/support/app.ts`: `freshStart(page)` (clears IndexedDB/localStorage). `e2e/smoke/smoke.spec.ts`: app loads on both
projects, six areas visible and navigable, every route in `paths.ts` renders without console errors.

### 2.10 Documents
`docs/team/CONVENTIONS.md`: folder layout + ownership map (copy section 1 of this backlog), commands (normal and
parallel-safe variants), coding rules (TS strict, no `any` without comment, pure functions for domain logic, React
function components, Zustand only for UI state, TanStack Query for async non-live data, Dexie liveQuery for persisted
data), test conventions (file naming, fakes, engine tests), selector contract, i18n/strings rule, notation rule,
accessibility rules (keyboard, focus, 44 px targets, WCAG AA), performance budgets (PRD), how to add a validator,
how placeholders/ownership transfer work. `README.md` (setup, scripts, local vs cloud mode), `THIRD_PARTY_NOTICES.md`
(Stockfish GPL-3.0, chess.js BSD-2-Clause, react-chessboard MIT, lichess chess-openings CC0, Lichess puzzles CC0 – and
the GPL note from the PRD risk table).

### 2.11 Acceptance criteria (WP-00)
1. `npm install` completed with all listed dependencies; `npm ls` has no errors; Playwright is exactly 1.56.1.
2. All scripts of 2.2 exist; `typecheck`, `lint`, `test`, `build`, `validate:content`, `e2e` pass.
3. Shell: six areas with German labels, sidebar ≥ 1024 px, bottom tab bar below, no horizontal scroll at 360 px, keyboard navigable, dark default.
4. Every route of `paths.ts` resolves (placeholders), 404 page, `/analysis/:gameId` deep link works after reload.
5. All contracts of 2.6 exist with JSDoc; zod schemas parse the fixtures; `PUZZLE_THEMES` has ≥ 20 trainable themes with German labels.
6. Fakes pass their contract tests; the app runs in local mode on the in-memory placeholders.
7. `lib/chess` tests: checkmate, stalemate, insufficient material, fivefold, 75-move (incl. mate-on-150th-half-move precedence), threefold and 50-move only claimable, castling legal/illegal cases (in check, through attacked square, into check, rook crossing attacked square is legal, pieces between), en passant only immediately, promotion to Q/R/B/N, replay keeps repetition count, `validateFen` rejects the listed invalid cases with German messages, `formatSan` de/en.
8. Glicko-2 reproduces Glickman's example; UCI parser tests; Node engine finds mate in 1 (`6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1` → `d1d8`, score mate +1 White POV).
9. Minimal board: legal drag and click moves, promotion choice, selector contract – covered by an e2e smoke on a placeholder page.
10. BoardLayout, primitives, CoachBubble, ClassificationBadge render in light and dark (unit/component tests).
11. `validate:content` aggregator runs with zero validators (exit 0) and with a dummy validator (exit 1 on error).
12. `CONVENTIONS.md`, `README.md`, `THIRD_PARTY_NOTICES.md`, `.env.example`, `.env.e2e`, `.gitignore` written.

**Checks:** `npm ls`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run validate:content`, `npm run e2e`.

---

## 3. Wave 1 packages

### WP-01 Board & Analysebrett
**PRD:** P0-03, P0-16 (board), Funktionsumfang §6 Analysebrett, §3 "Variante erkunden" target, Gestaltungsregeln (sounds,
animation ≤ 200 ms, colour codes, arrow keys), NFR Barrierefreiheit. **Depends:** WP-00. **Port:** 5201.
**Consumes:** `lib/chess`, `useSettings()`, `useServices().engines.analysis`, `ClassificationBadge`, `BoardLayout`, `paths`.
**Exposes:** `@/ui/board` (`Board`, `BoardProps`), `@/ui/chess` (`MoveList`, `EvalBar`, `usePlyNavigation`,
`NavigationControls`), `@/ui/sound` (`playSound(kind)`), page `/analysis/board`.

Instructions:
- Complete `Board`: props `fen`, `orientation`, `interactive`, `onMove(move: MoveRecord)`, `onMoveAttempt?(input) => boolean|Promise<boolean>`
  (lets callers veto/confirm before commit – used by coach warning and move confirmation), `arrows`, `marks`,
  `annotations: Array<{ square; classification }>` (symbol at the piece), `lastMove`, `highlightCheck`, `allowUserArrows`.
  Drag-and-drop and click-click (legal target dots, capture rings); illegal drop snaps back without state change.
  Promotion dialog (Dame/Turm/Läufer/Springer, German labels, ≥ 44 px targets, Escape cancels and returns the pawn).
  Castling by moving the king two squares (and by dropping the king on its own rook if react-chessboard allows it cleanly).
  Right mouse: drag draws an arrow, click toggles a square mark (Shift/Alt/Ctrl colours per DESIGN §2.2); left click
  clears user arrows/marks. Visual details (dots, rings, highlights, badge position, promotion picker, coordinates,
  board size rule, board themes Moos/Holz) exactly per DESIGN.md §2.2 and §4; board-theme mapping in `src/ui/board/boardTheme.ts`.
  Flip button component + `orientation` prop; coordinates per `settings.showCoordinates`.
  Highlights: last move, king in check, selected square, hint piece/target.
  Keyboard: board is focusable; arrow keys move a square cursor; Enter/Space selects and moves; screen-reader label
  announces the move in German ("Springer f3").
  Animations ≤ 200 ms, off when `settings.animations` is false or `prefers-reduced-motion`.
  Keep the selector contract of WP-00 §2.5.
- `ui/sound`: synthesize move, capture, check, success, error sounds with WebAudio (no audio files); respect
  `settings.sound`; no-op without AudioContext (tests).
- `ui/chess`: `MoveList` (SAN via `formatSan` in user notation, move numbers, current ply highlight, click to jump,
  optional classification icons), `usePlyNavigation` (ArrowLeft/ArrowRight/Home/End), `EvalBar` (White-POV `Score`,
  mate shown as "M3", accessible text).
- `/analysis/board` (`src/features/analysis-board/`): free play from start, `?fen=` or `?pgn=`; position editor
  (place/remove pieces, side to move, castling rights, en-passant square; validated with `validateFen`, German error);
  load FEN/PGN (errors shown in German), export FEN (copy) and PGN (copy/download); move list with navigation (playing
  a move from an earlier ply replaces the later moves after confirmation); live engine toggle with top 2 lines (DESIGN §3.5)
  (eval + depth, `engines.analysis`, stops on navigation); button "Gegen Bot ausspielen" → `paths.playFromPosition(fen)`.
- Document the board API in `src/ui/board/README.md`.

Acceptance criteria:
1. Moves work by drag-and-drop, click-click and touch (mobile project) – only legal moves are accepted.
2. Promotion dialog for both colours yields Q, R, B and N correctly; no auto-queen; cancel restores the pawn.
3. Castling and en passant work exactly per chess.js (e2e: legal castling both sides; castling refused when in check / through an attacked square; en passant only on the immediately following move).
4. Right-click arrows and square marks on desktop; programmatic arrows/marks/annotations render distinctly.
5. Flip, coordinates, last-move and check highlight, hint highlights work.
6. Sounds for move/capture/check/success/error play when enabled and never when disabled.
7. Board and analysis board usable at 360 px (no horizontal overflow) and at 2560 px.
8. Full keyboard operation of the board (select and move a piece without a mouse) – e2e.
9. MoveList shows German letters (K D T L S, `0-0`) by default and English when `settings.notation = 'en'`.
10. Analysis board: setup editor rejects illegal positions with German messages; FEN/PGN import/export round-trips; engine lines appear when the engine is available (fake engine in wave 1); "Gegen Bot ausspielen" navigates with the FEN.

Checks: typecheck; `npx eslint src/ui/board src/ui/chess src/ui/sound src/features/analysis-board e2e/board`;
`npx vitest run src/ui/board src/ui/chess src/ui/sound src/features/analysis-board`; build to `.build/WP-01`;
`E2E_SERVER=dev E2E_PORT=5201 npx playwright test e2e/board --output test-results/WP-01`.

### WP-02 Engine & analysis core
**PRD:** P0-10 (pipeline, accuracy, classification, best move per position), P0-11 (engine facts), P0-08 (move
assessment for coach), Analyse-Pipeline 1–4, Gewinnwahrscheinlichkeit/Genauigkeit formulas, Randfall 3, NFR Performance.
**Depends:** WP-00. **Consumes:** `lib/uci`, `lib/chess`, core contracts. **Exposes:** `createEngineService`,
`createAnalysisService`, pure functions `winPercent`, `moveAccuracy`, `gameAccuracy`, `expectedPointsLoss`,
`classifyMove`, `detectMotifs`, `buildFacts`, `lookupOpening`, `gamePhase` from `@/analysis` / `@/engine`.

Instructions:
- Browser engine (`src/engine/`): Worker transport
  (`new Worker(import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js')`, the matching `.wasm` sits next to it),
  `createEngineService(role)` = `createUciEngineService(workerTransport)`; separate worker per role (D-27); status and
  loading progress for "Engine lädt" UI; on init measure speed (`go depth 10`) and derive a budget (default depth 16–18,
  per-position movetime cap) so weak devices use less depth instead of freezing; abort ≤ 100 ms.
- Optional Lichess cloud-eval provider (`config.cloudEvalEnabled`): GET cloud-eval with 1.5 s timeout; 404/429/network →
  local engine; after 429 pause 60 s. Never required (CONSTRAINTS §2); tests mock `fetch`.
- Formulas (`src/analysis/`): verify constants against the Lichess source before implementing – fetch lila from GitHub
  raw (e.g. `modules/analyse/src/main/AccuracyPercent.scala`, `WinPercent`, `Divider`; reachable via
  raw.githubusercontent.com) and record URL + commit in `src/analysis/SOURCES.md` (formulas are facts; do not copy AGPL code).
  `winPercent(cp) = 50 + 50·(2/(1+e^(−0.00368208·cp)) − 1)` (mate/clamp handling per lila);
  `moveAccuracy = 103.1668·e^(−0.04354·(Wbefore − Wafter)) − 3.1669` (+ lila's uncertainty bonus only if confirmed), clamped 0–100;
  game accuracy aggregation per lila (volatility-weighted mean and harmonic mean).
- `expectedPointsLoss = max(0, EP(best) − EP(played))`, EP = mover's win% / 100. Classification (D-07):
  book (position after the move is in the opening book and no earlier move of that game left the book) >
  brilliant > great > best > excellent > good > miss > inaccuracy/mistake/blunder, with
  best: played = engine best or loss < 0.005; excellent: ≤ 0.02; good: ≤ 0.05; inaccuracy: ≤ 0.10; mistake: < 0.20; blunder: ≥ 0.20;
  brilliant: loss ≤ 0.02 AND a real piece sacrifice (after the move the moved piece or another piece can be won by the
  opponent with SEE ≤ −2 pawns, or the move itself is a losing capture by SEE) AND mover's win% after ≥ 50 AND win%
  before < 97 AND not the only legal move AND not a recapture;
  great: loss ≤ 0.02, not brilliant, and either (EP(best) − EP(second-best) ≥ 0.15) or (mover's win% before < 30 and after ≥ 50 – saves a lost position), excluding recaptures and only-legal-moves;
  miss: the opponent's previous move was mistake/blunder, the best reply would have recovered ≥ 0.10 EP, and the played move has 0.10 ≤ loss < 0.20 (blunders stay blunders).
- Opening book: `npm run openings:build` downloads `a.tsv`–`e.tsv` of lichess-org/chess-openings (CC0) from GitHub raw,
  replays each line with chess.js, writes `src/analysis/openings/openings.json` (EPD → { eco, name }); lazy-loaded;
  `lookupOpening(fen)`. Commit the generated JSON.
- Pipeline `analyseGame`: book check → engine per position (MultiPV 2) → loss/classification/accuracy → game accuracy
  per side → counts → eval graph → key moments (3–5 largest EP losses ≥ 0.10; fewer only if the game has fewer) →
  phase per ply (lila Divider logic, documented) → `facts` for every mistake, miss and blunder → progress after every
  position; abortable; `engineVersion` stored.
- Motif detectors (pure, chess.js only): hanging piece (attacked, SEE < 0), fork, pin (absolute/relative), skewer,
  discovered attack/check, double check, mate threat (from engine mate score), back-rank weakness, trapped piece,
  material swing along a PV. `buildFacts(kind, …)` creates `ExplanationFacts` containing only engine-confirmed lines
  (SAN generated by chess.js from engine PVs).
- `prepare(fen)` (analyse the position in the background and cache it, LRU by FEN; superseded by the next `prepare`),
  `assessMove(fenBefore, move)` (reuses the cached analysis; only the position after the move is searched, shallow;
  coach, D-41), `findThreats(fen)` (pass-move analysis: if the side to
  move is not in check, give the move to the opponent and report the opponent's best move when it wins ≥ 2 pawns or mates).
- Bench `npm run bench:analysis`: Node engine (lib/uci/node) analyses the 40-move fixture (core testing) and prints total time.

Acceptance criteria:
1. Browser EngineService implements the contract; two roles run independently; abort works; status/progress emitted.
2. `winPercent`, `moveAccuracy`, `gameAccuracy` match lila (constants and test values documented in SOURCES.md with URL + commit).
3. Classification thresholds exactly as D-07; one unit test per category and per boundary (0.005, 0.02, 0.05, 0.10, 0.20).
4. Book moves detected from the lichess openings data; data file committed with source and licence note.
5. `analyseGame` on the 40-move fixture (80 plies) finishes in ≤ 30 s in Node on this machine (`bench:analysis` output recorded in the report) with progress callbacks; best move present for every position.
6. Key moments 3–5; phases per ply; facts for every mistake/miss/blunder contain only moves from engine lines.
7. Motif detectors have unit tests on validated FENs (≥ 3 positive and ≥ 1 negative case per detector).
8. `assessMove` ≤ 1 s cold and ≤ 500 ms after `prepare(fenBefore)` has finished (Node, default budget; D-41), and flags a
   hanging-queen move with loss ≥ 0.20 and motif `hanging_piece`.
9. Cloud-eval failure paths tested (timeout, 404, 429, network error) – analysis still completes locally.

Checks: typecheck; `npx eslint src/engine src/analysis scripts/openings scripts/bench`; `npx vitest run src/engine src/analysis`;
`npm run openings:build`; `npm run bench:analysis`; build to `.build/WP-02`.

### WP-03 Puzzles
**PRD:** P0-04, P0-05, P0-06, P0-01 (demo: 5 puzzles), Puzzles §1 Ablauf/Hinweise/Erklärung, Randfall offline, NFR
Offline (≥ 200 puzzles locally), Performance (≤ 300 ms). **Depends:** WP-00. **Port:** 5203.
**Consumes:** `Board`, `BoardLayout`, `CoachBubble`, `data.repos.puzzles/puzzleAttempts/ratings/themeStats`,
`data.progress.recordPuzzleAttempt/initializeFromSelfAssessment`, `data.activity`, `explain.explainRuleBased`,
`SELF_ASSESSMENT_OPTIONS`, `PUZZLE_THEMES`, `paths`. **Exposes:** `@/puzzles` (`selectNextRated`, `checkPuzzleMove`,
`loadPuzzleBank`, `PuzzleSession` logic) and pages under `/puzzles`.

Instructions:
- Puzzle domain (`src/puzzles/`): session state machine (opponent's first move auto-played after ≤ 600 ms with
  animation; user move checked against the solution; accepted if equal to the solution move **or if it delivers
  checkmate** (D-12); after a correct user move the opponent's reply is auto-played; solved after the last move).
  Wrong move: red mark + error sound, move reverted, attempt failed (rated) / retry allowed (learning, theme).
  Hints (DESIGN §8.1): stage 1 highlight piece, stage 2 show target square, stage 3 play the remaining solution.
  In rated mode the first hint shows the one-time confirm line ("Ein Hinweis zählt das Puzzle als nicht gelöst.") and
  fails the attempt (D-11). Feedback timings, no auto-advance and the leave-confirmation for rated puzzles per DESIGN §8.2/§3.4.
- Rated selection: rating window ±150 around the current puzzle rating; exclude every puzzle with a previous rated
  attempt; widen to ±250, ±400, then any rating only when empty (show a short notice); if no unrated puzzle is left,
  show a message and a link to the learning mode. Prefetch the next puzzle while the current one is being solved so
  "Weiter" shows it in ≤ 300 ms (`performance.mark`).
- If no puzzle rating exists yet, show the self-assessment choice (`SELF_ASSESSMENT_OPTIONS`) and call
  `progress.initializeFromSelfAssessment` (onboarding in WP-09 reuses the same service call).
- Record each attempt via `progress.recordPuzzleAttempt` (mode, solved, firstTry, hints, solutionShown, time, themes,
  puzzle rating/RD); show the new rating with delta and a "vorläufig" marker while `provisional`.
- Learning mode: no rating, no timer, hints and "Lösung zeigen" (step through the solution with Vor/Zurück),
  retry allowed; after every puzzle show German motif tags and the 1–3 sentence explanation (`puzzle.explanation`;
  if missing, `explain.explainRuleBased({ kind: 'puzzle', … })`).
- Theme training: list all trainable themes from `PUZZLE_THEMES` with available count and the user's success rate;
  difficulty filter Leicht/Mittel/Schwer/Alle (rating −300…−100 / ±100 / +100…+300 around the user's rating); opening
  filter via `openingTags` when data exists; unrated (D-11); attempts recorded with mode `theme` so theme stats update.
- Demo `/puzzles/demo`: 5 fixed easy puzzles, nothing persisted, call to action "Anmelden, um Fortschritt zu speichern".
- Bank loading (D-25): `public/data/puzzles/manifest.json` + chunk files → `repos.puzzles.bulkUpsert` on first start and when
  the manifest version changes (offline afterwards). Write the wave-1 seed `public/data/puzzles/seed.json`: ≥ 40
  hand-checked puzzles in Lichess format (≥ 20 rated ≤ 600: mate in 1, win a hanging piece; the rest up to ~1400), each
  with themes and a German explanation (1–3 sentences).
- Validator `scripts/validate/puzzles.ts` (all chunks of the manifest): zod schema; legal FEN (`validateFen`); all moves
  legal in sequence; side to move after `moves[0]` is the solver; at every user ply the solution move is
  (a) an immediate checkmate, or (b) in a forced-mate puzzle the fastest mate and no other move mates within the same
  number of moves, or (c) otherwise engine-best with a margin ≥ 0.10 expected points over the second-best move
  (depth ≥ 18, MultiPV 2); `mateInN` themes match the engine mate distance; other immediately mating moves are allowed
  (accepted at runtime, D-12);
  rating 100–3000; every puzzle has an explanation or is from source `lichess`; theme ids exist in `PUZZLE_THEMES`.
  Uses the validation cache; `--quick` skips engine checks.
- Lichess importer `npm run puzzles:import-lichess -- --input <file.csv|file.csv.zst> --out <dir> [--min-popularity 80]
  [--min-plays 300] [--max 500000] [--rating-min 0] [--rating-max 3500]`: streaming parse (`csv-parse`, `fzstd` for .zst),
  exact columns `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags`, chess.js
  legality check per row (bad rows skipped and counted), writes manifest + chunk JSON for the app and a CSV for the
  Supabase seed; documented in `scripts/puzzles/README.md`; tested with a small fixture CSV that includes malformed rows.
- End screen action "Gegen Bot ausspielen" (`paths.playFromPosition(fenAfterOpponentMove)`); `activity.useTracking('puzzles')`.

Acceptance criteria:
1. Opponent's first move is auto-played; correct sequences complete the puzzle; wrong moves are marked immediately.
2. Any checkmating move is accepted (fixture with two mating moves).
3. Three hint stages work; a hint in rated mode counts as not solved.
4. Rated selection stays within ±150 when possible and never serves a puzzle that already has a rated attempt (unit test over 500 simulated attempts).
5. Glicko-2 update after every rated attempt is visible immediately (rating + delta).
6. Next puzzle appears ≤ 300 ms after "Weiter" (e2e measurement on desktop project).
7. Learning mode: hints, playable solution, motif tags + 1–3 sentence explanation after every puzzle.
8. Theme training lists ≥ 20 motifs, difficulty filter works, success rate per motif is stored and shown.
9. Demo shows exactly 5 puzzles and persists nothing.
10. After the bank is loaded, rated and learning mode work offline (`context.setOffline(true)`).
11. Seed bank and fixture pass `validate:content` (full engine mode); importer test passes.

Checks: typecheck; eslint and vitest on `src/puzzles src/features/puzzles scripts/puzzles scripts/validate/puzzles.ts`;
`npm run validate:content`; build to `.build/WP-03`; `E2E_SERVER=dev E2E_PORT=5203 npx playwright test e2e/puzzles --output test-results/WP-03`.

### WP-04 Bots & play
**PRD:** P0-07, P0-08, P0-09, P0-03 (game-level draw rules), Spielen §2 (personalities, assistance levels, resume,
play from position, bot rating), Bots: Technik je Stärke, Laufende Partie auf zwei Geräten, NFR bot answer ≤ 1 s.
**Depends:** WP-00. **Port:** 5204. **Consumes:** `Board` (`@/ui/board`), `MoveList`, `EvalBar` (`@/ui/chess`) – WP-00
placeholders until WP-01 is integrated, `engines.play`, `analysis.assessMove/findThreats`, `explain`, `data.progress`
(createGame/appendGameEvent/finishGame), `data.repos.games/gameMoves/ratings`, `lib/chess`, `paths`.
**Exposes:** `BOT_ROSTER`, `createBotEngine`, `recommendBot(rating)`, pages under `/play`.

Instructions:
- Roster (D-17): 14 bots – 100, 250, 400, 550, 700 (5 below 800), 850, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500.
  Original German names and personalities (suggestion: Pip, Lotte, Emil, Greta, Kalle, Nina, Theo, Frieda, Jonte, Ida,
  Oskar, Henrike, Professor Kraus, Zora – adjust freely, no chess.com names or images), original SVG avatars in
  `public/avatars/bots/`, style + German description, repertoire (2–4 lines per colour, validated by
  `scripts/validate/bots.ts`), German chat lines (greeting, capture, check, win, loss, draw).
- Engines (D-16): < 800 `stockfish-skill` (Skill Level 0–3) plus rule-based gross errors whose frequency falls with Elo
  (overlooking attacked pieces, missing captures – chosen from plausible-looking moves, not uniformly random);
  800–2000 `stockfish-human`: MultiPV candidates (8–12) at an Elo-dependent depth, softmax over expected-points loss
  with Elo-dependent temperature, Elo-dependent "blindness" to opponent threats (shallower search on opponent replies),
  preference for natural moves (recaptures, development, checks); must not be "perfect moves plus random blunders";
  2100–2500 `stockfish-elo` (UCI_LimitStrength + UCI_Elo). `MaiaBotEngine` stub + `src/bots/maia/README.md`
  (ONNX/onnxruntime-web plan); `engine: 'maia'` falls back to `stockfish-human`.
- Repertoire first (random among matching lines), then engine. Think time 1–8 s by complexity (legal move count,
  eval spread of candidates, captures available), skipped when `config.e2e`; compute time ≤ 1 s per move.
- Calibration `npm run bots:calibrate` → `docs/team/bot-calibration.md`: per bot over ≥ 200 positions from the fixture
  games: mean expected-points loss (reference engine depth 14), best-move share, inaccuracy/mistake/blunder shares.
- Setup (dialog on `/play`): bot list with avatar, name, Elo, style; colour (Weiß/Schwarz/Zufall); assistance level
  with explanation and "zählt fürs Bot-Rating: ja/nein"; no time-control selector in V1 (D-06/D-31).
- Levels: Wettkampf = no help, rated (bot rating via `progress.finishGame`, opponent rating = bot Elo, RD 50);
  Training = unlimited takeback (own move + bot reply, stored as takeback event), hint on request (stage 1 piece,
  stage 2 best-move arrow, D-36), eval bar; Coach = Training + before committing a user move with loss ≥ 0.20
  (`analysis.prepare(fen)` when the user's turn starts; `assessMove` via `Board.onMoveAttempt`; the move is held at most
  800 ms, then played without warning – DESIGN §8.2, D-41) a warning with a German reason from `explain.explain(facts)` ("Bist du sicher?
  …") and buttons "Trotzdem ziehen" / "Anderen Zug wählen"; after each bot move show opponent threats
  (`findThreats`: arrow + sentence) when they win ≥ 2 pawns or mate; short praise for best/great/brilliant moves.
  Coach bubble ≤ 3 sentences with "Mehr erfahren".
- Game end strictly via `ChessGame.status()` (D-04): checkmate, stalemate, insufficient material, fivefold, 75-move end
  automatically; threefold/50-move → button "Remis beanspruchen" for the user; the bot claims when claimable and
  `shouldClaimDraw` (its eval ≤ 0 for itself); "Aufgeben" with confirmation. Result dialog with German reason (DSB
  terms) and actions "Analyse ansehen" (`paths.analysisGame(id)`), "Revanche", "Neue Partie".
- Persistence/resume: `progress.createGame` (source `bot`, startFen, origin) and `appendGameEvent` after every move or
  takeback; `/play/game/:id` rebuilds the position with `ChessGame.fromMoves(startFen, moves)` (repetition history kept);
  active games listed on `/play`. Respect `settings.moveConfirmation` (confirm before commit).
- Two devices: heartbeat every 10 s (`games.heartbeat`); if another device's heartbeat is < 30 s old, ask "Partie läuft
  auf einem anderen Gerät – hier übernehmen?"; after `takeOver` the other device shows a notice and becomes read-only.
- `/play/position?fen=`: validate with `validateFen` (German error), choose bot/colour/level, game with `origin`.

Acceptance criteria:
1. ≥ 10 bots (14 planned) between 100 and 2500 with ≥ 4 below 800, each with name, avatar, style, repertoire, chat lines.
2. Calibration report: mean expected-points loss strictly decreasing with Elo; for every 800–2000 bot (inaccuracies + mistakes) ≥ 2 × blunders and best-move share between 25 % and 75 % (targets may be tuned once with reason in the report).
3. Bot compute time ≤ 1 s per move at default budget (measured in calibration); think time 1–8 s outside e2e.
4. Wettkampf/Training/Coach behave as specified; takeback unlimited in Training and Coach; Wettkampf games update the bot rating, others do not.
5. Coach warning appears before a move losing ≥ 0.20 expected points with a German reason (e2e with a fixture position where the queen can be hung).
6. Game end per FIDE: tests for mate, stalemate, insufficient material, fivefold, 75-move, threefold/50-move claim (not automatic), resignation.
7. Reload or a new browser context resumes the game at the same move (e2e); takeover dialog works with two contexts on the same data (memory/Dexie per WP-08 after integration).
8. Play from any valid FEN; invalid FEN shows a German error.
9. Usable at 360 px; all moves via keyboard possible (inherits board).

Checks: typecheck; eslint/vitest on `src/bots src/features/play scripts/bots scripts/validate/bots.ts`; `npm run bots:calibrate`;
`npm run validate:content`; build to `.build/WP-04`; `E2E_SERVER=dev E2E_PORT=5204 npx playwright test e2e/play --output test-results/WP-04`.

### WP-05 Review, explanations & PGN import
**PRD:** P0-10 (UI), P0-11, P0-15, Partieanalyse §3 (summary, colours, explanations, "Nochmal versuchen", "Variante
erkunden"), Analyse-Pipeline step 5, P2-01/P2-02/P2-06, Erfolgsmetriken (thumbs up/down).
**Depends:** WP-00. **Port:** 5205. **Consumes:** `analysis.analyseGame/assessMove`, `Board`, `MoveList`, `EvalBar`,
`ClassificationBadge`, `CoachBubble`, `data.repos.games/gameMoves/gameAnalyses`, `data.progress.saveAnalysis/recordExplanationFeedback/createGame`,
`data.auth.accessToken`, `config.explainUrl`, `lib/chess`, `paths`. **Exposes:** `createExplanationService`,
`parsePgnWithDiagnostics` (`@/pgn`), pages `/analysis`, `/analysis/:gameId`, `/analysis/import`.

Instructions:
- `/analysis` hub: own games (bot + pgn) with date, opponent, result, accuracy if analysed; actions "PGN importieren",
  "Analysebrett"; empty state suggests a fitting bot (`paths.play`).
- `/analysis/:gameId` (deep link): start `analyseGame` automatically when no stored analysis exists or `engineVersion`
  differs; progress bar "Analysiere Zug x von y", cancel; UI stays responsive; save via `progress.saveAnalysis`; reuse on reopen.
- Summary: accuracy both sides (0–100 %, one decimal), counts per category both sides, eval graph (own SVG, win% White
  per ply, click/keyboard to jump, table alternative for screen readers), 3–5 key moments.
- Move list + board: classification symbol and colour (DESIGN.md) at the piece and in the list; best move as arrow and
  SAN for every position; ArrowLeft/ArrowRight/Home/End.
- Explanations (`src/explain/`): rule-based German templates for kinds mistake, coach_warning, threat, praise, puzzle,
  driven by facts/motifs (e.g. "Nach Sxe5 gewinnt Weiß mit Dh5+ den Turm auf h8."), 1–3 sentences, du-form, segments
  with English SAN + `plain` in German notation (D-19). LLM path: when `config.mode === 'cloud'`, online and
  `allowLlm`: POST `ExplainRequest` to `config.explainUrl` with the user's access token, timeout 8 s, one attempt; accept
  only if every move segment is in `bestLine`/`refutation`/`playedMove`/`bestMove` of the facts and legal in sequence
  (validator), else fall back to rule-based; cache per (gameId, ply); store text + source in the analysis.
  Every mistake, miss and blunder gets an explanation, the better move as arrow and the follow-up line.
- Thumbs up/down under every explanation (`progress.recordExplanationFeedback`).
- "Nochmal versuchen": for mistake/blunder/miss reset the board to the position before the move; user tries; success
  when loss ≤ 0.02 (`assessMove`) or equal to best; up to 3 tries with hint stages (piece, target), then reveal.
- "Variante erkunden": open `/analysis/board?fen=` (WP-01) at the current position.
- PGN (`src/pgn/`): `parsePgnWithDiagnostics(text)` → games or `{ line, column, messageDe }` (tokenizer tracks lines;
  supports tag pairs, `{}`/`;` comments, NAGs, `( … )` variations (ignored – main line imported), SetUp/FEN, promotions,
  results, multiple games, BOM/CRLF). German messages, e.g. "Zeile 12: Ungültiger Zug „Nf9“ (Zug 23, Weiß)".
- `/analysis/import`: paste or upload `.pgn`; multiple games → selection list; save as source `pgn` with
  `externalId = sha256(normalised tags + movetext)`; duplicate → open the existing game; in cloud mode via
  `games-import` (contract `GameImportRequest/Response`; implemented by WP-11), local mode via `progress.createGame`;
  then open `/analysis/:gameId` (auto-analysis).

Acceptance criteria:
1. Analysis starts automatically, shows progress, completes the 40-move fixture in ≤ 30 s in Chromium (e2e measurement, desktop project, real engine after integration; with fake engine in wave 1 the flow must work).
2. Summary shows accuracy, counts per category, eval graph, 3–5 key moments; best move for every position.
3. Colour codes and symbols per PRD/DESIGN.md on board and list.
4. Every mistake/miss/blunder has a German explanation of 1–3 sentences naming only engine-confirmed moves; LLM failure/timeout/offline → rule-based explanation appears (unit + e2e with mocked endpoint).
5. LLM validator rejects texts with a move not in the facts or an illegal move (unit tests).
6. "Nochmal versuchen" works for a fixture blunder (success and reveal paths).
7. PGN import: ≥ 15 fixture PGNs (comments, variations, NAGs, FEN start, promotions, all results, multi-game, CRLF) parse correctly; invalid PGNs show a German error with the correct line number.
8. Imported games are stored with source `pgn` and an external id, analysed and listed; duplicates are not stored twice.
9. Deep link `/analysis/:gameId` works after reload; explanations are stored as plain text (+ segments) in the analysis.

Checks: typecheck; eslint/vitest on `src/explain src/pgn src/features/review src/features/pgn-import`; build to `.build/WP-05`;
`E2E_SERVER=dev E2E_PORT=5205 npx playwright test e2e/review --output test-results/WP-05`.

### WP-06 Lesson engine
**PRD:** P0-12, Lektionen §4 (Aufbau, Einstieg/skip test, Schritttypen, Bewertung, Fortschritt, Verzahnung), Kern-Ablauf
4, P2-04. **Depends:** WP-00. **Port:** 5206. **Consumes:** lesson contracts/schemas, `Board`, `BoardLayout`,
`CoachBubble`, `bots`/`BOT_ROSTER`, `lib/chess`, `data.progress.recordLessonProgress`, `data.repos.lessonProgress/profile/ratings`,
`paths`. **Exposes:** `@/lessons` (`loadCatalog`, `loadLesson`, `nextLessonFor`, `isUnlocked`, `computeStars`).

Instructions:
- Content loader (D-26): `import.meta.glob('/content/lessons/**/*.json')` (lazy per lesson), validated with core zod schemas
  (invalid content → visible dev error, never a crash in production); catalog includes planned courses. Use
  `src/lessons/__fixtures__/` for tests (until WP-07 content is integrated the UI must work with the fixture course).
- `/learn` Lernpfad: stages 0–4 with courses, progress (lessons done/total, stars), next lesson highlighted; planned
  courses/stages shown as "in Vorbereitung". Unlock rules (D-38): Stufe 0 always open; Stufe 1 open if
  `selfAssessment ∈ {beginner, club, advanced}` or skip test passed or Stufe 0 completed; lessons unlock sequentially
  within a course; the course test unlocks when all lessons are completed.
- Lesson player `/learn/:courseId/:lessonId` with the five step types: Erklärung (text + board + arrows/marks),
  Demo (Vor/Zurück + autoplay with comments), Finde den Zug (move tree: any accepted user move at a node, opponent's
  reply auto-played; `acceptAnyMate`; wrong → feedback + retry, counts a mistake; hints: text hints, then piece, then
  target highlight; each hint counts), Quiz (single choice, per-option feedback), Ausspielen (play vs bot from the FEN;
  goal checkmate/promote/draw within `maxMoves` judged with `ChessGame.status()`; retry).
- Progress: on every completed step call `recordLessonProgress` (currentStep, mistakes, hints); returning (also after
  reload or on another device) resumes at the saved step. Stars (D-13): 0 mistakes and 0 hints → 3, 1–2 → 2, ≥ 3 → 1; best stars kept.
- End screen: stars, "Nächste Lektion", Verzahnung: "Passende Puzzles" (`paths.puzzleTheme(practiceThemes[0])` or the
  theme list) and "Übungspartie" against the bot from `useServices().botRoster` nearest to the user's bot rating
  (no bot rating yet: nearest to the stage's Elo range, Stufe 0 → lowest bot).
- Course test and Stufe-0 skip test: score = correct first tries / exercises; pass ≥ `passThreshold` (default 0.8);
  pass → course completed / `profile.stageZeroSkipped = true`.
- "Diese Stellung gegen Bot spielen" action on explanation and demo steps (`paths.playFromPosition`).
- Keyboard: ArrowRight/ArrowLeft in explanation/demo, Enter = "Weiter". Phone: text below the board, actions fixed at the bottom.

Acceptance criteria:
1. All five step types work with the fixture course (e2e walks through every type).
2. Progress is saved per step; leaving and reopening (reload) resumes at the same step.
3. Stars follow D-13; unlock rules work (unit tests for every rule).
4. Course test/skip test scoring and pass threshold work.
5. Lesson end offers next lesson, matching puzzles and a practice game.
6. Usable at 360 px and fully by keyboard.

Checks: typecheck; eslint/vitest on `src/lessons src/features/lessons`; build to `.build/WP-06`;
`E2E_SERVER=dev E2E_PORT=5206 npx playwright test e2e/lessons --output test-results/WP-06`.

### WP-07 Lesson content
**PRD:** P0-13, Lehrplan (Stufe 0 complete + first three Stufe-1 courses), Lektionen §4, P0-04 (very easy puzzles from
lessons), CONSTRAINTS §1 and §3. **Depends:** WP-00. **Consumes:** lesson schemas, `lib/chess`, Node engine via
`ValidationContext`. **Exposes:** `content/lessons/**` (catalog + lessons), validator.

Instructions:
- Files: `content/lessons/catalog.json` (all courses incl. planned ones from the PRD Lehrplan with `status: 'planned'`),
  `content/lessons/<course-id>/<lesson-id>.json`. IDs stable, kebab-case.
- Courses and lessons (≈ 30 lessons + 6 course tests + 1 skip test):
  Stufe 0 "Brett und Figuren" (Brett und Feldnamen; Turm und Läufer; Dame und König; Springer; Bauer; Figurenwerte),
  "Schach, Matt und Patt" (Schach und drei Abwehrmöglichkeiten; Schachmatt; Patt; Erste Matts in 1; Remis-Regeln:
  ungenügendes Material, Wiederholung, 50 Züge), "Sonderregeln und Notation" (Rochade; En passant; Umwandlung; Notation;
  Partieablauf und Ergebnis); Stufe 1 "Keine Figuren verschenken" (Hängende Figuren; Angreifer und Verteidiger zählen;
  Der Sicherheits-Check vor jedem Zug; Tauschen nach Figurenwert; Gegnerische Drohungen erkennen), "Taktik-Grundlagen"
  (Gabel; Fesselung; Spieß; Abzug und Abzugsschach; Taktik-Mix), "Grundmatts und Mattbilder" (Grundreihenmatt;
  Dame und König gegen König; Turm und König gegen König; Typische Mattbilder; Matt in 2). Adjust titles if needed, keep the scope.
- Each lesson 5–12 steps, ≥ 3 different step types, starts with an explanation, ends with ≥ 2 exercises (find_move or
  quiz) as the short test; each course has ≥ 1 Ausspielen step (K+D vs K and K+T vs K in "Grundmatts").
- Rules content must match the FIDE Laws (cite article numbers in `sources`, confirm against `docs/team/RULES.md` when
  available): castling conditions (king and rook unmoved, squares between empty, king not in check, does not cross or
  land on an attacked square, the rook may cross an attacked square), en passant only immediately after the two-square
  advance, promotion compulsory to Q/R/B/N of the same colour (not limited to captured pieces), stalemate = draw,
  check must be answered, 50-move/threefold are claims while 75-move/fivefold end the game, insufficient material.
- Language: German, du, short sentences, DSB terms (Schach, Matt, Patt, Rochade, en passant/im Vorbeigehen schlagen,
  Umwandlung, Remis, Remis durch dreimalige Stellungswiederholung, 50-Züge-Regel), piece names König, Dame, Turm,
  Läufer, Springer, Bauer; German notation in texts (K D T L S, 0-0).
- Mark ≥ 30 very easy find_move exercises (mate in 1, win a hanging piece) with `puzzle: { rating 150–500, themes }`.
- Set `practiceThemes` for every Stufe-1 lesson (valid `PUZZLE_THEMES` ids).
- Validator `scripts/validate/lessons.ts`: schema; legal FENs (`validateFen`) and move sequences; find_move:
  `claim: best` → accepted moves include the engine best move and every non-accepted legal move is worse by ≥ 0.10
  expected points (depth ≥ 18, MultiPV ≥ 2, re-check all legal moves for short positions); `claim: mate` → mate in N
  confirmed and, if `acceptAnyMate`, all mating first moves accepted; `claim: rule` → legality only; replies in move
  trees legal; quiz `asserts` checked with lib/chess/engine; play_out: checkmate/promote goals have engine eval ≥ +5 or
  mate for the user, draw goals are drawable (eval within ±1.5); terminology lint (forbidden English terms such as
  "stalemate", "castling", "check mate", wrong piece names; required DSB terms); sentence length warning.
- `docs/content/LESSON-STYLE.md`: authoring rules (tone, structure, terminology, step patterns, validation).

Acceptance criteria:
1. 6 available courses with 28–32 lessons, 6 course tests, 1 Stufe-0 skip test; planned courses listed.
2. Structure rules per lesson met (step count, types, exercises at the end, Ausspielen per course).
3. `npm run validate:content` passes in full engine mode for all lessons (0 errors).
4. Rule statements carry FIDE article references; terminology lint passes.
5. ≥ 30 exercises flagged as easy puzzles; all Stufe-1 lessons have practice themes.
6. Validator unit tests detect: illegal FEN, illegal move, wrong best move, missing alternative mate, false quiz assert, unwinnable checkmate goal.

Checks: typecheck; eslint/vitest on `scripts/validate/lessons.ts scripts/content`; `npm run validate:content`.

### WP-08 Data layer, sync & auth (client)
**PRD:** P0-01, P0-02 (+ Given/When/Then), "So wird reaktiv umgesetzt" 1–6, Datenmodell, Randfälle 1–2, NFR
Sicherheit/Datenschutz, DoD (Konto-Export/-Löschung). CONSTRAINTS §2 Backend. **Depends:** WP-00. **Port:** 5208.
**Consumes:** storage contracts, `tables.ts`, `lib/rating`, `lib/time`, `@supabase/supabase-js`. **Exposes:**
`createDataServices` and pages `/login`, `/auth/callback`, `AuthGate`, `SyncStatusIndicator`.

Instructions:
- Dexie database `zugzwang` with tables for every entity plus `outbox` and `meta`; versioned schema; repositories
  implementing the core interfaces with `liveQuery`-based `observe` (UI updates without reload).
- ProgressService in Dexie transactions (each ≤ 50 ms): `recordPuzzleAttempt` (append attempt with client UUID; rated
  mode: provisional Glicko-2 via `lib/rating` vs puzzle rating/RD; theme_stats only for first-try results of rated,
  learning and theme modes (D-11); daily_activity), `recordLessonProgress` (furthest wins: max step, completed OR, max
  stars, D-13), `createGame`/`appendGameEvent`/`finishGame` (bot rating only for competition bot games), `saveAnalysis`,
  `recordExplanationFeedback`, `initializeFromSelfAssessment` (SELF_ASSESSMENT_OPTIONS, RD 350), `saveProfile`
  (settings last-writer-wins by `updatedAt`). Every write enqueues an outbox entry in the same transaction.
- Streak/daily activity logic as pure functions in `src/data/progress/` (D-14), exported for WP-09 and WP-11 parity tests.
- ActivityTracker hook: counts minutes while the tab is visible and the user interacted within the last 60 s.
- Sync: outbox flush immediately (debounce ≤ 100 ms) when online, exponential backoff 1 s → 60 s, flush on `online`
  event and app start; idempotent (row ids are client UUIDs; duplicates reported as ok). `SyncStatusIndicator` and banners
  exactly per DESIGN.md §3.7/§5.9/§5.10 (Gespeichert, Speichern …, Offline, Nicht synchronisiert with auto-retry, Lokal;
  local-mode banner once per session "Lokaler Modus – Fortschritt nur auf diesem Gerät" with in-app help text that
  matches `docs/setup/SYNC.md`).
- `SupabaseSyncAdapter` (active when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set): upsert with
  `onConflict: 'id', ignoreDuplicates: true` for append-only tables; lesson progress via RPC `upsert_lesson_progress`;
  settings via profile upsert with `updated_at` guard; realtime `postgres_changes` filtered by `user_id` applied to Dexie
  (server values for ratings, daily_activity, theme_stats replace provisional ones); full pull after login.
- Fake backend (`src/data/testing/`): in-memory server with the same semantics (dedupe, furthest wins, LWW,
  server-side recomputation of ratings in insertion order with `lib/rating`, daily activity/theme stats), configurable
  latency and offline/failure injection, realtime fan-out to several clients; a fake supabase-js client that routes
  to it, so `SupabaseSyncAdapter` itself is tested.
- Auth (cloud mode): `/login` with e-mail magic link (`signInWithOtp`) and Google (`signInWithOAuth`), `/auth/callback`,
  persisted session with auto refresh (30-day session = server config, documented), sign-out. `AuthGate`: logged-out
  users only reach `/login`, `/auth/callback`, `/puzzles/demo`. Local mode: no login, local profile created on first
  start, mode visible (D-15).
- AccountService: export all user data as JSON download (local and cloud); delete account (local: wipe after
  confirmation; cloud: call the `delete-account` function (WP-11) then sign out).
- Game takeover: `heartbeat`/`takeOver` update `activeDeviceId`/`activeHeartbeatAt` (LWW), observable.
- `docs/setup/SYNC.md`: local vs cloud mode, what syncs, conflict rules, how to enable cloud sync.

Acceptance criteria (tests with fake-indexeddb + fake backend):
1. Two clients on one fake backend: lesson completed on A is visible on B ≤ 2 s without reload (P0-02 GWT 1).
2. Offline: 5 puzzle attempts, reconnect → exactly 5 attempts stored once, server rating equals sequential Glicko-2 of the 5 (GWT 2).
3. Failing saves show "Nicht synchronisiert", retry automatically and finally store everything (GWT 3).
4. Push of an action reaches the (fake) DB ≤ 1 s after the action at 300 ms latency.
5. Duplicate pushes are ignored; lesson progress furthest-wins; settings last-writer-wins.
6. Dexie data survives reload (e2e); local-mode badge visible; no login in local mode.
7. Cloud-mode auth flows work against a mocked Supabase auth client (unit); AuthGate restricts logged-out users to login and demo.
8. Export produces JSON with all entities; delete wipes local data (and calls the function in cloud mode).
9. Built bundle contains no `service_role` or `sk-ant` strings; only `VITE_` public vars are read.

Checks: typecheck; eslint/vitest on `src/data src/features/auth src/features/sync`; build to `.build/WP-08` and
`grep -r "service_role\|sk-ant" .build/WP-08` (must be empty); `E2E_SERVER=dev E2E_PORT=5208 npx playwright test e2e/auth-sync --output test-results/WP-08`.

---

## 4. Wave 2 packages

### WP-09 Dashboard, profile, statistics, settings, onboarding, PWA
**PRD:** P0-14, P0-16, Fortschritt §5, Werkzeuge/Einstellungen §6, Kern-Abläufe 1–2, User Stories Onboarding 3 and
Fortschritt 1–3, Gestaltungsregeln (empty/error states), NFR Offline. **Depends:** WP-01…WP-08 integrated. **Port:** 5209.

Instructions:
- `/onboarding` (first start; local mode: first run; cloud: after first login): self-assessment (4 options) + daily goal
  (10/20/30/60 min, default 20) → `initializeFromSelfAssessment`, `saveProfile({ onboardingCompleted: true })`; then
  the dashboard shows the first course, a fitting bot (`recommendBot`) and the puzzle start rating. Redirect to
  onboarding while `onboardingCompleted` is false.
- Dashboard `/`: Puzzle-Rating, Bot-Rating (or "noch keine Wertung"), Streak, Tagesziel (minutes today / goal, progress
  ring), "Nächste Lektion" (`nextLessonFor`), "Weiter, wo du aufgehört hast" (active game → resume; lesson in progress →
  resume step; else last puzzle mode), "Als Nächstes trainieren" (weakest theme with ≥ 5 attempts and < 60 % → theme
  training; else most frequent mistake motif from analysed games → matching theme; else next lesson / fitting bot);
  empty and loading states; every area one click away.
- `src/stats/`: pure functions for rating history, success per theme, accuracy per phase (from stored analyses),
  frequent mistake motifs, weakness profile, recommendations (unit-tested).
- `/profile/stats`: rating curves (puzzle, bot), success rate per theme, accuracy per phase, most frequent mistake
  types; own accessible SVG charts (table fallback), lazy-loaded.
- `/profile`: name, ratings, streak, daily goal edit, mode and sync status, export and delete account (confirmation).
- `/settings` (DESIGN §3.6 list without "Einfache Ansicht", D-39): Design (Dunkel/Hell/System, dark default),
  Brettdesign (Moos default, Holz), Figuren (react-chessboard default set only, DESIGN §4.1), Koordinaten anzeigen,
  Mögliche Züge anzeigen, Töne, Animationen, Zugbestätigung, Notation (Deutsch K D T L S / Englisch K Q R B N),
  Sprache (Deutsch; Englisch shown as "in Vorbereitung", disabled), Tagesziel (Minuten); applied immediately, persisted.
- PWA (`pwa.config.ts` imported by vite.config.ts, `src/features/pwa/`): manifest (name "Zugzwang", German description,
  icons 192/512/maskable in `public/icons/`, theme/background colours from tokens, `display: standalone`), service worker
  precaching app shell, `public/engine/*`, puzzle bank chunks and lesson content (≥ 200 puzzles and opened courses
  offline), update prompt ("Neue Version verfügbar"), `OfflineBanner` ("Du bist offline – Puzzles laufen weiter.").

Acceptance criteria:
1. First start: onboarding → dashboard with first course, fitting bot and start rating (e2e).
2. Dashboard shows all P0-14 items with correct values from stored data; "Weiter, wo du aufgehört hast" resumes a game and a lesson (e2e).
3. Statistics show rating curves, theme success, accuracy per phase, frequent mistakes (unit + e2e on seeded data).
4. Every setting applies immediately and survives reload; notation switch changes the move list letters (e2e).
5. PWA: manifest valid, service worker registered, app installable (Playwright check of manifest + SW), offline banner and offline puzzles work.
6. All routes usable at 360, 390, 768, 1440, 2560 px without horizontal scroll (e2e loop over routes).

Checks: typecheck; eslint/vitest on owned paths; full `npm run build`; `E2E_SERVER=dev E2E_PORT=5209 npx playwright test e2e/dashboard e2e/pwa`
(PWA tests in preview mode: `E2E_PORT=5219 npx playwright test e2e/pwa`).

### WP-10 Puzzle bank
**PRD:** P0-04 (very easy puzzles from lessons, coverage of all levels), P0-05 (stored explanations), P0-06 (≥ 20
motifs with content), Datenmodell `puzzles` (explanation generated once and stored), NFR Offline. CONSTRAINTS §2 Puzzles.
**Depends:** WP-02 (motifs, openings), WP-03 (schema use, validator), WP-05 (`explainRuleBased`), WP-07 (lesson exercises).

Instructions:
- `npm run puzzles:generate -- --seed <n> --target 700`: Node engine (`lib/uci/node`); source positions from engine
  self-play games at mixed strengths starting from varied opening lines (`openings.json`); detect puzzle positions
  (after an opponent mistake the side to move has a forced mate or a unique winning move: EP(best) ≥ 0.70 and
  EP(best) − EP(second) ≥ 0.25 at depth ≥ 18); extend the solution while each user move stays unique by ≥ 0.10 EP (or
  is mate); end when the advantage is settled; Lichess format (prepend the opponent's mistake as `moves[0]`).
  Tag themes with WP-02 motif detectors + mate distance + phase/endgame material + opening tags; estimate rating with a
  documented heuristic (solution length, mate distance, depth at which Stockfish first finds the move, number of legal
  moves, quiet vs forcing first move), calibrated so one-move mates and hanging pieces land at 200–600; explanation via
  `explainRuleBased({ kind: 'puzzle', … })`; deterministic for a given seed.
- Export lesson exercises flagged `puzzle` as source `lesson` (rating from the flag).
- Write `public/data/puzzles/` chunks + manifest (keep WP-03's seed chunk), `supabase/seed/puzzles.csv`,
  `docs/content/PUZZLES.md` (method, statistics per rating band and theme, licences).

Acceptance criteria:
1. ≥ 600 generated puzzles plus lesson puzzles; rating bands: ≥ 150 ≤ 600, ≥ 120 in 601–1000, ≥ 100 in 1001–1400, ≥ 60 in 1401–2000.
2. Every trainable theme in the UI (≥ 20) has ≥ 10 puzzles; themes without 10 puzzles are marked not trainable for the UI (documented).
3. Every puzzle has a German explanation (1–3 sentences) and passes `npm run validate:content` in full engine mode.
4. Generator unit tests (detector, uniqueness, tagger on known positions) and a determinism test pass.
5. Bank loads in the app in ≤ 3 s on first start (desktop e2e of WP-03 still green) and next-puzzle ≤ 300 ms holds.

Checks: typecheck; eslint/vitest on `scripts/puzzles/generate`; `npm run puzzles:generate`; `npm run validate:content`;
`E2E_SERVER=dev E2E_PORT=5210 npx playwright test e2e/puzzles`.

### WP-11 Backend (Supabase)
**PRD:** P0-01, P0-02 (server side), Datenmodell, "So wird reaktiv umgesetzt" 3–5, NFR Sicherheit/Datenschutz, P0-11
(LLM via edge function), P0-15 (`POST /games/import`), P2-01/P2-02/P2-05, DoD (Konto-Löschung). CONSTRAINTS §2, §5.
**Depends:** WP-08 (adapter contract in use), WP-05 (ExplainRequest usage).

Instructions:
- `supabase/migrations/*.sql`: all tables of `src/core/tables.ts` (columns, types, PKs, `games` unique
  `(user_id, source, external_id)`, `game_moves` unique `(game_id, seq)`, `source` check constraint
  bot/pgn/chesscom/lichess), indexes for puzzle selection (rating, themes GIN); **RLS enabled on every table**:
  user tables `user_id = auth.uid()` for select/insert/update; append-only tables without update/delete policies;
  static tables (`puzzles`, `bots`, `courses`, `lessons`, `lesson_steps`) select-only for `authenticated` (+ `anon` for
  demo puzzles); `explanation_usage` not writable by clients.
- Server-side derived values (D-28): trigger on `puzzle_attempts` insert → Glicko-2 in PL/pgSQL (same parameters as
  `lib/rating`), sets `rating_before/after`, updates `ratings`, `theme_stats`, `daily_activity`; trigger on `games`
  finished (competition, bot) → bot rating; RPC `upsert_lesson_progress` (furthest wins); profile settings LWW by
  `updated_at`; duplicate ids ignored. Add user tables to the `supabase_realtime` publication (guarded so tests run).
- Tests (`supabase/tests/*.test.ts`, Vitest + PGlite, stub `auth` schema with `auth.uid()` from a session setting,
  roles `anon`/`authenticated`): migrations apply; a catalog query proves RLS is enabled on every table; generated
  cross-user test over every user table (read/insert/update of another user's rows fails); Glicko-2 parity SQL vs
  `lib/rating` on Glickman's example and 50 random sequences (|Δ| < 0.01); dedupe; furthest wins; LWW.
- Edge functions (each: `handler.ts` pure and Vitest-tested with injected dependencies, `index.ts` thin Deno entry
  with `npm:` specifiers, excluded from tsc/eslint):
  `explain` – JWT required; zod-validated `ExplainRequest`; rate limit 200 per user and day (`explanation_usage`);
  prompt contains only the facts, German, du, 1–3 sentences, moves written as `[[SAN]]` and only from the provided
  lines; Claude via the official `@anthropic-ai/sdk`, model `claude-opus-5-5`, `client.beta.messages.create` with
  `output_config: { effort: 'low', format: { type: 'json_schema', schema: { sentences: string[1..3] } } }`,
  `max_tokens: 16000`, server-side refusal fallback `betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'`
  (D-18), client `timeout: 20_000`, `maxRetries: 1`; check `stop_reason` (refusal/max_tokens → `{ ok: false }`);
  typed SDK error chain (RateLimitError → 429, APIStatusError → 502, APIConnectionError → 503); validate move markers
  server-side; key only from `Deno.env` (`ANTHROPIC_API_KEY`). Tests mock the SDK client.
  `games-import` (= PRD `POST /games/import`): `GameImportRequest`; `{ pgn }` validated with chess.js, stored as source
  `pgn` with external id = sha256(normalised PGN) and deduped; `{ source, externalId }` → 501 `not_implemented` (V2).
  `delete-account`: JWT required; deletes all user rows and the auth user (service role from function env).
- `supabase/config.toml` (email OTP + Google provider placeholders, site URL, session inactivity timeout 30 days),
  `npm run supabase:seed-content` (SQL for bots, courses, lessons, lesson_steps from repo content), `docs/setup/SUPABASE.md`
  (EU region Frankfurt, create project, apply migrations, seed puzzles/content, function secrets, app env vars,
  deploy functions, verify RLS, cost note).

Acceptance criteria:
1. Migrations apply in PGlite; every table has RLS (test); cross-user access fails on every user table (test).
2. Glicko-2 SQL parity with `lib/rating` (test); duplicates ignored; furthest wins; LWW.
3. `explain` handler: auth, validation, rate limit, prompt contains only facts, fallback/error mapping, refusal handling – all tested with a mocked client; no key outside function env.
4. `games-import` dedupes and validates; `delete-account` removes all user data (tested against PGlite where possible).
5. Setup document lets a person with a Supabase account enable cloud mode end to end.

Checks: typecheck; eslint/vitest on `supabase scripts/supabase`; `grep -rn "service_role\|ANTHROPIC_API_KEY" src` must be empty.

---

## 5. Wave 3

### WP-12 Core journeys, performance & quality sweep
**PRD:** DoD V1 (four core journeys as E2E on desktop and phone, Lighthouse ≥ 85 mobile), P0-16, NFR Performance,
CONSTRAINTS §5 (no console errors on main journeys). **Depends:** all. **Port:** 5212.

Instructions and acceptance criteria:
1. `e2e/journeys/`: (1) Erster Start → Onboarding → Dashboard with course, bot, start rating; (2) Tägliche Einheit →
   10 rated puzzles (solutions read from the bank JSON) → continue lesson → daily goal progress updates;
   (3) Bot-Partie → choose bot and level → play to the end vs the weakest bot (or resign) → analysis with explanations →
   "Nochmal versuchen"; (4) Lektion → Lernpfad → course → all steps → stars → next lesson unlocked. Each runs in the
   desktop and mobile projects with zero console errors.
2. `npm run lighthouse`: production build, Lighthouse mobile performance ≥ 85 for `/` and `/puzzles/rated`
   (Chromium from `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), reports in `docs/team/lighthouse/`.
3. `e2e/responsive/`: every route at 360/390/768/1440/2560 px without horizontal scroll.
4. Bundle scan: no `service_role`, `sk-ant`, `ANTHROPIC` in `dist`.
5. Problems in other paths are reported as `needs` (the manager turns them into FIX packages).

Checks: full gates `npm run typecheck && npm run lint && npm test && npm run build && npm run validate:content && npm run e2e`, `npm run lighthouse`.

---

## 6. After P0 is green (manager decides, CONSTRAINTS §1)
Candidates: P1-02 Tagespuzzle, P1-03 Wiederholung (review queue already modelled). Not before every P0 package is done.

## 7. FIX packages
None yet. Format: `FIX-xx | severity | source (review/test id) | owner paths | instruction | acceptance | checks`.
