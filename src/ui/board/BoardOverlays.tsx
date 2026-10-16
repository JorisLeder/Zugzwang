/**
 * Overlays drawn above the pieces: arrows (programmatic and right-drag), classification/feedback badges and the
 * keyboard cursor. All are `pointer-events: none` and hidden from assistive technology (the squares carry the
 * accessible names; badges are described in the move list and panel).
 */
import { Check, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { MoveClassification } from '@/core/analysis';
import type { Square } from '@/core/chess';
import { ClassificationBadge } from '@/ui/primitives';
import { ARROW_VIEWBOX, arrowPolygon, badgeBox, squareGeometry, type Orientation } from './boardLogic';

/** One arrow to draw. `colorVar` is a board token (`--zz-arrow-best` …). */
export interface OverlayArrow {
  from: Square;
  to: Square;
  colorVar: string;
  /** `program` (props) or `user` (right drag) – exposed as `data-arrow-source` for tests. */
  source: 'program' | 'user' | 'preview';
  /** Arrow kind or user colour – exposed as `data-arrow-kind`. */
  kind: string;
}

/** SVG arrow layer (DESIGN §2.2 geometry). */
export function BoardArrows({ arrows, orientation }: { arrows: OverlayArrow[]; orientation: Orientation }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${ARROW_VIEWBOX} ${ARROW_VIEWBOX}`}
      className="pointer-events-none absolute inset-0 z-20 size-full"
      data-testid="board-arrows"
    >
      {arrows.map((a) => {
        const points = arrowPolygon(a.from, a.to, orientation);
        if (!points) return null;
        return (
          <polygon
            key={`${a.source}-${a.from}-${a.to}`}
            points={points}
            data-arrow={`${a.from}-${a.to}`}
            data-arrow-source={a.source}
            data-arrow-kind={a.kind}
            style={{ fill: `var(${a.colorVar})`, opacity: a.source === 'preview' ? 0.7 : 1 }}
          />
        );
      })}
    </svg>
  );
}

function usePopIn(animate: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!animate || !el || typeof el.animate !== 'function') return;
    el.animate([{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  }, [animate]);
  return ref;
}

/** Classification badge at the destination square (DESIGN §4.5). */
export function AnnotationBadge({
  square,
  classification,
  orientation,
  boardPx,
  animate,
}: {
  square: Square;
  classification: MoveClassification;
  orientation: Orientation;
  boardPx: number;
  animate: boolean;
}) {
  const ref = usePopIn(animate);
  const box = badgeBox(square, orientation, boardPx);
  return (
    <span
      ref={ref}
      data-annotation={square}
      className="pointer-events-none absolute z-[21] rounded-full shadow-1 ring-2 ring-white"
      style={{ left: box.left, top: box.top, width: box.size, height: box.size }}
    >
      <ClassificationBadge classification={classification} size={box.size} />
    </span>
  );
}

/** Correct/wrong badge after a puzzle or lesson move (DESIGN §4.4): check or X, never colour alone. */
export function FeedbackBadge({
  square,
  result,
  label,
  orientation,
  boardPx,
  animate,
}: {
  square: Square;
  result: 'correct' | 'wrong';
  label: string;
  orientation: Orientation;
  boardPx: number;
  animate: boolean;
}) {
  const ref = usePopIn(animate);
  const box = badgeBox(square, orientation, boardPx);
  const Icon = result === 'correct' ? Check : X;
  return (
    <span
      ref={ref}
      role="img"
      aria-label={label}
      data-feedback={result}
      className="pointer-events-none absolute z-[21] inline-flex items-center justify-center rounded-full shadow-1 ring-2 ring-white"
      style={{
        left: box.left,
        top: box.top,
        width: box.size,
        height: box.size,
        backgroundColor: `var(${result === 'correct' ? '--zz-cls-best' : '--zz-cls-blunder'})`,
        color: `var(${result === 'correct' ? '--zz-cls-best-ink' : '--zz-cls-blunder-ink'})`,
      }}
    >
      <Icon aria-hidden="true" width={Math.round(box.size * 0.66)} height={Math.round(box.size * 0.66)} strokeWidth={3} />
    </span>
  );
}

/** Two-tone inset keyboard cursor (DESIGN §4.4/§7.2). */
export function KeyboardCursor({ square, orientation }: { square: Square; orientation: Orientation }) {
  const { col, row } = squareGeometry(square, orientation);
  return (
    <span
      aria-hidden="true"
      data-testid="board-cursor"
      data-square-cursor={square}
      className="pointer-events-none absolute z-[22]"
      style={{
        left: `${col * 12.5}%`,
        top: `${row * 12.5}%`,
        width: '12.5%',
        height: '12.5%',
        boxShadow: 'inset 0 0 0 3px var(--zz-board-focus-dark), inset 0 0 0 5px var(--zz-board-focus-light)',
      }}
    />
  );
}
