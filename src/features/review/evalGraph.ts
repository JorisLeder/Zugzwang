/**
 * Geometry of the evaluation graph (P0-10): White's win percentage per ply (0 = start position) as an SVG area –
 * White's share fills from the bottom, the 50 % line is the middle.
 */
import type { GameAnalysis } from '@/core/analysis';

/** Drawing size in SVG user units (the SVG scales to its container). */
export const GRAPH_WIDTH = 600;
export const GRAPH_HEIGHT = 120;

/** One point of the graph. */
export interface GraphPoint {
  ply: number;
  winPctWhite: number;
  x: number;
  y: number;
}

/** Points, the area path (White's share) and the outline path. */
export interface GraphGeometry {
  points: GraphPoint[];
  area: string;
  line: string;
  maxPly: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** x coordinate of a ply. */
export function plyX(ply: number, maxPly: number, width = GRAPH_WIDTH): number {
  return maxPly > 0 ? (ply / maxPly) * width : width / 2;
}

/** Computes the graph geometry from `analysis.evalGraph` (sorted by ply, values clamped to 0–100). */
export function graphGeometry(evalGraph: GameAnalysis['evalGraph'], width = GRAPH_WIDTH, height = GRAPH_HEIGHT): GraphGeometry {
  const sorted = [...evalGraph].sort((a, b) => a.ply - b.ply);
  const maxPly = sorted.length > 0 ? sorted[sorted.length - 1]!.ply : 0;
  const points = sorted.map((p) => {
    const pct = clamp(p.winPctWhite, 0, 100);
    return { ply: p.ply, winPctWhite: pct, x: r1(plyX(p.ply, maxPly, width)), y: r1(height - (pct / 100) * height) };
  });
  if (points.length === 0) return { points, area: '', line: '', maxPly };
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const area = `M${points[0]!.x} ${height} ${points.map((p) => `L${p.x} ${p.y}`).join(' ')} L${points[points.length - 1]!.x} ${height} Z`;
  return { points, area, line, maxPly };
}

/** Ply under an x coordinate (in SVG units), clamped to the game. */
export function plyAtX(x: number, maxPly: number, width = GRAPH_WIDTH): number {
  if (maxPly <= 0) return 0;
  return clamp(Math.round((x / width) * maxPly), 0, maxPly);
}
