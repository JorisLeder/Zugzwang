# Decision log

Owner: manager. One entry per decision: ID, question, decision, reason. Decisions never contradict
`docs/PRD.md` or `docs/team/CONSTRAINTS.md`; where the PRD leaves room, the decision fills it.
Entries marked "(auditor to confirm)" are re-checked by the chess-rules-auditor and recorded in `RULES.md`.

---

**D-01 – What are the six navigation areas?**
Decision: Start `/` (dashboard), Puzzles `/puzzles`, Spielen `/play`, Lernen `/learn` (page title "Lernpfad"; lessons
and courses), Analyse `/analysis` (game reviews, PGN import, Analysebrett), Profil `/profile` (incl. Statistik
`/profile/stats`); Einstellungen at `/settings`, reachable from Profil and the sidebar footer. English URL paths, German
labels, icons per DESIGN.md §3.2.
Reason: The PRD image of the information architecture is not in the text; these six follow the PRD modules
(Puzzles, Spielen, Lektionen, Analyse, Fortschritt/Profil) plus the start page that "führt direkt zur nächsten
sinnvollen Aktion". The designer's label "Lernen" (instead of "Lektionen") keeps six labelled tabs readable at 360 px
(DESIGN open point 1). `/analysis/{gameId}` is the deep link named in Ausblick V2.

**D-02 – What does the foundation build beyond scaffolding?**
Decision: Besides scaffold, shell, tokens and contracts, WP-00 also implements the shared runtime pieces every wave-1
package needs: `lib/chess` (FIDE-correct status on chess.js), `lib/rating` (Glicko-2), `lib/uci` + Node Stockfish
engine, BoardLayout, primitives, a minimal working board, in-memory fakes of all services.
Reason: 8 packages run in parallel; without these they would block each other or duplicate rules code (a
correctness risk). These pieces are small, pure and testable.

**D-03 – How do parallel packages plug in without editing shared files?**
Decision: WP-00 creates placeholder modules with fixed factory names (`createDataServices`, `createEngineService`,
`createAnalysisService`, `createBotEngine` + `BOT_ROSTER`, `createExplanationService`, each feature's `routes.tsx`,
`AuthGate`, `SyncStatusIndicator`, `OfflineBanner`, `@/ui/chess`, `@/ui/sound`). The owning package replaces the
implementation in place without changing the signature; `src/app` stays frozen.
Reason: Disjoint paths in one working tree, app compiles at every moment.

**D-04 – When does a game end? (auditor to confirm)**
Decision: Automatically on checkmate, stalemate, insufficient material, fivefold repetition (FIDE 9.6.1) and the
75-move rule (9.6.2; a mate on the last move takes precedence). Threefold repetition (9.2) and the 50-move rule (9.3) are
claims: the user gets a "Remis beanspruchen" button; a bot claims when claimable and its own evaluation is ≤ 0.
chess.js `isGameOver()`/`isDraw()` must not be used for termination.
Reason: CONSTRAINTS §3. Verified locally that chess.js 1.4.0 `isGameOver()` returns true after a threefold repetition
and at halfmove clock 100, which would end games that FIDE only allows to be claimed.

**D-05 – How is "dead position" detected? (auditor to confirm)**
Decision: Via chess.js `isInsufficientMaterial()` (K vs K, K+minor vs K, K+B vs K+B with same-coloured bishops).
Other dead positions (e.g. fully blocked pawn chains) are not detected in V1.
Reason: General dead-position detection needs a helpmate search. The subset never declares a wrong draw; it only
misses rare draws, which players can still agree via repetition/claims.

**D-06 – Clocks and flag fall in V1?**
Decision: No clocks in V1; every game has `timeControl: { kind: 'none' }`. The flag-fall rule (FIDE 6.9) is implemented
together with P1-06. Enum values (`timeout`, `timeout_vs_insufficient_material`) exist already.
Reason: "Bedenkzeit und Uhr" is P1-06; P0-07…P0-09 do not require clocks.

