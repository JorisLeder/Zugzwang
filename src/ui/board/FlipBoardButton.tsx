import { ArrowDownUp } from 'lucide-react';
import { IconButton, type IconButtonProps } from '@/ui/primitives';
import { BOARD_DE } from './strings.de';

/** Props of `FlipBoardButton`. */
export interface FlipBoardButtonProps extends Omit<IconButtonProps, 'label' | 'icon' | 'onClick'> {
  /** Flips the board (the parent toggles `orientation` of `Board`, eval bar and player bars together). */
  onFlip: () => void;
}

/** "Brett drehen" icon button (DESIGN §4.1: icon `ArrowDownUp`, key `F`). */
export function FlipBoardButton({ onFlip, ...rest }: FlipBoardButtonProps) {
  return <IconButton label={BOARD_DE.flip} icon={<ArrowDownUp />} aria-keyshortcuts="F" onClick={onFlip} {...rest} />;
}
