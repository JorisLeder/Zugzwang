/**
 * `@/explain` – explanations of mistakes, coach warnings, threats, praise and puzzles (WP-05, PRD P0-11, D-18, D-19).
 *
 * - `createExplanationService(config, data)` – the app's `ExplanationService` (D-03 factory): rule-based German
 *   templates always; in cloud mode, online and with a token additionally the validated LLM text of the `explain`
 *   edge function (WP-11), with fallback to the rule-based text on any failure.
 * - Pure functions: `explainRuleBased`, `explanationTeaser`, `validateExplanationSegments`, `plainText`.
 *
 * E2E hook: in e2e builds only (`config.e2e`), `localStorage['zz-e2e-explain-url']` switches the LLM path on against
 * a test endpoint without token, so Playwright can mock the function (`page.route`). Production never reads it.
 */
import type { ExplanationService } from '@/core/explain';
import type { AppConfig } from '@/core/services';
import type { DataServices } from '@/core/storage';
import { RuleAndLlmExplanationService } from './service';

export { explainRuleBased, explanationSentences, explanationTeaser } from './ruleBased';
export { RuleAndLlmExplanationService, type ExplanationServiceOptions } from './service';
export { explainContext, LLM_TIMEOUT_MS, requestLlmExplanation, type LlmOutcome } from './llm';
export { factMoves, MAX_EXPLANATION_CHARS, splitMarkers, validateExplanationSegments, type ValidationResult } from './validate';
export { assemble, countSentences, normalizeSegments, plainText, type Sentence } from './segments';
export { bestLineOf, replayFactLines, replaySan, type FactLines } from './lines';
export { capitalize, pieceNp, piecePronoun, type Case, type Determiner } from './grammar';

/** localStorage key of the e2e test endpoint (read only when `config.e2e`). */
export const E2E_EXPLAIN_URL_KEY = 'zz-e2e-explain-url';

function e2eExplainUrl(): string | null {
  try {
    return globalThis.localStorage?.getItem(E2E_EXPLAIN_URL_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Creates the explanation service. */
export function createExplanationService(config: AppConfig, data: DataServices): ExplanationService {
  const cloudUrl = config.mode === 'cloud' && config.explainUrl ? config.explainUrl : null;
  return new RuleAndLlmExplanationService({
    explainUrl: () => cloudUrl ?? (config.e2e ? e2eExplainUrl() : null),
    accessToken: () => data.auth.accessToken(),
    allowAnonymous: config.e2e && cloudUrl === null,
  });
}
