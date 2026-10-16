import { describe, expect, it, vi } from 'vitest';
import { cn } from './cn';
import { newId } from './ids';
import { constant, createValueStore, fromObservable, mapSubscribable } from './observable';
import { addDays, localDateKey } from './time';

describe('ids', () => {
  it('creates distinct UUIDs', () => {
    const a = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe(a);
  });
});

describe('time', () => {
  it('localDateKey respects the time zone', () => {
    const d = new Date('2026-10-16T23:30:00Z');
    expect(localDateKey(d, 'UTC')).toBe('2026-10-16');
    expect(localDateKey(d, 'Europe/Berlin')).toBe('2026-10-17');
    expect(localDateKey(d, 'America/Los_Angeles')).toBe('2026-10-16');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('observable', () => {
  it('value store emits current value and updates', () => {
    const s = createValueStore(1);
    const seen: number[] = [];
    const off = s.subscribe((v) => seen.push(v));
    s.set(2);
    s.update((v) => v + 1);
    off();
    s.set(9);
    expect(seen).toEqual([1, 2, 3]);
    expect(s.get()).toBe(9);
  });

  it('mapSubscribable, constant and fromObservable', () => {
    const s = createValueStore(2);
    const seen: string[] = [];
    mapSubscribable(s, (v) => `#${v}`).subscribe((v) => seen.push(v));
    constant('x').subscribe((v) => seen.push(v));
    const unsubscribe = vi.fn();
    const obs = { subscribe: (next: (v: string) => void) => (next('dexie'), { unsubscribe }) };
    const off = fromObservable(obs).subscribe((v) => seen.push(v));
    off();
    expect(seen).toEqual(['#2', 'x', 'dexie']);
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('cn', () => {
  it('merges classes and keeps font-size tokens next to colour tokens', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-body', 'text-muted')).toBe('text-body text-muted');
    expect(cn('text-muted', 'text-text')).toBe('text-text');
    expect(cn('text-h1', 'text-h2')).toBe('text-h2');
    const off = Math.random() > 2;
    expect(cn('a', off && 'b', undefined, 'c')).toBe('a c');
  });
});
