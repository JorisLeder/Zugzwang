/**
 * Game-analysis contracts (BACKLOG 2.6, PRD "Analyse-Pipeline", D-07, D-08).
 * Win percentages and expected-points loss are from the **mover's** point of view; engine scores from White's.
 */
import type { Color, Fen, San, Uci } from './chess';
import type { Score } from './engine';
import type { ExplanationFacts, ExplanationText } from './explain';

/** Move categories (PRD "Zugklassifizierung", thresholds D-07). */
export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** All classifications in display order (best first, worst last). */
export const MOVE_CLASSIFICATIONS: readonly MoveClassification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

/** Presentation data of one classification (DESIGN §2.3). */
export interface ClassificationMeta {
  /** German label shown next to the badge ("Patzer"); also the badge's `aria-label`. */
  labelDe: string;
  /** Text symbol inside the badge (`!!`, `!`, `?!`, `?`, `??`) – set when the badge shows text. */
  symbol?: string;
  /** lucide-react icon name when the badge shows an icon (`Star`, `ThumbsUp`, `Check`, `BookOpen`, `X`). */
  icon?: string;
  /** CSS custom property of the badge fill, e.g. `--zz-cls-blunder`. */
  fillVar: string;
  /** CSS custom property of the symbol/icon colour on the fill, e.g. `--zz-cls-blunder-ink`. */
  inkVar: string;
  /** One-line plain meaning (DESIGN §2.3/§8.7), shown as legend/tooltip for everyone (D-39). */
  plainDe: string;
}

/** Single source of truth for labels, symbols, colours and plain meanings of the move classifications. */
export const CLASSIFICATION_META: Record<MoveClassification, ClassificationMeta> = {
  brilliant: {
    labelDe: 'Brillant',
    symbol: '!!',
    fillVar: '--zz-cls-brilliant',
    inkVar: '--zz-cls-brilliant-ink',
    plainDe: 'Ein sehr starker Zug, oft mit einem klugen Figurenopfer.',
  },
  great: {
    labelDe: 'Großartig',
    symbol: '!',
    fillVar: '--zz-cls-great',
    inkVar: '--zz-cls-great-ink',
    plainDe: 'Ein besonders wichtiger Zug – oft der einzige gute in dieser Stellung.',
  },
  best: {
    labelDe: 'Bester Zug',
    icon: 'Star',
    fillVar: '--zz-cls-best',
    inkVar: '--zz-cls-best-ink',
    plainDe: 'Der stärkste Zug in dieser Stellung.',
  },
  excellent: {
    labelDe: 'Exzellent',
    icon: 'ThumbsUp',
    fillVar: '--zz-cls-excellent',
    inkVar: '--zz-cls-excellent-ink',
    plainDe: 'Fast so stark wie der beste Zug.',
  },
  good: {
    labelDe: 'Gut',
    icon: 'Check',
    fillVar: '--zz-cls-good',
    inkVar: '--zz-cls-good-ink',
    plainDe: 'Ein ordentlicher Zug, der die Stellung kaum verschlechtert.',
  },
  book: {
    labelDe: 'Buchzug',
    icon: 'BookOpen',
    fillVar: '--zz-cls-book',
    inkVar: '--zz-cls-book-ink',
    plainDe: 'Ein bekannter Eröffnungszug.',
  },
  inaccuracy: {
    labelDe: 'Ungenauigkeit',
    symbol: '?!',
    fillVar: '--zz-cls-inaccuracy',
    inkVar: '--zz-cls-inaccuracy-ink',
    plainDe: 'Es gab einen besseren Zug.',
  },
  mistake: {
    labelDe: 'Fehler',
    symbol: '?',
    fillVar: '--zz-cls-mistake',
    inkVar: '--zz-cls-mistake-ink',
    plainDe: 'Dieser Zug verschlechtert deine Stellung deutlich.',
  },
  miss: {
    labelDe: 'Verpasst',
    icon: 'X',
    fillVar: '--zz-cls-miss',
    inkVar: '--zz-cls-miss-ink',
    plainDe: 'Du hättest einen Fehler deines Gegners bestrafen können.',
  },
  blunder: {
    labelDe: 'Patzer',
    symbol: '??',
    fillVar: '--zz-cls-blunder',
    inkVar: '--zz-cls-blunder-ink',
    plainDe: 'Dieser Zug verliert viel, oft eine Figur oder die Partie.',
  },
};

