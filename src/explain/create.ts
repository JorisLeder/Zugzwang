/**
 * `createExplanationService(config, data)` – the app's `ExplanationService`. Kept apart from the `@/explain` barrel so
 * the app shell imports only the rule-based path; the LLM client (and its response schema) loads on its first use.
 */
import type { ExplanationService } from '@/core/explain';
import type { AppConfig } from '@/core/services';
import type { DataServices } from '@/core/storage';
import { RuleAndLlmExplanationService } from './service';

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