**D-07 – Exact move-classification boundaries.**
Decision (expected-points loss L, 0–1): best if the played move is the engine's best or L < 0.005; excellent L ≤ 0.02;
good L ≤ 0.05; inaccuracy L ≤ 0.10; mistake L < 0.20; blunder L ≥ 0.20. Precedence: book > brilliant > great > best >
excellent > good > miss > inaccuracy/mistake/blunder. Brilliant: L ≤ 0.02 + real piece sacrifice (SEE ≤ −2 pawns) +
mover's win% after ≥ 50 + win% before < 97 + not the only legal move + not a recapture. Great: L ≤ 0.02, not brilliant,
and (gap best→second ≥ 0.15 EP, or saves a lost position: win% before < 30 and after ≥ 50), excluding recaptures and
forced moves. Miss: opponent's previous move was mistake/blunder, the best reply would have recovered ≥ 0.10 EP, and
0.10 ≤ L < 0.20. Book: position after the move is in the lichess chess-openings set and the game has not left book.
Reason: PRD table gives overlapping ranges ("0,02–0,05"); lower bound exclusive/upper inclusive except blunder
"ab 0,20" (inclusive, same threshold as the coach warning in P0-08). Brilliant/Great/Miss need measurable rules.

**D-08 – Score orientation.**
Decision: All engine scores in contracts are from White's point of view; win% and expected-points loss are computed
from the mover's point of view.
Reason: UCI reports side-to-move scores; one normalisation point (lib/uci) avoids sign bugs.

**D-09 – Glicko-2 parameters.**
Decision: τ = 0.5, initial RD 350, volatility 0.06, RD clamped to [45, 350]. Each puzzle attempt is one rating period
with one game vs the puzzle (puzzle RD from data, default 80). Bot rating: Glicko-2 too, one period per Wettkampf game,
opponent = bot Elo with RD 50; Training/Coach games are not rated (PRD table). Puzzle ratings themselves do not change.
Reason: PRD names Glicko-2 and the `ratings` table holds rating/RD/volatility; τ = 0.5 is Glickman's example value,
which our test must reproduce.

**D-10 – Self-assessment options and start values.**
Decision: Neuling (kenne die Regeln kaum) → puzzle 400, bot 200, start Stufe 0; Einsteiger (kenne Regeln und einfache
Taktik) → 600 / 400 / Stufe 1; Clubspieler (ca. 1000–1400) → 1000 / 1000 / Stufe 1; Fortgeschritten (1600+) →
1500 / 1600 / Stufe 1. RD 350 so ratings adapt quickly.
Reason: PRD P0-04 gives 400 for newcomers and 600 for beginners as examples; the primary user (~200 Elo, knows rules
and basic tactics) is "Einsteiger". The two upper options serve the later persona (1200+) and the testers.

**D-11 – Hints, theme training and theme statistics.**
Decision: In rated mode any hint or showing the solution fails the attempt (PRD). Theme training is unrated. Theme
statistics count first-try results from rated, learning and theme modes; demo attempts are not stored.
Reason: PRD module table ("Hinweis oder Lösung = nicht gelöst"; Themen-Training separate from rated); P0-06 requires
success rate per motif.

**D-12 – Alternative mates.**
Decision: In puzzles and "Finde den Zug" steps every move that delivers immediate checkmate is accepted at any user
ply. Validators reject puzzles whose non-mating solution moves are not unique by ≥ 0.10 EP or whose forced-mate
solution has an equally fast alternative.
Reason: PRD "Gibt es mehrere Mattzüge, gilt jeder als richtig"; CONSTRAINTS §1 puzzle validation.

**D-13 – Lesson stars.**
Decision: Penalty = mistakes + hints used in the lesson; 0 → 3 stars, 1–2 → 2 stars, ≥ 3 → 1 star; a completed lesson has
at least 1 star; the best result is kept (furthest progress wins).
Reason: PRD "1–3 Sterne je Lektion, abhängig von Fehlern und Hinweisen".