/** Game phase per ply (lichess Divider logic, WP-02). */
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

/** One analysed half-move. */
export interface AnalysedMove {
  /** 1-based half-move index (as `MoveRecord.ply`). */
  ply: number;
  color: Color;
  san: San;
  uci: Uci;
  fenBefore: Fen;
  fenAfter: Fen;
  /** Evaluation before the move (White POV). */
  evalBefore: Score;
  /** Evaluation after the move (White POV). */
  evalAfter: Score;
  /** Engine's best move in `fenBefore`; `null` only if no legal move existed. */
  bestMove: Uci | null;
  bestMoveSan: San | null;
  /** Engine line starting with the best move. */
  bestLine: Uci[];
  /** Engine line after the played move, starting with the played move. */
  playedLine: Uci[];
  /** Mover's win percentage before the move, 0–100. */
  winPctBefore: number;
  /** Mover's win percentage after the move, 0–100. */
  winPctAfter: number;
  /** max(0, EP(best) − EP(played)), 0–1 (EP = win% / 100, mover POV). */
  expectedPointsLoss: number;
  /** Move accuracy 0–100 (lichess formula). */
  accuracy: number;
  classification: MoveClassification;
  phase: GamePhase;
  /** Opening reached after this move, if in book. */
  opening?: { eco: string; name: string };
  /** Engine facts for mistakes, misses and blunders (input of explanations). */
  facts?: ExplanationFacts;
  /** Stored explanation (rule-based or LLM). */
  explanation?: ExplanationText;
}

/** Complete analysis of a game (stored in `game_analyses`). */
export interface GameAnalysis {
  gameId: string;
  engineId: string;
  /** Engine version string; a different version triggers re-analysis. */
  engineVersion: string;
  /** Target depth used. */
  depth: number;
  /** ISO timestamp. */
  createdAt: string;
  /** Game accuracy per side, 0–100. */
  accuracy: { w: number; b: number };
  /** Number of moves per classification for each side. */
  counts: Record<Color, Record<MoveClassification, number>>;
  moves: AnalysedMove[];
  /** 3–5 key moments as plies. */
  keyMoments: number[];
  /** White's win percentage after every ply (ply 0 = start position). */
  evalGraph: Array<{ ply: number; winPctWhite: number }>;
}

/** Input of `AnalysisService.analyseGame`. */
export interface AnalyseGameInput {
  gameId: string;
  startFen: Fen;
  /** Main line in UCI from `startFen`. */
  moves: Uci[];
}

/** Progress callback payload ("Analyse läuft … 18 von 40 Zügen"). */
export interface AnalysisProgress {
  /** Positions finished. */
  done: number;
  /** Positions in total. */
  total: number;
  phase: 'book' | 'engine' | 'facts';
}

/** Assessment of a single candidate move (coach warning P0-08, "Nochmal versuchen"). */
export interface MoveAssessment {
  expectedPointsLoss: number;
  classification: MoveClassification;
  bestMove: Uci | null;
  bestLine: Uci[];
  playedLine: Uci[];
  evalBefore: Score;
  evalAfter: Score;
  facts: ExplanationFacts;
}

/** Opponent threat found by a pass-move analysis (coach, P0-08). */
export interface ThreatInfo {
  /** The threatening move (opponent's best move if it were their turn). */
  move: Uci;
  san: San;
  line: Uci[];
  /** Material the threat wins, in pawns. */
  materialGain: number;
  /** Set when the threat is a forced mate. */
  mateIn?: number;
  facts: ExplanationFacts;
}

/** Analysis pipeline (WP-02). */
export interface AnalysisService {
  /** Warms the cache for a position (coach: called when the user's turn starts, D-41). */
  prepare(fen: Fen): void;
  /** Full game review with progress; abortable. */
  analyseGame(
    input: AnalyseGameInput,
    opts?: { onProgress?: (p: AnalysisProgress) => void; signal?: AbortSignal },
  ): Promise<GameAnalysis>;
  /** Assesses one move in a position (≤ 500 ms after `prepare`, ≤ 1 s cold). */
  assessMove(fenBefore: Fen, move: Uci, opts?: { signal?: AbortSignal }): Promise<MoveAssessment>;
  /** Threat of the opponent if it were their move; `null` when nothing wins ≥ 2 pawns or mates. */
  findThreats(fen: Fen, opts?: { signal?: AbortSignal }): Promise<ThreatInfo | null>;
}
