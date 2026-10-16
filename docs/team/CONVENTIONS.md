# Conventions

Owner: WP-00 Foundation (frozen after wave 0 – changes via `needs` → manager → FIX package). Binding for every coder.
Read together with `CONSTRAINTS.md`, `BACKLOG.md` §0, `DECISIONS.md`, `DESIGN.md` and `RULES.md`.

Contents: 1 Ownership · 2 Folder layout · 3 Commands · 4 Architecture rules · 5 Chess rules layer · 6 Engine ·
7 Coding rules · 8 UI, design and accessibility · 9 Language, strings and notation · 10 Tests · 11 Selector contract ·
12 Content validators · 13 Placeholders and ownership transfer · 14 Performance budgets · 15 Decisions taken by WP-00

---

## 1. Ownership map (copy of BACKLOG §1)

A coder edits only its owned paths. Placeholder files that WP-00 created inside another package's paths become that
package's property when its wave starts. Everything WP-00 owns is **frozen** afterwards: `src/core/**`, `src/lib/**`,
`src/app/**`, `src/ui/primitives/**`, `src/ui/layout/**`, `src/styles/**`, `src/i18n/**`, root config files,
`package.json`, `scripts/validate-content.ts`, `scripts/lib/**`, `e2e/support/**`, `e2e/smoke/**`.
(WP-00 also wrote `vitest.config.ts` and `pwa.config.ts`; the first is a frozen root config, the second belongs to WP-09.)

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

## 2. Folder layout

```
src/
  main.tsx                 entry (fonts, styles, <App/>)
  app/                     App, router (routes.tsx), shell/, paths.ts, services.tsx, config.ts, navigation.ts
  core/                    contracts: chess, engine, analysis, explain, bots, puzzles, rating, games, lessons,
                           profile, storage, tables, services; schemas/ (zod); testing/ (fakes + fixtures)
  lib/                     chess/ (rules layer), rating/ (Glicko-2), uci/ (parser, EngineService, node.ts),
                           ids.ts, time.ts, observable.ts, cn.ts
  i18n/                    German number/eval formatting, shared strings
  styles/                  tokens.css (DESIGN §2 verbatim), app.css (Tailwind v4 mapping)
  ui/primitives/           generic components (DESIGN §5)
  ui/layout/               BoardLayout, Page, PlaceholderPage, shell context
  ui/board/                Board (WP-01)        ui/chess/  MoveList, EvalBar, … (WP-01)   ui/sound/ (WP-01)
  features/<area>/         routes.tsx + pages/ + strings.de.ts per area
  engine/ analysis/ bots/ explain/ data/      service factories (owners replace the placeholders)
  puzzles/ lessons/ pgn/ stats/               domain logic of the owning packages
scripts/                   copy-engine.mjs, validate-content.ts, lib/ (validation, Node engine), validate/, …
e2e/                       support/ (fixtures, board, app helpers), smoke/, one folder per area
content/lessons/           lesson JSON (WP-07)       public/   static files (engine/ is generated, git-ignored)
supabase/                  migrations, functions (handler.ts tested, index.ts Deno entry), tests (WP-11)
```

Imports: always via the `@/` alias (`@/core`, `@/lib/chess`, `@/ui/primitives` …). Packages talk to each other only
through `src/core` contracts and the public `index.ts` of a package folder – never import another package's internal
files.

---

## 3. Commands

| Purpose | Normal (integration, single user) | Parallel-safe (wave coders, D-22) |
|---|---|---|
| Install | `npm ci` (only WP-00 / the integration step) | never run `npm install`/`npm add` |
| Commit | integration step only | never `git commit` |
| Type check | `npm run typecheck` | `npm run typecheck` – your paths must be clean; report foreign errors |
| Lint | `npm run lint` | `npx eslint <your paths>` |
| Unit tests | `npm test` | `npx vitest run <your paths>` |
| Build | `npm run build` (→ `dist/`) | `npx vite build --outDir .build/<WP-id> --emptyOutDir` (never write `dist/`) |
| E2E | `npm run e2e` (production preview on port 4173) | `E2E_SERVER=dev E2E_PORT=<port> npx playwright test e2e/<area> --output test-results/<WP-id>` |
| Content | `npm run validate:content` | same (results cached in `.cache/validate/`); `-- --quick` skips engine checks; `-- --only <name>` |