**D-14 – Streak and daily goal.**
Decision: Streak = consecutive calendar days (user's time zone) with ≥ 1 completed action (puzzle attempt, completed
lesson step, finished game). Today does not break the streak before midnight. Daily goal reached when active minutes
≥ `dailyGoalMinutes` (default 20).
Reason: PRD metric "Tage mit mindestens einer abgeschlossenen Aktion"; Z5.

**D-15 – Local mode vs. cloud mode.**
Decision: With `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` the app runs in cloud mode (login required; logged out
only `/login` and the 5-puzzle demo, P0-01). Without them it runs in local mode: full app, no login, data in IndexedDB,
clearly labelled "Lokaler Modus – Fortschritt nur auf diesem Gerät".
Reason: CONSTRAINTS §2 (no Supabase project here); the PRD non-goal "Nutzung ohne Konto" stays true for the production
configuration, which is cloud mode.

**D-16 – Bot engines.**
Decision: Stockfish only (npm `stockfish`, lite single-threaded): < 800 Skill Level 0–3 + rule-based gross errors;
800–2000 human error model (MultiPV candidates, softmax over expected-points loss, Elo-dependent depth and threat
blindness); 2100–2500 UCI_LimitStrength/UCI_Elo. `MaiaBotEngine` stub documents the ONNX path.
Reason: CONSTRAINTS §2 (Hugging Face unreachable); P0-07 forbids "perfect moves with random blunders".

**D-17 – Bot roster.**
Decision: 14 bots at 100, 250, 400, 550, 700, 850, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500 (5 below 800) with
original names, avatars and personalities.
Reason: PRD "12–15 Bots … unter 800 besonders fein abgestuft"; P0-07 minimum 10 with ≥ 4 below 800; chess.com names
and images must not be used.

**D-18 – LLM model and refusal fallback for explanations.**
Decision: Edge function `explain` uses `claude-opus-5-5` (PRD default) via the official `@anthropic-ai/sdk` with
`effort: 'low'`, structured JSON output, and server-side refusal fallback enabled (`betas:
['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`). Rule-based explanations are always the fallback.
Open for the project owner: switch to `claude-haiku-5-5` for cost (PRD open question) or disable the refusal fallback.
Reason: CONSTRAINTS §2; current Claude API guidance recommends the refusal fallback for this model; low effort fits
a 1–3 sentence verbalisation task.

**D-19 – How are explanations stored and shown in the user's notation?**
Decision: `ExplanationText = { plain, segments, source, motifs }`. `segments` hold text and moves (English SAN); the UI
renders moves in the chosen notation; `plain` is German-notation plain text for storage/TTS (P2-06). The LLM marks
moves as `[[SAN]]`; the client validator accepts only moves from the engine facts.
Reason: P0-11 (only engine-confirmed moves), P2-06 (plain text), notation setting (CONSTRAINTS §4).

**D-20 – Board library and sounds.**
Decision: react-chessboard v5 (MIT) on chess.js. Sounds synthesised with WebAudio (no audio files).
Reason: PRD/CONSTRAINTS stack; no licence questions and no downloads for sound assets.

**D-21 – Tool versions.**
Decision: `@playwright/test` pinned to 1.56.1 (bundles Chromium revision 1194, the one installed in `/opt/pw-browsers`;
1.64 would need 1248). TypeScript ~5.9.3 (typescript-eslint peer range < 6.1). ESLint 9.39.x (eslint-plugin-jsx-a11y does
not support ESLint 10). react-router 7.x (data router). Everything else latest mutually compatible.
Reason: Verified with `npm view` and the browser directories on this machine.

**D-22 – Parallel builds and e2e in one working tree.**
Decision: Parallel coders build into `.build/<WP-id>`, run e2e against their own Vite dev server on a fixed port
(`E2E_SERVER=dev E2E_PORT=…`) with `--output test-results/<WP-id>`. The final gate `npm run e2e` uses a production
preview build.
Reason: Concurrent writes to `dist/` and port collisions would make results meaningless.

