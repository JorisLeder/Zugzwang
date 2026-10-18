/**
 * HTTP helpers of the edge functions (Deno and Node share the web `Request`/`Response` API): CORS for calls from the
 * app, JSON answers, the caller's bearer token and a guarded JSON body read.
 */

/** CORS headers: the functions are called from the app's origin with a bearer token (no cookies). */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** A request handler (`Deno.serve` takes it as is). */
export type RequestHandler = (req: Request) => Promise<Response>;

/** JSON response with CORS headers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** The token of an `Authorization: Bearer …` header, or `null`. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get('Authorization') ?? '');
  return m ? m[1]! : null;
}

/** Result of `readJsonBody`. */
export type JsonBody = { ok: true; value: unknown } | { ok: false; reason: 'too_large' | 'not_json' };

/** Reads the JSON body; bodies over `maxChars` characters (or a larger `Content-Length` in bytes × 4) are refused. */
export async function readJsonBody(req: Request, maxChars: number): Promise<JsonBody> {
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maxChars * 4) return { ok: false, reason: 'too_large' };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  if (text.length > maxChars) return { ok: false, reason: 'too_large' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: 'not_json' };
  }
}

/** Answers for the cases every POST function handles the same way. */
export interface PostHandlerAnswers {
  /** Body for a request with another method than POST (status 405). */
  methodNotAllowed: unknown;
  /** Body when `handle` throws (status 500). The error is logged, never sent. */
  internalError: unknown;
}

/**
 * Wraps a POST handler: answers the CORS preflight (`OPTIONS`, 204), refuses other methods (405) and turns any thrown
 * error into a 500 with `answers.internalError` – the client then falls back (rule-based text, local import).
 */
export function postHandler(name: string, answers: PostHandlerAnswers, handle: RequestHandler): RequestHandler {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
    if (req.method !== 'POST') return jsonResponse(answers.methodNotAllowed, 405);
    try {
      return await handle(req);
    } catch (e) {
      console.error(`${name}: unexpected error`, e instanceof Error ? e.message : String(e));
      return jsonResponse(answers.internalError, 500);
    }
  };
}
