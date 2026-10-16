/**
 * Puzzle contracts (BACKLOG 2.6, PRD P0-04…P0-06, D-24).
 *
 * Lichess format for every puzzle: `fen` is the position **before** the opponent's first move; `moves[0]` is the
 * opponent's move (auto-played), then user, opponent, user, … (UCI). Every immediately mating user move is accepted (D-12).
 */
import type { Fen, Uci } from './chess';
import type { ExplanationText } from './explain';

/** Lichess theme key, e.g. `fork`, `mateIn2`. */
export type PuzzleThemeId = string;

/** A puzzle theme/motif with German label. */
export interface PuzzleTheme {
  /** Lichess theme key. */
  id: PuzzleThemeId;
  /** German label for chips and lists. */
  labelDe: string;
  /** One German sentence explaining the motif. */
  descriptionDe: string;
  /** `motif` tactics, `mate` mate patterns/length, `phase` game phase, `endgame` endgame type, `special` rules/pawns, `meta` length/advantage tags. */
  group: 'motif' | 'mate' | 'phase' | 'endgame' | 'special' | 'meta';
  /**
   * Offered in Themen-Training. The UI additionally hides themes that have fewer than 10 puzzles in the local bank
   * (WP-10 AC 2), so this flag means "can be trained", not "has content".
   */
  trainable: boolean;
}

