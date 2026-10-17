import { describe, expect, it } from 'vitest';
import { ActiveTimeCounter } from './activity';

function counter(visible = { v: true }) {
  let t = 0;
  const minutes: number[] = [];
  const c = new ActiveTimeCounter({ now: () => t, isVisible: () => visible.v, onMinute: () => minutes.push(t), tickMs: 5000 });
  const advance = (ms: number, interact = false) => {
    for (let x = 0; x < ms; x += 5000) {
      t += 5000;
      if (interact) c.interact();
      c.tick();
    }
  };
  return { c, minutes, advance, visible };
}

describe('ActiveTimeCounter', () => {
  it('counts minutes while visible and the user interacted within the last 60 s', () => {
    const { c, minutes, advance } = counter();
    c.interact();
    advance(60_000); // the interaction at t=0 covers the first 60 s
    expect(minutes).toHaveLength(1);
    advance(30_000); // idle > 60 s → nothing more counts
    expect(minutes).toHaveLength(1);
    expect(c.partialMs).toBe(0);
    advance(60_000, true);
    expect(minutes).toHaveLength(2);
  });

  it('does not count while the tab is hidden', () => {
    const { minutes, advance, visible } = counter();
    visible.v = false;
    advance(120_000, true);
    expect(minutes).toHaveLength(0);
    visible.v = true;
    advance(60_000, true);
    expect(minutes).toHaveLength(1);
  });

  it('a long gap between ticks (throttled timer, sleep) counts at most two ticks', () => {
    let t = 0;
    const minutes: number[] = [];
    const c = new ActiveTimeCounter({ now: () => t, isVisible: () => true, onMinute: () => minutes.push(t), tickMs: 5000 });
    c.interact();
    t = 3_600_000;
    c.interact();
    c.tick();
    expect(c.partialMs).toBe(10_000);
    expect(minutes).toHaveLength(0);
    c.resume();
    expect(c.partialMs).toBe(10_000);
  });
});
