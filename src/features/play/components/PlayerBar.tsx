import type { ReactNode } from 'react';
import type { Color, PieceSymbol } from '@/core/chess';
import { cn } from '@/lib/cn';
import { PieceIcon, type PieceCode } from '@/ui/board';
import { STRINGS_DE } from '../strings.de';

/** Props of `PlayerBar`. */
export interface PlayerBarProps {
  name: string;
  elo?: number;
  avatar: ReactNode;
  /** Colour of this player (the captured pieces are the opponent's). */
  color: Color;
  /** Pieces this player captured. */
  captured: PieceSymbol[];
  /** Material lead in pawns (0 = none shown). */
  lead: number;
  /** Bot thinking: "{Name} überlegt …" (DESIGN §4.7). */
  thinking?: boolean;
  testId?: string;
}

/** Player bar above/below the board (DESIGN §4.7): avatar, name, Elo, captured pieces with material lead. */
export function PlayerBar({ name, elo, avatar, color, captured, lead, thinking = false, testId }: PlayerBarProps) {
  const opponent: Color = color === 'w' ? 'b' : 'w';
  return (
    <div data-testid={testId} className="flex w-full min-w-0 items-center gap-2">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-body-sm font-semibold text-text">{name}</span>
          {elo !== undefined && <span className="text-caption text-muted tabular-nums">{elo}</span>}
        </span>
        {thinking ? (
          <span role="status" className="text-caption text-muted">
            {STRINGS_DE.thinking(name)}
          </span>
        ) : (
          <span className="flex h-4 items-center" aria-label={captured.length ? STRINGS_DE.capturedLabel(name) : undefined} role={captured.length ? 'img' : undefined}>
            {captured.map((p, i) => (
              <PieceIcon key={`${p}${i}`} piece={`${opponent}${p.toUpperCase()}` as PieceCode} className={cn('size-4', i > 0 && '-ml-1')} />
            ))}
            {lead > 0 && <span className="ml-1 text-caption text-muted tabular-nums">{STRINGS_DE.materialLead(lead)}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
