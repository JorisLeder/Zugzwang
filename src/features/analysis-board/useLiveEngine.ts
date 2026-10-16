/**
 * Live engine for the Analysebrett (DESIGN §3.5/§5.12): analyses the shown position with MultiPV 2 on the
 * `analysis` engine, streams the lines, aborts (UCI `stop`) whenever the position changes, the toggle is switched off
 * or the page is left.
 */
import { useEffect, useState } from 'react';
import type { Fen } from '@/core/chess';
import type { EngineLine, EngineService, EngineStatus } from '@/core/engine';

/** Depth of the live analysis (the search stops there to save battery; navigation aborts earlier). */
export const LIVE_DEPTH = 20;
/** Number of lines shown (DESIGN §3.5: top 2). */
export const LIVE_MULTIPV = 2;

/** State of the live engine for the current position. */
export interface LiveEngineState {
  status: EngineStatus;
  /** Lines for `fen` (empty while searching or when there is no legal move). */
  lines: EngineLine[];
  /** The search for `fen` has finished. */
  done: boolean;
  /** German-free technical error of the last search (the UI shows its own text). */
  error: string | null;
}

interface Result {
  fen: Fen;
  lines: EngineLine[];
  done: boolean;
  error: string | null;
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/** Runs the analysis while `enabled`. */
export function useLiveEngine(engine: EngineService, fen: Fen, enabled: boolean): LiveEngineState {
  const [status, setStatus] = useState<EngineStatus>(() => engine.status());
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => engine.onStatus(setStatus), [engine]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const signal = controller.signal;
    engine
      .analyse(fen, {
        depth: LIVE_DEPTH,
        multiPv: LIVE_MULTIPV,
        signal,
        onUpdate: (lines) => {
          if (!signal.aborted) setResult({ fen, lines: [...lines].sort((a, b) => a.multipv - b.multipv), done: false, error: null });
        },
      })
      .then((analysis) => {
        if (!signal.aborted) setResult({ fen, lines: analysis.lines, done: true, error: null });
      })
      .catch((e: unknown) => {
        if (signal.aborted || isAbort(e)) return;
        setResult({ fen, lines: [], done: true, error: e instanceof Error ? e.message : String(e) });
      });
    return () => controller.abort();
  }, [engine, fen, enabled]);

  const current = result && result.fen === fen ? result : null;
  return {
    status,
    lines: enabled && current ? current.lines : [],
    done: enabled && current !== null && current.done,
    error: enabled && current ? current.error : null,
  };
}
