/**
 * Authoring format of hand-written puzzles (wave-1 seed bank `public/data/puzzles/seed.json`, demo puzzles).
 *
 * Authors write the line in SAN (English letters, opponent's move first) and the German explanation with moves marked
 * as `[[SAN]]` (D-19 marker syntax). `buildSeedPuzzle` converts this to the Lichess-format `Puzzle` (UCI moves,
 * explanation segments, German-notation `plain`) and throws on any illegal move or unknown marked move.
 */
import type { Fen } from '@/core/chess';
import type { ExplanationSegment, ExplanationText, MotifId } from '@/core/explain';
import { RATING_DEFAULTS } from '@/core/rating';
import type { Puzzle } from '@/core/puzzles';
import { ChessGame, formatSan } from '@/lib/chess';

/** A hand-written puzzle. */
export interface SeedPuzzleSource {
  id: string;
  /** Position before the opponent's first move. */
  fen: Fen;
  /** Line in English SAN: opponent's move first, then solver/opponent alternating, ending with a solver move. */
  line: string[];
  rating: number;
  themes: string[];
  openingTags?: string[];
  /** German explanation (1–3 sentences, "du"); moves as `[[SAN]]` in English SAN. */
  explanation: string;
}

/** Puzzle themes → explanation motifs (for `ExplanationText.motifs`). */
const THEME_MOTIFS: Record<string, MotifId> = {
  hangingPiece: 'hanging_piece',
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discoveredAttack: 'discovered_attack',
  doubleCheck: 'double_check',
  trappedPiece: 'trapped_piece',
  backRankMate: 'back_rank',
  promotion: 'promotion',
  mate: 'mate',
};

/** Parses `text [[Nf3]] text` into segments; `plain` uses German notation. */
export function explanationFromMarkup(markup: string, motifs: MotifId[] = []): ExplanationText {
  const segments: ExplanationSegment[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    if (m.index > last) segments.push({ type: 'text', text: markup.slice(last, m.index) });
    segments.push({ type: 'move', san: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < markup.length) segments.push({ type: 'text', text: markup.slice(last) });
  const plain = segments.map((s) => (s.type === 'text' ? s.text : formatSan(s.san, 'de'))).join('').trim();
  return { plain, segments, source: 'rule', motifs };
}

/** Converts an authored puzzle to the Lichess-format `Puzzle` (source `seed`). Throws on illegal moves. */
export function buildSeedPuzzle(src: SeedPuzzleSource): Puzzle {
  const game = ChessGame.fromFen(src.fen);
  const moves: string[] = [];
  const sans: string[] = [];
  src.line.forEach((san, i) => {
    const r = game.move(san);
    if (!r) throw new Error(`${src.id}: move ${i + 1} "${san}" is illegal in ${game.fen()}`);
    moves.push(r.uci);
    sans.push(r.san);
  });
  const motifs = [...new Set(src.themes.flatMap((t) => (THEME_MOTIFS[t] ? [THEME_MOTIFS[t]] : t.startsWith('mateIn') ? ['mate' as const] : [])))];
  const explanation = explanationFromMarkup(src.explanation, motifs);
  return {
    id: src.id,
    fen: src.fen,
    moves,
    rating: src.rating,
    ratingDeviation: RATING_DEFAULTS.puzzleRd,
    themes: [...src.themes],
    openingTags: [...(src.openingTags ?? [])],
    source: 'seed',
    explanation,
  };
}
