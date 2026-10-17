/**
 * "Nochmal versuchen" as a React hook around the pure state machine of `retry.ts`: decides attempts (the engine's
 * best move and the played move at once, any other move with `analysis.assessMove`), takes wrong moves back after
 * `WRONG_MOVE_MS` and reveals the better move after `MAX_TRIES` wrong tries.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysedMove } from '@/core/analysis';
import type { MoveRecord } from '@/core/chess';
import type { AnalysisService } from '@/core/analysis';
import {
  afterWrong,
  attemptKind,
  beginAttempt,
  nextHint,
  resolveAttempt,
  reveal as revealState,
  startRetry,
  WRONG_MOVE_MS,
  type RetryState,
} from './retry';

/** State and actions of a retry. */
export interface RetryControls {
  state: RetryState | null;
  start: (m: AnalysedMove) => boolean;
  stop: () => void;
  attempt: (rec: MoveRecord) => void;
  hint: () => void;
  reveal: () => void;
}

/** Retry hook (see the file header). `onDone` is called once when a retry succeeds or the move is revealed. */
export function useRetry(analysis: AnalysisService, onDone?: (state: RetryState) => void): RetryControls {
  const [state, setState] = useState<RetryState | null>(null);
  const stateRef = useRef<RetryState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const update = useCallback((next: RetryState | null) => {
    const prev = stateRef.current;
    stateRef.current = next;
    setState(next);
    const done = (s: RetryState | null) => s !== null && (s.phase === 'success' || s.phase === 'revealed');
    if (next && done(next) && !done(prev)) onDoneRef.current?.(next);
  }, []);

  const clearWork = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearWork, [clearWork]);

  const start = useCallback(
    (m: AnalysedMove) => {
      clearWork();
      const s = startRetry(m);
      update(s);
      return s !== null;
    },
    [clearWork, update],
  );

  const stop = useCallback(() => {
    clearWork();
    update(null);
  }, [clearWork, update]);

  const settle = useCallback(
    (next: RetryState) => {
      update(next);
      if (next.phase === 'wrong') {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const cur = stateRef.current;
          if (cur && cur.phase === 'wrong') update(afterWrong(cur));
        }, WRONG_MOVE_MS);
      }
    },
    [update],
  );

  const attempt = useCallback(
    (rec: MoveRecord) => {
      const cur = stateRef.current;
      if (!cur || cur.phase !== 'thinking') return;
      const checking = beginAttempt(cur, rec);
      update(checking);
      const kind = attemptKind(checking, rec.uci);
      if (kind !== 'assess') {
        settle(resolveAttempt(checking, kind));
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      analysis
        .assessMove(checking.fenBefore, rec.uci, { signal: ctrl.signal })
        .then((a) => {
          if (ctrl.signal.aborted || stateRef.current !== checking) return;
          settle(resolveAttempt(checking, { loss: a.bestMove === rec.uci ? 0 : a.expectedPointsLoss }));
        })
        .catch(() => {
          if (ctrl.signal.aborted || stateRef.current !== checking) return;
          settle(resolveAttempt(checking, null));
        });
    },
    [analysis, settle, update],
  );

  const hint = useCallback(() => {
    const cur = stateRef.current;
    if (cur) update(nextHint(cur));
  }, [update]);

  const reveal = useCallback(() => {
    const cur = stateRef.current;
    if (!cur) return;
    clearWork();
    update(revealState(cur));
  }, [clearWork, update]);

  return { state, start, stop, attempt, hint, reveal };
}
