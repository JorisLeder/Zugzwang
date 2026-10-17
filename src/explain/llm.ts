/**
 * Client of the `explain` edge function (WP-11, D-18): one POST of an `ExplainRequest` with the user's access token,
 * timeout 8 s, one attempt, response checked with the zod contract. Returns the segments or a failure reason – the
 * caller always falls back to the rule-based explanation (P0-11).
 */
import type { ExplainRequest, ExplanationFacts, ExplanationSegment } from '@/core/explain';
import { explainResponseSchema } from '@/core/schemas';

/** Default timeout of one request (BACKLOG WP-05). */
export const LLM_TIMEOUT_MS = 8_000;

/** Why the LLM path gave no text. `transient` failures pause further requests for a while. */
export type LlmFailure = { reason: 'timeout' | 'network' | 'http' | 'invalid_response' | 'rate_limited' | 'unavailable' | 'refused' | 'invalid'; transient: boolean };

/** Outcome of `requestLlmExplanation`. */
export type LlmOutcome = { ok: true; segments: ExplanationSegment[]; model: string } | ({ ok: false } & LlmFailure);

/** Request context per facts kind. */
export function explainContext(kind: ExplanationFacts['kind']): ExplainRequest['context'] {
  if (kind === 'mistake') return 'analysis';
  if (kind === 'puzzle') return 'puzzle';
  return 'coach';
}

/** Options of one request. */
export interface LlmRequestOptions {
  url: string;
  /** Bearer token (Supabase JWT); omitted only for the e2e test endpoint. */
  token: string | null;
  fetchFn: typeof fetch;
  timeoutMs?: number;
  /** Caller's signal: aborting it rejects with an `AbortError`. */
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException('Explanation aborted', 'AbortError');
}

/** Sends the facts to the `explain` function (see the file header). Rejects only when `signal` aborts. */
export async function requestLlmExplanation(facts: ExplanationFacts, opts: LlmRequestOptions): Promise<LlmOutcome> {
  if (opts.signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? LLM_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  const body: ExplainRequest = { context: explainContext(facts.kind), facts, language: 'de' };
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let res: Response;
    try {
      res = await opts.fetchFn(opts.url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch {
      if (opts.signal?.aborted) throw abortError();
      return { ok: false, reason: timedOut ? 'timeout' : 'network', transient: true };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      if (opts.signal?.aborted) throw abortError();
      if (timedOut) return { ok: false, reason: 'timeout', transient: true };
      return { ok: false, reason: res.ok ? 'invalid_response' : 'http', transient: !res.ok && res.status >= 500 };
    }
    const parsed = explainResponseSchema.safeParse(json);
    if (!parsed.success) {
      if (res.status === 429) return { ok: false, reason: 'rate_limited', transient: true };
      return { ok: false, reason: res.ok ? 'invalid_response' : 'http', transient: !res.ok && res.status >= 500 };
    }
    const data = parsed.data;
    if (!data.ok) return { ok: false, reason: data.error, transient: data.error === 'rate_limited' || data.error === 'unavailable' };
    return { ok: true, segments: data.segments, model: data.model };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
