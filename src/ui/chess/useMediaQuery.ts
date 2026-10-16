import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches (false without `matchMedia`). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', onChange);
      return () => mq.removeEventListener?.('change', onChange);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/**
 * Scrolls `el` into view inside its nearest scrollable ancestor only (never the page – the board must stay in view on
 * phones). `axis` picks the direction.
 */
export function scrollIntoContainer(el: HTMLElement, axis: 'y' | 'x' = 'y'): void {
  let container = el.parentElement;
  while (container) {
    const style = getComputedStyle(container);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    if (overflow === 'auto' || overflow === 'scroll') break;
    container = container.parentElement;
  }
  if (!container) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (axis === 'y') {
    if (r.top < c.top) container.scrollTop -= c.top - r.top;
    else if (r.bottom > c.bottom) container.scrollTop += r.bottom - c.bottom;
  } else if (r.left < c.left) {
    container.scrollLeft -= c.left - r.left;
  } else if (r.right > c.right) {
    container.scrollLeft += r.right - c.right;
  }
}
