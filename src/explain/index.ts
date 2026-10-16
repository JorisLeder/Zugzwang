/**
 * `@/explain` – explanation service factory (D-03). PLACEHOLDER written by WP-00: returns the fake explanation
 * service. WP-05 replaces it (rule-based German templates + validated LLM client) WITHOUT changing the signature.
 */
import type { ExplanationService } from '@/core/explain';
import type { AppConfig } from '@/core/services';
import type { DataServices } from '@/core/storage';
import { FakeExplanationService } from '@/core/testing';

/** Creates the explanation service. */
export function createExplanationService(config: AppConfig, data: DataServices): ExplanationService {
  void config;
  void data;
  return new FakeExplanationService();
}
