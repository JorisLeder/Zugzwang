/**
 * ActivityTracker: counts active minutes into daily activity. A second counts while the tab is visible and the user
 * interacted (pointer, key, wheel, touch, scroll) within the last 60 s. Several pages tracking at once share one
 * counter (reference counted), so time is never counted twice.
 */
import { useEffect } from 'react';
import type { ActivityTracker } from '@/core/storage';

/** Options of `ActiveTimeCounter`. */
export interface ActiveTimeOptions {
  /** Called for each full active minute. */
  onMinute(): void;
  now?: () => number;
  isVisible?: () => boolean;
  /** Inactivity after which time stops counting (default 60 s). */
  idleMs?: number;
  /** Tick interval (default 5 s); a longer gap between ticks counts at most two ticks (throttled timers). */
  tickMs?: number;
}

/** Pure counter of active time (driven by `interact()` and `tick()`). */
export class ActiveTimeCounter {
  private readonly now: () => number;
  private readonly isVisible: () => boolean;
  private readonly idleMs: number;
  private readonly tickMs: number;
  private readonly onMinute: () => void;
  private lastInteraction = -Infinity;
  private lastTick: number;
  private activeMs = 0;

  constructor(opts: ActiveTimeOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.isVisible = opts.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
    this.idleMs = opts.idleMs ?? 60_000;
    this.tickMs = opts.tickMs ?? 5_000;
    this.onMinute = opts.onMinute;
    this.lastTick = this.now();
  }

  /** Interval of the driving timer. */
  get interval(): number {
    return this.tickMs;
  }

  /** The user interacted now. */
  interact(): void {
    this.lastInteraction = this.now();
  }

  /** Restarts the tick clock without counting (e.g. when the tab becomes visible again). */
  resume(): void {
    this.lastTick = this.now();
  }

  /** Counts the time since the last tick if the user was active. */
  tick(): void {
    const t = this.now();
    const dt = Math.max(0, Math.min(t - this.lastTick, this.tickMs * 2));
    this.lastTick = t;
    if (!this.isVisible() || t - this.lastInteraction > this.idleMs) return;
    this.activeMs += dt;
    while (this.activeMs >= 60_000) {
      this.activeMs -= 60_000;
      this.onMinute();
    }
  }

  /** Active milliseconds not yet counted as a minute. */
  get partialMs(): number {
    return this.activeMs;
  }
}

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/** Creates the tracker; `addMinutes` persists minutes (daily activity + outbox). */
export function createActivityTracker(addMinutes: (minutes: number) => Promise<void>, opts: Partial<ActiveTimeOptions> = {}): ActivityTracker {
  let refs = 0;
  let stopGlobal: (() => void) | null = null;
  const counter = new ActiveTimeCounter({
    ...opts,
    onMinute: () => {
      addMinutes(1).catch((e) => console.warn('ActivityTracker: saving active minutes failed', e));
    },
  });

  function startGlobal(): () => void {
    if (typeof window === 'undefined') return () => {};
    const onInteract = () => counter.interact();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') counter.tick();
      else counter.resume();
    };
    for (const ev of INTERACTION_EVENTS) window.addEventListener(ev, onInteract, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    counter.resume();
    counter.interact(); // opening a training page counts as interaction
    const timer = setInterval(() => counter.tick(), counter.interval);
    return () => {
      counter.tick();
      clearInterval(timer);
      for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, onInteract, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  function acquire(): () => void {
    refs += 1;
    if (refs === 1) stopGlobal = startGlobal();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      refs -= 1;
      if (refs === 0) {
        stopGlobal?.();
        stopGlobal = null;
      }
    };
  }

  return {
    useTracking(_area) {
      useEffect(() => acquire(), []);
    },
  };
}
