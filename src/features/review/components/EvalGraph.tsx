import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { CLASSIFICATION_META, type GameAnalysis } from '@/core/analysis';
import type { MoveRecord, Notation } from '@/core/chess';
import { formatPercent } from '@/i18n';
import { formatSan } from '@/lib/chess';
import { GRAPH_HEIGHT, GRAPH_WIDTH, graphGeometry, plyAtX, plyX } from '../evalGraph';
import { isBadMove, moveNumberText } from '../review';
import { STRINGS_DE } from '../strings.de';

/** Props of `EvalGraph`. */
export interface EvalGraphProps {
  analysis: GameAnalysis;
  moves: MoveRecord[];
  ply: number;
  onSelectPly: (ply: number) => void;
  notation: Notation;
}

/**
 * Evaluation graph (P0-10): White's win percentage per ply as an own SVG (White's share from the bottom). Click or
 * tap jumps to a ply; the graph is a focusable slider (←/→, Pos1/Ende, Bild↑/↓ = 5 plies). Mistakes, misses and
 * blunders are dots in their category colour. A table with the same values is the alternative for screen readers.
 */
export function EvalGraph({ analysis, moves, ply, onSelectPly, notation }: EvalGraphProps) {
  const geo = graphGeometry(analysis.evalGraph);
  const svgRef = useRef<SVGSVGElement>(null);
  const tableId = useId();
  const maxPly = geo.maxPly;
  const label = (p: number) => {
    const pct = formatPercent(geo.points.find((x) => x.ply === p)?.winPctWhite ?? 50, 1);
    const m = moves[p - 1];
    return STRINGS_DE.graphValue(m ? moveNumberText(m, formatSan(m.san, notation)) : STRINGS_DE.graphStart, pct);
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSelectPly(plyAtX(((e.clientX - rect.left) / rect.width) * GRAPH_WIDTH, maxPly));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = { ArrowLeft: ply - 1, ArrowDown: ply - 1, ArrowRight: ply + 1, ArrowUp: ply + 1, Home: 0, End: maxPly, PageUp: ply + 5, PageDown: ply - 5 }[
      e.key
    ];
    if (target === undefined) return;
    e.preventDefault();
    onSelectPly(Math.max(0, Math.min(maxPly, target)));
  };

  const markers = analysis.moves.filter((m) => isBadMove(m.classification));
  const cursorX = plyX(Math.min(ply, maxPly), maxPly);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label={STRINGS_DE.graphLabel}
        aria-valuemin={0}
        aria-valuemax={maxPly}
        aria-valuenow={Math.min(ply, maxPly)}
        aria-valuetext={label(Math.min(ply, maxPly))}
        aria-describedby={tableId}
        onKeyDown={onKey}
        data-testid="eval-graph"
        className="rounded-md"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-28 w-full cursor-pointer touch-none overflow-hidden rounded-md"
          aria-hidden="true"
          onPointerDown={onPointer}
        >
          <rect x={0} y={0} width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="var(--zz-eval-black)" />
          {geo.area && <path d={geo.area} fill="var(--zz-eval-white)" />}
          <line x1={0} x2={GRAPH_WIDTH} y1={GRAPH_HEIGHT / 2} y2={GRAPH_HEIGHT / 2} stroke="var(--zz-text-muted)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {geo.line && <path d={geo.line} fill="none" stroke="var(--zz-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          <line x1={cursorX} x2={cursorX} y1={0} y2={GRAPH_HEIGHT} stroke="var(--zz-focus)" strokeWidth={2} vectorEffect="non-scaling-stroke" data-testid="eval-graph-cursor" />
          {markers.map((m) => {
            const pt = geo.points.find((p) => p.ply === m.ply);
            if (!pt) return null;
            return (
              <circle
                key={m.ply}
                cx={pt.x}
                cy={pt.y}
                r={4}
                fill={`var(${CLASSIFICATION_META[m.classification].fillVar})`}
                stroke="var(--zz-bg)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                data-classification={m.classification}
              />
            );
          })}
        </svg>
      </div>
      <details id={tableId} className="text-body-sm text-muted">
        <summary className="cursor-pointer select-none py-1 hover:text-text pointer-coarse:py-3">{STRINGS_DE.graphTable}</summary>
        <div className="max-h-64 overflow-y-auto">
          <table className="mt-2 w-full border-collapse text-left tabular-nums">
            <caption className="sr-only">{STRINGS_DE.graphTableCaption}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-1 pr-2 font-medium">
                  {STRINGS_DE.graphColMove}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {STRINGS_DE.graphColWhite}
                </th>
              </tr>
            </thead>
            <tbody>
              {geo.points.map((p) => {
                const m = moves[p.ply - 1];
                return (
                  <tr key={p.ply} className="border-b border-border/50" aria-current={p.ply === ply ? 'step' : undefined}>
                    <td className="py-1 pr-2">
                      <button type="button" className="text-left text-text hover:underline" onClick={() => onSelectPly(p.ply)}>
                        {m ? moveNumberText(m, formatSan(m.san, notation)) : STRINGS_DE.graphStart}
                      </button>
                    </td>
                    <td className="py-1">{formatPercent(p.winPctWhite, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