E2E ports: WP-01 5201, WP-03 5203, WP-04 5204, WP-05 5205, WP-06 5206, WP-08 5208, WP-09 5209 (PWA preview 5219),
WP-10 5210, WP-12 5212, FIX packages 5230–5299 (assigned per FIX). `E2E_REUSE=1` reuses a running server on the port.
Never run `playwright install` – Chromium 1194 is preinstalled in `/opt/pw-browsers`.

---

## 4. Architecture rules

- **Contracts first.** Shared types, constants and zod schemas live in `src/core` (`import … from '@/core'`). You may
  not change them; request additions under `needs`.
- **Service wiring (D-03).** `src/app/services.tsx` builds `AppServices` once from fixed factories:
  `createDataServices(config)` (`src/data`), `createEngineService(role, config)` (`src/engine`),
  `createAnalysisService(engine, config)` (`src/analysis`), `createBotEngine(engine, config)` + `BOT_ROSTER`
  (`src/bots`), `createExplanationService(config, data)` (`src/explain`). Components get services with
  `useServices()`; settings with `useSettings()` / `useSettings(s => s.notation)` and change them with
  `useUpdateSettings()` (persisted through `data.repos.profile.updateSettings`).
- **Writes.** Every write that creates progress goes through `data.progress` (ProgressService). Repositories are for
  reads (`get`/`list`/`query`) and live updates (`observe…`, use `useSubscribable(source, initial)` from
  `@/lib/observable`; memoise the source with `useMemo`).
- **Routes.** Each feature exports `routes: RouteObject[]` from `src/features/<area>/routes.tsx`, flat with absolute
  paths from `ROUTE_PATTERNS` (`@/app/paths`), pages lazy-loaded (`lazy: () => import('./pages/X')`, the module exports
  `Component`). `handle: { public: true }` = outside the AuthGate (login, callback, demo); `handle: { bare: true }` =
  without the shell. `paths.*()` is the **only** way to build URLs.
