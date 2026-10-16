/**
 * The six navigation areas (D-01, DESIGN §3.2) with labels, lucide icons and active-route matching.
 */
import { ChartLine, CircleUser, GraduationCap, House, Puzzle, Swords, type LucideIcon } from 'lucide-react';
import { paths } from './paths';
import { APP_DE } from './strings.de';

/** One area of the main navigation. */
export interface NavArea {
  key: 'home' | 'puzzles' | 'play' | 'learn' | 'analysis' | 'profile';
  label: string;
  icon: LucideIcon;
  to: string;
  /** Whether the area is active for a pathname. */
  isActive: (pathname: string) => boolean;
}

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

/** Start, Puzzles, Spielen, Lernen, Analyse, Profil (Einstellungen belongs to Profil). */
export const NAV_AREAS: readonly NavArea[] = [
  { key: 'home', label: APP_DE.nav.home, icon: House, to: paths.home(), isActive: (p) => p === '/' || p === paths.onboarding() },
  { key: 'puzzles', label: APP_DE.nav.puzzles, icon: Puzzle, to: paths.puzzles(), isActive: under('/puzzles') },
  { key: 'play', label: APP_DE.nav.play, icon: Swords, to: paths.play(), isActive: under('/play') },
  { key: 'learn', label: APP_DE.nav.learn, icon: GraduationCap, to: paths.learn(), isActive: under('/learn') },
  { key: 'analysis', label: APP_DE.nav.analysis, icon: ChartLine, to: paths.analysis(), isActive: under('/analysis') },
  {
    key: 'profile',
    label: APP_DE.nav.profile,
    icon: CircleUser,
    to: paths.profile(),
    isActive: (p) => under('/profile')(p) || under('/settings')(p),
  },
];