/** All known themes (≥ 30, ≥ 20 trainable). Order = display order in Themen-Training. */
export const PUZZLE_THEMES: readonly PuzzleTheme[] = [
  // Tactical motifs
  { id: 'hangingPiece', labelDe: 'Hängende Figur', descriptionDe: 'Eine ungedeckte Figur kann einfach geschlagen werden.', group: 'motif', trainable: true },
  { id: 'fork', labelDe: 'Gabel', descriptionDe: 'Eine Figur greift zwei oder mehr gegnerische Figuren gleichzeitig an.', group: 'motif', trainable: true },
  { id: 'pin', labelDe: 'Fesselung', descriptionDe: 'Eine Figur kann nicht ziehen, ohne eine wertvollere Figur dahinter freizugeben.', group: 'motif', trainable: true },
  { id: 'skewer', labelDe: 'Spieß', descriptionDe: 'Eine wertvolle Figur wird angegriffen und muss weichen – dahinter fällt eine andere.', group: 'motif', trainable: true },
  { id: 'discoveredAttack', labelDe: 'Abzugsangriff', descriptionDe: 'Eine Figur zieht weg und gibt den Angriff einer anderen Figur frei.', group: 'motif', trainable: true },
  { id: 'doubleCheck', labelDe: 'Doppelschach', descriptionDe: 'Zwei Figuren geben gleichzeitig Schach – nur ein Königszug hilft.', group: 'motif', trainable: true },
  { id: 'trappedPiece', labelDe: 'Gefangene Figur', descriptionDe: 'Eine Figur hat kein sicheres Feld mehr und geht verloren.', group: 'motif', trainable: true },
  { id: 'deflection', labelDe: 'Ablenkung', descriptionDe: 'Eine verteidigende Figur wird von ihrer Aufgabe weggelockt.', group: 'motif', trainable: true },
  { id: 'attraction', labelDe: 'Hinlenkung', descriptionDe: 'Eine gegnerische Figur wird auf ein ungünstiges Feld gelockt.', group: 'motif', trainable: true },
  { id: 'capturingDefender', labelDe: 'Verteidiger schlagen', descriptionDe: 'Wer den Verteidiger schlägt, gewinnt die Figur, die er gedeckt hat.', group: 'motif', trainable: true },
  { id: 'sacrifice', labelDe: 'Opfer', descriptionDe: 'Material wird hergegeben, um mehr zu gewinnen oder mattzusetzen.', group: 'motif', trainable: true },
  { id: 'intermezzo', labelDe: 'Zwischenzug', descriptionDe: 'Statt sofort zurückzuschlagen, kommt erst ein stärkerer Zug dazwischen.', group: 'motif', trainable: true },
  { id: 'clearance', labelDe: 'Räumung', descriptionDe: 'Eine Figur macht ein Feld oder eine Linie für eine andere Figur frei.', group: 'motif', trainable: true },
  { id: 'interference', labelDe: 'Verstellung', descriptionDe: 'Eine Figur stellt sich zwischen gegnerische Figuren und unterbricht ihre Verbindung.', group: 'motif', trainable: true },
  { id: 'xRayAttack', labelDe: 'Röntgenangriff', descriptionDe: 'Eine Figur wirkt durch eine andere Figur hindurch auf ein Feld.', group: 'motif', trainable: true },
  { id: 'exposedKing', labelDe: 'Ungeschützter König', descriptionDe: 'Der König hat kaum Schutz und wird zum Ziel.', group: 'motif', trainable: true },
  { id: 'quietMove', labelDe: 'Stiller Zug', descriptionDe: 'Ein starker Zug ohne Schach und ohne Schlagen.', group: 'motif', trainable: true },
  { id: 'defensiveMove', labelDe: 'Verteidigungszug', descriptionDe: 'Der richtige Zug wehrt eine Drohung ab.', group: 'motif', trainable: true },
  { id: 'kingsideAttack', labelDe: 'Angriff am Königsflügel', descriptionDe: 'Angriff auf den kurz rochierten König.', group: 'motif', trainable: true },
  { id: 'queensideAttack', labelDe: 'Angriff am Damenflügel', descriptionDe: 'Angriff auf den lang rochierten König.', group: 'motif', trainable: true },
  { id: 'attackingF2F7', labelDe: 'Angriff auf f2/f7', descriptionDe: 'Angriff auf das schwache Feld neben dem König.', group: 'motif', trainable: true },
  // Mates
  { id: 'mateIn1', labelDe: 'Matt in 1', descriptionDe: 'Setze mit einem Zug matt.', group: 'mate', trainable: true },
  { id: 'mateIn2', labelDe: 'Matt in 2', descriptionDe: 'Setze in zwei Zügen matt.', group: 'mate', trainable: true },
  { id: 'mateIn3', labelDe: 'Matt in 3', descriptionDe: 'Setze in drei Zügen matt.', group: 'mate', trainable: true },
  { id: 'mateIn4', labelDe: 'Matt in 4', descriptionDe: 'Setze in vier Zügen matt.', group: 'mate', trainable: true },
  { id: 'mateIn5', labelDe: 'Matt in 5 oder mehr', descriptionDe: 'Ein langes, erzwungenes Matt.', group: 'mate', trainable: true },
  { id: 'backRankMate', labelDe: 'Grundreihenmatt', descriptionDe: 'Matt auf der Grundreihe, weil eigene Bauern dem König den Weg versperren.', group: 'mate', trainable: true },
  { id: 'smotheredMate', labelDe: 'Ersticktes Matt', descriptionDe: 'Ein Springer setzt matt, weil der König von eigenen Figuren eingeschlossen ist.', group: 'mate', trainable: true },
  { id: 'anastasiaMate', labelDe: 'Anastasias Matt', descriptionDe: 'Springer und Turm (oder Dame) setzen den König am Rand matt.', group: 'mate', trainable: true },
  { id: 'arabianMate', labelDe: 'Arabisches Matt', descriptionDe: 'Springer und Turm setzen den König in der Ecke matt.', group: 'mate', trainable: true },
  { id: 'bodenMate', labelDe: 'Bodens Matt', descriptionDe: 'Zwei Läufer setzen auf sich kreuzenden Diagonalen matt.', group: 'mate', trainable: true },
  { id: 'doubleBishopMate', labelDe: 'Matt mit dem Läuferpaar', descriptionDe: 'Zwei Läufer auf benachbarten Diagonalen setzen matt.', group: 'mate', trainable: true },
  { id: 'dovetailMate', labelDe: 'Schwalbenschwanzmatt', descriptionDe: 'Die Dame setzt matt, eigene Figuren versperren dem König die Flucht.', group: 'mate', trainable: true },
  { id: 'hookMate', labelDe: 'Hakenmatt', descriptionDe: 'Turm, Springer und Bauer setzen gemeinsam matt.', group: 'mate', trainable: true },
  // Special rules and pawns
  { id: 'promotion', labelDe: 'Umwandlung', descriptionDe: 'Ein Bauer erreicht die letzte Reihe und wird umgewandelt.', group: 'special', trainable: true },
  { id: 'underPromotion', labelDe: 'Unterverwandlung', descriptionDe: 'Umwandlung in Turm, Läufer oder Springer statt in eine Dame.', group: 'special', trainable: true },
  { id: 'advancedPawn', labelDe: 'Vorgerückter Bauer', descriptionDe: 'Ein weit vorgerückter Bauer entscheidet die Stellung.', group: 'special', trainable: true },
  { id: 'enPassant', labelDe: 'En passant', descriptionDe: 'Ein Bauer schlägt en passant.', group: 'special', trainable: true },
  { id: 'castling', labelDe: 'Rochade', descriptionDe: 'Die Rochade ist der stärkste Zug.', group: 'special', trainable: true },
  { id: 'zugzwang', labelDe: 'Zugzwang', descriptionDe: 'Der Gegner muss ziehen und verschlechtert dadurch seine Stellung.', group: 'special', trainable: true },
  // Phases
  { id: 'opening', labelDe: 'Eröffnung', descriptionDe: 'Eine Taktik in der Eröffnung.', group: 'phase', trainable: true },
  { id: 'middlegame', labelDe: 'Mittelspiel', descriptionDe: 'Eine Taktik im Mittelspiel.', group: 'phase', trainable: true },
  { id: 'endgame', labelDe: 'Endspiel', descriptionDe: 'Eine Taktik im Endspiel.', group: 'phase', trainable: true },
  // Endgame types
  { id: 'pawnEndgame', labelDe: 'Bauernendspiel', descriptionDe: 'Nur Könige und Bauern sind übrig.', group: 'endgame', trainable: true },
  { id: 'rookEndgame', labelDe: 'Turmendspiel', descriptionDe: 'Endspiel mit Türmen und Bauern.', group: 'endgame', trainable: true },
  { id: 'queenEndgame', labelDe: 'Damenendspiel', descriptionDe: 'Endspiel mit Damen und Bauern.', group: 'endgame', trainable: true },
  { id: 'bishopEndgame', labelDe: 'Läuferendspiel', descriptionDe: 'Endspiel mit Läufern und Bauern.', group: 'endgame', trainable: true },
  { id: 'knightEndgame', labelDe: 'Springerendspiel', descriptionDe: 'Endspiel mit Springern und Bauern.', group: 'endgame', trainable: true },
  { id: 'queenRookEndgame', labelDe: 'Dame-und-Turm-Endspiel', descriptionDe: 'Endspiel mit Damen, Türmen und Bauern.', group: 'endgame', trainable: true },
  // Meta tags (not trainable): length and size of the advantage
  { id: 'oneMove', labelDe: 'Ein Zug', descriptionDe: 'Die Lösung besteht aus einem Zug.', group: 'meta', trainable: false },
  { id: 'short', labelDe: 'Kurz', descriptionDe: 'Die Lösung hat zwei Züge.', group: 'meta', trainable: false },
  { id: 'long', labelDe: 'Lang', descriptionDe: 'Die Lösung hat drei Züge.', group: 'meta', trainable: false },
  { id: 'veryLong', labelDe: 'Sehr lang', descriptionDe: 'Die Lösung hat vier oder mehr Züge.', group: 'meta', trainable: false },
  { id: 'mate', labelDe: 'Matt', descriptionDe: 'Das Puzzle endet mit Matt.', group: 'meta', trainable: false },
  { id: 'crushing', labelDe: 'Entscheidender Vorteil', descriptionDe: 'Die Lösung gewinnt entscheidend Material.', group: 'meta', trainable: false },
  { id: 'advantage', labelDe: 'Vorteil', descriptionDe: 'Die Lösung bringt einen klaren Vorteil.', group: 'meta', trainable: false },
  { id: 'equality', labelDe: 'Ausgleich', descriptionDe: 'Die Lösung rettet eine schlechtere Stellung ins Gleichgewicht.', group: 'meta', trainable: false },
  { id: 'master', labelDe: 'Meisterpartie', descriptionDe: 'Aus einer Partie mit Titelträgern.', group: 'meta', trainable: false },
  { id: 'masterVsMaster', labelDe: 'Meister gegen Meister', descriptionDe: 'Aus einer Partie zwischen zwei Titelträgern.', group: 'meta', trainable: false },
  { id: 'superGM', labelDe: 'Weltklasse', descriptionDe: 'Aus einer Partie von Weltklassespielern.', group: 'meta', trainable: false },
];

