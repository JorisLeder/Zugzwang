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
export { createExplanationService, E2E_EXPLAIN_URL_KEY } from './create';
export { explainRuleBased, explanationSentences, explanationTeaser } from './ruleBased';
export { RuleAndLlmExplanationService, type ExplanationServiceOptions } from './service';
export { explainContext, LLM_TIMEOUT_MS, requestLlmExplanation, type LlmOutcome } from './llm';
export { factMoves, MAX_EXPLANATION_CHARS, splitMarkers, validateExplanationSegments, type ValidationResult } from './validate';
export { assemble, countSentences, normalizeSegments, plainText, type Sentence } from './segments';
export { bestLineOf, replayFactLines, replaySan, type FactLines } from './lines';
export { capitalize, pieceNp, piecePronoun, type Case, type Determiner } from './grammar';
