/** `POST /games/import` request schema (P2-02). */
import { z } from 'zod';
import type { GameImportRequest } from '../games';

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
