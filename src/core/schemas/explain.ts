/** `explain` edge function request/response schemas (D-18, D-19). */
import { z } from 'zod';
import type { ExplainRequest, ExplainResponse } from '../explain';
import { explanationFactsSchema, explanationSegmentSchema } from './common';

/** Request body. */
export const explainRequestSchema = z.object({
  context: z.enum(['analysis', 'coach', 'puzzle']),
  facts: explanationFactsSchema,
  language: z.literal('de'),
}) satisfies z.ZodType<ExplainRequest>;

/** Response body. */
export const explainResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), segments: z.array(explanationSegmentSchema).min(1), model: z.string().min(1) }),
  z.object({ ok: z.literal(false), error: z.enum(['rate_limited', 'invalid', 'unavailable', 'refused']) }),
]) satisfies z.ZodType<ExplainResponse>;
