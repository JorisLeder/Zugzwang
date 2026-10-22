import { describe, expect, it } from 'vitest';
import { quizOptionOrder, shuffleSeeded } from './quizOrder';

const OPTIONS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('quiz option order', () => {
  it('is a permutation and keeps the input untouched', () => {
    const out = quizOptionOrder(OPTIONS, 'step', 'seed');
    expect([...out].map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(OPTIONS.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is stable for one step and seed (re-renders keep the order)', () => {
    expect(quizOptionOrder(OPTIONS, 'step', 'run-1')).toEqual(quizOptionOrder(OPTIONS, 'step', 'run-1'));
  });

  it('does not keep the correct first option first: every position gets used across steps and seeds', () => {
    const first = new Set<string>();
    for (let i = 0; i < 80; i++) first.add(quizOptionOrder(OPTIONS, `step-${i}`, 'v')[0]!.id);
    expect(first.size).toBe(4);
    let firstStays = 0;
    for (let i = 0; i < 400; i++) if (quizOptionOrder(OPTIONS, `s${i}`, 'v')[0]!.id === 'a') firstStays++;
    expect(firstStays).toBeGreaterThan(40);
    expect(firstStays).toBeLessThan(180); // about a quarter, not always
  });

  it('can differ between runs of the same step', () => {
    const orders = new Set<string>();
    for (let run = 0; run < 30; run++) orders.add(quizOptionOrder(OPTIONS, 'step', `v-${run}`).map((o) => o.id).join(''));
    expect(orders.size).toBeGreaterThan(5);
  });

  it('handles empty and single lists', () => {
    expect(shuffleSeeded([], 'x')).toEqual([]);
    expect(shuffleSeeded([1], 'x')).toEqual([1]);
  });
});
