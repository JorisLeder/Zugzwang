// Deno entry of the `delete-account` edge function: wires the real clients into `handler.ts` (all logic and tests
// live there). Imports of `handler.ts` resolve through this folder's `deno.json`. `SUPABASE_URL`,
// `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { supabaseAccountAdmin, supabaseAuth } from '../_shared/supabase.ts';
import { createDeleteAccountHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

Deno.serve(
  createDeleteAccountHandler({
    auth: supabaseAuth(createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, noSession)),
    admin: supabaseAccountAdmin(createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, noSession)),
  }),
);
