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
| `npm run supabase:seed-content` | Writes `supabase/seed.sql` (bots, courses, lessons, puzzle bank + demo puzzles; idempotent) and test-applies it to the migrations in PGlite; `-- --no-verify` skips that |
| `npm run lighthouse` | Lighthouse mobile performance (WP-12) |

Scripts owned by later packages print `not implemented yet (WP-xx)` until they are delivered.

**Puzzle bank:** `public/data/puzzles/` ships with the app (offline): the seed chunk, `lessons.json` (flagged lesson exercises)
and `generated-NN.json`, listed with sha256 in `manifest.json`; `supabase/seed/puzzles.csv` holds the same rows for the backend.
`npm run puzzles:generate -- --seed 1 --target 700` rebuilds it deterministically from Stockfish self-play (cache `.cache/puzzles-generate/`),
then `npm run validate:content -- --only puzzles` re-checks every solver move at depth 18. Method, rating heuristic, options and licences: header of `scripts/puzzles/generate/index.ts`.

## Speichern & Synchronisieren

The same content is shown in the app (help dialog behind the "Lokal"/sync status and the local-mode banner).

- **Local mode** (default, no Supabase variables): progress stays in this browser (IndexedDB). No account, no login;
  the app shows a "Lokal" badge and the banner "Lokaler Modus – Fortschritt nur auf diesem Gerät".
- Local data is lost when the browser data is cleared. Back it up with "Daten exportieren" (JSON) in the settings
  (Einstellungen → Konto und Daten), which also offers deleting all local data.
- **Cloud mode**: copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build
  time. Only these public values belong in the client, never a `service_role` key; the Claude API key lives only in
  the `explain` edge function. Login is then required.
