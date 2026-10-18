/**
 * Uniqueness rules of the solution builder with the real Node Stockfish (depth 14 to keep the test fast; production
 * uses 18).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createGeneratorEngine, findDepth } from './engine';
import { buildSolution, isFailure, type SolutionConfig } from './solution';

const engine = createGeneratorEngine('perSearch');
const config: SolutionConfig = { depth: 14, maxAdvantageMoves: 3 };

afterAll(() => engine.dispose());

describe('buildSolution (Stockfish)', () => {
  it('builds a unique mate in 2 with the best defence (smothered mate)', async () => {
    const s = await buildSolution(engine.service, '5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1', config);
    expect(isFailure(s)).toBe(false);
    if (isFailure(s)) return;
    expect(s.moves).toEqual(['c4g8', 'f8g8', 'h6f7']);
    expect(s.mateIn).toBe(2);
    expect(s.finalCp).toBeNull();
  });

  it('rejects a mate in 2 that can be reached with a second first move', async () => {
    expect(await buildSolution(engine.service, 'k7/8/2K5/8/8/8/8/1R4R1 w - - 0 1', config)).toEqual({ failed: true, reason: 'mate_not_unique' });
  });

  it('accepts a mate in 1 even with several mating moves (all are accepted at runtime)', async () => {
    const s = await buildSolution(engine.service, 'k7/8/8/8/8/8/1R6/1R4K1 w - - 0 1', config);
    expect(isFailure(s) ? s.reason : s.mateIn).toBe(1);
    if (!isFailure(s)) expect(s.moves).toHaveLength(1);
  });

  it('accepts winning a hanging queen as the only good move and stops when nothing unique follows', async () => {
    const s = await buildSolution(engine.service, '6k1/5pp1/7p/2q5/8/7P/5PP1/2R3K1 w - - 0 1', config);
    expect(isFailure(s)).toBe(false);
    if (isFailure(s)) return;
    expect(s.moves[0]).toBe('c1c5');
    expect(s.moves.length % 2).toBe(1);
    expect(s.mateIn).toBeNull();
    expect(s.finalCp).toBeGreaterThan(300);
  });

  it('rejects a capture that other moves almost match (not unique) and a balanced position (not winning)', async () => {
    expect(await buildSolution(engine.service, '6k1/5pp1/7p/2b5/8/7P/5PP1/2R3K1 w - - 0 1', config)).toEqual({ failed: true, reason: 'not_unique' });
    expect(await buildSolution(engine.service, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', config)).toEqual({ failed: true, reason: 'not_winning' });
  });
});

describe('findDepth', () => {
  it('is the first depth from which the final move stayed best', () => {
    expect(findDepth([[1, 'a2a3'], [2, 'e2e4'], [3, 'e2e4']], 'e2e4')).toBe(2);
    expect(findDepth([[1, 'e2e4'], [2, 'e2e4']], 'e2e4')).toBe(1);
    expect(findDepth([[1, 'e2e4'], [2, 'd2d4'], [3, 'e2e4']], 'e2e4')).toBe(3);
    expect(findDepth([], 'e2e4')).toBe(1);
  });
});
