/** Settings schema (profile JSON, import/export). */
import { z } from 'zod';
import type { Settings } from '../profile';

/** User settings. */
export const settingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']),
  boardTheme: z.enum(['moos', 'holz']),
  pieceSet: z.literal('default'),
  sound: z.boolean(),
  animations: z.boolean(),
  moveConfirmation: z.boolean(),
  language: z.enum(['de', 'en']),
  notation: z.enum(['de', 'en']),
  showCoordinates: z.boolean(),
  showLegalMoves: z.boolean(),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<Settings>;
