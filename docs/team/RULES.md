# RULES.md – Zugzwang rules reference

Owner: chess rules auditor. Binding for every package that touches rules logic, game end, clocks, ratings,
analysis or chess content. Last updated: 2026-10-16 (before any code exists).

How to read the status tags:

- **[CONFIRMED]** – the quoted wording came back from a web search result for the named source.
- **[SUBSTANCE]** – the search confirmed the content and the article number, but not every word of the quote.
  Do not put these quotes in front of users word for word; the rule itself is safe to implement.
- **[UNCONFIRMED]** – not confirmed by any source reachable from this machine. Do not rely on it until someone
  checks the original.

The FIDE, DSB, Lichess, chess.com and glicko.net sites cannot be reached from this machine (CONSTRAINTS §2).
All quotes come from the WebSearch tool, except where the source is code fetched from raw.githubusercontent.com.
The chess.js behaviour was checked by running scripts against **chess.js 1.4.0** (the current npm release on 2026-10-16).

---

## 0. Contract for the code team (summary)

| # | Rule (FIDE article) | chess.js 1.4.0 provides | The app layer must |
|---|---|---|---|
| 1 | Legal moves, check, castling, e.p., promotion (3.7–3.10) | Correct move generation **for positions reached by moves** | Use chess.js for every legality decision. Clean up every FEN on load (rule 13). |
| 2 | Checkmate ends the game (5.1.1) | `isCheckmate()` | Check this **first**. It takes priority over the 50/75-move counters (fixtures M4, M6). |
| 3 | Stalemate = draw, immediately (5.2.1) | `isStalemate()` | End the game as a draw ("Patt"). |
| 4 | Dead position = draw, immediately (5.2.2) | `isInsufficientMaterial()` covers only K v K, K+N v K, K+B v K and K+B(s) v K+B(s) with all bishops on one colour | End the game on `isInsufficientMaterial()`. Other dead positions (for example locked pawns, D11) are not detected in V1. This limit is accepted and documented: the 75-move and fivefold rules still end such games. |
| 5 | Threefold repetition is a **claim** (9.2) | `isThreefoldRepetition()` → **true**, and `isDraw()`/`isGameOver()` → **true** | **Never** end the game on `isDraw()`/`isGameOver()`. Offer "Remis beantragen" to the player to move (§5.2). |
| 6 | 50-move rule is a **claim** (9.3) | `isDrawByFiftyMoves()` (half-move clock ≥ 100), also inside `isDraw()`/`isGameOver()` | Same as row 5. |
| 7 | Fivefold repetition is **automatic** (9.6.1) | nothing | Count position keys (§5.1). On the 5th occurrence the game is a draw. |
| 8 | 75-move rule is **automatic** (9.6.2) | nothing (half-move clock is in `fen()` field 5) | Half-move clock ≥ 150 and not checkmate → draw. |
| 9 | Flag fall (6.9) | no clocks | Lost on time, **unless the opponent cannot checkmate by any series of legal moves**, then draw. Use `cannotMate()` (§5.3). Clocks are P1-06. |
| 10 | Resignation (5.1.2, 2023 text) | nothing | Resigning loses, **unless the opponent cannot checkmate**, then the game is a draw. Use `cannotMate()`. |
| 11 | Same position (9.2.2) | Its internal hash counts an e.p. right whenever an enemy pawn stands next to the pawn, even when the e.p. capture is illegal (pin). It under-counts (R5). | Build your own repetition key from `fen()` (it lists the e.p. square only when an e.p. capture is legal). Do not use `isThreefoldRepetition()` for claims. |
| 12 | Promotion compulsory to Q/R/B/N (3.7.5) | Rejects a promotion move without a piece, and rejects promotion to K or P | Always ask (picker, no auto-queen). |
| 13 | Illegal positions (3.10.3) | `load()` **accepts** a FEN in which the side not to move is in check. It **trusts castling flags** even when the king or rook is not on its square, and then generates illegal castling (C11, C12). It **accepts a bogus e.p. square** and generates a capture of a pawn that is not there (E5). | Every FEN entry point (lessons, puzzles, user FEN, PGN `[FEN]`) goes through `normalizeFen()` (§5.4). `npm run validate:content` rejects positions where the side not to move is in check. |
| 14 | Resuming a game | `load(fen)` resets the repetition history | Resume by replaying all moves from the game's start FEN (`game_moves`). Never resume from the last FEN only. |
| 15 | Castling notation (App. C) | SAN `O-O`/`O-O-O` (letter O). The parser also accepts `0-0`. | German display: `0-0`/`0-0-0` (FIDE C.13). English display: `O-O`. PGN export: `O-O` (what chess.js writes). |

---

## 1. Sources and edition in force

| Source | URL | Note |
|---|---|---|
| FIDE Laws of Chess, in force from 1 Jan 2023 (English, the authentic text) | https://handbook.fide.com/chapter/e012023 | Handbook E.01 |
| Same, PDF (FIDE Rules Commission) | https://rcc.fide.com/wp-content/uploads/2022/12/20230101Laws-of-Chess.pdf and https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf | "Approved by the FIDE General Assembly on 07/08/2022" |
| RCC article pages | https://rcc.fide.com/article3/ · https://rcc.fide.com/article5/ · http://rcc.fide.com/article6/ · https://rcc.fide.com/article9/ · https://rcc.fide.com/appendixc/ | |
| Table of changes 2018 → 2023 | https://rcc.fide.com/wp-content/uploads/2022/12/20230101Laws-of-Chess_tableofchanges.pdf | |
| German translation (DSB Schiedsrichterkommission, Ralph Alt) | https://rcc.fide.com/wp-content/uploads/2023/04/FIDE-Regeln-2023-Final-DEU.pdf · https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-E.01.Laws_of_chess-GER.pdf · https://www.schachbund.de/downloads.html (DSB download list: "FIDE-Regeln (gültig ab 01.01.2023) … Stand 07.07.2026") | The translation itself says the English text is authentic |
| Arbiters' Manual 2025 | https://arbiters.fide.com/wp-content/uploads/Publications/Manual/Arbiters_Manual_2025.pdf | Explains the rules for arbiters (not the rules themselves) |

**Edition check (2026-10-16):** the 2023 edition is still in force. At the 2nd FIDE Council meeting on 23 Aug 2026 the Council
decided "to further discuss the proposed draft of the Laws of Chess by a working group"
(https://www.fide.com/2nd-fide-council-meeting-august-23-2026-list-of-decisions/). No newer edition has an effective date.
[CONFIRMED by search]. Re-check before release.

---

## 2. FIDE Laws (2023) – quoted passages

The quotes say "he/she" as the 2023 text does. Sub-numbering differs between sources: the 2023 PDF writes some
sub-items as "1) 2) …" where the 2018 text has 3.8.2.1.1 and so on. The content is the same.

### 2.1 Castling – Art. 3.8.2
- **3.8.2** [SUBSTANCE] "by 'castling'. This is a move of the king and either rook of the same colour along the
  player's first rank, counting as a single move of the king and executed as follows: the king is transferred from
  its original square two squares towards the rook on its original square, then that rook is transferred to the
  square the king has just crossed." (The first sentence matched the search exactly. The rest was confirmed as a
  paraphrase only.)
- **3.8.2.1** [CONFIRMED] "The right to castle has been lost: 1) if the king has already moved, or 2) with a rook that
  has already moved."
- **3.8.2.2** [CONFIRMED] "Castling is prevented temporarily: … if the square on which the king stands, or the square
  which it must cross, or the square which it is to occupy, is attacked by one or more of the opponent's pieces, or
  … if there is any piece between the king and the rook with which castling is to be effected."
- Consequence (explicit in the wording, not an extra rule): only the **king's** three squares count. A rook that
  stands on or crosses an attacked square does not prevent castling (fixtures C5, C6). Queenside, b1/b8 must be
  **empty** but may be attacked (C5, C7).
- URLs: https://handbook.fide.com/chapter/e012023 · https://rcc.fide.com/article3/

### 2.2 En passant – Art. 3.7.4
- **3.7.4.1** [SUBSTANCE] "A pawn occupying a square on the same rank as and on an adjacent file to an opponent's pawn
  which has just advanced two squares in one move from its original square may capture this opponent's pawn as
  though the latter had been moved only one square." (Exact up to "advanced two squares". Older editions number it 3.7.3.1 or 3.7(d).)
