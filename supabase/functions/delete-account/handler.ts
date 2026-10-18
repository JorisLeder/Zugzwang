/**
 * `delete-account` edge function (PRD Datenschutz, DoD "Konto-Export und -Löschung"): deletes every row of the caller
 * (`delete_user_data`, service role) and then the auth user. Only the caller's own account can be deleted – the user
 * id comes from the verified access token, never from the request body.
 *
 * Answers: `{ ok: true, deletedRows }` (200), `{ ok: false, error }` with 401 (no valid token) or 500 (the app shows
 * an error and keeps the local data; a repeated call finishes the deletion – both steps are idempotent).
 */
import { bearerToken, jsonResponse, postHandler, type RequestHandler } from '../_shared/http.ts';
import { FUNCTIONS_DE } from '../_shared/strings.de.ts';
import type { AccountAdminPort, AuthPort } from '../_shared/supabase.ts';

/** Dependencies (`index.ts` wires the real ones; tests pass fakes). */
export interface DeleteAccountDeps {
  auth: AuthPort;
  admin: AccountAdminPort;
}

/** Answer of the function. */
export type DeleteAccountResponse = { ok: true; deletedRows: number } | { ok: false; error: string };

const answer = (body: DeleteAccountResponse, status: number) => jsonResponse(body, status);

/** Creates the request handler. */
export function createDeleteAccountHandler(deps: DeleteAccountDeps): RequestHandler {
  return postHandler(
    'delete-account',
    { methodNotAllowed: { ok: false, error: FUNCTIONS_DE.methodNotAllowed }, internalError: { ok: false, error: FUNCTIONS_DE.deleteFailed } },
    async (req) => {
      const token = bearerToken(req);
      const userId = token ? await deps.auth.userId(token) : null;
      if (!userId) return answer({ ok: false, error: FUNCTIONS_DE.signInRequired }, 401);
      // Rows first: if the auth user deletion fails, the account still exists and the user can retry.
      const deletedRows = await deps.admin.deleteUserData(userId);
      await deps.admin.deleteAuthUser(userId);
      return answer({ ok: true, deletedRows }, 200);
    },
  );
}
