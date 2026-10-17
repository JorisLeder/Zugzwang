/**
 * `ExplanationService` (WP-05, P0-11): rule-based German templates always; the LLM path only when the app runs in
 * cloud mode with an `explain` URL, the browser is online, the caller allows it and the user has an access token.
 * The LLM text is accepted only after `validateExplanationSegments` (engine-confirmed moves only); any failure,
 * timeout (8 s), refusal, rate limit or invalid output gives the rule-based explanation. Transient failures pause the
 * LLM path for `backoffMs` so a broken service does not delay every explanation. Results are cached per `cacheKey`
 * (e.g. `${gameId}:${ply}`) and concurrent requests for the same key share one call.
 */
import type { ExplanationFacts, ExplanationService, ExplanationText } from '@/core/explain';
import { requestLlmExplanation, LLM_TIMEOUT_MS } from './llm';
import { explainRuleBased } from './ruleBased';
import { plainText } from './segments';
import { validateExplanationSegments } from './validate';

/** Dependencies and tuning of the service. */
export interface ExplanationServiceOptions {
  /** `explain` edge function URL; `null` = rule-based only (local mode). */
  explainUrl: () => string | null;
  /** Access token for the function; `null` = no LLM request (logged out). */
  accessToken: () => Promise<string | null>;
  /** Send requests without a token (only for the e2e test endpoint). */
  allowAnonymous?: boolean;
  fetchFn?: typeof fetch;
  /** `false` when the device is offline (default: `navigator.onLine`). */
  isOnline?: () => boolean;
  timeoutMs?: number;
  /** Pause of the LLM path after a transient failure (default 5 min). */
  backoffMs?: number;
  /** Maximum cached explanations (default 300). */
  cacheSize?: number;
  now?: () => number;
}

function browserOnline(): boolean {
  try {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  } catch {
    return true;
  }
}

function abortError(): DOMException {
  return new DOMException('Explanation aborted', 'AbortError');
}

/** Resolves like `promise`, or rejects with an `AbortError` as soon as `signal` aborts. */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** The explanation service (see the file header). */
export class RuleAndLlmExplanationService implements ExplanationService {
  private readonly opts: ExplanationServiceOptions;
  private readonly cache = new Map<string, ExplanationText>();
  private readonly inflight = new Map<string, Promise<ExplanationText | null>>();
  private pausedUntil = 0;

  constructor(opts: ExplanationServiceOptions) {
    this.opts = opts;
  }

  explainRuleBased(facts: ExplanationFacts): ExplanationText {
    return explainRuleBased(facts);
  }

  async explain(facts: ExplanationFacts, opts: { allowLlm?: boolean; signal?: AbortSignal; cacheKey?: string } = {}): Promise<ExplanationText> {
    if (opts.signal?.aborted) throw abortError();
    const key = opts.cacheKey;
    const cached = key ? this.cache.get(key) : undefined;
    if (cached) return structuredClone(cached);
    const rule = explainRuleBased(facts);
    const url = opts.allowLlm === false ? null : this.llmUrl();
    if (!url) return rule;

    // A keyed request is shared by every caller of that key, so it does not take one caller's signal; each caller
    // stops waiting when its own signal aborts.
    let pending = key ? this.inflight.get(key) : undefined;
    if (!pending) {
      pending = this.fetchLlm(url, facts, key ? undefined : opts.signal);
      if (key) {
        this.inflight.set(key, pending);
        void pending.finally(() => this.inflight.delete(key)).catch(() => undefined);
      }
    }
    const llm = await raceAbort(pending, opts.signal);
    if (!llm) return rule;
    if (key) this.remember(key, llm);
    return structuredClone(llm);
  }

  /** URL for an LLM request now, or `null` when the LLM path is off (local mode, offline, paused). */
  private llmUrl(): string | null {
    const url = this.opts.explainUrl();
    if (!url) return null;
    if (!(this.opts.isOnline ?? browserOnline)()) return null;
    if ((this.opts.now ?? Date.now)() < this.pausedUntil) return null;
    return url;
  }

  private async fetchLlm(url: string, facts: ExplanationFacts, signal?: AbortSignal): Promise<ExplanationText | null> {
    let token: string | null = null;
    try {
      token = await this.opts.accessToken();
    } catch {
      token = null;
    }
    if (!token && !this.opts.allowAnonymous) return null;
    const fetchFn = this.opts.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
    const outcome = await requestLlmExplanation(facts, {
      url,
      token,
      fetchFn,
      timeoutMs: this.opts.timeoutMs ?? LLM_TIMEOUT_MS,
      ...(signal ? { signal } : {}),
    });
    if (!outcome.ok) {
      if (outcome.transient) this.pausedUntil = (this.opts.now ?? Date.now)() + (this.opts.backoffMs ?? 5 * 60_000);
      return null;
    }
    const valid = validateExplanationSegments(outcome.segments, facts);
    if (!valid.ok) {
      console.warn(`LLM explanation rejected (${valid.reason}); using the rule-based explanation.`);
      return null;
    }
    return { plain: plainText(valid.segments), segments: valid.segments, source: 'llm', motifs: facts.motifs.map((m) => m.id) };
  }

  private remember(key: string, value: ExplanationText): void {
    this.cache.delete(key);
    this.cache.set(key, value);
    const max = this.opts.cacheSize ?? 300;
    while (this.cache.size > max) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
