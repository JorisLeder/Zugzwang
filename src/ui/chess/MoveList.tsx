import { useEffect, useRef } from 'react';
import { CLASSIFICATION_META, type MoveClassification } from '@/core/analysis';
import type { MoveRecord, Notation } from '@/core/chess';
import { formatSan } from '@/lib/chess';
import { cn } from '@/lib/cn';
import { useSettings } from '@/app/services';
import { ClassificationBadge } from '@/ui/primitives';
import { movePairs } from './moveListModel';
import { CHESS_UI_DE } from './strings.de';
import { scrollIntoContainer, useMediaQuery } from './useMediaQuery';

/** Props of `MoveList`. */
export interface MoveListProps {
  /** Main line. */
  moves: MoveRecord[];
  /** Current ply (0 = start position; n = after `moves[n-1]`). */
  currentPly: number;
  /** Click on a half-move jumps to its ply. */
  onSelectPly?: (ply: number) => void;
  /** Notation; default from settings (`de`). */
  notation?: Notation;
  /** Classification per ply (analysis). */
  classifications?: Partial<Record<number, MoveClassification>>;
  /** `list` (rows "12. Sf3 Sc6"), `strip` (one horizontal line, phones) or `auto` (strip below 768 px, default). */
  variant?: 'auto' | 'list' | 'strip';
  /** Accessible name of the list (default "Zugliste"). */
  label?: string;
  className?: string;
}

/**
 * Move list (DESIGN §5.5): move numbers, every half-move a button (current = `aria-current="step"`, `surface-3`,
 * weight 600), optional classification badge, auto-scroll to the current move inside its scroll container, SAN in
 * the user's notation (German K D T L S and `0-0` by default). Phones get a horizontal strip.
 * Variations are not shown (the analysis board replaces later moves instead, WP-01).
 */
export function MoveList({ moves, currentPly, onSelectPly, notation, classifications, variant = 'auto', label, className }: MoveListProps) {
  const settingsNotation = useSettings((s) => s.notation);
  const n = notation ?? settingsNotation;
  const phone = useMediaQuery('(max-width: 767px)');
  const strip = variant === 'strip' || (variant === 'auto' && phone);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (currentRef.current) scrollIntoContainer(currentRef.current, strip ? 'x' : 'y');
  }, [currentPly, strip, moves.length]);

  const cell = (m: MoveRecord | undefined) => {
    if (!m) return <span />;
    const cls = classifications?.[m.ply];
    const san = formatSan(m.san, n);
    const current = m.ply === currentPly;
    return (
      <button
        type="button"
        ref={current ? currentRef : undefined}
        aria-current={current ? 'step' : undefined}
        aria-label={CHESS_UI_DE.moveLabel(m.moveNumber, m.color, san, CHESS_UI_DE.moveInWords(m), cls ? CLASSIFICATION_META[cls].labelDe : undefined)}
        data-ply={m.ply}
        onClick={() => onSelectPly?.(m.ply)}
        className={cn(
          'focus-inset flex items-center gap-1.5 rounded-sm px-2 text-left text-move whitespace-nowrap tabular-nums hover:bg-surface-2',
          // Strip (phones): every half-move at least 44 × 44 px, also short ones like "e4".
          strip ? 'h-11 min-w-11 justify-center' : 'h-8 pointer-coarse:h-11',
          current && 'bg-surface-3 font-semibold',
        )}
      >
        {san}
        {cls && <ClassificationBadge classification={cls} size={18} />}
      </button>
    );
  };

  const pairs = movePairs(moves);

  if (strip) {
    return (
      <ol
        aria-label={label ?? CHESS_UI_DE.moveList}
        data-variant="strip"
        className={cn('flex h-11 items-center gap-1 overflow-x-auto overscroll-x-contain', className)}
      >
        {pairs.map((r) => (
          <li key={`${r.number}-${r.white?.ply ?? r.black?.ply}`} className="flex shrink-0 items-center">
            <span aria-hidden="true" className="pl-1 text-move text-muted tabular-nums">
              {r.number}.{r.white ? '' : '..'}
            </span>
            {r.white && cell(r.white)}
            {r.black && cell(r.black)}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol aria-label={label ?? CHESS_UI_DE.moveList} data-variant="list" className={cn('flex flex-col gap-0.5', className)}>
      {pairs.map((r) => (
        <li key={`${r.number}-${r.white?.ply ?? r.black?.ply}`} className="grid grid-cols-[40px_1fr_1fr] items-center">
          <span aria-hidden="true" className="text-move text-muted tabular-nums">
            {r.number}.
          </span>
          {r.white ? cell(r.white) : <span aria-hidden="true" className="px-2 text-muted">…</span>}
          {cell(r.black)}
        </li>
      ))}
    </ol>
  );
}
