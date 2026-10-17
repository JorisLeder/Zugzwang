import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { aggregate, checkCriteria, lossClass, moveLoss, renderReport, spread, type BotStats, type MoveSample } from './calibration';

/** Statistics of a fictitious bot (only the fields the checks read matter). */
function stats(elo: number, meanLoss: number, shares: Partial<BotStats['shares']> = {}, extra: Partial<BotStats> = {}): BotStats {
  return {
    id: `bot-${elo}`,
    name: `Bot ${elo}`,
    elo,
    engine: elo < 800 ? 'stockfish-skill' : elo <= 2000 ? 'stockfish-human' : 'stockfish-elo',
    positions: 200,
    meanLoss,
    shares: { best: 0.5, excellent: 0.1, good: 0.1, inaccuracy: 0.1, mistake: 0.1, blunder: 0.05, ...shares },
    compute: { mean: 300, p95: 600, max: 800 },
    think: { min: 1000, mean: 2500, max: 6000 },
    ...extra,
  };
}

const byId = (results: ReturnType<typeof checkCriteria>, id: string) => results.find((r) => r.id === id)!;

describe('loss classes (D-07 thresholds)', () => {
  it('uses the exclusive/inclusive boundaries of D-07', () => {
    expect(lossClass(0.0049, false)).toBe('best');
    expect(lossClass(0.005, false)).toBe('excellent');
    expect(lossClass(0.02, false)).toBe('excellent');
    expect(lossClass(0.0201, false)).toBe('good');
    expect(lossClass(0.05, false)).toBe('good');
    expect(lossClass(0.1, false)).toBe('inaccuracy');
    expect(lossClass(0.1999, false)).toBe('mistake');
    expect(lossClass(0.2, false)).toBe('blunder');
    // The reference engine's own best move is always "best".
    expect(lossClass(0.3, true)).toBe('best');
  });
});

describe('moveLoss', () => {
  it('is 0 for the reference best move and the win% difference otherwise (mover POV)', () => {
    const before = { bestMove: 'e2e4', score: { type: 'cp' as const, value: 30 } };
    expect(moveLoss(START_FEN, 'e2e4', before, null)).toEqual({ loss: 0, isBest: true });
    // White POV −100 after 1.g4: win% 52.8 → 40.9 for White.
    const r = moveLoss(START_FEN, 'g2g4', before, { bestMove: null, score: { type: 'cp', value: -100 } });
    expect(r.isBest).toBe(false);
    expect(r.loss).toBeCloseTo(0.1186, 3);
  });

  it('scores finished positions by the rules: checkmate keeps the win, stalemate is a draw', () => {
    // Fool's mate: 2…Qh4# – the reference prefers another mate, but Qh4 mates too → no loss.
    const fools = 'rnbqkbnr/pppp1ppp/8/4p3/5PP1/8/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    expect(moveLoss(fools, 'd8h4', { bestMove: 'f8c5', score: { type: 'mate', value: -1 } }, null).loss).toBe(0);
    // White wins easily but Qb6 stalemates the black king on a8 → about half a point lost.
    const stale = 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1';
    const r = moveLoss(stale, 'b1b6', { bestMove: 'b1b7', score: { type: 'mate', value: 1 } }, null);
    expect(r.loss).toBeCloseTo(0.5, 1);
  });

  it('rejects illegal moves and missing evaluations', () => {
    const before = { bestMove: 'e2e4', score: { type: 'cp' as const, value: 30 } };
    expect(() => moveLoss(START_FEN, 'e2e5', before, null)).toThrow(/Illegal/);
    expect(() => moveLoss(START_FEN, 'd2d4', before, null)).toThrow(/Missing reference/);
  });
});

describe('aggregate', () => {
  it('computes mean loss, class shares, compute and think statistics', () => {
    const sample = (loss: number, isBest: boolean, computeMs: number, thinkTimeMs: number): MoveSample => ({
      positionId: 'p',
      fen: START_FEN,
      uci: 'e2e4',
      source: 'human-model',
      computeMs,
      thinkTimeMs,
      loss,
      isBest,
    });
    const s = aggregate({ id: 'x', name: 'X', elo: 1000, engine: 'stockfish-human' }, [
      sample(0, true, 100, 1000),
      sample(0.08, false, 300, 3000),
      sample(0.15, false, 500, 2000),
      sample(0.25, false, 900, 7000),
    ]);
    expect(s.positions).toBe(4);
    expect(s.meanLoss).toBeCloseTo(0.12, 6);
    expect(s.shares).toMatchObject({ best: 0.25, inaccuracy: 0.25, mistake: 0.25, blunder: 0.25 });
    expect(s.compute).toEqual({ mean: 450, p95: 900, max: 900 });
    expect(s.think).toEqual({ min: 1000, mean: 3250, max: 7000 });
  });
});

