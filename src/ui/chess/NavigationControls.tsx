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

/**
 * ⏮ ◀ ▶ ⏭ (DESIGN §5.5): 44 px icon buttons "Zum Anfang", "Zurück", "Vor", "Zum Ende"; disabled at the ends.
 * Keyboard: `usePlyNavigation` (←/→/Home/End).
 */
export function NavigationControls({ ply, maxPly, onNavigate, className }: NavigationControlsProps) {
  return (
    <div role="group" aria-label={CHESS_UI_DE.navigation} className={cn('flex items-center gap-1', className)}>
      <IconButton label={CHESS_UI_DE.first} icon={<ChevronsLeft />} disabled={ply <= 0} aria-keyshortcuts="Home" onClick={() => onNavigate(0)} />
      <IconButton label={CHESS_UI_DE.prev} icon={<ChevronLeft />} disabled={ply <= 0} aria-keyshortcuts="ArrowLeft" onClick={() => onNavigate(ply - 1)} />
      <IconButton label={CHESS_UI_DE.next} icon={<ChevronRight />} disabled={ply >= maxPly} aria-keyshortcuts="ArrowRight" onClick={() => onNavigate(ply + 1)} />
      <IconButton label={CHESS_UI_DE.last} icon={<ChevronsRight />} disabled={ply >= maxPly} aria-keyshortcuts="End" onClick={() => onNavigate(maxPly)} />
    </div>
  );
}
