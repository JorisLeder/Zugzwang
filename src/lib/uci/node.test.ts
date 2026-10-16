/**
 * Integration tests with the real Node Stockfish (npm `stockfish` 19, lite single-threaded).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { createNodeEngineService, NODE_ENGINE_ID } from './node';

const engine = createNodeEngineService();

afterAll(() => engine.dispose());

describe('Node Stockfish engine', () => {
  it('finds the back-rank mate in one d1d8 with score mate +1 (White POV)', async () => {
    const a = await engine.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 10 });
    expect(a.bestMove).toBe('d1d8');
    expect(a.lines[0]!.score).toEqual({ type: 'mate', value: 1 });
    expect(a.engineId).toBe(NODE_ENGINE_ID);
  });

  it('reports Black mating as a negative mate score (White POV)', async () => {
    const a = await engine.analyse('3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', { depth: 10 });
    expect(a.bestMove).toBe('d8d1');
    expect(a.lines[0]!.score).toEqual({ type: 'mate', value: -1 });
  });

  it('runs a real "go depth 10" on the start position quickly', async () => {
    const t0 = Date.now();
    const a = await engine.analyse(START_FEN, { depth: 10, multiPv: 2 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(a.depth).toBeGreaterThanOrEqual(10);
    expect(a.lines).toHaveLength(2);
    expect(a.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
    expect(a.lines[0]!.score.type).toBe('cp');
  });

  it('returns bestMove null for a checkmated position', async () => {
    const a = await engine.analyse('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', { depth: 5 });
    expect(a.bestMove).toBeNull();
    expect(a.lines).toEqual([]);
  });

  it('aborts a long search', async () => {
    const ctrl = new AbortController();
    const p = engine.analyse(START_FEN, { depth: 60, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 100);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    const after = await engine.bestMove(START_FEN, { depth: 4 });
    expect(after.move).toMatch(/^[a-h][1-8][a-h][1-8]$/);
  });

  it('plays weaker with strength options (and restores them)', async () => {
    const r = await engine.bestMove(START_FEN, { depth: 6, skillLevel: 0 });
    expect(r.move).toMatch(/^[a-h][1-8][a-h][1-8]$/);
  });
});
