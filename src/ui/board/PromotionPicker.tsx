import { defaultPieces } from 'react-chessboard';
import { useEffect, useRef } from 'react';
import type { Color, PromotionPiece, Square } from '@/core/chess';
import { BOARD_DE } from './strings.de';

/** Props of `PromotionPicker`. */
export interface PromotionPickerProps {
  /** Promotion square. */
  square: Square;
  color: Color;
  orientation: 'white' | 'black';
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const ORDER: PromotionPiece[] = ['q', 'r', 'b', 'n'];

/**
 * Promotion choice (DESIGN §4.6): four pieces stacked from the promotion square towards the centre on the promotion
 * file, rest of the board dimmed. Always all four (no auto-queen); `Esc` or a click outside cancels.
 * Selector contract: buttons `data-testid="promotion-q|r|b|n"`.
 */
export function PromotionPicker({ square, color, orientation, onSelect, onCancel }: PromotionPickerProps) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const col = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const fromTop = (orientation === 'white') === (rank === 8);
  return (
    <div className="absolute inset-0 z-10" data-testid="promotion-picker">
      <button type="button" aria-label={BOARD_DE.promotionCancel} className="absolute inset-0 size-full cursor-default bg-scrim" onClick={onCancel} />
      <div
        role="dialog"
        aria-label={BOARD_DE.promotionTitle}
        className="absolute flex w-[12.5%] flex-col overflow-hidden rounded-sm bg-surface shadow-3"
        style={{ left: `${col * 12.5}%`, ...(fromTop ? { top: 0 } : { bottom: 0, flexDirection: 'column-reverse' }) }}
      >
        {ORDER.map((p, i) => {
          const Piece = defaultPieces[`${color}${p.toUpperCase()}`]!;
          return (
            <button
              key={p}
              ref={i === 0 ? first : undefined}
              type="button"
              data-testid={`promotion-${p}`}
              aria-label={BOARD_DE.promotionPieces[p]}
              onClick={() => onSelect(p)}
              className="focus-inset aspect-square w-full min-h-11 p-[6%] hover:bg-surface-2"
            >
              <Piece />
            </button>
          );
        })}
      </div>
    </div>
  );
}
