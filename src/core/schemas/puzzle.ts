/**
 * Puzzle bank schemas (D-24, D-25): `public/data/puzzles/manifest.json` and its chunk files.
 * Theme ids are checked against `PUZZLE_THEMES` by the puzzle validator, not here (Lichess may add themes).
 */
import { z } from 'zod';
import type { Puzzle, PuzzleBankManifest } from '../puzzles';
import { explanationTextSchema, fenSchema, uciSchema } from './common';

/** One puzzle in Lichess format: `moves[0]` is the opponent's move, so at least two moves. */
export const puzzleSchema = z.object({
  id: z.string().min(1),
  fen: fenSchema,
  moves: z.array(uciSchema).min(2),
  rating: z.number().int().min(0).max(4000),
  ratingDeviation: z.number().min(0),
  themes: z.array(z.string().min(1)),
  openingTags: z.array(z.string()),
  popularity: z.number().optional(),
  nbPlays: z.number().int().min(0).optional(),
  source: z.enum(['lichess', 'generated', 'lesson', 'seed']),
  explanation: explanationTextSchema.optional(),
  gameUrl: z.string().url().optional(),
}) satisfies z.ZodType<Puzzle>;

/** A chunk file: an array of puzzles. */
export const puzzleChunkSchema = z.array(puzzleSchema);

/** Manifest listing the chunk files. */
export const puzzleBankManifestSchema = z.object({
  version: z.string().min(1),
  chunks: z.array(
    z.object({
      file: z.string().min(1),
      count: z.number().int().min(0),
      source: z.enum(['lichess', 'generated', 'lesson', 'seed']),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
}) satisfies z.ZodType<PuzzleBankManifest>;
