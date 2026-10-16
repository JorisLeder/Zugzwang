import type { Score } from '@/core/engine';
import { formatEval } from '@/i18n/format';
import { cn } from '@/lib/cn';
import { CHESS_UI_DE } from './strings.de';

/** Props of `EvalBar`. */
export interface EvalBarProps {
  /** Evaluation, White POV; `null` while unknown (shows 50 %). */
  score: Score | null;
  /** Board orientation: White's part is at the bottom (vertical) / left (horizontal) when `white`. */
  orientation: 'white' | 'black';
  /** Vertical 24 px bar (≥ 768 px) or horizontal 8 px bar (phone). */
  direction?: 'vertical' | 'horizontal';
  className?: string;
}

/** White's share 3–97 % (forced mate 100/0) – lichess win% (DESIGN §5.4). */
function whiteShare(score: Score | null): number {
  if (!score) return 50;
  if (score.type === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, score.value));
  const w = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return Math.max(3, Math.min(97, w));
}

/** Evaluation bar. PLACEHOLDER (WP-00) with the final signature – WP-01 owns it from wave 1. */
export function EvalBar({ score, orientation, direction = 'vertical', className }: EvalBarProps) {
  const share = whiteShare(score);
  const text = score ? formatEval(score) : '0,0';
  const side = share > 55 ? CHESS_UI_DE.whiteBetter : share < 45 ? CHESS_UI_DE.blackBetter : CHESS_UI_DE.equal;
  const whiteAtStart = orientation === 'white';
  const vertical = direction === 'vertical';
  return (
    <div
      role="img"
      aria-label={CHESS_UI_DE.evalLabel(text, side)}
      className={cn(
        'relative overflow-hidden rounded-[4px] bg-eval-black outline outline-1 outline-white/10 light:outline-black/15',
        vertical ? 'h-full w-6' : 'h-2 w-full',
        className,
      )}
    >
      <div
        className="absolute bg-eval-white transition-all duration-[var(--zz-dur-slow)] ease-out"
        style={
          vertical
            ? { left: 0, right: 0, height: `${share}%`, ...(whiteAtStart ? { bottom: 0 } : { top: 0 }) }
            : { top: 0, bottom: 0, width: `${share}%`, ...(whiteAtStart ? { left: 0 } : { right: 0 }) }
        }
      />
    </div>
  );
}