- In Supabase, enable e-mail (magic link) and Google login, set the redirect URL `<origin>/auth/callback`, and limit
  the session to 30 days. Step-by-step setup (project, migrations, seed, secret, edge functions, auth):
  [Cloud-Sync einrichten (Supabase)](#cloud-sync-einrichten-supabase).
- **What syncs**: profile and settings, ratings, puzzle attempts, games with all moves, analyses, lesson progress,
  daily activity and streak, theme stats, review items, explanation feedback.
- **Not synced**: the puzzle bank, the bots and the lesson content (they ship with the app).
- **Offline**: changes are queued and sent exactly once on reconnect; failures show "Nicht synchronisiert" and are
  retried automatically (backoff from 1 s up to 60 s).
- **Conflicts**: puzzle attempts and game moves are append-only; lesson progress keeps the furthest state; settings
  keep the last change; the server computes ratings, streak and stats. A game running on another device can be taken
  over.
- The first login on a device that ran in local mode moves its local progress into the account once.
- Account deletion in cloud mode uses the `delete-account` edge function.
- `VITE_CLOUD_EVAL=true` optionally uses the Lichess cloud evaluation to speed up analysis; the local engine is
  always the fallback.

## Cloud-Sync einrichten (Supabase)

Ohne diese Schritte läuft die App im lokalen Modus. Du brauchst ein Supabase-Konto; die Supabase CLI startest du mit
`npx supabase …`.

1. **Projekt anlegen:** Im Supabase-Dashboard ein neues Projekt in einer EU-Region erstellen (z. B. Frankfurt,
   `eu-central-1`) und das Datenbank-Passwort notieren. Dann das Repository verbinden:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>   # <ref> aus https://<ref>.supabase.co
   ```
2. **Datenbank einrichten:** Migrationen und statische Inhalte einspielen:
   ```bash
   npm run supabase:seed-content           # schreibt supabase/seed.sql: Bots, Kurse, Lektionen, Puzzle-Bank, 5 Demo-Puzzles
   npx supabase db push --include-seed     # Migrationen aus supabase/migrations/, danach der Seed
   ```
   Die Migrationen legen alle Tabellen mit Row Level Security an, dazu die Server-Berechnung von Rating, Serie und
   Statistik und die Realtime-Freigabe. Das Seed-Skript prüft die Inhalte und spielt den Seed zur Probe gegen die
   Migrationen ein (PGlite). Der Seed ist idempotent: Nach Inhaltsänderungen neu erzeugen und z. B. mit
   `psql -1 -v ON_ERROR_STOP=1 -f supabase/seed.sql "<Connection-String>"` einspielen (Dashboard → Connect).
3. **Claude-API-Schlüssel** nur als Secret der Funktion `explain` hinterlegen, nie in `.env.local`:
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
   ```
   Ohne Schlüssel bleibt es bei den regelbasierten Erklärungen; mit Schlüssel gibt es bis zu 200 KI-Erklärungen pro
   Person und Tag.
4. **Die drei Funktionen deployen:**
   ```bash
   npx supabase functions deploy explain          # Erklärungen mit Claude
   npx supabase functions deploy games-import     # PGN-Import ohne Duplikate
   npx supabase functions deploy delete-account   # Konto samt Daten löschen
   ```
   Jede Funktion lädt gemeinsamen Code aus `src/` über ihre `deno.json`; `SUPABASE_URL` und die Projektschlüssel setzt
   Supabase selbst. Die Funktionen prüfen das Anmelde-Token selbst. Scheitern Aufrufe trotz Anmeldung mit 401 (etwa
   mit den neuen JWT-Signaturschlüsseln), deploye mit `--no-verify-jwt`.
5. **Anmeldung** im Dashboard unter *Authentication*:
   - *Sign In / Providers:* „Email“ aktiv lassen – die App meldet per Magic Link an.
   - *E-Mail-Vorlage (wichtig, *Authentication → Email Templates → Magic Link*):* Der Link in der Mail muss
     `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Anmelden</a>` lauten (statt
     `{{ .ConfirmationURL }}`). Nur so funktioniert der Link auch, wenn er in einem anderen Browser oder einer anderen
     App als der angefordernden geöffnet wird (z. B. iPhone-Home-Bildschirm-App und Mail-App); der Standardlink braucht
     den Speicher des Browsers, in dem er angefordert wurde.
   - *Google (optional):* In der Google Cloud Console einen OAuth-Client vom Typ „Webanwendung“ mit der
     Weiterleitungs-URI `https://<ref>.supabase.co/auth/v1/callback` anlegen, Client-ID und Secret beim Provider
     „Google“ eintragen.
   - *URL Configuration:* „Site URL“ ist die Adresse der App (z. B. `https://schach.example.org`); unter „Redirect URLs“
     `https://schach.example.org/auth/callback` und für die Entwicklung `http://localhost:5173/auth/callback` eintragen.
   - *Sessions (optional, je nach Tarif):* Sitzungsdauer auf 30 Tage begrenzen.
   - Der eingebaute E-Mail-Versand schickt nur wenige Mails pro Stunde und nur an Mitglieder deines Supabase-Teams.
     Für weitere Personen trägst du unter *SMTP Settings* einen eigenen SMTP-Server ein.
6. **App verbinden:** `.env.example` nach `.env.local` kopieren und die Werte aus *Project Settings → API Keys*
   eintragen:
   ```bash
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon- bzw. publishable-Schlüssel>
   ```
   Die Werte werden beim Build eingebaut, also `npm run dev` bzw. `npm run build` neu starten. In den Client gehören
   nur diese öffentlichen Werte, nie der `service_role`- bzw. Secret-Schlüssel.

**Was dann synchronisiert wird:** Nach der Anmeldung liegen Profil und Einstellungen, Ratings, Puzzle-Versuche,
Partien mit allen Zügen, Analysen, Lektionsfortschritt, Tagesaktivität und Serie, Motiv-Statistik, Wiederholungen und
dein Feedback zu Erklärungen in deinem Konto. Andere angemeldete Geräte zeigen Änderungen per Realtime ohne Neuladen,
und eine laufende Partie kannst du auf einem anderen Gerät übernehmen. Was ein Gerät vorher lokal gespeichert hat,
wird bei der ersten Anmeldung einmalig übernommen. Puzzle-Bank, Bots und Lektionen kommen mit der App; der Seed legt
sie nur zusätzlich auf dem Server ab. Mehr dazu unter [Speichern & Synchronisieren](#speichern--synchronisieren).

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
supabase/      config.toml, migrations, edge functions, seed/ (puzzle CSV), tests
```

Licences of third-party code, data and fonts: `THIRD_PARTY_NOTICES.md` (Stockfish is GPL-3.0).
