/**
 * Reads the public runtime configuration (`VITE_` variables only, D-15). Frozen (WP-00).
 */
import type { AppConfig } from '@/core/services';

/** Subset of `import.meta.env` we read. */
export interface AppEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_CLOUD_EVAL?: string;
  VITE_E2E?: string;
}

/** Builds the `AppConfig`: cloud mode only when both Supabase variables are set. */
export function readAppConfig(env: AppEnv = import.meta.env as AppEnv): AppConfig {
  const url = env.VITE_SUPABASE_URL?.trim() || undefined;
  const key = env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;
  const cloud = Boolean(url && key);
  const config: AppConfig = {
    mode: cloud ? 'cloud' : 'local',
    cloudEvalEnabled: env.VITE_CLOUD_EVAL === 'true' || env.VITE_CLOUD_EVAL === '1',
    e2e: env.VITE_E2E === '1' || env.VITE_E2E === 'true',
  };
  if (cloud) {
    config.supabaseUrl = url;
    config.supabaseAnonKey = key;
    config.explainUrl = `${url!.replace(/\/+$/, '')}/functions/v1/explain`;
  }
  return config;
}