**D-23 – German castling notation. (auditor to confirm)**
Decision: German notation shows castling as `0-0` / `0-0-0` and pieces as K, D, T, L, S (pawn without letter,
promotion `=D` etc.). English notation and PGN use `O-O`.
Reason: CONSTRAINTS §4 (German letters default); FIDE Laws Appendix C writes castling with zeros.

**D-24 – Puzzle data format.**
Decision: Lichess format for every puzzle: `fen` before the opponent's first move, `moves[0]` = opponent's move, then
alternating user/opponent moves in UCI.
Reason: The importer of the official Lichess CSV maps 1:1; one runtime path for imported, generated, seed and lesson puzzles.

**D-25 – Where does the puzzle bank live in the client?**
Decision: Static chunked JSON in `public/data/puzzles/` with a manifest; loaded into IndexedDB on first start/version
change; precached by the service worker. Cloud mode additionally seeds the `puzzles` table.
Reason: NFR offline (≥ 200 puzzles locally), puzzle switch ≤ 300 ms, no backend here.

**D-26 – Lesson content format.**
Decision: JSON files in `content/lessons/` validated by zod schemas from `src/core`; "Finde den Zug" solutions are move
trees (variations possible).
Reason: PRD "Inhalte liegen versioniert im Git-Repository und werden beim Deploy eingespielt"; P2-04 requires move trees.

**D-27 – Engine instances.**
Decision: Two Stockfish workers: `play` (bots, coach, hints) and `analysis` (game review, analysis board).
Reason: Background analysis must not delay bot replies (≤ 1 s) or coach warnings.

**D-28 – Where are ratings, streaks and statistics computed?**
Decision: Client computes provisional values immediately (shown as provisional in cloud mode); in cloud mode Postgres
triggers compute the authoritative values with the same algorithms (PL/pgSQL Glicko-2) and realtime replaces the
provisional values. Parity is proven by tests (PGlite). In local mode the client is the authority.
Reason: PRD "Ratings, Streaks und Statistiken berechnet der Server; der Browser zeigt bis zur Bestätigung einen vorläufigen Wert".

**D-29 – Additions to the PRD data model.**
Decision: `games` gets `start_fen`, `headers`, `end_reason`, `origin`, `active_device_id`, `active_heartbeat_at`,
`rating_before/after`, `finished_at`; `game_moves` is an append-only event log with `seq`, `kind` (move/takeback) and
`user_id`; `profiles` gets `self_assessment`, `onboarding_completed`, `stage_zero_skipped`; new tables
`explanation_usage` (rate limit 200/day) and `explanation_feedback` (thumbs up/down).
Reason: Needed for P0-09 (resume from any start position, takebacks without updates), "Partie läuft auf einem anderen
Gerät", play from FEN, bot rating curves, NFR rate limit, PRD explanation-quality metric.

**D-30 – Wave plan.**
Decision: Wave 1: board, engine/analysis, puzzles, bots/play, review/explanations/PGN, lesson engine, lesson content,
client data layer. Wave 2: dashboard/profile/stats/settings/onboarding/PWA, puzzle bank generation, Supabase backend.
Wave 3: core journeys, Lighthouse, responsive sweep.
Reason: Dashboard aggregates all modules; the puzzle generator needs the motif detectors and rule-based explainer; the
SQL schema follows the adapter contract; the journeys need everything.

**D-31 – Time-control selector.**
Decision: Not shown in V1 (games are untimed).
Reason: D-06; showing options that do nothing would confuse learners.

**D-32 – Rated puzzles when the rating window is exhausted.**
Decision: Widen ±150 → ±250 → ±400 → any rating (with a short notice); if no unattempted puzzle is left, say so and
offer the learning mode. Never repeat a rated puzzle.
Reason: P0-04 "dasselbe Puzzle erscheint nicht zweimal bewertet" has priority over the ±150 window.

**D-33 – Account deletion in cloud mode.**
Decision: Edge function `delete-account` (service role only in function env) deletes all user rows and the auth user.
Reason: DoD V1 "Konto-Export und -Löschung funktionieren"; clients cannot delete auth users.

