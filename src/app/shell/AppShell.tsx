/**
 * App shell (DESIGN §3.1/§3.2, D-01, D-40): skip link, sidebar/rail (≥ 768 px), bottom tab bar (< 768 px, hidden on
 * active board screens), offline banner slot, main content. Frozen (WP-00).
 */
import { Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { OfflineBanner } from '@/features/pwa/OfflineBanner';
import { cn } from '@/lib/cn';
import { useSubscribable } from '@/lib/observable';
import { useMediaQuery } from '@/ui/chess/useMediaQuery';
import { ShellContext, type ShellControls } from '@/ui/layout/shellContext';
import { NAV_AREAS, type NavArea } from '../navigation';
import { paths } from '../paths';
import { useServices } from '../services';
import { APP_DE } from '../strings.de';
import { BrandMark } from './BrandMark';

/** Sidebar-only (≥ 768 px), with tooltip and help dialog: loaded on demand, off the phone start-up path. */
const SyncStatusIndicator = lazy(() => import('@/features/sync/SyncStatusIndicator').then((m) => ({ default: m.SyncStatusIndicator })));

function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById('main');
        main?.focus();
        main?.scrollIntoView();
      }}
      className="sr-only z-[80] rounded-md bg-accent px-4 py-3 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {APP_DE.skipLink}
    </a>
  );
}

function SideNavItem({ area, active }: { area: NavArea; active: boolean }) {
  const Icon = area.icon;
  return (
    <li>
      <Link
        to={area.to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'focus-inset relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-caption',
          'xl:min-h-11 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-body xl:font-medium',
          active ? 'text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-text',
        )}
      >
        {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
        <Icon aria-hidden="true" className="size-6 shrink-0" />
        <span>{area.label}</span>
      </Link>
    </li>
  );
}

function SideNav({ pathname }: { pathname: string }) {
  const sidebarVisible = useMediaQuery('(min-width: 768px)');
  const settingsActive = pathname === paths.settings() || pathname.startsWith(`${paths.settings()}/`);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--zz-sidebar-w)] flex-col border-r border-border bg-surface md:flex">
      <Link to={paths.home()} className="flex h-16 items-center justify-center gap-2 px-3 xl:justify-start xl:px-5" aria-label={APP_DE.brand}>
        <BrandMark className="size-8 shrink-0" />
        <span className="hidden text-h3 text-text xl:inline">{APP_DE.brand}</span>
      </Link>
      <nav aria-label={APP_DE.nav.label} className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-1">
          {NAV_AREAS.map((a) => (
            <SideNavItem key={a.key} area={a} active={a.isActive(pathname)} />
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-1 border-t border-border px-2 py-3">
        {sidebarVisible && (
          <Suspense fallback={<div aria-hidden="true" className="min-h-11" />}>
            <SyncStatusIndicator />
          </Suspense>
        )}
        <Link
          to={paths.settings()}
          aria-current={settingsActive ? 'page' : undefined}
          className={cn(
            'focus-inset flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-caption xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-body-sm',
            settingsActive ? 'text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          <SettingsIcon aria-hidden="true" className="size-5" />
          {/* The 72 px rail is too narrow for the word: icon only (accessible name kept) below 1280 px. */}
          <span className="sr-only xl:not-sr-only">{APP_DE.nav.settings}</span>
        </Link>
        <ProfileAvatarLink />
      </div>
    </aside>
  );
}

function ProfileAvatarLink() {
  const { data } = useServices();
  const profileSource = useMemo(() => data.repos.profile.observe(), [data]);
  const profile = useSubscribable(profileSource, null);
  const initial = (profile?.displayName ?? 'Du').trim().slice(0, 1).toUpperCase() || 'D';
  return (
    <Link to={paths.profile()} aria-label={APP_DE.profileAvatar} className="mx-auto flex size-11 items-center justify-center rounded-full xl:mx-3 xl:size-9">
      <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-surface-3 text-body-sm font-semibold text-text">
        {initial}
      </span>
    </Link>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label={APP_DE.nav.label}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <ul className="flex h-14">
        {NAV_AREAS.map((area) => {
          const active = area.isActive(pathname);
          const Icon = area.icon;
          return (
            <li key={area.key} className="min-w-0 flex-1">
              <Link
                to={area.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-inset relative flex h-full flex-col items-center justify-center gap-0.5 text-caption',
                  active ? 'text-accent-text' : 'text-muted',
                )}
              >
                {active && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-accent" />}
                <Icon aria-hidden="true" className="size-6" />
                <span className="max-w-full truncate">{area.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Shell layout route: renders the navigation around `<Outlet/>`. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const [boardScreens, setBoardScreens] = useState(0);
  const registerBoardScreen = useCallback(() => {
    setBoardScreens((n) => n + 1);
    return () => setBoardScreens((n) => n - 1);
  }, []);
  const controls = useMemo<ShellControls>(() => ({ registerBoardScreen }), [registerBoardScreen]);
  const boardScreen = boardScreens > 0;

  return (
    <ShellContext.Provider value={controls}>
      <div className="min-h-dvh bg-bg text-text" data-board-screen={boardScreen || undefined}>
        <SkipLink />
        <SideNav pathname={pathname} />
        <div className="flex min-h-dvh min-w-0 flex-col md:pl-[var(--zz-sidebar-w)]">
          <OfflineBanner />
          <main id="main" tabIndex={-1} className={cn('min-w-0 flex-1 focus:outline-none', !boardScreen && 'pb-[var(--zz-tabbar-h)] md:pb-0')}>
            {children ?? <Outlet />}
          </main>
        </div>
        {!boardScreen && <TabBar pathname={pathname} />}
      </div>
    </ShellContext.Provider>
  );
}