- **3.7.4.2** [CONFIRMED] "This capture is only legal on the move following this advance and is called an
  'en passant' capture."
- URLs: https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf · https://handbook.fide.com/chapter/e012018

### 2.3 Promotion – Art. 3.7.5
- **3.7.5.1** [SUBSTANCE] "When a player, having the move, plays a pawn to the rank furthest from its starting
  position, he/she must exchange that pawn as part of the same move for a new queen, rook, bishop or knight of the
  same colour on the intended square of arrival. This is called the square of 'promotion'."
- **3.7.5.2** [CONFIRMED] "The player's choice is not restricted to pieces that have been captured previously."
- **3.7.5.3** [CONFIRMED] "This exchange of a pawn for another piece is called promotion, and the effect of the new
  piece is immediate."
- URL: https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf

### 2.4 Check, legal and illegal moves – Art. 3.9, 3.10
- **3.9.1** [SUBSTANCE] "The king is said to be 'in check' if it is attacked by one or more of the opponent's pieces,
  even if such pieces are constrained from moving to the square occupied by the king because they would then leave or
  place their own king in check."
- **3.9.2** [SUBSTANCE] "No piece can be moved that will either expose the king of the same colour to check or leave
  that king in check."
- **3.10.1 / 3.10.2** [SUBSTANCE] A move is legal when all the relevant requirements of Articles 3.1–3.9 have been
  fulfilled; it is illegal when it fails to meet them.
- **3.10.3** [CONFIRMED] "A position is illegal when it cannot have been reached by any series of legal moves."
- URLs: https://rcc.fide.com/wp-content/uploads/2022/12/20230101Laws-of-Chess.pdf · https://rcc.fide.com/article3/

### 2.5 Checkmate and resignation – Art. 5.1
- **5.1.1** [CONFIRMED] "The game is won by the player who has checkmated his/her opponent's king. This immediately
  ends the game, provided that the move producing the checkmate position was in accordance with Article 3 and
  Articles 4.2 – 4.7."
- **5.1.2 (changed in 2023)** [SUBSTANCE] The game is lost by the player who declares he/she resigns (this ends the
  game immediately), **unless the position is such that the opponent cannot checkmate the player's king by any
  possible series of legal moves; then the result is a draw.** Source of the change: https://suffolkchess.org/2023/04/updated-fide-laws-of-chess.html
  ("to avoid interpretation problems, such as when a player resigns against a bare King"). The exact 2023 wording is
  [UNCONFIRMED]. The pre-2023 text was: "The game is won by the player whose opponent declares he resigns."
- URLs: https://rcc.fide.com/article5/ · https://handbook.fide.com/chapter/e012023

### 2.6 Stalemate and dead position – Art. 5.2, 1.5
- **5.2.1** [CONFIRMED] "The game is drawn when the player to move has no legal move and his/her king is not in check.
  The game is said to end in 'stalemate'. This immediately ends the game, provided that the move producing the
  stalemate position was in accordance with Article 3 and Articles 4.2 – 4.7."
- **5.2.2** [CONFIRMED] "The game is drawn when a position has arisen in which neither player can checkmate the
  opponent's king with any series of legal moves. The game is said to end in a 'dead position'." [SUBSTANCE for the
  next sentence:] "This immediately ends the game, provided that the move producing the position was in accordance with
  Article 3 and Articles 4.2 – 4.7."
- **1.5** [CONFIRMED] "If the position is such that neither player can possibly checkmate the opponent's king, the game
  is drawn (see Article 5.2.2)."
- Note: "any series of legal moves" means **any** sequence, even a cooperative one, not a forced mate. K+N+N v K is **not**
  dead (D7). K+B v K+B with bishops on opposite colours is not dead (D5, mate in one in D12).
- URL: https://handbook.fide.com/chapter/e012023

### 2.7 Flag fall – Art. 6.9
- **6.9** [CONFIRMED, first sentence] "Except where one of the Articles 5.1.1, 5.1.2, 5.2.1, 5.2.2, 5.2.3 applies, if a
  player does not complete the prescribed number of moves in the allotted time, the game is lost by the player."
  [SUBSTANCE, second sentence] "However, the game is drawn if the position is such that the opponent cannot checkmate
  the player's king by any possible series of legal moves."
- URLs: https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf · http://rcc.fide.com/article6/