**D-34 – P1 pull-in.**
Decision: Only after all P0 packages are done: first P1-02 Tagespuzzle, then P1-03 Wiederholung.
Reason: CONSTRAINTS §1.

**D-35 – Language and i18n.**
Decision: UI strings in per-feature `strings.de.ts`; language setting offers Deutsch, English shown as
"in Vorbereitung" (disabled).
Reason: PRD "Sprache (Deutsch zuerst, Englisch vorbereitet)".

**D-36 – Hints in bot games (Training/Coach).**
Decision: Stage 1 highlights the piece of the best move, stage 2 shows the best-move arrow.
Reason: PRD "Hinweis auf Anfrage"; consistent with the staged puzzle hints.

**D-37 – Draw offers.**
Decision: No draw offer/agreement in V1; draws come from the rules (D-04) or claims.
Reason: Not in the PRD; avoid inventing features.

**D-38 – Lessons: locking.**
Decision: Stufe 0 always open; Stufe 1 open when the self-assessment is Einsteiger or higher, the Stufe-0 skip test is
passed, or Stufe 0 is completed. Lessons unlock sequentially inside a course; the course test unlocks after all lessons.
Planned courses and stages are visible as "in Vorbereitung".
Reason: PRD "Komplette Neulinge beginnen bei Stufe 0. Wer die Regeln kennt, überspringt sie mit einem kurzen Test";
Kern-Ablauf 4 "nächste Lektion wird freigeschaltet"; Lernpfad user story ("damit ich weiß, was als Nächstes kommt").

**D-39 – "Einfache Ansicht" (DESIGN.md §8.7)?**
Decision: Deferred – not part of the V1 P0 packages. No "Einfache Ansicht" setting, no second presentation variant.
Kept for everyone because it directly serves P0-10/P0-11 understanding at no extra mode: the one-line plain meaning of
each move category (`CLASSIFICATION_META.plainDe`) shown as legend/tooltip in the analysis. Design review checklist
item 9 is suspended. Can be re-proposed after P0 is green if testers show a learning problem tied to a PRD requirement.
Reason: No PRD requirement names it; the PRD settings list (§6) does not contain it; it would double the presentation
and test surface in every wave-1 package (DESIGN open point 2).

**D-40 – Tab bar on phone board screens.**
Decision: Accept DESIGN.md §3.4: on phones (< 768 px) the tab bar is replaced by the fixed action bar while a board task
is active; the top bar's "‹" returns to the area hub. On all other screens and on ≥ 768 px every area is one click away.
Reason: PRD Gestaltungsregeln require "Brett in voller Breite oben, Aktionen in einer festen Leiste unten" on phones;
two stacked bottom bars would push the panel out of view at 360 × 640. Leaving never loses progress (P0-09, P0-12).

**D-41 – Coach warning latency (DESIGN open point 3).**
Decision: `AnalysisService.prepare(fen)` analyses the user's position in the background as soon as it is the user's
turn; `assessMove` then only searches the position after the move (shallow) and must answer ≤ 500 ms after `prepare`
finished (≤ 1 s cold) on this machine. The UI holds the move at most 800 ms (DESIGN §8.2); if no answer, the move is
played without warning. WP-12 measures the mobile project.
Reason: P0-08 requires the warning before a move losing ≥ 0.20; the 800 ms cap keeps play fluid (PRD Randfall 3).

**D-42 – Designer's other open points.**
Decision: Draw claims by bots: see D-04 (bot claims when claimable and its own evaluation ≤ 0) – the rules auditor
records it in RULES.md. Bot names/avatars: created by WP-04 (original, no chess.com assets), reviewed by the designer in
the wave-1 design review. Fonts: Inter self-hosted via `@fontsource-variable/inter` (OFL-1.1). Radix: the umbrella
package `radix-ui` provides the primitives DESIGN §11 lists.
Reason: DESIGN.md §12 open points 4–5 and §11 dependency requests.
