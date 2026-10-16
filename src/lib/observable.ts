/**
 * Small reactive helpers around the `Subscribable` contract (`@/core/storage`). Frozen (WP-00).
 */
import { useEffect, useState } from 'react';
import type { Subscribable } from '@/core/storage';

/** A writable value that implements `Subscribable` (emits the current value on subscribe). */
export interface ValueStore<T> extends Subscribable<T> {
  get(): T;
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

/** Creates a `ValueStore`. Subscribers are called synchronously with the current value and after every `set`. */
export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const l of [...listeners]) l(value);
    },
    update(fn) {
      this.set(fn(value));
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(value);
      return () => listeners.delete(cb);
    },
  };
}

/** Derives a `Subscribable` by mapping another one. */
export function mapSubscribable<T, U>(source: Subscribable<T>, fn: (value: T) => U): Subscribable<U> {
  return { subscribe: (cb) => source.subscribe((v) => cb(fn(v))) };
}

/**
 * Adapts an observable with `subscribe(next, error?)` returning `{ unsubscribe() }` – e.g. Dexie `liveQuery`,
 * RxJS, Supabase channels – to the `Subscribable` contract.
 */
export function fromObservable<T>(
  observable: { subscribe(next: (value: T) => void, error?: (err: unknown) => void): { unsubscribe(): void } },
  onError: (err: unknown) => void = (err) => console.error(err),
): Subscribable<T> {
  return {
    subscribe(cb) {
      const sub = observable.subscribe(cb, onError);
      return () => sub.unsubscribe();
    },
  };
}

/** Wraps a fixed value as `Subscribable`. */
export function constant<T>(value: T): Subscribable<T> {
  return { subscribe: (cb) => (cb(value), () => {}) };
}

/**
 * React hook: current value of a `Subscribable`; `initial` until the first emission. Resubscribes when `source`
 * changes (memoise it, e.g. with `useMemo`). `null`/`undefined` sources return `initial`.
 */
export function useSubscribable<T>(source: Subscribable<T> | null | undefined, initial: T): T {
  const [state, setState] = useState<{ source: typeof source; value: T }>({ source, value: initial });
  useEffect(() => {
    if (!source) return undefined;
    return source.subscribe((value) => setState({ source, value }));
  }, [source]);
  // A new source shows `initial` until it emits (no stale value from the previous source).
  return state.source === source ? state.value : initial;
}
