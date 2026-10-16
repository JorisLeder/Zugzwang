import type { Score } from '@/core/engine';
import { formatEval } from '@/i18n/format';
import { cn } from '@/lib/cn';
import { evalWords, leadingSide, whiteShare } from './evalBar';
import { CHESS_UI_DE } from './strings.de';

/** Props of `EvalBar`. */
export interface EvalBarProps {
  /** Evaluation, White POV; `null` while unknown (shows 50 %). */
  score: Score | null;
  /** Board orientation: White's part is at the bottom (vertical) / left (horizontal) when `white`. */
  orientation: 'white' | 'black';
  /** Vertical 24 px bar (≥ 768 px) or horizontal 8 px bar (phone). */
  direction?: 'vertical' | 'horizontal';
  /** Show the number inside the bar (vertical only; default true). */
  showLabel?: boolean;
  className?: string;
}

/**
 * Evaluation bar (DESIGN §5.4): White's share = win percentage (3–97 %, mate 100/0), White's side follows the board
 * orientation, 200 ms transition. The vertical bar shows "+1,3" / "M3" at the leading side's end; the phone bar has no
 * number (the panel shows it). `role="img"` with a German label, e.g. "Bewertung: Weiß steht etwas besser (+1,3)".
 */
export function EvalBar({ score, orientation, direction = 'vertical', showLabel = true, className }: EvalBarProps) {
  const share = whiteShare(score);
  const text = score ? formatEval(score) : '0,0';
  const whiteAtStart = orientation === 'white';
  const vertical = direction === 'vertical';
  const leader = leadingSide(score);
  // White's end of the bar: bottom (vertical) / left (horizontal) when White is at the bottom of the board.
  const labelAtWhiteEnd = leader === 'w';
  const labelAtBottom = labelAtWhiteEnd === whiteAtStart;
  return (
    <div
      role="img"
      aria-label={CHESS_UI_DE.evalLabel(text, evalWords(score))}
      data-testid="eval-bar"
      data-share={Math.round(share)}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[4px] bg-eval-black outline outline-1 outline-white/10 light:outline-black/15',
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
      {vertical && showLabel && score && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 text-center text-[11px] leading-4 font-bold tracking-tighter tabular-nums',
            labelAtWhiteEnd ? 'text-eval-black' : 'text-eval-white',
            labelAtBottom ? 'bottom-1' : 'top-1',
          )}
        >
          {text}
        </span>
      )}
    </div>
  );
}
