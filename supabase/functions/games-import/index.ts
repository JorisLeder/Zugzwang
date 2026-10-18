// Deno entry of the `games-import` edge function: wires the real clients into `handler.ts` (all logic and tests live
// there). Imports of `handler.ts` resolve through this folder's `deno.json`. Uses only `SUPABASE_URL` and
// `SUPABASE_ANON_KEY` (provided by Supabase): every statement runs with the caller's JWT, so RLS applies.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { supabaseAuth, supabaseGames } from '../_shared/supabase.ts';
import { createGamesImportHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

Deno.serve(
  createGamesImportHandler({
    auth: supabaseAuth(createClient(url, anonKey, { auth: noSession })),
    games: (token) => supabaseGames(createClient(url, anonKey, { auth: noSession, global: { headers: { Authorization: `Bearer ${token}` } } })),
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  }),
);
