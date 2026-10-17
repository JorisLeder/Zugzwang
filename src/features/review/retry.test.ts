import { describe, expect, it } from 'vitest';
import type { AnalysedMove } from '@/core/analysis';
import { START_FEN } from '@/core/chess';
import { FakeAnalysisService, FIXTURE_GAME, FIXTURE_GAME_ANALYSIS_SCRIPT } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import {
  afterWrong,
  attemptKind,
  beginAttempt,
  MAX_TRIES,
  nextHint,
  resolveAttempt,
  retryDone,
  retryFen,
  retryMarks,
  reveal,
  startRetry,
  SUCCESS_LOSS,
  triesLeft,
  type RetryState,
} from './retry';

async function blunder(): Promise<AnalysedMove> {
  const a = await new FakeAnalysisService({ moves: FIXTURE_GAME_ANALYSIS_SCRIPT }).analyseGame({
    gameId: 'g',
    startFen: START_FEN,
    moves: FIXTURE_GAME.moves,
  });
  return a.moves[FIXTURE_GAME.blunder.ply - 1]!;
}

function play(state: RetryState, uci: string) {
  const rec = ChessGame.fromFen(state.fenBefore).move(uci)!;
  return beginAttempt(state, rec);
}

describe('Nochmal versuchen (state machine)', () => {
  it('starts at the position before the blunder with the rook as hint piece', async () => {
    const s = startRetry(await blunder())!;
    expect(s.fenBefore).toBe(FIXTURE_GAME.blunder.fenBefore);
    expect(s.mover).toBe('w');
    expect([s.hintPiece, s.hintFrom, s.hintTo]).toEqual(['r', 'f1', 'f2']);
    expect(retryFen(s)).toBe(FIXTURE_GAME.blunder.fenBefore);
    expect(retryMarks(s)).toEqual([]);
  });

  it('cannot retry a move that was the best move', async () => {
    const m = await blunder();
    expect(startRetry({ ...m, bestMove: m.uci })).toBeNull();
  });

  it('success path: the engine move succeeds at once', async () => {
    let s = startRetry(await blunder())!;
    s = play(s, 'f1f2');
    expect(s.phase).toBe('checking');
    expect(retryFen(s)).not.toBe(FIXTURE_GAME.blunder.fenBefore);
    expect(attemptKind(s, 'f1f2')).toBe('best');
    s = resolveAttempt(s, 'best');
    expect(s.phase).toBe('success');
    expect(s.alternative).toBe(false);
    expect(retryDone(s)).toBe(true);
    expect(reveal(s).phase).toBe('success');
  });

  it(`another move succeeds when it loses at most ${SUCCESS_LOSS}`, async () => {
    let s = play(startRetry(await blunder())!, 'b4b5');
    expect(attemptKind(s, 'b4b5')).toBe('assess');
    s = resolveAttempt(s, { loss: SUCCESS_LOSS });
    expect(s).toMatchObject({ phase: 'success', alternative: true });
  });

  it('reveal path: three wrong tries reveal the better move; the played move fails at once', async () => {
    let s = startRetry(await blunder())!;
    for (let i = 1; i <= MAX_TRIES; i++) {
      s = play(s, 'd1c2');
      expect(attemptKind(s, 'd1c2')).toBe('played');
      s = resolveAttempt(s, 'played');
      expect(s.phase).toBe('wrong');
      expect(s.tries).toBe(i);
      s = afterWrong(s);
      expect(s.attempt).toBeNull();
      if (i < MAX_TRIES) {
        expect(s.phase).toBe('thinking');
        expect(triesLeft(s)).toBe(MAX_TRIES - i);
      }
    }
    expect(s.phase).toBe('revealed');
  });

  it('a move losing more than the threshold is wrong; an engine failure does not count as a try', async () => {
    let s = play(startRetry(await blunder())!, 'a4a5');
    s = resolveAttempt(s, { loss: 0.3 });
    expect(s).toMatchObject({ phase: 'wrong', tries: 1 });
    s = play(afterWrong(s), 'a4a5');
    s = resolveAttempt(s, null);
    expect(s).toMatchObject({ phase: 'thinking', tries: 1, checkFailed: true, attempt: null });
  });

  it('hint stages: piece, target square, then the reveal', async () => {
    let s = startRetry(await blunder())!;
    s = nextHint(s);
    expect(retryMarks(s)).toEqual([{ square: 'f1', kind: 'hint-piece' }]);
    s = nextHint(s);
    expect(retryMarks(s)).toEqual([
      { square: 'f1', kind: 'hint-piece' },
      { square: 'f2', kind: 'hint-target' },
    ]);
    s = nextHint(s);
    expect(s.phase).toBe('revealed');
    expect(retryMarks(s)).toEqual([]);
  });
});