describe('acceptance checks (criteria 2 and 3)', () => {
  const good = [stats(100, 0.3), stats(700, 0.1), stats(1000, 0.05), stats(2000, 0.02), stats(2500, 0.01)];

  it('passes for a well-ordered roster', () => {
    const r = checkCriteria(good);
    expect(r.map((c) => c.id)).toEqual(['2a', '2b', '2c', '3a', '3b']);
    expect(r.every((c) => c.pass)).toBe(true);
  });

  it('2a: the mean loss must fall strictly with Elo (ties fail too)', () => {
    const r = checkCriteria([stats(1000, 0.05), stats(1200, 0.05), stats(1400, 0.06)]);
    expect(byId(r, '2a').pass).toBe(false);
    expect(byId(r, '2a').detail).toContain('Bot 1200 (1200)');
    expect(byId(r, '2a').detail).toContain('Bot 1400 (1400)');
  });

  it('2b/2c: error ratio and best-move share are checked for the 800–2000 bots only', () => {
    const r = checkCriteria([
      stats(500, 0.2, { best: 0.1, inaccuracy: 0.05, mistake: 0.05, blunder: 0.4 }),
      stats(1000, 0.05, { inaccuracy: 0.1, mistake: 0.05, blunder: 0.08 }),
      stats(1600, 0.03, { best: 0.8 }),
      stats(2200, 0.02, { best: 0.9 }),
    ]);
    expect(byId(r, '2b').pass).toBe(false);
    expect(byId(r, '2b').detail).toBe('fails for Bot 1000');
    expect(byId(r, '2c').pass).toBe(false);
    expect(byId(r, '2c').detail).toContain('Bot 1600 (80.0 %)');
    expect(byId(r, '2c').detail).not.toContain('Bot 2200');
  });

  it('3a/3b: compute time ≤ 1 s and think time within 1–8 s', () => {
    const r = checkCriteria([
      stats(1000, 0.05, {}, { compute: { mean: 500, p95: 900, max: 1001 } }),
      stats(1200, 0.04, {}, { think: { min: 500, mean: 2000, max: 3000 } }),
    ]);
    expect(byId(r, '3a').pass).toBe(false);
    expect(byId(r, '3a').detail).toContain('Bot 1000 (1001 ms)');
    expect(byId(r, '3b').pass).toBe(false);
    expect(byId(r, '3b').detail).toContain('Bot 1200');
  });
});

describe('report and helpers', () => {
  it('spread picks evenly spaced items deterministically', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(spread(items, 5)).toEqual([0, 2, 4, 6, 8]);
    expect(spread(items, undefined)).toBe(items);
    expect(spread(items, 20)).toBe(items);
  });

  it('renders the result table, the checks and the overall verdict', () => {
    const list = [stats(100, 0.3), stats(1000, 0.05)];
    const md = renderReport(list, checkCriteria(list), {
      date: '2026-10-17',
      positions: 200,
      games: ['a', 'b'],
      referenceDepth: 14,
      engineId: 'stockfish-test',
      seed: 1,
      durationSec: 60,
      parameters: ['p1'],
      notes: ['n1'],
    });
    expect(md).toContain('# Bot calibration');
    expect(md).toContain('**Result: all acceptance checks pass.**');
    expect(md).toContain('| Bot 1000 | 1000 | stockfish-human | 200 | 0.0500 | 50.0 % |');
    expect(md).toContain('| 2a | Mean expected-points loss strictly decreasing with Elo | pass |');
    expect(md).toContain('- p1');
    expect(md).toContain('- n1');
    const failing = [stats(100, 0.01), stats(1000, 0.05)];
    expect(renderReport(failing, checkCriteria(failing), { date: '', positions: 0, games: [], referenceDepth: 14, engineId: '', seed: 1, durationSec: 0, parameters: [] })).toContain(
      'SOME CHECKS FAIL',
    );
  });
});
