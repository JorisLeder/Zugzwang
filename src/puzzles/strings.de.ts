/**
 * German texts produced by the puzzle domain logic (task line, hint texts, motif hints – DESIGN §8.1, §9.2).
 * UI labels of the pages live in `src/features/puzzles/strings.de.ts`.
 */
import type { PieceSymbol } from '@/core/chess';
import type { PuzzleTheme } from '@/core/puzzles';

/** Accusative with possessive ("Schau dir deinen Springer … an") per piece. */
const OWN_PIECE_ACCUSATIVE_DE: Record<PieceSymbol, string> = {
  p: 'deinen Bauern',
  n: 'deinen Springer',
  b: 'deinen Läufer',
  r: 'deinen Turm',
  q: 'deine Dame',
  k: 'deinen König',
};

/** Personal pronoun of the piece (der Springer → er, die Dame → sie). */
const PIECE_PRONOUN_DE: Record<PieceSymbol, string> = {
  p: 'Er',
  n: 'Er',
  b: 'Er',
  r: 'Er',
  q: 'Sie',
  k: 'Er',
};

/** Motif hints for the first hint stage in Lernmodus/Themen-Training ("Denk an eine Gabel."). */
export const MOTIF_HINTS_DE: Readonly<Record<string, string>> = {
  hangingPiece: 'Denk an eine ungedeckte Figur.',
  fork: 'Denk an eine Gabel.',
  pin: 'Denk an eine Fesselung.',
  skewer: 'Denk an einen Spieß.',
  discoveredAttack: 'Denk an einen Abzugsangriff.',
  doubleCheck: 'Denk an ein Doppelschach.',
  trappedPiece: 'Denk an eine gefangene Figur.',
  deflection: 'Denk an eine Ablenkung.',
  attraction: 'Denk an eine Hinlenkung.',
  capturingDefender: 'Denk daran, den Verteidiger zu schlagen.',
  sacrifice: 'Denk an ein Opfer.',
  intermezzo: 'Denk an einen Zwischenzug.',
  clearance: 'Denk an eine Räumung.',
  interference: 'Denk an eine Verstellung.',
  xRayAttack: 'Denk an einen Röntgenangriff.',
  quietMove: 'Denk an einen stillen Zug.',
  defensiveMove: 'Denk an die Verteidigung.',
  backRankMate: 'Denk an ein Grundreihenmatt.',
  smotheredMate: 'Denk an ein ersticktes Matt.',
  promotion: 'Denk an eine Umwandlung.',
  underPromotion: 'Denk an eine Unterverwandlung.',
  enPassant: 'Denk an en passant.',
  castling: 'Denk an die Rochade.',
  zugzwang: 'Denk an Zugzwang.',
  mate: 'Denk an ein Matt.',
};

/** Puzzle domain strings. */
export const PUZZLE_DOMAIN_DE = {
  sideToMove: (white: boolean) => (white ? 'Weiß am Zug' : 'Schwarz am Zug'),
  taskBest: (white: boolean) => `${white ? 'Weiß' : 'Schwarz'} am Zug. Finde den besten Zug.`,
  taskMate: (white: boolean, n: number) =>
    `${white ? 'Weiß' : 'Schwarz'} am Zug. Setze matt in ${n} ${n === 1 ? 'Zug' : 'Zügen'}.`,
  hintPiece: (piece: PieceSymbol, square: string) => `Schau dir ${OWN_PIECE_ACCUSATIVE_DE[piece]} auf ${square} an.`,
  hintTarget: (piece: PieceSymbol, square: string) => `${PIECE_PRONOUN_DE[piece]} will nach ${square}.`,
  hintSolution: 'Hier ist die Lösung.',
  /** Fallback when no explanation is available at all. */
  noExplanation: 'Für dieses Puzzle gibt es noch keine Erklärung.',
} as const;

/** Group headings of Themen-Training. */
export const THEME_GROUP_LABELS_DE: Record<PuzzleTheme['group'], string> = {
  motif: 'Taktische Motive',
  mate: 'Mattbilder',
  special: 'Besondere Regeln und Bauern',
  phase: 'Partiephasen',
  endgame: 'Endspiele',
  meta: 'Weitere',
};
