/**
 * Rating curve of one pool as an own SVG line chart (one series, no legend – the title names it): recessive grid,
 * 2 px line, end marker, crosshair + tooltip on hover and with the arrow keys, and a table view as fallback.
 */
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDelta, formatNumber } from '@/i18n';
import type { RatingSeries } from '@/stats';
import { STRINGS_DE } from '../strings.de';
import { linearScale, nearestIndex, niceTicks } from './scale';
import { useWidth } from './useWidth';

const HEIGHT = 200;
const M = { top: 12, right: 16, bottom: 28, left: 48 };
const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
const DATE_SHORT = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });

function pointText(p: { at: string; rating: number }): string {
  return `${DATE.format(new Date(p.at))}: ${STRINGS_DE.colRating} ${formatNumber(Math.round(p.rating))}`;
}

/** Props of `RatingChart`. */
export interface RatingChartProps {
  title: string;
  series: RatingSeries;
  emptyText: string;
  testId: string;
}

/** One rating curve with summary, chart and table. */
export function RatingChart({ title, series, emptyText, testId }: RatingChartProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const measured = useWidth(ref);
  const width = measured > 0 ? measured : 600;
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const points = series.points;

  const innerW = Math.max(10, width - M.left - M.right);
  const { domain, ticks } = niceTicks(series.min ?? 0, series.max ?? 0, 4);
  const x = linearScale([0, Math.max(1, points.length - 1)], [M.left, M.left + innerW]);
  const y = linearScale(domain, [HEIGHT - M.bottom, M.top]);
  const xs = points.map((_, i) => (points.length === 1 ? M.left + innerW / 2 : x(i)));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs[i]!.toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  const active = hover !== null ? points[hover] : undefined;
  const last = points.at(-1);

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(nearestIndex(xs, e.clientX - rect.left));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const current = hover ?? points.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, current - 1);
    else if (e.key === 'ArrowRight') next = Math.min(points.length - 1, current + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = points.length - 1;
    else if (e.key === 'Escape') {
      setHover(null);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      setHover(next);
    }
  }

  const summary =
    series.current === null ? emptyText : STRINGS_DE.chartRating(title, series.count, formatNumber(Math.round(series.current)));

  return (
    <figure className="flex min-w-0 flex-col gap-3" data-testid={testId} data-count={series.count} data-current={series.current ?? ''}>
      <figcaption className="flex flex-col gap-1">
        <span className="text-h3 text-text">{title}</span>
        {series.current !== null && (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-muted">
            <span>
              {STRINGS_DE.current}: <span className="font-semibold tabular-nums text-text">{formatNumber(Math.round(series.current))}</span>
            </span>
            <span>
              {STRINGS_DE.change}: <span className="font-semibold tabular-nums text-text">{formatDelta(series.delta)}</span>
            </span>
            {series.max !== null && (
              <span>
                {STRINGS_DE.highest}: <span className="font-semibold tabular-nums text-text">{formatNumber(Math.round(series.max))}</span>
              </span>
            )}
          </span>
        )}
      </figcaption>
      {points.length === 0 ? (
        <p className="rounded-md bg-surface-2 px-4 py-6 text-center text-body-sm text-muted">{emptyText}</p>
      ) : (
        <>
          <div
            ref={ref}
            className="relative w-full min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            tabIndex={0}
            role="slider"
            aria-label={summary}
            aria-describedby={`${id}-hint`}
            aria-valuemin={1}
            aria-valuemax={points.length}
            aria-valuenow={(hover ?? points.length - 1) + 1}
            aria-valuetext={pointText(points[hover ?? points.length - 1]!)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            <span id={`${id}-hint`} className="sr-only">
              {STRINGS_DE.ratingCurvesHint}
            </span>
            <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" className="block max-w-full touch-pan-y" onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--zz-border)" strokeWidth={1} />
                  <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={12} fill="var(--zz-text-muted)" className="tabular-nums">
                    {formatNumber(t)}
                  </text>
                </g>
              ))}
              <text x={M.left} y={HEIGHT - 8} fontSize={12} fill="var(--zz-text-muted)">
                {DATE_SHORT.format(new Date(points[0]!.at))}
              </text>
              {points.length > 1 && (
                <text x={M.left + innerW} y={HEIGHT - 8} fontSize={12} textAnchor="end" fill="var(--zz-text-muted)">
                  {DATE_SHORT.format(new Date(last!.at))}
                </text>
              )}
              <path d={path} fill="none" stroke="var(--zz-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last && <circle cx={xs.at(-1)} cy={y(last.rating)} r={4} fill="var(--zz-accent)" stroke="var(--zz-surface)" strokeWidth={2} />}
              {active && hover !== null && (
                <g aria-hidden="true">
                  <line x1={xs[hover]} x2={xs[hover]} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--zz-border-strong)" strokeWidth={1} />
                  <circle cx={xs[hover]} cy={y(active.rating)} r={5} fill="var(--zz-accent)" stroke="var(--zz-surface)" strokeWidth={2} />
                </g>
              )}
            </svg>
            {active && hover !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 rounded-md bg-surface-3 px-2 py-1 text-caption text-text shadow-2"
                style={{ left: Math.min(Math.max(0, xs[hover]! - 60), Math.max(0, width - 130)) }}
                data-testid={`${testId}-tooltip`}
              >
                <span className="block text-muted">{DATE.format(new Date(active.at))}</span>
                <span className="block font-semibold tabular-nums">
                  {STRINGS_DE.colRating}: {formatNumber(Math.round(active.rating))}
                </span>
              </div>
            )}
          </div>
          <div>
            <button
              type="button"
              aria-expanded={table}
              aria-controls={`${id}-table`}
              onClick={() => setTable((t) => !t)}
              className="min-h-11 text-body-sm font-medium text-accent-text underline-offset-4 hover:underline"
            >
              {table ? STRINGS_DE.tableToggleHide : STRINGS_DE.tableToggleShow}
            </button>
            {table && (
              <div id={`${id}-table`} className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-left text-body-sm">
                  <caption className="sr-only">{title}</caption>
                  <thead className="sticky top-0 bg-surface-2">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium text-muted">
                        {STRINGS_DE.colDate}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium text-muted">
                        {STRINGS_DE.colRating}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p, i) => (
                      <tr key={`${p.at}-${i}`} className="border-t border-border">
                        <td className="px-3 py-1.5 text-text">{DATE.format(new Date(p.at))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-text">{formatNumber(Math.round(p.rating))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </figure>
  );
}
