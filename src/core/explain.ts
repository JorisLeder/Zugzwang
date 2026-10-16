/**
 * Explanation contracts (BACKLOG 2.6, PRD P0-11, D-18, D-19). Explanations only name engine-confirmed moves.
 */
import type { Color, Fen, PieceSymbol, San, Square, Uci } from './chess';

/** Tactical/positional motifs detected by rules (WP-02) and verbalised by explanations (WP-05). */
export type MotifId =
  | 'hanging_piece'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'double_check'
  | 'mate_threat'
  | 'mate'
  | 'back_rank'
  | 'material_loss'
  | 'missed_win'
  | 'trapped_piece'
  | 'promotion'
  | 'stalemate_trap';

/** German names of the motifs (DSB terminology where it exists). */
export const MOTIF_LABELS_DE: Record<MotifId, string> = {
  hanging_piece: 'Hängende Figur',
  fork: 'Gabel',
  pin: 'Fesselung',
  skewer: 'Spieß',
  discovered_attack: 'Abzugsangriff',
  double_check: 'Doppelschach',
  mate_threat: 'Mattdrohung',
  mate: 'Matt',
  back_rank: 'Grundreihenschwäche',
  material_loss: 'Materialverlust',
  missed_win: 'Verpasster Gewinn',
  trapped_piece: 'Gefangene Figur',
  promotion: 'Umwandlung',
  stalemate_trap: 'Pattfalle',
};

/** One detected motif with the squares/pieces involved (for arrows and text). */
export interface MotifInstance {
  id: MotifId;
  /** Key squares (e.g. forking piece first, then the attacked squares). */
  squares: Square[];
  /** Pieces involved. */
  pieces: Array<{ square: Square; piece: PieceSymbol; color: Color }>;
  /** Material gained by exploiting the motif, in pawns (if known). */
  gain?: number;
}

/** Engine-confirmed facts about a move/position – the only input of explanations (rule-based or LLM). */
export interface ExplanationFacts {
  /** What is explained: a mistake in analysis, a coach warning before a move, an opponent threat, praise, a puzzle. */
  kind: 'mistake' | 'coach_warning' | 'threat' | 'praise' | 'puzzle';
  /** Side whose move/position is explained. */
  mover: Color;
  /** Position before the move. */
  fenBefore: Fen;
  /** The move played (or attempted). */
  playedMove?: { uci: Uci; san: San };
  /** The engine's best move. */
  bestMove?: { uci: Uci; san: San };
  /** Engine line after the best move, English SAN, starting with the best move. */
  bestLine: San[];
  /** Engine line refuting the played move (opponent's best reply first), English SAN. */
  refutation: San[];
  /** Expected-points loss 0–1 (mover POV). */
  expectedPointsLoss?: number;
  /** Material change in pawns for the mover after the refutation (negative = loss). */
  materialSwing?: number;
  /** Forced mate distance, if any (positive = mover mates, negative = mover gets mated). */
  mateIn?: number;
  /** Detected motifs. */
  motifs: MotifInstance[];
  /** Puzzle themes (Lichess keys) when `kind = 'puzzle'`. */
  themes?: string[];
}

/** Part of an explanation: plain text, or a move (rendered in the user's notation; English SAN in data). */
export type ExplanationSegment = { type: 'text'; text: string } | { type: 'move'; san: San };

/** A rendered explanation (D-19). */
export interface ExplanationText {
  /** Plain text with German notation – for storage, search and TTS (P2-06). */
  plain: string;
  /** Text and move segments; moves are English SAN and shown via `formatSan` in the user's notation. */
  segments: ExplanationSegment[];
  /** Rule-based template or LLM (validated). */
  source: 'rule' | 'llm';
  /** Motifs mentioned. */
  motifs: MotifId[];
}

/** Produces explanations (WP-05). Rule-based is always available; LLM only in cloud mode and online. */
export interface ExplanationService {
  /** Explains facts; falls back to `explainRuleBased` on any LLM failure, timeout, refusal or invalid output. */
  explain(
    facts: ExplanationFacts,
    opts?: { allowLlm?: boolean; signal?: AbortSignal; cacheKey?: string },
  ): Promise<ExplanationText>;
  /** Deterministic German template explanation (1–3 sentences, "du"). */
  explainRuleBased(facts: ExplanationFacts): ExplanationText;
}

/** Request body of the `explain` edge function (WP-11). */
export interface ExplainRequest {
  context: 'analysis' | 'coach' | 'puzzle';
  facts: ExplanationFacts;
  language: 'de';
}

/** Response of the `explain` edge function. Moves inside `segments` must come from the facts (validated client-side too). */
export type ExplainResponse =
  | { ok: true; segments: ExplanationSegment[]; model: string }
  | { ok: false; error: 'rate_limited' | 'invalid' | 'unavailable' | 'refused' };

/** Thumbs up/down under an explanation (PRD metric "Nützlichkeit"). */
export interface ExplanationFeedback {
  /** Client UUID. */
  id: string;
  context: 'analysis' | 'coach' | 'puzzle';
  /** Reference of the explained object, e.g. `${gameId}:${ply}` or a puzzle id. */
  ref: string;
  vote: 1 | -1;
  createdAt: string;
}