/** Lookup of a theme by id; `undefined` for unknown keys. */
export function puzzleThemeById(id: PuzzleThemeId): PuzzleTheme | undefined {
  return PUZZLE_THEMES.find((t) => t.id === id);
}

/** A puzzle in Lichess format (D-24). */
export interface Puzzle {
  /** Lichess puzzle id, or a generated/lesson id (`gen-…`, `lesson-…`). */
  id: string;
  /** Position before the opponent's first move. */
  fen: Fen;
  /** `moves[0]` = opponent's move, then user/opponent alternating (UCI). The user makes `moves[1]`, `moves[3]`, … */
  moves: Uci[];
  /** Glicko-2 rating of the puzzle (fixed; puzzle ratings do not change, D-09). */
  rating: number;
  /** Rating deviation (default 80 if unknown). */
  ratingDeviation: number;
  themes: PuzzleThemeId[];
  /** Lichess opening tags (e.g. `Sicilian_Defense`). */
  openingTags: string[];
  popularity?: number;
  nbPlays?: number;
  source: 'lichess' | 'generated' | 'lesson' | 'seed';
  /** Stored German explanation (1–3 sentences), generated once. */
  explanation?: ExplanationText;
  gameUrl?: string;
}

/** Mode in which a puzzle was attempted. V1 uses rated, learning, theme and demo; the rest are P1 preparation. */
export type PuzzleMode = 'rated' | 'learning' | 'theme' | 'demo' | 'daily' | 'review' | 'rush_3' | 'rush_5' | 'survival';