### 2.8 Threefold repetition (claim) – Art. 9.2
- **9.2.1** [SUBSTANCE] "The game is drawn, upon a correct claim by a player having the move, when the same position for
  at least the third time (not necessarily by a repetition of moves):
  9.2.1.1 is about to appear, if he/she first writes his/her move, which cannot be changed, on his/her scoresheet and
  declares to the arbiter his/her intention to make this move, or
  9.2.1.2 has just appeared, and the player claiming the draw has the move."
  (The German 2023 text matching this was returned by search: "Die Partie ist remis aufgrund eines korrekten Antrages
  der Spielerin / des Spielers, die / der am Zug ist, wenn die gleiche Stellung mindestens zum dritten Mal (nicht
  notwendigerweise durch Zugwiederholung) …")
- **9.2.2** [SUBSTANCE] "Positions are considered the same if and only if the same player has the move, pieces of the
  same kind and colour occupy the same squares and the possible moves of all the pieces of both players are the same.
  Thus positions are not the same if:
  9.2.2.1 at the start of the sequence a pawn could have been captured en passant,
  9.2.2.2 a king had castling rights with a rook that has not been moved, but forfeited these after moving. The
  castling rights are lost only after the king or rook is moved."
- URLs: https://handbook.fide.com/chapter/e012023 · https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf

### 2.9 Fifty-move rule (claim) – Art. 9.3, 9.4
- **9.3** [SUBSTANCE] "The game is drawn, upon a correct claim by a player having the move, if:
  9.3.1 he/she writes his/her move, which cannot be changed, on his/her scoresheet and declares to the arbiter his/her
  intention to make this move which will result in the last 50 moves by each player having been made without the
  movement of any pawn and without any capture, or
  9.3.2 the last 50 moves by each player have been completed without the movement of any pawn and without any capture."
- **9.4** [CONFIRMED] "If the player touches a piece as in Article 4.3, he/she loses the right to claim a draw under
  Article 9.2 or 9.3 on that move."
- URLs: https://handbook.fide.com/chapter/e012023 · http://rcc.fide.com/article9/

### 2.10 Fivefold repetition and 75-move rule (automatic) – Art. 9.6
- **9.6** [SUBSTANCE] "If one or both of the following occur(s) then the game is drawn:
  9.6.1 the same position has appeared, as in 9.2.2 at least five times.
  9.6.2 any series of at least 75 moves have been made by each player without the movement of any pawn and without any
  capture. If the last move resulted in checkmate, that shall take precedence."
  9.6.2 was [CONFIRMED] by search (RCC text). The German 2023 text was also returned [CONFIRMED]: "9.6 Falls eine oder
  beide der folgenden Situationen auftreten, ist die Partie remis: 9.6.1 sobald eine gleiche Stellung, entsprechend
  Artikel 9.2.2, mindestens fünfmal entstanden ist. 9.6.2 sobald wenigstens 75 Züge von jedem Spielenden ausgeführt
  worden sind, ohne dass ein Bauer gezogen hat und ohne dass eine Figur geschlagen worden ist. Wenn der letzte Zug
  mattsetzt, hat dies Vorrang."
- No claim is needed: the game ends at the moment the 5th occurrence or the 75th move happens (RCC Q&A Nov 2021,
  https://rcc.fide.com/2021/11/08/questions-answers-november-2021/ [SUBSTANCE]).
- URLs: https://handbook.fide.com/chapter/e012023 · https://rcc.fide.com/wp-content/uploads/2022/12/20230101Laws-of-Chess.pdf

### 2.11 Notation of castling – Appendix C
- **C.13.1** [CONFIRMED, 2023] "0-0 = castling with rook h1 or rook h8 (kingside castling)".
- "0-0-0 = castling with rook a1 or rook a8 (queenside castling)" [CONFIRMED in the 2018 and 2012 editions; the 2023
  sub-number C.13.2 is UNCONFIRMED].
- FIDE writes **zeros**. chess.js writes the letter O (PGN). DESIGN.md §5.5 (German "0-0", English "O-O", PGN "O-O") is
  consistent with this.
- English piece letters K Q R B N come from App. C [SUBSTANCE]. The German letters **K D T L S** are standard German usage,
  but the DSB's Appendix C wording was not found [UNCONFIRMED as DSB text].
- URLs: https://rcc.fide.com/appendixc/ · https://rcc.fide.com/wp-content/uploads/2022/11/Laws_of_Chess-2023.pdf

---

## 3. German terms (DSB translation of the 2023 Laws)

Sources: https://rcc.fide.com/wp-content/uploads/2023/04/FIDE-Regeln-2023-Final-DEU.pdf,
https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-E.01.Laws_of_chess-GER.pdf,
the 2018 DSB translation https://rcc.fide.com/wp-content/uploads/2020/12/FIDE-Regeln-2018-Final-DEU.pdf. The 2023 text
uses gender-inclusive forms ("die Spielerin / der Spieler", "Spielende").

| Concept | Term in the DSB text | Status | UI recommendation |
|---|---|---|---|
| check | "im Schach stehen" (5.2.1: "… ihr / sein König nicht im Schach steht") | CONFIRMED | "Schach" |
| checkmate | "mattsetzen", "mattgesetzt" (5.1.1, 2018: "… der den gegnerischen König mattgesetzt hat"); 9.6.2: "mattsetzt" | CONFIRMED | "Schachmatt", "Matt", "mattsetzen" |
| stalemate | "Patt", "Pattstellung" (5.2.1) | CONFIRMED | "Patt" |
| dead position | "tote Stellung" (5.2.2) | CONFIRMED | "tote Stellung" (explain: "keine Seite kann mehr mattsetzen") |
| legal move | "regelgemäßer Zug" (5.2.1: "keinen regelgemäßen Zug") | CONFIRMED | "regelgemäßer Zug"; "legaler Zug" is acceptable everyday German |
| castling | "Rochade" (3.8) | CONFIRMED | "Rochade", "kurze/lange Rochade" (common usage; the latter is [UNCONFIRMED] as DSB text) |
| en passant | "Schlagen en passant"; notation "e.p." = "(schlägt) en passant" | CONFIRMED | "en passant schlagen". "im Vorbeigehen schlagen" is **not** found in the DSB text [UNCONFIRMED]; use it only as a gloss. |
| promotion | "Umwandlung", "Umwandlungsfeld" (3.7.5) | CONFIRMED | "Umwandlung" |
| pieces | "Dame, Turm, Läufer oder Springer derselben Farbe" (3.7.5.1); König, Bauer | CONFIRMED | as is |
| draw | "remis" ("ist die Partie remis") | CONFIRMED | "Remis" |
| claim | "aufgrund eines korrekten Antrages" (9.2.1) | CONFIRMED | "Remis beantragen" (DSB noun: Antrag). DESIGN.md uses "beanspruchen", see finding R-03. |
| threefold repetition | "die gleiche Stellung mindestens zum dritten Mal" (9.2.1) | CONFIRMED (phrase); "dreimalige Stellungswiederholung" is common German, [UNCONFIRMED] as DSB term | "Remis durch dreimalige Stellungswiederholung" |
| fivefold repetition | "mindestens fünfmal entstanden" (9.6.1) | CONFIRMED | "Remis durch fünfmalige Stellungswiederholung" |
| 50-move rule | 9.3 wording ("die letzten 50 Züge von jedem Spielenden … ohne dass ein Bauer gezogen hat und ohne dass eine Figur geschlagen worden ist") | SUBSTANCE; the name "50-Züge-Regel" is common German [UNCONFIRMED as DSB term] | "50-Züge-Regel" |
| 75-move rule | "wenigstens 75 Züge von jedem Spielenden" (9.6.2) | CONFIRMED | "75-Züge-Regel" |
| flag fall | 6.9: "… nicht möglich ist, den König … durch eine beliebige Folge regelgemäßer Züge matt zu setzen" | SUBSTANCE; the noun "Zeitüberschreitung" is [UNCONFIRMED] for 2023 | "Zeit abgelaufen" / "Zeitüberschreitung" |
| resign | – | [UNCONFIRMED] | "aufgeben" |

---

## 4. Ratings and analysis references

### 4.1 Glicko-2 (puzzle rating, P0-04)
Source: Mark E. Glickman, "Example of the Glicko-2 system", https://glicko.net/glicko/glicko2.pdf (not reachable from this machine).
The search confirmed the final values and the formulas below. Two open-source implementations were also used as a cross-check:
https://raw.githubusercontent.com/sublee/glicko2/master/glicko2.py with its test
https://raw.githubusercontent.com/sublee/glicko2/master/glicko2tests.py, and
https://raw.githubusercontent.com/deepy/glicko2/master/glicko2/glicko2.py.

Algorithm (one rating period, opponents j = 1..m, scores s_j ∈ {0, 0.5, 1}) [SUBSTANCE: confirmed by search and both implementations]:
1. Unrated default: r = 1500, RD = 350, σ = 0.06 (defaults in both implementations; the paper's wording is [UNCONFIRMED]).
   System constant τ: Glickman suggests 0.3–1.2 (https://rdrr.io/cran/PlayerRatings/man/glicko2.html). The example uses τ = 0.5.
2. μ = (r − 1500) / 173.7178, φ = RD / 173.7178 [CONFIRMED].
3. g(φ) = 1 / √(1 + 3φ²/π²); E(μ, μ_j, φ_j) = 1 / (1 + exp(−g(φ_j)(μ − μ_j))); v = [Σ g(φ_j)² E (1 − E)]⁻¹.
4. Δ = v Σ g(φ_j)(s_j − E).
5. σ′ from the Illinois algorithm (a regula falsi variant; revised Feb 2012) [CONFIRMED]:
   a = ln σ²; f(x) = eˣ(Δ² − φ² − v − eˣ) / (2(φ² + v + eˣ)²) − (x − a)/τ²; A = a;
   B = ln(Δ² − φ² − v) if Δ² > φ² + v, otherwise B = a − kτ with the smallest k ≥ 1 such that f(a − kτ) ≥ 0;
   iterate C = A + (A − B) f_A / (f_B − f_A); if f_C·f_B ≤ 0 then A = B, f_A = f_B, else f_A = f_A/2; B = C, f_B = f_C;
   stop when |B − A| ≤ ε; σ′ = e^(A/2). ε = 0.000001 (both implementations; the paper value is [SUBSTANCE]).
6. φ* = √(φ² + σ′²).
7. φ′ = 1 / √(1/φ*² + 1/v); μ′ = μ + φ′² Σ g(φ_j)(s_j − E).
8. r′ = 173.7178 μ′ + 1500; RD′ = 173.7178 φ′.
A player who did not compete in a period: RD′ = 173.7178 · √(φ² + σ²); r and σ stay the same (the deepy implementation's `did_not_compete`; the paper's
wording is [UNCONFIRMED]). Example: RD 200, σ 0.06 → 200.2714.

**Glickman's worked example (must reproduce):**
- Player: r = 1500, RD = 200, σ = 0.06; τ = 0.5.
- Opponents: (1400, RD 30) **won**; (1550, RD 100) **lost**; (1700, RD 300) **lost**.
- Paper result [CONFIRMED]: μ′ = −0.2069, φ′ = 0.8722, **r′ = 1464.06, RD′ = 151.52, σ′ = 0.05999**.
- Unrounded result (the paper rounds intermediate values): r′ = 1464.0507, RD′ = 151.5165, σ′ = 0.0599960. Checked three ways:
  my scratch implementation, the sublee test (`1464.051, 151.515, 0.05999`), and a GitHub PR quoted by search
  ("unrounded arithmetic gives about 1464.0507 / 151.5165 / 0.059996").
- Unrounded intermediates (my implementation, for unit tests): μ = 0, φ = 1.151292; g = 0.995498, 0.953149, 0.724235;
  E = 0.639468, 0.431842, 0.302841; v = 1.778977; Δ = −0.483933; φ* = 1.152855; φ′ = 0.872199; μ′ = −0.206941.
  The paper's rounded intermediates (v ≈ 1.7785, Δ ≈ −0.4834 from memory) are [UNCONFIRMED]. Do not test against them.
- Test tolerance: |r′ − 1464.06| ≤ 0.02, |RD′ − 151.52| ≤ 0.01, |σ′ − 0.05999| ≤ 0.00001.
- App decision needed (manager, DECISIONS.md): treat each puzzle attempt as its own rating period with one "game"
  against the puzzle's rating/RD (solved = 1, failed / hint / solution = 0). Lichess does this for puzzles, but that is [UNCONFIRMED].

### 4.2 Lichess win probability and accuracy (analysis, P0-10)
lichess.org/page/accuracy cannot be reached from this machine. The constants below come from **Lichess source code**
fetched from GitHub. That is the primary source, so they are [CONFIRMED]:
- https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/eval.scala
- https://raw.githubusercontent.com/lichess-org/lila/master/modules/analyse/src/main/AccuracyPercent.scala
- https://raw.githubusercontent.com/lichess-org/lila/master/ui/lib/src/ceval/winningChances.ts

Win percentage (side's point of view, 0–100):
```
winningChances(cp) = clamp(2 / (1 + exp(-0.00368208 * cp)) - 1, -1, +1)   // MULTIPLIER = -0.00368208 (lila PR #11148)
WinPercent(cp)     = 50 + 50 * winningChances(clamp(cp, -1000, +1000))   // Cp.CEILING = 1000
mate (server, accuracy): WinPercent(+1000) for a mate in favour, WinPercent(-1000) against
mate (client display):   cp = (21 - min(10, |mate|)) * 100, signed
start position: WhiteScore.initial = +15 cp
```
Move accuracy (from the win percentage of the mover before and after the move):
```
if after >= before: 100
else: clamp(103.1668100711649 * exp(-0.04354415386753951 * (before - after)) - 3.166924740191411 + 1, 0, 100)
                                                            // "+1": uncertainty bonus (due to imperfect analysis)
```
Game accuracy per colour: windows of win percentages of size clamp(n/10, 2, 8) (n = number of evals). Each window is
weighted by the standard deviation of its win percentages, clamped to [0.5, 12]. The result is the mean of the
volatility-weighted mean and the **harmonic mean** of the move accuracies. Whether the standard deviation is the
population or the sample version is [UNCONFIRMED] (scalalib `Maths` was not fetched).

Reference values (computed from the formulas above): W(0) = 50.0000, W(100) = 59.1026, W(200) = 67.6212, W(300) = 75.1126,
W(500) = 86.3072, W(≥1000) = 97.5447, W(−300) = 24.8874. Move accuracy with the +1 bonus for a win-% drop of
5 → 80.8153, 10 → 64.5798, 20 → 41.0168, 40 → 15.9090, 60 → 5.3993, 80 → 1.0002, 100 → 0.

### 4.3 chess.com move classification (analysis, P0-10)
Source: https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
(same article id 8572705 as the PRD link; the slug has changed). Expected points (EP) = winning chances on a 0–1 scale.
- Thresholds (EP lost by the move) [CONFIRMED]: Best 0.00 · Excellent 0.00–0.02 · Good 0.02–0.05 · Inaccuracy 0.05–0.10 ·
  Mistake 0.10–0.20 · Blunder 0.20–1.00.
- chess.com computes EP "based on their rating and the engine evaluation" [CONFIRMED]. The PRD uses the Lichess
  win percentage / 100, which does not depend on rating. **This deviates from chess.com and must be logged in DECISIONS.md.**
- Boundary convention [app decision; chess.com's inclusive/exclusive limits are UNCONFIRMED]: Best = the engine's
  first move or loss ≤ 0.0005; Excellent ≤ 0.02; Good ≤ 0.05; Inaccuracy ≤ 0.10; Mistake ≤ 0.20; Blunder > 0.20.
- **Brilliant** [SUBSTANCE, support article]: "when you find a good piece sacrifice". The position should not be bad
  after the move, and the player should not already be completely winning without it. Brilliant and Great are "always the best or
  nearly best move in the position, but are also special in some way".
- **Great** [SUBSTANCE, support article]: critical to the outcome, for example it turns a losing position into an equal one or an
  equal position into a winning one, or it is the only good move. The bar is set lower for newer players.
- **Miss** [UNCONFIRMED from the official article; third-party wording]: a missed chance to punish the opponent's error
  or to win (forum: the old "Missed Win" label was replaced by "Miss",
  https://www.chess.com/forum/view/community/chess-com-move-classifications).
- **Book** [UNCONFIRMED from the official article]: a move from known opening theory. The PRD pipeline uses the
  lichess-org/chess-openings data (CC0).
- The exact algorithms for Brilliant, Great and Miss are not public. Our rules are app decisions and must be documented.

---

## 5. App-level rules (normative)

### 5.1 Game end check after every move (in this order)
```
1. chess.isCheckmate()               → win for the side that moved            (5.1.1; beats 9.3 and 9.6.2)
2. chess.isStalemate()               → draw "Patt"                            (5.2.1)
3. chess.isInsufficientMaterial()    → draw "tote Stellung"                   (5.2.2, partial: see §0 row 4)
4. repetitionCount(key) >= 5         → draw "fünfmalige Stellungswiederholung" (9.6.1)
5. halfmoveClock >= 150              → draw "75-Züge-Regel"                   (9.6.2)
6. claims for the side to move: repetitionCount(key) >= 3 → "threefold"; halfmoveClock >= 100 → "fifty"
```
- `key = chess.fen().split(' ').slice(0, 4).join(' ')` (placement, side to move, castling rights, e.p. square).
  chess.js `fen()` lists the e.p. square only when an e.p. capture is legal, so this key matches 9.2.2 exactly. Castling
  rights in the FEN are the permanent rights, which matches 9.2.2.2 (fixtures R3–R5). The castling flags must have been
  cleaned up on load (§5.4).
- The count includes the game's start position (first occurrence) and every position after each half-move.
- `halfmoveClock = Number(chess.fen().split(' ')[4])`. chess.js resets it after every pawn move and every capture,
  including e.p. captures.
- Do **not** call `isDraw()` or `isGameOver()` to decide the end of a game. Both return true on threefold
  repetition and the 50-move rule. Engine and bot loops must not stop on them either.

### 5.2 Draw claims (9.2, 9.3, 9.4)
- **On the learner's turn:** show "Remis beantragen" when the current position has occurred ≥ 3 times (9.2.1.2) or the
  half-move clock is ≥ 100 (9.3.2). A claim the app offers is always correct; there is no "incorrect claim" path.
- **With the learner's move (9.2.1.1 / 9.3.1):** if the learner's move produces the 3rd occurrence or brings the
  half-move clock to 100, show the claim prompt **before the bot replies**. The declared and executed move has the same
  effect as writing the move and declaring it to the arbiter.
- If the learner does not claim and the game goes on, the right for that occurrence is gone (9.4). For 9.2 it
  comes back on any later occurrence; for 9.3 it stays while the clock is still ≥ 100.
- **Bot claims** (DESIGN.md §12 point 4, recommendation for DECISIONS.md): a bot claims a draw that is available to it
  only when its own engine evaluation (bot's point of view) is ≤ 0.00. Otherwise it plays on. Fivefold and 75 moves end the game
  anyway. Bots never claim in lesson "Ausspielen" steps where the task is to win or hold.

### 5.3 `cannotMate(position, color)` – flag fall (6.9), resignation (5.1.2)
Material table from Lichess `InsufficientMatingMaterial(board, color)`
(https://raw.githubusercontent.com/lichess-org/scalachess/master/core/src/main/scala/InsufficientMatingMaterial.scala, [CONFIRMED source]).
`color` cannot mate if:
1. `color` has only its king; or
2. `color` has king + exactly one knight and nothing else, **and** the opponent has only king + queen(s); or
3. `color` has king + bishop(s) only, **and** there are no bishops on both square colours on the board (either side), **and**
   the opponent has no knight and no pawn.
Otherwise assume a mate is possible.

I checked this table myself by brute force with chess.js. I listed every legal position with the given material and
Black to move, and counted the positions that are checkmate (scratch script, 5½ min):

| Mating side v defending side | Mate position exists? | Example (Black to move, mated) |
|---|---|---|
| K+N v K+Q | **no** (1,125,328 positions tested) | – |
| K+N v K+R | yes | `8/8/8/8/8/K7/2N5/kr6 b - - 0 1` |
| K+N v K+B | yes | `8/8/8/8/8/8/b1N5/k1K5 b - - 0 1` |
| K+N v K+N | yes | `8/8/8/8/8/1K6/2N5/kn6 b - - 0 1` |
| K+N v K+P | yes | `8/8/8/8/8/8/p1N5/k1K5 b - - 0 1` |
| K+B v K+Q | **no** (1,895,880 tested) | – |
| K+B v K+R | **no** (1,895,880 tested) | – |
| K+B v K+N | yes | `8/8/8/8/8/8/nBK5/k7 b - - 0 1` |
| K+B v K+P | yes | `8/8/8/8/8/8/pB6/k1K5 b - - 0 1` |
| K+B v K+B, same colour | **no** (917,224 tested) | – |
| K+B v K+B, opposite colours | yes | `8/8/8/8/8/8/bB6/k1K5 b - - 0 1` |

Limit: the table looks at material, not at the exact position (a locked pawn structure may make mate impossible
anyway). Lichess accepts the same limit. Record it in DECISIONS.md. A flag can only fall in a game that is still running.
Checkmate, stalemate and dead position end the game first (6.9 "Except where …", fixture F3).

### 5.4 `normalizeFen(fen)` – every FEN entry point
chess.js 1.4.0 reproduced these problems (fixtures C11, C12, E5, script output in §6):
1. Castling flag `K`/`Q`/`k`/`q`: keep it only if the king of that colour is on e1/e8 **and** its own rook is on h1/a1 or
   h8/a8. Otherwise remove it. Without this, chess.js generates O-O-O with the king on f1 (Kf1–d1), and O-O with no rook on h1.
2. E.p. square: keep it only if (a) it is on rank 6 for White to move or rank 3 for Black to move, (b) the e.p. square and the
   pawn's start square behind it are empty, (c) an enemy pawn stands on the square in front of it (the pawn that just advanced
   two squares), and (d) a legal e.p. capture exists. Otherwise set it to `-`. Without this, chess.js plays `exd6` "capturing"
   a pawn that is not there.
3. Reject (content validation) or refuse (user input) a position where the side **not** to move is in check (3.10.3).
   chess.js does not check this. chess.js itself already rejects pawns on rank 1/8 and more than one king per colour.
4. Content validation also rejects positions that are illegal in less obvious ways when a lesson or puzzle uses them
   (for example 9+ pawns of one colour, or more pieces than promotions could have produced). Recommended checks per colour:
   pawns ≤ 8 and pawns + max(0, Q−1) + max(0, R−2) + max(0, B−2) + max(0, N−2) ≤ 8. Also, for positions without
   promotions, there must be no two bishops of one colour on the same square colour (Arbiters' Manual: a second
   same-colour bishop "can only arise from promotion or an illegal move", citing 3.7.5.1 [SUBSTANCE]).

---

## 6. Test cases (verified with chess.js 1.4.0 on 2026-10-16)

The verification ran in `/tmp/claude-0/-home-user/557a1fa5-29e0-51e6-9af0-7c8adad742a1/scratchpad/chess` (outside the repo, not committed): `verify.js`, `fixtures.js`, `helpmate.js`. All 65
fixtures pass against chess.js plus the reference app-layer sketch from §5 (`status`, `positionKey`, `cannotMate`). All start
FENs are legal positions (the side not to move is not in check), except the deliberately broken ones in C11, C12 and E5.

Fields in the JSON fixtures below: `fen` (`"startpos"` = initial position), `moves` (SAN, played in order), then the
expectations after the moves:
- `legal` / `illegal`: SAN expected in or not in `chess.moves()`.
- `pieceMoves`: exact move list for a square.
- `allMoves`: exact list of all legal moves.
- `rejected`: inputs that `chess.move()` must throw on.
- `sanOf`: SAN produced by the move.
- `fenAfter`: exact FEN.
- `status`: result of §5.1 (`over`, `result`, `reason`, or `claims`).
- `insufficient`: chess.js `isInsufficientMaterial()`; `fideDead`: FIDE dead position.
- `chessjsThreefold` / `chessjsFifty` / `chessjsIsGameOver`: chess.js observations, kept to document the differences.
- `cannotMate`, `onFlag`, `onResign`: §5.3 per colour (the colour whose flag falls or who resigns).
- `mateDemo`: a checkmate position proving that mate is possible.
- `chessjsBug` + `fideIllegal` + `chessjsGenerates`: FIDE-illegal moves that chess.js generates from a dirty FEN.
  These **must not** appear after `normalizeFen()`.

### 6.1 Overview
| Rule | Cases | What the cases show |
|---|---|---|
| Castling 3.8.2 | C1–C12 | Both sides legal (C1). In check: no castling (C2). Square the king crosses attacked (C3). Destination attacked (C4). **Rook crosses an attacked square b1: legal** (C5). Rook itself attacked: legal (C6). Piece on b1: queenside illegal (C7). King moved and returned (C8). Rook moved and returned (C9). Black, d8 attacked (C10). Dirty FEN castling flags (C11, C12). |
| En passant 3.7.4 | E1–E5 | Allowed right after d7-d5 (E1). Expired one move later (E2). Illegal because of a rank pin, and `fen()` omits the square (E3). E.p. capture as check evasion (E4). Bogus e.p. square in the FEN (E5). |
| Promotion 3.7.5 | P1–P4c | Exactly Q/R/B/N; no piece, K or P rejected (P1). New knight gives check at once (P2). Capture-promotion (P3). `8/k1P5/2K5/8/8/8/8/8 w`: c8=Q stalemate (P4a), c8=R plays on (P4b), c8=N dead position (P4c). |
| Check / illegal 3.9, 3.10 | I1–I4 | Pinned piece cannot move (I1). King may not move into check (I2). Only check-ending moves (I3). Illegal moves throw (I4). |
| Checkmate 5.1.1 | K1–K3 | Fool's mate (K1). Back-rank mate (K2). King cannot capture a protected rook, which is mate (K3). |
| Stalemate 5.2.1 | S1, S2, P4a | |
| Dead position 5.2.2 | D1–D11 | K v K, K+B v K, K+N v K, **K+B v K+B with same-colour bishops**, K+B+B on the same colour v K: dead, and chess.js agrees. Opposite-colour bishops, K+N v K+N, K+N+N v K, K+B v K+N, K+N v K+P: not dead. **Locked pawns D11: dead under FIDE, chess.js misses it.** |
| Threefold 9.2 / fivefold 9.6.1 | R1a–R5 | 2nd occurrence: nothing (R1a). 3rd: claim only, but chess.js says game over (R1b). 5th: automatic draw (R2). Castling rights differ (R3a/b). E.p. possible at the first occurrence (R4a/b). **Pinned e.p.: same position under FIDE; chess.js under-counts** (R5). |
| 50 / 75 moves 9.3, 9.6.2 | M1–M6 | Clock 100: claim (M1). Capture resets (M2). Pawn move resets (M3). **Mate on half-move 100: checkmate, although chess.js also says isDraw** (M4). Clock 150: automatic draw (M5). Mate on half-move 150 takes precedence (M6). |
| Flag fall 6.9 / resignation 5.1.2 | F1–F8 | K+Q v K: White's flag falls → draw, Black's flag falls → 1-0 (F1). K+R v K+N: the K+R side's flag loses (F2). **K+N v K is already a dead position**, so no flag can fall (F3). K+N v K+P (F4). K+N v K+Q: K+Q side's flag → draw (F5). K+B v K+R: K+R side's flag → draw (F6). K+B v K+P (F7). Resigning against a bare king → draw (F8). |

### 6.2 Fixtures (JSON)
```json
[
  {"id": "C1", "art": "3.8.2", "fen": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "moves": [], "legal": ["O-O", "O-O-O"]},
  {"id": "C2", "art": "3.8.2.2", "fen": "4k3/8/8/4r3/8/8/8/R3K2R w KQ - 0 1", "moves": [], "illegal": ["O-O", "O-O-O"], "note": "king in check"},
  {"id": "C3", "art": "3.8.2.2", "fen": "1k3r2/8/8/8/8/8/8/R3K2R w KQ - 0 1", "moves": [], "illegal": ["O-O"], "legal": ["O-O-O"], "note": "f1 (square the king crosses) attacked"},
  {"id": "C4", "art": "3.8.2.2", "fen": "1k4r1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "moves": [], "illegal": ["O-O"], "legal": ["O-O-O"], "note": "g1 (king destination) attacked"},
  {"id": "C5", "art": "3.8.2.2", "fen": "1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "moves": [], "legal": ["O-O-O"], "note": "b1 attacked, only the ROOK crosses it -> castling legal"},
  {"id": "C6", "art": "3.8.2.2", "fen": "r5k1/8/8/8/8/8/8/R3K2R w KQ - 0 1", "moves": [], "legal": ["O-O-O"], "note": "rook a1 itself attacked -> castling legal"},
  {"id": "C7", "art": "3.8.2.2", "fen": "r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1", "moves": [], "illegal": ["O-O-O"], "legal": ["O-O"], "note": "knight on b1 between king and rook"},
  {"id": "C8", "art": "3.8.2.1", "fen": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "moves": ["Kf1", "Kf8", "Ke1", "Ke8"], "illegal": ["O-O", "O-O-O"], "fenAfter": "r3k2r/8/8/8/8/8/8/R3K2R w - - 4 3", "note": "king moved and returned"},
  {"id": "C9", "art": "3.8.2.1", "fen": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "moves": ["Rh2", "Rh7", "Rh1", "Rh8"], "illegal": ["O-O"], "legal": ["O-O-O"], "fenAfter": "r3k2r/8/8/8/8/8/8/R3K2R w Qq - 4 3", "note": "h-rook moved and returned"},
  {"id": "C10", "art": "3.8.2.2", "fen": "r3k2r/8/8/B7/8/8/8/R3K2R b KQkq - 0 1", "moves": [], "illegal": ["O-O-O"], "legal": ["O-O"], "note": "black: d8 attacked by Ba5"},
  {"id": "C11", "art": "3.8.2.1", "fen": "r3k2r/8/8/8/8/8/8/R4K1R w KQkq - 0 1", "moves": [], "fideIllegal": ["O-O-O", "O-O"], "chessjsBug": "chess.js 1.4.0 trusts the FEN flags and generates O-O-O (Kf1-d1); app must strip KQ on load (king not on e1)", "chessjsGenerates": ["O-O-O"]},
  {"id": "C12", "art": "3.8.2.1", "fen": "r3k2r/8/8/8/8/8/8/R3K3 w KQkq - 0 1", "moves": [], "fideIllegal": ["O-O"], "chessjsBug": "chess.js 1.4.0 generates O-O although h1 is empty; app must strip K on load", "chessjsGenerates": ["O-O"]},
  {"id": "E1", "art": "3.7.4", "fen": "startpos", "moves": ["e4", "a6", "e5", "d5"], "legal": ["exd6"], "fenAfter": "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3"},
  {"id": "E2", "art": "3.7.4.2", "fen": "startpos", "moves": ["e4", "a6", "e5", "d5", "Nf3", "h6"], "illegal": ["exd6"], "note": "right expired"},
  {"id": "E3", "art": "3.7.4 + 3.9.2", "fen": "7k/2p5/8/KP5r/8/8/8/8 b - - 0 1", "moves": ["c5"], "illegal": ["bxc6"], "fenAfter": "7k/8/8/KPp4r/8/8/8/8 w - - 0 2", "note": "e.p. would expose Ka5 to Rh5; fen() omits the e.p. square"},
  {"id": "E4", "art": "3.7.4 + 3.9", "fen": "8/8/8/4k3/2p5/8/3P4/4K3 w - - 0 1", "moves": ["d4+"], "legal": ["cxd3"], "note": "e.p. capture removes the checking pawn"},
  {"id": "E5", "art": "3.7.4.1", "fen": "4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1", "moves": [], "fideIllegal": ["exd6"], "chessjsBug": "chess.js 1.4.0 accepts the bogus e.p. square and generates exd6 capturing a non-existent pawn; app must strip it on load", "chessjsGenerates": ["exd6"]},
  {"id": "P1", "art": "3.7.5.1", "fen": "8/P6k/8/8/8/8/8/K7 w - - 0 1", "moves": [], "pieceMoves": {"a7": ["a8=N", "a8=B", "a8=R", "a8=Q"]}, "rejected": ["a8", {"from": "a7", "to": "a8"}, {"from": "a7", "to": "a8", "promotion": "k"}, {"from": "a7", "to": "a8", "promotion": "p"}]},
  {"id": "P2", "art": "3.7.5.3", "fen": "8/4P1k1/8/8/8/8/8/K7 w - - 0 1", "moves": [], "sanOf": {"e8=N": "e8=N+", "e8=Q": "e8=Q"}, "note": "new piece acts immediately: knight gives check"},
  {"id": "P3", "art": "3.7.5.1", "fen": "1r5k/P7/8/8/8/8/8/K7 w - - 0 1", "moves": [], "pieceMoves": {"a7": ["a8=N", "a8=B", "a8=R", "a8=Q", "axb8=N", "axb8=B", "axb8=R+", "axb8=Q+"]}},
  {"id": "P4a", "art": "3.7.5 + 5.2.1", "fen": "8/k1P5/2K5/8/8/8/8/8 w - - 0 1", "moves": ["c8=Q"], "status": {"over": true, "result": "1/2-1/2", "reason": "stalemate"}},
  {"id": "P4b", "art": "3.7.5", "fen": "8/k1P5/2K5/8/8/8/8/8 w - - 0 1", "moves": ["c8=R"], "status": {"over": false, "claims": []}, "note": "under-promotion avoids stalemate (K+R v K wins)"},
  {"id": "P4c", "art": "3.7.5 + 5.2.2", "fen": "8/k1P5/2K5/8/8/8/8/8 w - - 0 1", "moves": ["c8=N+"], "status": {"over": true, "result": "1/2-1/2", "reason": "dead_position"}},
  {"id": "I1", "art": "3.9.2", "fen": "4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1", "moves": [], "pieceMoves": {"e2": []}, "note": "pinned knight"},
  {"id": "I2", "art": "3.9.2", "fen": "4k3/8/8/8/8/8/3r4/4K3 w - - 0 1", "moves": [], "pieceMoves": {"e1": ["Kxd2", "Kf1"]}},
  {"id": "I3", "art": "3.9", "fen": "4k3/8/8/8/8/8/8/r3K2N w - - 0 1", "moves": [], "allMoves": ["Kd2", "Ke2", "Kf2"], "note": "in check: only moves that end the check"},
  {"id": "I4", "art": "3.10.2", "fen": "4k3/8/8/8/8/8/4N3/4K3 w - - 0 1", "moves": [], "rejected": [{"from": "e2", "to": "e4"}, "Ke3"]},
  {"id": "K1", "art": "5.1.1", "fen": "startpos", "moves": ["f3", "e5", "g4", "Qh4#"], "status": {"over": true, "result": "0-1", "reason": "checkmate"}},
  {"id": "K2", "art": "5.1.1", "fen": "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "moves": ["Ra8#"], "status": {"over": true, "result": "1-0", "reason": "checkmate"}},
  {"id": "K3", "art": "5.1.1", "fen": "4k3/8/8/8/8/8/3r4/3rK3 w - - 0 1", "moves": [], "status": {"over": true, "result": "0-1", "reason": "checkmate"}, "note": "king may not capture a protected rook"},
  {"id": "S1", "art": "5.2.1", "fen": "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", "moves": [], "status": {"over": true, "result": "1/2-1/2", "reason": "stalemate"}},
  {"id": "S2", "art": "5.2.1", "fen": "k7/8/1QK5/8/8/8/8/8 b - - 0 1", "moves": [], "status": {"over": true, "result": "1/2-1/2", "reason": "stalemate"}},
  {"id": "D1", "art": "5.2.2", "fen": "8/8/8/4k3/8/8/8/4K3 w - - 0 1", "moves": [], "insufficient": true, "fideDead": true, "note": "K v K"},
  {"id": "D2", "art": "5.2.2", "fen": "8/8/8/4k3/8/8/8/2B1K3 w - - 0 1", "moves": [], "insufficient": true, "fideDead": true, "note": "K+B v K"},
  {"id": "D3", "art": "5.2.2", "fen": "8/8/8/4k3/8/8/8/1N2K3 w - - 0 1", "moves": [], "insufficient": true, "fideDead": true, "note": "K+N v K"},
  {"id": "D4", "art": "5.2.2", "fen": "5b1k/8/8/8/8/8/8/2B1K3 w - - 0 1", "moves": [], "insufficient": true, "fideDead": true, "note": "K+B v K+B, bishops on same colour (c1, f8 dark)"},
  {"id": "D5", "art": "5.2.2", "fen": "2b4k/8/8/8/8/8/8/2B1K3 w - - 0 1", "moves": [], "insufficient": false, "fideDead": false, "note": "K+B v K+B, opposite colours: mate possible"},
  {"id": "D6", "art": "5.2.2", "fen": "6nk/8/8/8/8/8/8/1N2K3 w - - 0 1", "moves": [], "insufficient": false, "fideDead": false, "note": "K+N v K+N: mate possible"},
  {"id": "D7", "art": "5.2.2", "fen": "7k/8/8/8/8/8/8/1N2KN2 w - - 0 1", "moves": [], "insufficient": false, "fideDead": false, "note": "K+N+N v K: mate possible (not forced)"},
  {"id": "D8", "art": "5.2.2", "fen": "7k/8/8/8/8/8/8/2B1K1B1 w - - 0 1", "moves": [], "insufficient": true, "fideDead": true, "note": "K+B+B same colour (c1, g1) v K"},
  {"id": "D9", "art": "5.2.2", "fen": "6nk/8/8/8/8/8/8/2B1K3 w - - 0 1", "moves": [], "insufficient": false, "fideDead": false, "note": "K+B v K+N: mate possible"},
  {"id": "D10", "art": "5.2.2", "fen": "7k/7p/8/8/8/8/8/1N2K3 w - - 0 1", "moves": [], "insufficient": false, "fideDead": false, "note": "K+N v K+P"},
  {"id": "D11", "art": "5.2.2", "fen": "k7/8/8/p1p1p1p1/P1P1P1P1/8/8/K7 w - - 0 1", "moves": [], "insufficient": false, "fideDead": true, "note": "locked pawns, kings cannot cross: FIDE dead, chess.js does not detect"},
  {"id": "R1a", "art": "9.2", "fen": "startpos", "moves": ["Nf3", "Nf6", "Ng1", "Ng8"], "status": {"over": false, "claims": []}, "chessjsThreefold": false, "note": "2nd occurrence"},
  {"id": "R1b", "art": "9.2.1.2", "fen": "startpos", "moves": ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"], "status": {"over": false, "claims": ["threefold"]}, "chessjsThreefold": true, "chessjsIsGameOver": true, "note": "3rd occurrence: claim only; chess.js isDraw()/isGameOver() = true"},
  {"id": "R2", "art": "9.6.1", "fen": "startpos", "moves": ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"], "status": {"over": true, "result": "1/2-1/2", "reason": "fivefold"}, "note": "5th occurrence: automatic; chess.js has no fivefold API"},
  {"id": "R3a", "art": "9.2.2.2", "fen": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "moves": ["Kf1", "Kf8", "Ke1", "Ke8", "Kf1", "Kf8", "Ke1", "Ke8"], "status": {"over": false, "claims": []}, "chessjsThreefold": false, "note": "start position had castling rights -> different position"},
  {"id": "R3b", "art": "9.2.2.2", "fen": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "moves": ["Kf1", "Kf8", "Ke1", "Ke8", "Kf1", "Kf8", "Ke1", "Ke8", "Kf1", "Kf8", "Ke1", "Ke8"], "status": {"over": false, "claims": ["threefold"]}, "chessjsThreefold": true},
  {"id": "R4a", "art": "9.2.2.1", "fen": "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "moves": ["e4", "Kf8", "Kf1", "Ke8", "Ke1", "Kf8", "Kf1", "Ke8", "Ke1"], "status": {"over": false, "claims": []}, "chessjsThreefold": false, "note": "first occurrence had e.p. possible -> different position"},
  {"id": "R4b", "art": "9.2.2.1", "fen": "4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "moves": ["e4", "Kf8", "Kf1", "Ke8", "Ke1", "Kf8", "Kf1", "Ke8", "Ke1", "Kf8", "Kf1", "Ke8", "Ke1"], "status": {"over": false, "claims": ["threefold"]}, "chessjsThreefold": true},
  {"id": "R5", "art": "9.2.2", "fen": "7k/2p5/8/KP5r/8/8/8/8 b - - 0 1", "moves": ["c5", "Ka6", "Kg8", "Ka5", "Kh8", "Ka6", "Kg8", "Ka5", "Kh8"], "status": {"over": false, "claims": ["threefold"]}, "chessjsThreefold": false, "note": "e.p. after c5 was illegal (pin) -> same position per 9.2.2; chess.js internal hash differs and under-counts; FEN key is correct"},
  {"id": "M1", "art": "9.3.2", "fen": "8/8/8/4k3/8/8/8/R3K3 w - - 99 80", "moves": ["Ra2"], "status": {"over": false, "claims": ["fifty"]}, "chessjsFifty": true, "chessjsIsGameOver": true},
  {"id": "M2", "art": "9.3", "fen": "8/8/8/4k3/8/8/r7/R3K3 w - - 99 80", "moves": ["Rxa2"], "status": {"over": false, "claims": []}, "chessjsFifty": false, "note": "capture resets the count"},
  {"id": "M3", "art": "9.3", "fen": "8/8/8/4k3/8/8/P7/4K3 w - - 99 80", "moves": ["a3"], "status": {"over": false, "claims": []}, "chessjsFifty": false, "note": "pawn move resets the count"},
  {"id": "M4", "art": "5.1.1 over 9.3", "fen": "6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80", "moves": ["Ra8#"], "status": {"over": true, "result": "1-0", "reason": "checkmate"}, "chessjsFifty": true, "note": "chess.js reports isCheckmate AND isDrawByFiftyMoves/isDraw: check mate first"},
  {"id": "M5", "art": "9.6.2", "fen": "8/8/8/4k3/8/8/8/R3K3 w - - 149 120", "moves": ["Ra2"], "status": {"over": true, "result": "1/2-1/2", "reason": "seventyfive"}, "note": "chess.js has no 75-move API"},
  {"id": "M6", "art": "9.6.2", "fen": "6k1/5ppp/8/8/8/8/8/R5K1 w - - 149 120", "moves": ["Ra8#"], "status": {"over": true, "result": "1-0", "reason": "checkmate"}, "note": "mate on the 75th move takes precedence"},
  {"id": "F1", "art": "6.9", "fen": "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "moves": [], "cannotMate": {"w": false, "b": true}, "onFlag": {"w": "1/2-1/2", "b": "1-0"}},
  {"id": "F2", "art": "6.9", "fen": "n3k3/8/8/8/8/8/8/4K2R w - - 0 1", "moves": [], "cannotMate": {"w": false, "b": false}, "onFlag": {"w": "0-1", "b": "1-0"}, "mateDemo": "8/8/8/8/8/6n1/7R/5k1K w - - 0 1"},
  {"id": "F3", "art": "5.2.2 before 6.9", "fen": "8/8/8/4k3/8/8/8/1N2K3 w - - 0 1", "moves": [], "status": {"over": true, "result": "1/2-1/2", "reason": "dead_position"}, "note": "K+N v K: game already over, a flag cannot fall"},
  {"id": "F4", "art": "6.9", "fen": "7k/7p/8/8/8/8/8/1N2K3 w - - 0 1", "moves": [], "cannotMate": {"w": false, "b": false}, "onFlag": {"w": "0-1", "b": "1-0"}, "mateDemo": "k1K5/p1N5/8/8/8/8/8/8 b - - 0 1"},
  {"id": "F5", "art": "6.9", "fen": "3qk3/8/8/8/8/8/8/1N2K3 w - - 0 1", "moves": [], "cannotMate": {"w": true, "b": false}, "onFlag": {"w": "0-1", "b": "1/2-1/2"}, "note": "K+N cannot mate K+Q (brute force: no mate position exists)"},
  {"id": "F6", "art": "6.9", "fen": "4k2r/8/8/8/8/8/8/2B1K3 w - - 0 1", "moves": [], "cannotMate": {"w": true, "b": false}, "onFlag": {"w": "0-1", "b": "1/2-1/2"}, "note": "K+B cannot mate K+R (brute force)"},
  {"id": "F7", "art": "6.9", "fen": "7k/7p/8/8/8/8/8/2B1K3 w - - 0 1", "moves": [], "cannotMate": {"w": false, "b": false}, "onFlag": {"w": "0-1", "b": "1-0"}, "mateDemo": "k7/p1K5/8/3B4/8/8/8/8 b - - 0 1"},
  {"id": "F8", "art": "5.1.2", "fen": "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "moves": [], "onResign": {"w": "1/2-1/2", "b": "1-0"}, "note": "resigning against a side that cannot mate is a draw (2023 text)"}
]
```

---

## 7. chess.js 1.4.0 compared with FIDE (all reproduced by script)

| # | chess.js behaviour | FIDE | Consequence for the app | Fixture |
|---|---|---|---|---|
| 1 | `isThreefoldRepetition()` is true at the 3rd occurrence, and `isDraw()`/`isGameOver()` are then true | 9.2: claim by the player to move, otherwise play goes on | Offer a claim only; never end the game on `isDraw`/`isGameOver` | R1b |
| 2 | `isDrawByFiftyMoves()` is true at half-move clock ≥ 100, and also inside `isDraw()`/`isGameOver()` | 9.3: claim | Same as 1 | M1 |
| 3 | No fivefold repetition | 9.6.1: automatic draw at the 5th occurrence | Count position keys (§5.1) | R2 |
| 4 | No 75-move rule | 9.6.2: automatic draw at 75 moves each, unless the last move is mate | Check half-move clock ≥ 150 after the mate check | M5, M6 |
| 5 | Mate on the 100th half-move: `isCheckmate()` **and** `isDraw()` are both true | 5.1.1: mate ends the game | Test `isCheckmate()` first | M4 |
| 6 | `isInsufficientMaterial()` only knows K v K, K+N v K, K+B v K, and K+B(s) v K+B(s) with all bishops on one colour | 5.2.2: any position where no series of legal moves can mate | Accepted V1 limit (locked pawns are not detected); 9.6 ends such games | D11 |
| 7 | No clocks | 6.9: on flag fall, draw if the opponent cannot mate | `cannotMate()` (§5.3) | F1–F7 |
| 8 | No resignation handling | 5.1.2 (2023): resigning against a side that cannot mate = draw | `cannotMate()` | F8 |
| 9 | Internal repetition hash includes the e.p. square whenever an enemy pawn stands next to the pawn, even when the capture is illegal (pin) | 9.2.2: same position if the possible moves are the same | Use `fen()`-based keys; `fen()` checks legality | R5 |
| 10 | `load()` accepts a position where the side not to move is in check | 3.10.3: illegal position | Validate in `normalizeFen()` and `validate:content` | script V1 |
| 11 | `load()` keeps castling flags even when the king or rook is not on its square, and then generates illegal castling | 3.8.2.1 | `normalizeFen()` strips such flags | C11, C12 |
| 12 | `load()` keeps an e.p. square with no pawn behind it and generates a capture of a missing pawn | 3.7.4.1 | `normalizeFen()` checks the e.p. square | E5 |
| 13 | `load(fen)` starts a new repetition history | 9.2/9.6 count over the whole game | Resume by replaying moves | §0 row 14 |
| 14 | SAN uses `O-O`; the parser also accepts `0-0` | App. C uses `0-0` | Change only the display | script `verify.js` (SAN output `O-O`, input `0-0` accepted) |
| 15 | Move without a promotion piece throws; promotion to `k`/`p` throws | 3.7.5.1 promotion is compulsory to Q/R/B/N | Picker always asks | P1 |

What chess.js gets right (verified): every castling condition, including a rook that crosses or stands on an attacked
square; e.p. only on the next move, illegal when it would expose the king, allowed as a check evasion; all four promotion
pieces, including capture-promotion; pins; the king may not move into check or capture a protected piece; mate and
stalemate detection; repetition counting that respects castling rights and real e.p. rights.

---

## 8. Findings on existing documents (rules audit)

| id | Severity | Location | Wrong or incomplete statement | Correct rule (citation) | Fix |
|---|---|---|---|---|---|
| R-01 | major | docs/PRD.md:383–393 | Accuracy `A = 103.1668·e^(−0.04354·ΔW) − 3.1669` with no edge rules | Lichess source (§4.2): +1 uncertainty bonus, clamp to [0, 100], 100 when the win % does not drop, cp clamped to ±1000, mate → ±1000 cp, game accuracy = mean of the volatility-weighted mean and the harmonic mean | Implement §4.2 exactly; unit-test against the reference values |
| R-02 | major | docs/PRD.md:244 (P0-03) | "Remis-Regeln (Patt, 50 Züge, dreifache Wiederholung, Material)" can be read as automatic game ends, and the automatic rules are missing | FIDE 9.2, 9.3 are claims; 9.6.1 and 9.6.2 are automatic; 5.2.2 dead position (CONSTRAINTS §3 already says this) | Acceptance tests for P0-03 use fixtures R1–R5 and M1–M6; implement §5.1/§5.2 |
| R-03 | minor | docs/team/DESIGN.md:537, 538, 1033, 1116 | Button "Remis beanspruchen"; text "Diese Stellung ist jetzt zum dritten Mal entstanden"; "In den letzten 50 Zügen beider Seiten …" | DSB 9.2.1 uses "Antrag" and "mindestens zum dritten Mal"; 9.3 counts "die letzten 50 Züge von jedem Spielenden" | "Remis beantragen"; "Diese Stellung ist jetzt mindestens zum dritten Mal entstanden. Du kannst Remis beantragen."; "Jede Seite hat 50 Züge lang keinen Bauern gezogen und keine Figur geschlagen. Du kannst Remis beantragen." |
| R-04 | minor | docs/team/DESIGN.md:1034 | Game-end copy has "Du hast aufgegeben." with no exception | 5.1.2 (2023): resigning against a side that cannot mate is a draw; 6.9 flag fall in the same case is a draw (P1) | Add "Remis: Du hast aufgegeben, aber {Bot} kann dich nicht mehr mattsetzen." and, for P1-06, "Zeit abgelaufen – Remis, weil {Name} nicht mehr mattsetzen kann." / "Zeit abgelaufen – {Name} gewinnt." |
| R-05 | info | docs/team/DESIGN.md:1006–1007 | "en passant (im Vorbeigehen schlagen)" | DSB text uses "en passant" / "Schlagen en passant"; "im Vorbeigehen" was not found in it | Keep "en passant" as the term; the gloss is fine |
| R-06 | info | docs/team/DESIGN.md:734–735 | Castling "0-0"/"0-0-0" in German notation, "O-O" in PGN | Confirmed: FIDE App. C.13.1 "0-0"; chess.js and PGN use "O-O" | none |
| R-07 | minor | docs/PRD.md:168–183 | Classification "nach dem Prinzip von chess.com" with expected points | chess.com expected points depend on the player's rating (support article 8572705); the PRD uses the rating-independent Lichess win % | Log the deviation and the boundary convention (§4.3) in DECISIONS.md |
| R-08 | minor | docs/PRD.md:355–356 (`games`, `game_moves`) | Games can start from any FEN ("Aus Stellung spielen"), but no start FEN is stored explicitly | 9.2/9.6 count from the game's start; resuming must replay moves (§0 row 14) | Store `start_fen` per game (or a PGN `[FEN]` header) and resume by replay |
| R-09 | info | docs/team/DESIGN.md §12 point 4 | Bot claim policy open | – | Recommendation in §5.2 (bot claims only when its eval ≤ 0.00); manager to log in DECISIONS.md |

No other rule statements exist yet: there is no code, and no lesson or puzzle content.
