/**
 * DOM helpers of the board: measured width (badges need pixel sizes; animations need a laid-out board) and the
 * accessibility clean-up of react-chessboard's drag-and-drop layer.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/** Width of the element in px (0 before layout and in jsdom). */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref]);
  return width;
}

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/**
 * react-chessboard wraps every piece in a dnd-kit draggable (`role="button"`, `tabindex="0"`, English instructions and
 * an English live region). The board is one tab stop with its own German keyboard model and announcements, so the
 * pieces are not focusable at all (a click focuses the board) and the dnd-kit texts are hidden from assistive technology.
 */
export function useDndAccessibilityFix(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    const fix = () => {
      root.querySelectorAll('[aria-roledescription="draggable"]').forEach((el) => {
        if (el.hasAttribute('tabindex')) el.removeAttribute('tabindex');
        setAttr(el, 'aria-hidden', 'true');
      });
      root.querySelectorAll('[id^="DndLiveRegion"], [id^="DndDescribedBy"]').forEach((el) => setAttr(el, 'aria-hidden', 'true'));
    };
    fix();
    const observer = new MutationObserver(fix);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'aria-hidden'] });
    return () => observer.disconnect();
  }, [ref]);
}