/** One attempt (append-only, `puzzle_attempts`). */
export interface PuzzleAttempt {
  /** Client UUID (idempotent sync). */
  id: string;
  puzzleId: string;
  mode: PuzzleMode;
  solved: boolean;
  /** Solved without any wrong move. */
  firstTry: boolean;
  hintsUsed: 0 | 1 | 2 | 3;
  solutionShown: boolean;
  timeMs: number;
  themes: PuzzleThemeId[];
  puzzleRating: number;
  /** User's puzzle rating before/after (rated mode only). */
  ratingBefore?: number;
  ratingAfter?: number;
  createdAt: string;
}

/** Query for puzzle selection. Ratings inclusive. */
export interface PuzzleQuery {
  ratingMin?: number;
  ratingMax?: number;
  /** Puzzles having **any** of these themes. */
  themes?: PuzzleThemeId[];
  openingTag?: string;
  excludeIds?: Iterable<string>;
  limit: number;
  /** Random order (otherwise ordered by rating, then id). */
  shuffle?: boolean;
}

/** `public/data/puzzles/manifest.json` (D-25). */
export interface PuzzleBankManifest {
  /** Bank version; a change triggers re-import into IndexedDB. */
  version: string;
  chunks: Array<{ file: string; count: number; source: Puzzle['source']; sha256: string }>;
}
