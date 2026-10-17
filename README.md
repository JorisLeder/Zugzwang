# Zugzwang

**Zugzwang** ist ein persönliches Schach-Lerntool als Web-App, angelehnt an chess.com. Es begleitet dich vom ersten
Zug bis zum fortgeschrittenen Spieler:

- **Puzzles** mit eigenem Rating, Lernmodus mit Hinweisen und Training nach Motiven (Gabel, Fesselung, Grundreihenmatt …)
- **Spielen gegen Bots** von ca. 100 bis 2500 Elo, auf Wunsch mit Coach, der vor groben Fehlern warnt
- **Partieanalyse** mit Genauigkeit, Zugbewertung (Brillant bis Patzer) und Erklärungen, *warum* ein Zug schlecht war
- **Lektionen** in einem Lernpfad mit fünf Stufen, vom kompletten Neuling bis ca. 2000 Elo
- **Fortschritt**, der sofort gespeichert und – mit Cloud-Anbindung – zwischen Laptop und Handy synchronisiert wird

Schachregeln laufen ausschließlich über [chess.js](https://github.com/jhlywa/chess.js) und werden gegen die
FIDE-Regeln geprüft; Analyse und Bots nutzen [Stockfish](https://stockfishchess.org). Die vollständige Produktbeschreibung
steht in [`docs/PRD.md`](docs/PRD.md).

**Status:** in Entwicklung (V1), gebaut mit Claude-Code-Agenten-Workflows. Bewusst ohne Agenten-Kontextdateien
(AGENTS.md/CLAUDE.md) und ohne Planungsdokumente im Repository: Die Verträge in `src/core` und die Tests sind die
Spezifikation. Kommentare wie „DESIGN §4.3“ oder „D-13“ verweisen auf entfernte Planungsdokumente.

---

Chess learning web app (PWA) in German: rated puzzles, lessons from the rules to tactics, bots with a coach, and game
analysis with explanations. Product spec: `docs/PRD.md`.

## Setup

Requirements: Node 22.12+ (developed with 22.22), npm 10. Playwright uses the preinstalled Chromium in
`PLAYWRIGHT_BROWSERS_PATH` (`@playwright/test` is pinned to 1.56.1 = Chromium revision 1194).

```bash
npm ci            # exact versions from package-lock.json
npm run dev       # copies the Stockfish engine to public/engine/ and starts Vite on http://localhost:5173
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Copy engine (`scripts/copy-engine.mjs`) + Vite dev server |
| `npm run build` | Copy engine + production build into `dist/` (PWA service worker generated) |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` over app, scripts, tests and the testable parts of `supabase/` |
| `npm run lint` | ESLint (TypeScript, React hooks, jsx-a11y, react-refresh, rules-layer import guard) |
| `npm test` / `npm run test:watch` | Vitest: project `node` (`*.test.ts`) and `dom` (`*.test.tsx`, jsdom) |
| `npm run e2e` | Playwright, desktop (1440×900) and mobile (390×844, touch) against a production preview build |
| `npm run validate:content` | Runs every validator in `scripts/validate/` (legality + Stockfish checks of all content); `-- --quick` skips engine checks |
| `npm run openings:build` | Build the opening book (WP-02) |
| `npm run bench:analysis` | Time the analysis of the 40-move fixture game (WP-02) |
| `npm run puzzles:import-lichess` | Import the official Lichess puzzle CSV (CC0, needs access to database.lichess.org; `-- --help` lists options) |
| `npm run bots:calibrate` | Bot calibration report (written to `.cache/bot-calibration.md`) |
| `npm run puzzles:generate` | Generate the puzzle bank with Stockfish (WP-10) |
| `npm run supabase:seed-content` | SQL seed for static content (WP-11) |
| `npm run lighthouse` | Lighthouse mobile performance (WP-12) |

Scripts owned by later packages print `not implemented yet (WP-xx)` until they are delivered.

## Local mode and cloud mode

- **Local mode** (default, no configuration): no login, all progress stays in this browser (IndexedDB). The app says so
  clearly ("Lokaler Modus – Fortschritt nur auf diesem Gerät").
- **Cloud mode**: copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Then
  login is required and progress syncs across devices via Supabase. Setting up the Supabase project (migrations with
  Row Level Security, edge functions, secrets) will be described in this README
  once the backend package is done. Only public `VITE_` values belong in the client; the Claude API key lives only in the
  `explain` edge function.
- `VITE_CLOUD_EVAL=true` optionally uses the Lichess cloud evaluation to speed up analysis; the local engine is
  always the fallback.

## Structure (short)

```
src/core/      shared contracts (types, constants, zod schemas) + src/core/testing (fakes, fixtures)
src/lib/       chess rules layer (chess.js wrapper), Glicko-2, UCI/engine, helpers
src/app/       router, shell, paths.ts (the only URL builder), service wiring
src/ui/        primitives, layouts (BoardLayout), board, chess widgets, sound
src/features/  one folder per area (routes.tsx + pages)
src/engine, src/analysis, src/bots, src/explain, src/data, src/puzzles, src/lessons, src/pgn, src/stats
scripts/       engine copy, content validation, generators, importers
e2e/           Playwright tests (support/ helpers, smoke/, one folder per area)
content/       lesson content (JSON)
supabase/      migrations, edge functions, tests
```

Licences of third-party code, data and fonts: `THIRD_PARTY_NOTICES.md` (Stockfish is GPL-3.0).
