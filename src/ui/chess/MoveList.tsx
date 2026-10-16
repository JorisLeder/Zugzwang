import type { MoveClassification } from '@/core/analysis';
import type { MoveRecord, Notation } from '@/core/chess';
import { formatSan } from '@/lib/chess';
import { cn } from '@/lib/cn';
import { useSettings } from '@/app/services';
import { ClassificationBadge } from '@/ui/primitives';
import { CHESS_UI_DE } from './strings.de';

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
  className?: string;
}

/**
 * Move list as move-number rows (DESIGN §5.5). PLACEHOLDER (WP-00) with the final signature – WP-01 owns it
 * (phone strip, auto-scroll, variations).
 */
export function MoveList({ moves, currentPly, onSelectPly, notation, classifications, className }: MoveListProps) {
  const settingsNotation = useSettings((s) => s.notation);
  const n = notation ?? settingsNotation;
  const rows: Array<{ number: number; white?: MoveRecord; black?: MoveRecord }> = [];
  for (const m of moves) {
    const last = rows[rows.length - 1];
    if (m.color === 'w' || !last || last.number !== m.moveNumber) rows.push({ number: m.moveNumber });
    rows[rows.length - 1]![m.color === 'w' ? 'white' : 'black'] = m;
  }
  const cell = (m: MoveRecord | undefined) => {
    if (!m) return <span />;
    const cls = classifications?.[m.ply];
    const san = formatSan(m.san, n);
    return (
      <button
        type="button"
        aria-current={m.ply === currentPly ? 'step' : undefined}
        aria-label={CHESS_UI_DE.moveWords(m.moveNumber, m.color, san)}
        onClick={() => onSelectPly?.(m.ply)}
        className={cn(
          'focus-inset flex h-8 items-center gap-1.5 rounded-sm px-2 text-left text-move tabular-nums hover:bg-surface-2 pointer-coarse:h-11',
          m.ply === currentPly && 'bg-surface-3 font-semibold',
        )}
      >
        {san}
        {cls && <ClassificationBadge classification={cls} size={18} />}
      </button>
    );
  };
  return (
    <ol aria-label={CHESS_UI_DE.moveList} className={cn('grid grid-cols-[40px_1fr_1fr] gap-y-0.5', className)}>
      {rows.map((r) => (
        <li key={`${r.number}-${r.white?.ply ?? r.black?.ply}`} className="contents">
          <span className="flex h-8 items-center text-move text-muted tabular-nums pointer-coarse:h-11">{r.number}.</span>
          {r.white ? cell(r.white) : <span className="flex items-center px-2 text-muted">…</span>}
          {cell(r.black)}
        </li>
      ))}
    </ol>
  );
}