- **State.** Zustand only for UI state; TanStack Query for async non-live data (e.g. fetches); Dexie `liveQuery` (via
  repositories' `observe…`) for persisted data. No global mutable singletons outside services.
- **Board screens** use `BoardLayout` (`@/ui/layout`); other pages use `Page`. While a `BoardLayout` is mounted the
  phone tab bar is replaced by its action bar (D-40).
- **Browser-only APIs** need a fallback in core logic (Capacitor later, CONSTRAINTS §1). Storage access is wrapped in
  try/catch.

---

## 5. Chess rules layer (`@/lib/chess`, RULES.md)

- chess.js is imported **only** in `src/lib/chess` (ESLint `no-restricted-imports` enforces it). Never hand-roll rules.
- `ChessGame`: `fromFen(fen)`, `fromMoves(startFen, uciMoves)` (**resume = replay**, keeps repetition history),
  `fromPgn(pgn)`, `legalMoves(square?)`, `move(uci | san | MoveInput)` (returns `null` on anything illegal, never
  throws; no auto-queen; a promotion piece on a non-promotion move is illegal), `undo()`, `fen()`, `history()`,
  `uciMoves()`, `status()`, `claimDraw(kind)`, `resign(color)`, `flagFall(color)`, `pgn(headers)`, `repetitionCount()`.
- `status()` follows FIDE 2023 (D-04, RULES §5.1): checkmate (beats the 50/75-move counters) → stalemate →
  insufficient material (D-05) → fivefold repetition → 75-move rule end the game automatically; threefold repetition and
  the 50-move rule only appear in `claimableDraws`. **Never** use chess.js `isGameOver()`/`isDraw()`.
- Resignation against a side that cannot mate is a draw (5.1.2; `cannotMate`), same for flag fall (6.9).
- FEN entry points: `validateFen(fen)` (strict, German `errorDe`) for user input, editor and content;
  `ChessGame.fromFen` normalises castling flags and e.p. squares (`normalizeFen`) and rejects illegal positions with a
  `ChessRulesError` (`messageDe`).
- Helpers: `uciToSan`, `uciLineToSan`, `sanToUci` (accepts German letters and `0-0`), `formatSan(san, 'de'|'en')`,
  `pieceNameDe`, `PIECE_VALUES`, `materialBalance`, `cannotMate`, `positionKey`.
- The 65 FIDE fixtures of RULES.md §6.2 run in `src/lib/chess/rules-fixtures.test.ts`.

---

## 6. Engine

- All engine scores in contracts are **White's point of view** (D-08); `@/lib/uci` is the single conversion point
  (`toWhitePov`, bounds flipped too). Win% and expected-points loss are computed from the mover's point of view.
- `createUciEngineService(transport, id, opts)` serialises calls, syncs with `isready`, restores per-call options
  (MultiPV, Skill Level, UCI_LimitStrength/UCI_Elo, values clamped to the engine's limits), aborts via `stop` +
  `AbortError`. `stop()` ends the running search with its partial result.
- Browser: the engine files are copied by `scripts/copy-engine.mjs` to `public/engine/stockfish-19-lite-single.{js,wasm}`
  and loaded as a Web Worker (`import.meta.env.BASE_URL + 'engine/stockfish-19-lite-single.js'`, WP-02).
- Node (tests, scripts): `createNodeEngineService()` from `@/lib/uci/node` (never import it in browser code), or the
  shared helper `scripts/lib/engine.ts` (`sharedEngine()`, `analysePosition()`, `withEngine()`). Each Node engine is a
  separate instance; always `dispose()` it so the process can exit. Depth 12 at the start position ≈ 0.2 s.

---

## 7. Coding rules

- TypeScript strict; no `any` without an `eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason` comment.
- Domain logic as pure functions (rules, ratings, classification, selection, stats) with unit tests; React function
  components only; hooks follow the React hooks rules (lint).
- Code, identifiers and comments in English; JSDoc on every export of shared modules.
- IDs are client UUIDs (`newId()` from `@/lib/ids`); timestamps ISO strings; calendar days `localDateKey(date, tz)`.
- No secrets in the client: only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUD_EVAL`, `VITE_E2E`.
- `console.log` is not allowed in `src/` (lint); use `console.warn`/`console.error` only for real problems – the e2e
  fixture fails on console errors.
- Components in `.tsx` files export only components (react-refresh); put hooks/constants into `.ts` files.

---

## 8. UI, design and accessibility

- DESIGN.md is binding (except §8.7 "Einfache Ansicht", deferred by D-39). Use **tokens only**: Tailwind utilities
  generated from `src/styles/app.css` (`bg-surface`, `bg-surface-2`, `text-muted`, `text-accent-text`, `bg-accent
  text-on-accent`, `border-border-strong`, `rounded-lg`, `shadow-2`, typography `text-h1 … text-caption`). The
  default Tailwind palette is disabled; no raw hex values in components (board/classification colours via
  `var(--zz-…)`).
- Dark theme is the default (`:root`); light = `<html data-theme="light">` (set by the settings store); board theme
  `data-board="holz"`; animations off = `data-motion="off"` (also under `prefers-reduced-motion` and in e2e).
- Reuse `@/ui/primitives`: Button (one primary per view), IconButton (German `label` required), Card, Tabs,
  Dialog/Sheet, Tooltip, Toast (`useToast`, system events only), ProgressBar, ProgressRing, Spinner, Badge, Chip, Tag,
  Switch, SegmentedControl, RadioGroup, Select, Banner, EmptyState, ErrorState, Stars, RatingDelta, StreakBadge,
  CoachBubble, ClassificationBadge (reads `CLASSIFICATION_META`).
- Accessibility (WCAG 2.2 AA): everything works with the keyboard; visible focus (global `:focus-visible` ring, use
  `focus-inset` inside lists/segmented controls); touch targets ≥ 44 × 44 px (`pointer-coarse:` variants); every page
  has exactly one visible `h1` (`Page`/`BoardLayout` provide it); icons are `aria-hidden`, icon-only buttons have German
  `aria-label`s; status changes use `role="status"`/`aria-live`; colour is never the only signal; the skip link
  "Zum Inhalt springen" targets `#main`.
- Motion ≤ 200 ms (`--zz-dur-*` tokens), no looping decoration; no learning feedback in toasts.

---

## 9. Language, strings and notation

- UI and content in German with "du"; DSB terms (Schach, Matt, Patt, Rochade, en passant, Umwandlung, Remis, Remis
  durch dreimalige Stellungswiederholung, 50-Züge-Regel, "Remis beantragen" – RULES.md §3).
- **Strings rule (D-35):** UI strings live in `strings.de.ts` per feature/UI folder (export a `const … = { … } as const`),
  not inline in components. Shared strings: `@/i18n` (`COMMON_DE`).
- Numbers via `@/i18n` (`formatNumber`, `formatPercent` "78,4 %", `formatDelta` "+8"/"−6"/"±0", `formatEval` "+1,3",
  "M3").
- **Notation rule (D-23):** data stores English SAN and UCI only. Display every move with
  `formatSan(san, settings.notation)`: German = K D T L S, `=D`, castling `0-0`/`0-0-0`; English = K Q R B N, `O-O`.
  PGN export always uses English SAN and `O-O`.

---

## 10. Tests

- File naming: `*.test.ts` → Vitest project `node` (src, scripts, supabase); `*.test.tsx` → project `dom` (jsdom,
  jest-dom matchers, `vitest.setup.ts`). Tests sit next to the code. Default timeout 20 s.
- Fakes and fixtures (`@/core/testing`): `createMemoryDataServices()`, `FakeEngineService` (FEN → lines),
  `FakeAnalysisService` (+ `FIXTURE_GAME_ANALYSIS_SCRIPT`), `FakeBotEngine` (seeded), `FakeExplanationService`,
  `createFakeUciTransport()`; fixtures `FIXTURE_GAME` (40 moves, known blunder at ply 27), `FIXTURE_PUZZLES` (5, incl.
  two mating moves), `FIXTURE_COURSE` + `FIXTURE_LESSON` (all five step types), `FIXTURE_BOTS`. Until a dependency is
  integrated, test against these fakes and say so in your report.
- Engine tests use the real Node engine with small depths (≤ 12 unless the test is about depth) and dispose it in
  `afterAll`.
- Component tests render with `@testing-library/react`; components using `useServices()` need
  `<ServicesProvider services={createAppServices(readAppConfig({}))}>` or a bundle built from fakes; routing via
  `MemoryRouter`.
- E2E: import `test`/`expect` from `e2e/support/fixtures.ts` (fails on console errors and page errors; allow-list with
  `test.use({ allowedConsoleErrors: [/…/] })`); board helpers `clickMove`, `dragMove`, `readFen`, `pieceOn`,
  `waitForFenChange` from `e2e/support/board.ts`; `freshStart(page, path)` and `hasHorizontalScroll` from
  `e2e/support/app.ts`. Every e2e runs on `desktop` and `mobile`; skip one only with a reason.
- Content with chess claims is tested by the validators (§12), not by hand.

---

## 11. Selector contract (board)

`@/ui/board` must keep these attributes (WP-01 owns the board; the e2e helpers depend on them):

| Element | Selector |
|---|---|
| Board root | `[data-testid="board"]` with `data-orientation="white|black"` and `data-fen="<current FEN>"` |
| Square | `[data-square="e4"]` (every one of the 64 squares) |
| Piece | `[data-piece="wP"]` … `[data-piece="bK"]` (colour + upper-case piece letter) |
| Promotion buttons | `[data-testid="promotion-q"]`, `promotion-r`, `promotion-b`, `promotion-n` (German aria-labels Dame, Turm, Läufer, Springer) |

Other stable hooks: `[data-testid="board-layout"]`, `[data-testid="board-container"]`, `[data-testid="action-bar"]`
(BoardLayout), navigation `getByRole('navigation', { name: 'Hauptnavigation' })`. Prefer roles and German accessible
names in tests; add `data-testid` only where no role fits.

---

## 12. Content validators – how to add one

1. Create `scripts/validate/<name>.ts` (owners: `puzzles.ts` WP-03, `bots.ts` WP-04, `lessons.ts` WP-07).
2. Default-export `async (ctx: ValidationContext) => ValidationReport` (types in `scripts/lib/validation.ts`):
   `{ checked, errors: [{ file?, id?, message }], warnings: [...] }`. German messages for content authors are welcome.
3. Use `@/lib/chess` (`validateFen`, `ChessGame`) for legality and `await ctx.engine()` for Stockfish (shared, lazy).
   Wrap engine work in `ctx.cache.getOrCompute(ctx.cache.key(content, VALIDATOR_VERSION), …)` and bump your
   `VALIDATOR_VERSION` when the checks change. Respect `ctx.quick` (skip engine checks).
4. Put unit tests next to it (`scripts/validate/<name>.test.ts` – test files are not run as validators).
5. `npm run validate:content` runs all validators, prints a summary table and exits 1 on any error. With zero
   validators it prints "no validators" and exits 0.

---

## 13. Placeholders and ownership transfer

- WP-00 created working placeholders with the **final signatures** in other packages' paths: service factories
  (`src/data`, `src/engine`, `src/analysis`, `src/bots`, `src/explain`), every `src/features/<area>/routes.tsx` and its
  pages, the shell slots `@/features/auth/AuthGate`, `@/features/sync/SyncStatusIndicator`,
  `@/features/pwa/OfflineBanner`, `@/ui/board`, `@/ui/chess`, `@/ui/sound`, the npm script files of later packages,
  and `pwa.config.ts`.
- When your wave starts these files are yours: replace the implementation in place, **keep the exported names and
  signatures** (the app shell imports them), delete the placeholder comment. The app must compile at every moment.
- If a signature really has to change, do not change it – list it under `needs`.

---

## 14. Performance budgets (PRD NFR)

| Budget | Value |
|---|---|
| First page usable | ≤ 2.5 s on 4G; Lighthouse mobile performance ≥ 85 (WP-12) |
| Bot answer | ≤ 1 s compute without artificial think time |
| Puzzle switch | ≤ 300 ms ("Weiter" → next puzzle) |
| Game analysis | 40 moves ≤ 30 s |
| Coach warning | ≤ 500 ms after `prepare`, ≤ 1 s cold; the UI holds a move ≤ 800 ms (D-41) |
| Transitions | ≤ 200 ms |
| Offline | ≥ 200 puzzles locally, opened courses available |

Keep routes lazy, keep heavy libraries (react-chessboard, engine glue, content) out of the main chunk.

---

## 15. Decisions taken by WP-00 (not specified elsewhere)

- `Settings.updatedAt` default is the epoch so any stored change wins LWW; `RATING_DEFAULTS.rating = 1500` is used only
  when a rating is missing (normally ratings come from the self-assessment, D-10).
- `Score` `{ type: 'mate', value: 0 }` means the side to move is already checkmated (the sign cannot carry the winner).
- `ChessGame.move()` refuses moves after the game is over; `undo()` also clears a resignation/claim/flag-fall end.
- A Board `MoveRecord.ply` is relative to the shown position; callers that track a game apply `move.uci` to their own
  `ChessGame`.
- Bot rating (ProgressService.finishGame): opponent rating = the bot's Elo from the game headers
  (`WhiteElo`/`BlackElo` of the bot's colour), RD 50 – so bot games must write that header.
- `puzzle_attempts.puzzle_rd` column added to the DB contract (needed by the server-side Glicko-2 trigger).
- `profiles` has no `user_id`; its owner column is `id` (`USER_ID_COLUMN`).
- `useSettings()` returns the settings object (or a selected part); `useUpdateSettings()` persists patches.
- Public routes are marked with `handle.public`, shell-less routes with `handle.bare`.
