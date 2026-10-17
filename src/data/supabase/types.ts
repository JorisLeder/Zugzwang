/**
 * The subset of the supabase-js v2 client the data layer uses. The real client (`createClient`) satisfies it
 * structurally; the fake client in `../testing` implements it on top of the in-memory backend.
 */

/** Error object of PostgREST / functions responses. */
export interface SbError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Response of a PostgREST request (`status` 0 = network error). */
export interface SbResponse<T> {
  data: T | null;
  error: SbError | null;
  status?: number;
}

/** Filter/transform part of a select query (thenable). */
export interface SbSelectBuilder extends PromiseLike<SbResponse<Array<Record<string, unknown>>>> {
  eq(column: string, value: unknown): SbSelectBuilder;
  in(column: string, values: readonly unknown[]): SbSelectBuilder;
  order(column: string, opts?: { ascending?: boolean }): SbSelectBuilder;
  range(from: number, to: number): SbSelectBuilder;
}

/** Result of `upsert` (thenable; `.select()` returns the written rows). */
export interface SbUpsertBuilder extends PromiseLike<SbResponse<unknown>> {
  select(columns?: string): PromiseLike<SbResponse<Array<Record<string, unknown>>>>;
}

/** `client.from(table)`. */
export interface SbTableBuilder {
  select(columns?: string): SbSelectBuilder;
  upsert(rows: object | object[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): SbUpsertBuilder;
}

/** Realtime payload of `postgres_changes`. */
export interface SbRealtimePayload {
  schema: string;
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

/** Realtime channel. */
export interface SbChannel {
  on(
    type: 'postgres_changes',
    filter: { event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; schema: string; table: string; filter?: string },
    callback: (payload: SbRealtimePayload) => void,
  ): SbChannel;
  subscribe(callback?: (status: string, err?: Error) => void): SbChannel;
}

/** Session of supabase-js (subset). */
export interface SbSession {
  access_token: string;
  refresh_token?: string;
  /** Unix seconds. */
  expires_at?: number;
  user: { id: string; email?: string; app_metadata?: { provider?: string } };
}

/** `client.auth` (subset). */
export interface SbAuth {
  getSession(): Promise<{ data: { session: SbSession | null }; error: SbError | null }>;
  onAuthStateChange(cb: (event: string, session: SbSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
  signInWithOtp(args: { email: string; options?: { emailRedirectTo?: string; shouldCreateUser?: boolean } }): Promise<{ error: SbError | null }>;
  signInWithOAuth(args: { provider: 'google'; options?: { redirectTo?: string } }): Promise<{ error: SbError | null }>;
  exchangeCodeForSession(code: string): Promise<{ data: { session: SbSession | null }; error: SbError | null }>;
  verifyOtp(args: { token_hash: string; type: 'email' | 'magiclink' | 'signup' }): Promise<{ data: { session: SbSession | null }; error: SbError | null }>;
  setSession(args: { access_token: string; refresh_token: string }): Promise<{ data: { session: SbSession | null }; error: SbError | null }>;
  signOut(opts?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: SbError | null }>;
}

/** The client subset. */
export interface SupabaseLike {
  from(table: string): SbTableBuilder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<SbResponse<unknown>>;
  channel(name: string): SbChannel;
  removeChannel(channel: SbChannel): Promise<unknown> | unknown;
  functions: {
    invoke(name: string, opts?: { method?: 'POST' | 'GET'; body?: unknown }): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  auth: SbAuth;
}

/** Lazily provides the client (the real one is loaded with a dynamic import in cloud mode only). */
export type SupabaseProvider = () => Promise<SupabaseLike>;
