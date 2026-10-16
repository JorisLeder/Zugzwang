import { defaultPieces } from 'react-chessboard';
import { useEffect, useRef, type KeyboardEvent } from 'react';
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
 * Promotion choice (DESIGN §4.6, FIDE 3.7.5.1): four pieces of the mover's colour stacked from the promotion square
 * towards the centre on the promotion file, the rest of the board dimmed. Always all four (no auto-queen); Dame has the
 * initial focus; ↑/↓ move between the options; `Esc` or a click outside cancels and the pawn stays where it was.
 * Each option is a full square (≥ 45 px at 360 px width). Selector contract: `data-testid="promotion-q|r|b|n"`.
 */
export function PromotionPicker({ square, color, orientation, onSelect, onCancel }: PromotionPickerProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    buttons.current[0]?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
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

  const onOptionKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const current = buttons.current.findIndex((b) => b === document.activeElement);
    // Visual "down" is towards the centre when the picker starts at the top edge.
    const step = (e.key === 'ArrowDown') === fromTop ? 1 : -1;
    const next = (Math.max(0, current) + step + ORDER.length) % ORDER.length;
    buttons.current[next]?.focus();
  };

  return (
    <div className="absolute inset-0 z-30" data-testid="promotion-picker">
      <button
        type="button"
        tabIndex={-1}
        aria-label={BOARD_DE.promotionCancel}
        className="absolute inset-0 size-full cursor-default bg-scrim"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={BOARD_DE.promotionTitle}
        className="absolute flex w-[12.5%] flex-col overflow-hidden rounded-sm bg-surface shadow-3"
        style={{ left: `${col * 12.5}%`, ...(fromTop ? { top: 0 } : { bottom: 0, flexDirection: 'column-reverse' }) }}
      >
        {ORDER.map((p, i) => {
          const Piece = defaultPieces[`${color}${p.toUpperCase()}`]!;
          return (
            <button
              key={p}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              data-testid={`promotion-${p}`}
              aria-label={BOARD_DE.promotionPieces[p]}
              onClick={() => onSelect(p)}
              onKeyDown={onOptionKey}
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
