import { defaultPieces } from 'react-chessboard';
import { cn } from '@/lib/cn';

/** Piece code: colour + upper-case letter (`wK`, `bN`, …) – same as the board's `data-piece`. */
export type PieceCode = `${'w' | 'b'}${'P' | 'N' | 'B' | 'R' | 'Q' | 'K'}`;

/** Props of `PieceIcon`. */
export interface PieceIconProps {
  piece: PieceCode;
  className?: string;
}

/** The board's piece artwork (react-chessboard default set, D-47) as a decorative icon (`aria-hidden`). */
export function PieceIcon({ piece, className }: PieceIconProps) {
  const Piece = defaultPieces[piece]!;
  return (
    <span aria-hidden="true" className={cn('inline-flex size-8 [&>svg]:size-full', className)}>
      <Piece />
    </span>
  );
}
