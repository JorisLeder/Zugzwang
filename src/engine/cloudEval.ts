/**
 * Optional Lichess cloud-eval provider (PRD "Analyse-Pipeline" step 2, `config.cloudEvalEnabled`). Never required
 * (CONSTRAINTS §2): every failure returns `null` and the caller analyses locally.
 *
 * `GET https://lichess.org/api/cloud-eval?fen=…&multiPv=N` → `{ fen, knodes, depth, pvs: [{ moves, cp | mate }] }`.
 * Lichess stores cloud evaluations from **White's** point of view, which matches our contracts (D-08).
 * - 1.5 s timeout; 404 (not in the cloud), other HTTP errors, invalid JSON, illegal PVs, network errors → `null`.
 * - 429 (rate limited) → `null` and no further requests for 60 s.
 */
import type { Fen } from '@/core/chess';
import type { EngineAnalysis, EngineLine, Score } from '@/core/engine';
import { uciLineToSan } from '@/lib/chess';

/** Engine id reported for cloud results. */
export const CLOUD_ENGINE_ID = 'lichess-cloud-eval';

/** Default endpoint. */
export const CLOUD_EVAL_URL = 'https://lichess.org/api/cloud-eval';

/** Looks up stored evaluations. */
export interface CloudEvalProvider {
  /**
   * Cloud evaluation of `fen` with at least `multiPv` lines and depth ≥ `minDepth`, or `null` (not found, too shallow,
   * failure, paused after 429).
   */
  lookup(fen: Fen, opts?: { multiPv?: number; minDepth?: number; signal?: AbortSignal }): Promise<EngineAnalysis | null>;
}

/** Options of `createLichessCloudEval`. */
export interface CloudEvalOptions {
  /** `fetch` implementation (tests). Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Request timeout in ms (default 1500). */
  timeoutMs?: number;
  /** Pause after HTTP 429 in ms (default 60 000). */
  pauseMs?: number;
  /** Clock (tests). */
  now?: () => number;
  /** Endpoint (default `https://lichess.org/api/cloud-eval`). */
  url?: string;
}

interface CloudPv {
  moves?: unknown;
  cp?: unknown;
  mate?: unknown;
}

interface CloudResponse {
  depth?: unknown;
  knodes?: unknown;
  pvs?: unknown;
}

function toLine(pv: CloudPv, index: number, depth: number, fen: Fen, knodes: number | undefined): EngineLine | null {
  if (typeof pv.moves !== 'string') return null;
  const moves = pv.moves.trim().split(/\s+/).filter(Boolean);
  if (moves.length === 0 || uciLineToSan(fen, moves).length !== moves.length) return null;
  let score: Score;
  if (typeof pv.mate === 'number' && Number.isInteger(pv.mate)) score = { type: 'mate', value: pv.mate };
  else if (typeof pv.cp === 'number' && Number.isFinite(pv.cp)) score = { type: 'cp', value: Math.round(pv.cp) };
  else return null;
  const line: EngineLine = { multipv: index + 1, depth, score, pv: moves };
  if (knodes !== undefined) line.nodes = knodes * 1000;
  return line;
}

/** Creates the Lichess cloud-eval provider (see file header). */
export function createLichessCloudEval(opts: CloudEvalOptions = {}): CloudEvalProvider {
  const timeoutMs = opts.timeoutMs ?? 1500;
  const pauseMs = opts.pauseMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  const url = opts.url ?? CLOUD_EVAL_URL;
  let pausedUntil = 0;

  return {
    async lookup(fen, callOpts = {}) {
      const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
      if (!doFetch || now() < pausedUntil || callOpts.signal?.aborted) return null;
      const multiPv = Math.max(1, callOpts.multiPv ?? 1);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      callOpts.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await doFetch(`${url}?fen=${encodeURIComponent(fen)}&multiPv=${multiPv}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (res.status === 429) {
          pausedUntil = now() + pauseMs;
          return null;
        }
        if (!res.ok) return null;
        const body = (await res.json()) as CloudResponse;
        const depth = typeof body.depth === 'number' ? body.depth : 0;
        if (depth < (callOpts.minDepth ?? 0) || !Array.isArray(body.pvs)) return null;
        const knodes = typeof body.knodes === 'number' ? body.knodes : undefined;
        const lines: EngineLine[] = [];
        for (const [i, pv] of (body.pvs as CloudPv[]).entries()) {
          const line = toLine(pv, i, depth, fen, knodes);
          if (!line) return null;
          lines.push(line);
        }
        if (lines.length < multiPv) return null;
        const selected = lines.slice(0, multiPv);
        return { fen, lines: selected, depth, bestMove: selected[0]!.pv[0]!, source: 'cloud', engineId: CLOUD_ENGINE_ID };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
        callOpts.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
