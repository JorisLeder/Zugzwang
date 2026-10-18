// Deno entry of the `explain` edge function: wires the real clients into `handler.ts` (all logic and tests live
// there). Imports of `handler.ts` resolve through this folder's `deno.json`. Secrets: `ANTHROPIC_API_KEY`
// (`supabase secrets set ANTHROPIC_API_KEY=…`); `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
// are provided by Supabase.
import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { supabaseAuth, supabaseQuota } from '../_shared/supabase.ts';
import { createExplainHandler } from './handler.ts';

const env = (name: string): string | undefined => Deno.env.get(name);
const url = env('SUPABASE_URL')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

Deno.serve(
  createExplainHandler({
    env,
    auth: supabaseAuth(createClient(url, env('SUPABASE_ANON_KEY')!, noSession)),
    quota: supabaseQuota(createClient(url, env('SUPABASE_SERVICE_ROLE_KEY')!, noSession)),
    claude: (apiKey) => new Anthropic({ apiKey }).beta.messages,
  }),
);
