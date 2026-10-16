/** The Node engine helper for scripts runs a real Stockfish "go depth 10". */
import { afterAll, describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { analysePosition, disposeSharedEngine, withEngine } from './engine';

afterAll(() => disposeSharedEngine());

describe('scripts/lib/engine', () => {
  it('analyses the start position with go depth 10', async () => {
    const a = await analysePosition(START_FEN, 10);
    expect(a.depth).toBeGreaterThanOrEqual(10);
    expect(a.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
  });

  it('finds mate in one with a fresh engine', async () => {
    const best = await withEngine(async (e) => (await e.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 10 })).bestMove);
    expect(best).toBe('d1d8');
  });
});
