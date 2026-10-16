import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/ui/primitives';
import { CHESS_UI_DE } from './strings.de';

/** Props of `NavigationControls`. */
export interface NavigationControlsProps {
  /** Current ply (0 = start). */
  ply: number;
  maxPly: number;
  onNavigate: (ply: number) => void;
  className?: string;
}

/** ⏮ ◀ ▶ ⏭ (DESIGN §5.5). PLACEHOLDER (WP-00) with the final signature – WP-01 owns it from wave 1. */
export function NavigationControls({ ply, maxPly, onNavigate, className }: NavigationControlsProps) {
  return (
    <div role="group" aria-label={CHESS_UI_DE.navigation} className={cn('flex items-center gap-1', className)}>
      <IconButton label={CHESS_UI_DE.first} icon={<ChevronsLeft />} disabled={ply <= 0} onClick={() => onNavigate(0)} />
      <IconButton label={CHESS_UI_DE.prev} icon={<ChevronLeft />} disabled={ply <= 0} onClick={() => onNavigate(ply - 1)} />
      <IconButton label={CHESS_UI_DE.next} icon={<ChevronRight />} disabled={ply >= maxPly} onClick={() => onNavigate(ply + 1)} />
      <IconButton label={CHESS_UI_DE.last} icon={<ChevronsRight />} disabled={ply >= maxPly} onClick={() => onNavigate(maxPly)} />
    </div>
  );
}
