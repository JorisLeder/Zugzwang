# Third-party notices

Zugzwang uses the following third-party software, data and fonts. Versions are pinned in `package-lock.json`.

## Licence note (GPL)

The app ships **Stockfish** (GPL-3.0) to the browser (`public/engine/`, copied from the npm package `stockfish`).
Distributing the app to other people therefore makes the GPL-3.0 obligations apply to the app as a whole: the complete
corresponding source code must be made available under the GPL-3.0 (PRD, "Risiken": "GPL-Pflichten durch
Stockfish/chessground – Quellcode öffentlich stellen, sobald die App anderen zugänglich gemacht wird"). For private use
this is uncritical, but it is a conscious decision (PRD open question for the project owner). All other components
below are GPL-compatible.

## Engine

| Component | Licence | Use | Source |
|---|---|---|---|
| Stockfish 19 (Stockfish.js, npm `stockfish` 19.0.1, lite single-threaded WASM) | GPL-3.0 (engine); the package's non-engine glue code is MIT | Analysis, hints, coach, bots, content validation | https://github.com/nmrugg/stockfish.js · https://github.com/official-stockfish/Stockfish |

## Chess libraries

| Component | Licence | Use | Source |
|---|---|---|---|
| chess.js 1.4 | BSD-2-Clause | Rules, legality, FEN/PGN (only via `src/lib/chess`) | https://github.com/jhlywa/chess.js |
| react-chessboard 5 | MIT | Board component | https://github.com/Clariity/react-chessboard |
| Piece artwork bundled with react-chessboard ("Cburnett" set) | GPL-2.0-or-later (also CC BY-SA 3.0) | Board pieces (DESIGN §4.1) | https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces |

Note on the piece artwork (confirmed by the manager, D-47): the default piece SVGs of react-chessboard are the
"Cburnett" set by Colin M. L. Burnett. The react-chessboard source file `src/pieces.tsx` (commit d2dc982, 2026-02-10)
states: "https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces – By en:User:Cburnett – Own work – CC BY-SA 3.0".
Lichess distributes the same set as `public/piece/cburnett` under **GPLv2+** with author Colin M. L. Burnett
(lichess-org/lila `COPYING.md`). Zugzwang uses the set under GPL-2.0-or-later, which is compatible with the app's
GPL-3.0 situation (Stockfish). Attribution: chess pieces © Colin M. L. Burnett, GPLv2+ / CC BY-SA 3.0.

## Data

| Data | Licence | Use | Source |
|---|---|---|---|
| lichess-org/chess-openings (ECO names, a.tsv–e.tsv) | CC0-1.0 | Opening book / "Buchzug" (WP-02) | https://github.com/lichess-org/chess-openings |
| Lichess puzzle database | CC0-1.0 | Optional importer `npm run puzzles:import-lichess` (WP-03) | https://database.lichess.org/#puzzles |

Lichess formulas (win percentage, accuracy) are used as facts with attribution in `src/analysis/SOURCES.md`; no
Lichess (AGPL-3.0) code is copied.

## Fonts and icons

| Component | Licence | Use | Source |
|---|---|---|---|
| Inter Variable (`@fontsource-variable/inter`) | SIL Open Font License 1.1 | UI font, self-hosted | https://rsms.me/inter · https://fontsource.org |
| lucide-react | ISC | Icons | https://lucide.dev |

## Application libraries (runtime)

| Component | Licence |
|---|---|
| React, React DOM | MIT |
| React Router 7 | MIT |
| Radix UI (`radix-ui`) | MIT |
| Zustand | MIT |
| TanStack Query | MIT |
| Dexie, dexie-react-hooks | Apache-2.0 |
| zod | MIT |
| @supabase/supabase-js | MIT |
| clsx, tailwind-merge | MIT |
| class-variance-authority | Apache-2.0 |
| workbox-window | MIT |
| Tailwind CSS (build-time, generated CSS shipped) | MIT |

Development-only tools (Vite, Vitest, Playwright, ESLint, TypeScript, tsx, PGlite, Lighthouse, …) are not shipped to
users; their licences are listed in their packages under `node_modules/`.
