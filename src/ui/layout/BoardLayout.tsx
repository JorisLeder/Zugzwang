/**
 * `BoardLayout` – the single layout for every board screen (PRD Gestaltungsregeln, DESIGN §3.3–§3.5). Frozen (WP-00).
 *
 * Slots / props contract:
 * - `board`        the board element (e.g. `<Board/>`); it is placed in a square container of the computed size.
 *                  Pass a function `(size) => ReactNode` if the board needs the pixel size.
 * - `panelTabs`    panel content (usually `<Tabs>`); scrolls inside the panel.
 * - `actions`      action bar: phone = fixed bar at the bottom (max 1 primary + 3 icon buttons), desktop = panel footer.
 * - `title`        the screen's h1: top-bar title on phone/tablet, visually hidden h1 + panel header on desktop.
 * - `backTo`       target of the "‹" back link on phone/tablet (the area hub, D-40).
 * - `panelHeader`  custom desktop panel header (defaults to `title`).
 * - `menu`         content of the ⋮ slot in the phone top bar (e.g. a dropdown trigger).
 * - `playerTop` / `playerBottom`  player bars (games, analysis); omitted on puzzles/lessons (board grows by 88 px).
 * - `evalBar` / `evalBarHorizontal`  vertical eval bar left of the board (≥ 768 px) / horizontal bar under the
 *                  top player bar on phone. Pass the same component with different `direction`.
 *
 * Behaviour: desktop (≥ 1024 px) board as large as the viewport height allows (multiple of 8, ≤ 960, ≥ 320) with the
 * panel (`--zz-panel-w`) beside it; tablet board centred on top with the panel below; phone board edge to edge, panel
 * below, actions fixed at the bottom, and the shell's tab bar is hidden while this layout is mounted (D-40).
 */
import { ChevronLeft } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { useRegisterBoardScreen } from './shellContext';
import { LAYOUT_DE } from './strings.de';
import { useBoardSize } from './useBoardSize';

/** Props of `BoardLayout` (see the file header for the slot contract). */
export interface BoardLayoutProps {
  board: ReactNode | ((size: number) => ReactNode);
  panelTabs?: ReactNode;
  actions?: ReactNode;
  title: string;
  backTo?: string;
  backLabel?: string;
  panelHeader?: ReactNode;
  menu?: ReactNode;
  playerTop?: ReactNode;
  playerBottom?: ReactNode;
  evalBar?: ReactNode;
  evalBarHorizontal?: ReactNode;
  className?: string;
}

/** Board screen layout. */
export function BoardLayout({
  board,
  panelTabs,
  actions,
  title,
  backTo,
  backLabel = LAYOUT_DE.back,
  panelHeader,
  menu,
  playerTop,
  playerBottom,
  evalBar,
  evalBarHorizontal,
  className,
}: BoardLayoutProps) {
  useRegisterBoardScreen();
  const areaRef = useRef<HTMLDivElement>(null);
  const hasPlayerBars = Boolean(playerTop || playerBottom);
  const size = useBoardSize(areaRef, { hasPlayerBars, hasEvalBar: Boolean(evalBar) });

  return (
    <div
      data-testid="board-layout"
      className={cn(
        'flex min-h-dvh flex-col [@media(min-height:600px)]:h-dvh',
        'lg:h-dvh lg:min-h-0 lg:flex-row lg:items-stretch lg:justify-center lg:gap-6 lg:p-6',
        className,
      )}
    >
      {/* Top bar on phone/tablet; on desktop only the h1 remains (visually hidden – the panel header shows the title). */}
      <header className="sticky top-0 z-20 flex h-[var(--zz-topbar-board-h)] shrink-0 items-center gap-1 bg-bg px-1 lg:contents">
        {backTo ? (
          <Link
            to={backTo}
            aria-label={backLabel}
            className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-2 lg:hidden"
          >
            <ChevronLeft aria-hidden="true" className="size-6" />
          </Link>
        ) : (
          <span className="w-3 lg:hidden" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold text-text lg:sr-only">{title}</h1>
        {menu && <div className="lg:hidden">{menu}</div>}
      </header>

      <div ref={areaRef} className="flex shrink-0 flex-col items-center md:px-[var(--zz-gutter)] lg:min-w-0 lg:flex-1 lg:justify-center lg:px-0">
        <div className="flex items-stretch gap-3">
          {evalBar && <div className="hidden shrink-0 md:flex">{evalBar}</div>}
          <div className="flex flex-col" style={{ width: size }}>
            {playerTop && <div className="flex h-[var(--zz-player-bar-h)] items-center px-2 md:px-0">{playerTop}</div>}
            {evalBarHorizontal && <div className="w-full md:hidden">{evalBarHorizontal}</div>}
            <div data-testid="board-container" style={{ width: size, height: size }}>
              {typeof board === 'function' ? board(size) : board}
            </div>
            {playerBottom && <div className="flex h-[var(--zz-player-bar-h)] items-center px-2 md:px-0">{playerBottom}</div>}
          </div>
        </div>
      </div>

      <aside
        aria-label={LAYOUT_DE.panel}
        className={cn(
          'flex min-h-0 flex-1 flex-col bg-bg md:mx-auto md:w-full md:max-w-[640px]',
          'lg:mx-0 lg:w-[var(--zz-panel-w)] lg:max-w-none lg:flex-none lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:bg-surface',
          actions && 'pb-[var(--zz-actionbar-h)] lg:pb-0',
        )}
      >
        <div className="hidden shrink-0 border-b border-border px-4 py-3 lg:block">
          {panelHeader ?? (
            <p aria-hidden="true" className="text-h3 text-text">
              {title}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[var(--zz-gutter)] py-3 lg:px-4">{panelTabs}</div>
        {actions && (
          <div
            data-testid="action-bar"
            className={cn(
              'fixed inset-x-0 bottom-0 z-20 flex h-[var(--zz-actionbar-h)] items-center gap-2 border-t border-border bg-surface px-4 pb-[env(safe-area-inset-bottom,0px)]',
              'md:left-[var(--zz-sidebar-w)] lg:static lg:h-auto lg:shrink-0 lg:p-3',
            )}
          >
            {actions}
          </div>
        )}
      </aside>
    </div>
  );
}
