/**
 * Shared zod building blocks for the content and API schemas (zod 4).
 */
import { z } from 'zod';
import { SQUARES, type Square } from '../chess';
import type { ExplanationFacts, ExplanationSegment, ExplanationText, MotifId, MotifInstance } from '../explain';

/** UCI move: `e2e4`, `e7e8q` (promotion piece lower case). */
export const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, 'Ungültiger UCI-Zug');

/** FEN string – shape check only (six fields); legality is checked by `validateFen` in the validators. */
export const fenSchema = z
  .string()
  .regex(/^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/, 'Ungültige FEN');

/** Board square `a1` … `h8`. */
export const squareSchema = z.enum(SQUARES as unknown as [Square, ...Square[]]);

/** Side. */
export const colorSchema = z.enum(['w', 'b']);

/** Piece letter. */
export const pieceSymbolSchema = z.enum(['p', 'n', 'b', 'r', 'q', 'k']);

/** English SAN (loose shape check; legality via lib/chess). */
export const sanSchema = z.string().min(2).max(10);

/** ISO-8601 timestamp. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Board arrow. */
export const arrowSchema = z.object({
  from: squareSchema,
  to: squareSchema,
  kind: z.enum(['user', 'best', 'threat', 'hint', 'played']),
});

/** Square highlight. */
export const squareMarkSchema = z.object({
  square: squareSchema,
  kind: z.enum(['user', 'hint-piece', 'hint-target', 'danger', 'selected', 'last-move', 'check']),
});

/** Motif ids. */
export const motifIdSchema = z.enum([
  'hanging_piece',
  'fork',
  'pin',
  'skewer',
  'discovered_attack',
  'double_check',
  'mate_threat',
  'mate',
  'back_rank',
  'material_loss',
  'missed_win',
  'trapped_piece',
  'promotion',
  'stalemate_trap',
]) satisfies z.ZodType<MotifId>;

/** Motif instance. */
export const motifInstanceSchema = z.object({
  id: motifIdSchema,
  squares: z.array(squareSchema),
  pieces: z.array(z.object({ square: squareSchema, piece: pieceSymbolSchema, color: colorSchema })),
  gain: z.number().optional(),
}) satisfies z.ZodType<MotifInstance>;

/** Engine facts (input of explanations). */
export const explanationFactsSchema = z.object({
  kind: z.enum(['mistake', 'coach_warning', 'threat', 'praise', 'puzzle']),
  mover: colorSchema,
  fenBefore: fenSchema,
  playedMove: z.object({ uci: uciSchema, san: sanSchema }).optional(),
  bestMove: z.object({ uci: uciSchema, san: sanSchema }).optional(),
  bestLine: z.array(sanSchema),
  refutation: z.array(sanSchema),
  expectedPointsLoss: z.number().min(0).max(1).optional(),
  materialSwing: z.number().optional(),
  mateIn: z.number().int().optional(),
  motifs: z.array(motifInstanceSchema),
  themes: z.array(z.string()).optional(),
}) satisfies z.ZodType<ExplanationFacts>;

/** Explanation segment (text or English-SAN move). */
export const explanationSegmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('move'), san: sanSchema }),
]) satisfies z.ZodType<ExplanationSegment>;

/** Rendered explanation. */
export const explanationTextSchema = z.object({
  plain: z.string().min(1),
  segments: z.array(explanationSegmentSchema),
  source: z.enum(['rule', 'llm']),
  motifs: z.array(motifIdSchema),
}) satisfies z.ZodType<ExplanationText>;
