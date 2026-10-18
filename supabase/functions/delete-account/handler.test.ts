/**
 * `delete-account` handler with a mocked auth and admin port: only the caller's account is deleted (id from the
 * token, never from the body), rows before the auth user, failures are a 500 the app reports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FUNCTIONS_DE } from '../_shared/strings.de.ts';
import { createDeleteAccountHandler, type DeleteAccountDeps } from './handler';

const TOKEN = 'jwt-of-alice';

function setup() {
  const calls: string[] = [];
  const userId = vi.fn(async (t: string) => (t === TOKEN ? 'alice' : null));
  const deleteUserData = vi.fn(async (id: string) => {
    calls.push(`rows:${id}`);
    return 17;
  });
  const deleteAuthUser = vi.fn(async (id: string) => {
    calls.push(`auth:${id}`);
  });
  const deps: DeleteAccountDeps = { auth: { userId }, admin: { deleteUserData, deleteAuthUser } };
  return { deps, calls, userId, deleteUserData, deleteAuthUser };
}

function post(opts: { token?: string | null; body?: unknown } = {}): Request {
  const token = opts.token === undefined ? TOKEN : opts.token;
  return new Request('http://localhost/functions/v1/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(opts.body ?? {}),
  });
}

async function call(deps: DeleteAccountDeps, req: Request) {
  const res = await createDeleteAccountHandler(deps)(req);
  expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as unknown) };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('delete-account', () => {
  it('answers the CORS preflight and refuses other methods', async () => {
    const s = setup();
    expect((await call(s.deps, new Request('http://localhost/', { method: 'OPTIONS' }))).status).toBe(204);
    expect(await call(s.deps, new Request('http://localhost/', { method: 'DELETE' }))).toEqual({ status: 405, body: { ok: false, error: FUNCTIONS_DE.methodNotAllowed } });
    expect(s.calls).toEqual([]);
  });

  it('requires a valid access token and deletes nothing without one', async () => {
    const s = setup();
    expect(await call(s.deps, post({ token: null }))).toEqual({ status: 401, body: { ok: false, error: FUNCTIONS_DE.signInRequired } });
    expect(await call(s.deps, post({ token: 'expired' }))).toEqual({ status: 401, body: { ok: false, error: FUNCTIONS_DE.signInRequired } });
    expect(s.calls).toEqual([]);
  });

  it('deletes all rows of the caller, then the auth user', async () => {
    const s = setup();
    expect(await call(s.deps, post())).toEqual({ status: 200, body: { ok: true, deletedRows: 17 } });
    expect(s.calls).toEqual(['rows:alice', 'auth:alice']);
  });

  it('ignores a user id in the body – only the caller can be deleted', async () => {
    const s = setup();
    await call(s.deps, post({ body: { userId: 'bob', user_id: 'bob' } }));
    expect(s.calls).toEqual(['rows:alice', 'auth:alice']);
  });

  it('keeps the auth user when deleting the rows fails (500, retry possible)', async () => {
    const s = setup();
    s.deleteUserData.mockRejectedValueOnce(new Error('db down'));
    expect(await call(s.deps, post())).toEqual({ status: 500, body: { ok: false, error: FUNCTIONS_DE.deleteFailed } });
    expect(s.deleteAuthUser).not.toHaveBeenCalled();
    // A repeated call finishes the deletion.
    expect(await call(s.deps, post())).toEqual({ status: 200, body: { ok: true, deletedRows: 17 } });
  });

  it('answers 500 when the auth user cannot be deleted', async () => {
    const s = setup();
    s.deleteAuthUser.mockRejectedValueOnce(new Error('auth admin down'));
    expect(await call(s.deps, post())).toEqual({ status: 500, body: { ok: false, error: FUNCTIONS_DE.deleteFailed } });
  });
});
