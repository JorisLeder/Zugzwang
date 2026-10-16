/**
 * Profile, settings and activity contracts (BACKLOG 2.6, PRD §5/§6, D-10, D-14).
 */
import type { Notation } from './chess';
import type { StageId } from './lessons';
import type { PuzzleThemeId } from './puzzles';

/** User settings (stored in `profiles.settings`, last writer wins by `updatedAt`). */
export interface Settings {
  /** Design: dark is the default (DESIGN §2); `system` follows the OS. */
  theme: 'dark' | 'light' | 'system';
  /** Brettdesign: Moos (default) or Holz. */
  boardTheme: 'moos' | 'holz';
  /** Figuren: only react-chessboard's default set in V1. */
  pieceSet: 'default';
  /** Töne. */
  sound: boolean;
  /** Animationen (also off under `prefers-reduced-motion`). */
  animations: boolean;
  /** Zugbestätigung (default off). */
  moveConfirmation: boolean;
  /** UI language; English is "in Vorbereitung" (D-35). */
  language: 'de' | 'en';
  /** Notation: German letters (default) or English. */
  notation: Notation;
  /** Koordinaten anzeigen. */
  showCoordinates: boolean;
  /** Mögliche Züge anzeigen. */
  showLegalMoves: boolean;
  /** ISO timestamp of the last change (LWW). */
  updatedAt: string;
}

/** Defaults: dark, Moos, German notation, sound/animations/coordinates/legal moves on, move confirmation off. */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  boardTheme: 'moos',
  pieceSet: 'default',
  sound: true,
  animations: true,
  moveConfirmation: false,
  language: 'de',
  notation: 'de',
  showCoordinates: true,
  showLegalMoves: true,
  updatedAt: '1970-01-01T00:00:00.000Z',
};

/** Default daily goal in minutes (Tagesziel). */
export const DEFAULT_DAILY_GOAL_MINUTES = 20;

/** Daily goal choices in onboarding/profile (minutes). */
export const DAILY_GOAL_OPTIONS: readonly number[] = [10, 20, 30, 60];

/** Self-assessment at first start (D-10). */
export type SelfAssessment = 'newcomer' | 'beginner' | 'club' | 'advanced';

/** One self-assessment option with its start values. */
export interface SelfAssessmentOption {
  id: SelfAssessment;
  labelDe: string;
  descriptionDe: string;
  /** Start puzzle rating (RD 350). */
  puzzleRating: number;
  /** Start bot rating (RD 350). */
  botRating: number;
  /** Lernpfad stage to start at. */
  startStage: StageId;
}

/** Self-assessment options and start values (D-10). */
export const SELF_ASSESSMENT_OPTIONS: readonly SelfAssessmentOption[] = [
  {
    id: 'newcomer',
    labelDe: 'Neuling',
    descriptionDe: 'Ich kenne die Regeln kaum.',
    puzzleRating: 400,
    botRating: 200,
    startStage: 0,
  },
  {
    id: 'beginner',
    labelDe: 'Einsteiger',
    descriptionDe: 'Ich kenne die Regeln und einfache Taktik.',
    puzzleRating: 600,
    botRating: 400,
    startStage: 1,
  },
  {
    id: 'club',
    labelDe: 'Clubspieler',
    descriptionDe: 'Ich spiele etwa auf 1000 bis 1400 Elo.',
    puzzleRating: 1000,
    botRating: 1000,
    startStage: 1,
  },
  {
    id: 'advanced',
    labelDe: 'Fortgeschritten',
    descriptionDe: 'Ich spiele auf 1600 Elo oder mehr.',
    puzzleRating: 1500,
    botRating: 1600,
    startStage: 1,
  },
];

/** User profile (`profiles`, one row per user). */
export interface Profile {
  /** User id (local profile id in local mode, auth user id in cloud mode). */
  id: string;
  displayName: string;
  settings: Settings;
  dailyGoalMinutes: number;
  selfAssessment: SelfAssessment | null;
  onboardingCompleted: boolean;
  /** The Stufe-0 skip test was passed (D-38). */
  stageZeroSkipped: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Activity of one calendar day in the user's time zone (`daily_activity`, D-14). */
export interface DailyActivity {
  /** `YYYY-MM-DD` in the user's time zone (`localDateKey`). */
  date: string;
  /** Active minutes. */
  minutes: number;
  /** Puzzle attempts. */
  puzzles: number;
  /** Finished games. */
  games: number;
  /** Completed lesson steps. */
  lessons: number;
  /** minutes ≥ dailyGoalMinutes. */
  goalReached: boolean;
}

/** Success per theme (`theme_stats`): first-try results of rated, learning and theme modes (D-11). */
export interface ThemeStat {
  theme: PuzzleThemeId;
  attempts: number;
  successes: number;
}

/** Spaced-repetition item (P1-03 preparation, `review_queue`). */
export interface ReviewQueueItem {
  id: string;
  itemType: 'puzzle' | 'own_mistake';
  objectId: string;
  dueAt: string;
  intervalDays: number;
}
