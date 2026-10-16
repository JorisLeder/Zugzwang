/**
 * German number/eval formatting (DESIGN §9.1: `Intl.NumberFormat('de-DE')`, "+1,3", "78,4 %", "1.250").
 * Minus signs use U+2212 ("−") for display. Frozen (WP-00).
 */
import type { Score } from '@/core/engine';

/** Typographic minus sign. */
export const MINUS = '−';

const cache = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', options);
    cache.set(key, f);
  }
  return f;
}

/** "1.250", "3,5" (German separators). */
export function formatNumber(value: number, fractionDigits = 0): string {
  return nf({ minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
    .format(value)
    .replace('-', MINUS);
}

/** "78,4 %" for 78.4 (value in percent, not a fraction). */
export function formatPercent(value: number, fractionDigits = 1): string {
  return `${formatNumber(value, fractionDigits)}\u00A0%`;
}

/** Signed integer delta: "+8", "−6", "±0" (rating deltas). */
export function formatDelta(value: number): string {
  const n = Math.round(value);
  if (n === 0) return '±0';
  return n > 0 ? `+${formatNumber(n)}` : `${MINUS}${formatNumber(Math.abs(n))}`;
}

/** Engine evaluation for labels (White POV): "+1,3", "−0,8", "0,0", "M3", "−M2". */
export function formatEval(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#';
    return score.value > 0 ? `M${score.value}` : `${MINUS}M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  if (Math.abs(pawns) < 0.05) return '0,0';
  return `${pawns > 0 ? '+' : MINUS}${formatNumber(Math.abs(pawns), 1)}`;
}
