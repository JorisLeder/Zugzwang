/** `POST /games/import` request and response schemas (P2-02). */
import { z } from 'zod';
import type { GameImportRequest, GameImportResponse } from '../games';

/** Either a PGN (V1) or `source` + `externalId` (V2, answered with 501). */
export const gameImportRequestSchema = z
  .object({
    pgn: z.string().min(1).max(1_000_000).optional(),
    source: z.enum(['bot', 'pgn', 'chesscom', 'lichess']).optional(),
    externalId: z.string().min(1).max(200).optional(),
  })
  .refine((r) => r.pgn !== undefined || (r.source !== undefined && r.externalId !== undefined), {
    message: 'Entweder pgn oder source und externalId angeben',
  }) satisfies z.ZodType<GameImportRequest>;

/** Answer of `games-import`: the stored (or already existing) game, or a German error with an optional PGN line. */
export const gameImportResponseSchema = z.union([
  z.object({ ok: z.literal(true), gameId: z.string().min(1), duplicate: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string(), line: z.number().int().optional() }),
]) satisfies z.ZodType<GameImportResponse>;
