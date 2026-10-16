import { describe, expect, it } from 'vitest';
import { readAppConfig } from './config';

describe('readAppConfig (D-15)', () => {
  it('local mode without Supabase variables', () => {
    expect(readAppConfig({})).toEqual({ mode: 'local', cloudEvalEnabled: false, e2e: false });
    expect(readAppConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }).mode).toBe('local');
  });
  it('cloud mode with both variables; explain URL derived', () => {
    const c = readAppConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_ANON_KEY: 'anon', VITE_CLOUD_EVAL: 'true', VITE_E2E: '1' });
    expect(c).toEqual({
      mode: 'cloud',
      supabaseUrl: 'https://x.supabase.co/',
      supabaseAnonKey: 'anon',
      explainUrl: 'https://x.supabase.co/functions/v1/explain',
      cloudEvalEnabled: true,
      e2e: true,
    });
  });
});
