/**
 * Sample rows of every table of `@/core/tables` for the migration tests: complete (every column of the row type),
 * valid for the constraints and typed with `TableRows`, so a column added to the contract but missing in the
 * migrations (or the other way round) fails the schema test.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '@/core/profile';
import type { TableName, TableRows } from '@/core/tables';

/** Ids a sample row may refer to. */
export interface SampleRefs {
  /** Owner (auth user id) of a user row. */
  owner: string;
  /** Game of a `game_moves` / `game_analyses` row (default: a new id). */
  gameId?: string;
  /** Course of a `lessons` row / lesson of a `lesson_steps` row (static content). */
  courseId?: string;
  lessonId?: string;
}

const NOW = '2026-10-18T10:00:00.000Z';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const counts = {
  brilliant: 0,
  great: 0,
  best: 4,
  excellent: 3,
  good: 2,
  book: 2,
  inaccuracy: 1,
  mistake: 1,
  miss: 0,
  blunder: 0,
};

/** A complete, valid row of `table`. Ids are fresh UUIDs (static rows: fresh text ids). */
export function sampleRow<T extends TableName>(table: T, refs: SampleRefs): TableRows[T] {
  const { owner } = refs;
  const id = randomUUID();
  const rows: { [K in TableName]: () => TableRows[K] } = {
    profiles: () => ({
      id: owner,
      display_name: 'Testperson',
      settings: { ...DEFAULT_SETTINGS, updatedAt: NOW },
      daily_goal_minutes: 20,
      self_assessment: 'beginner',
      onboarding_completed: true,
      stage_zero_skipped: false,
      time_zone: 'Europe/Berlin',
      created_at: NOW,
      updated_at: NOW,
    }),
    ratings: () => ({
      user_id: owner,
      kind: 'puzzle',
      rating: 400,
      rd: 350,
      volatility: 0.06,
      games_count: 0,
      updated_at: NOW,
    }),
    puzzles: () => ({
      id: `test-${id}`,
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      moves: ['a1a8'],
      rating: 600,
      rating_deviation: 80,
      themes: ['mateIn1', 'backRankMate'],
      opening_tags: [],
      popularity: null,
      nb_plays: null,
      source: 'seed',
      explanation: null,
      game_url: null,
    }),
    puzzle_attempts: () => ({
      id,
      user_id: owner,
      puzzle_id: 'seed-0001',
      mode: 'learning',
      solved: true,
      first_try: true,
      hints_used: 0,
      solution_shown: false,
      time_ms: 12_000,
      themes: ['mateIn1'],
      puzzle_rating: 400,
      puzzle_rd: 80,
      rating_before: null,
      rating_after: null,
      created_at: NOW,
    }),
    review_queue: () => ({
      id,
      user_id: owner,
      item_type: 'puzzle',
      object_id: 'seed-0001',
      due_at: NOW,
      interval_days: 1,
      updated_at: NOW,
    }),
    games: () => ({
      id: refs.gameId ?? id,
      user_id: owner,
      source: 'bot',
      external_id: null,
      bot_id: 'bot-1',
      user_color: 'w',
      assistance: 'training',
      time_control: { kind: 'none' },
      start_fen: START_FEN,
      pgn: '',
      headers: { White: 'Du', Black: 'Bot', BlackElo: '600' },
      status: 'active',
      result: '*',
      end_reason: null,
      origin: { type: 'new' },
      active_device_id: null,
      active_heartbeat_at: null,
      rating_before: null,
      rating_after: null,
      created_at: NOW,
      updated_at: NOW,
      finished_at: null,
    }),
    game_moves: () => ({
      id,
      game_id: refs.gameId ?? randomUUID(),
      user_id: owner,
      seq: 1,
      kind: 'move',
      ply: 1,
      uci: 'e2e4',
      san: 'e4',
      fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      plies: null,
      created_at: NOW,
    }),
    game_analyses: () => ({
      game_id: refs.gameId ?? id,
      user_id: owner,
      engine_id: 'stockfish',
      engine_version: '17',
      depth: 12,
      accuracy_white: 81.5,
      accuracy_black: 74.25,
      counts: { w: { ...counts }, b: { ...counts } },
      moves: [],
      key_moments: [3, 7],
      eval_graph: [{ ply: 0, winPctWhite: 50 }],
      created_at: NOW,
    }),
    bots: () => ({
      id: `bot-${id}`,
      name: 'Testbot',
      elo: 600,
      avatar: 'avatar.svg',
      style: 'solid',
      style_label_de: 'Solide',
      description_de: 'Ein Bot für Tests.',
      engine: { skill: 0 } as unknown as TableRows['bots']['engine'],
      repertoire: {} as unknown as TableRows['bots']['repertoire'],
      chat: {} as unknown as TableRows['bots']['chat'],
    }),
    courses: () => ({
      id: refs.courseId ?? `course-${id}`,
      stage: 1,
      order_index: 1,
      version: 1,
      title_de: 'Testkurs',
      description_de: 'Ein Kurs für Tests.',
      status: 'available',
      lesson_ids: [],
      test_lesson_id: null,
    }),
    lessons: () => ({
      id: refs.lessonId ?? `lesson-${id}`,
      course_id: refs.courseId ?? 'missing-course',
      order_index: 1,
      version: 1,
      kind: 'lesson',
      title_de: 'Testlektion',
      summary_de: 'Eine Lektion für Tests.',
      practice_themes: ['fork'],
      pass_threshold: null,
      sources: [],
    }),
    lesson_steps: () => ({
      lesson_id: refs.lessonId ?? 'missing-lesson',
      step_index: 0,
      step_id: 's1',
      type: 'explanation',
      content: { id: 's1', type: 'explanation', textDe: 'Der König zieht ein Feld weit.' },
    }),
    lesson_progress: () => ({
      user_id: owner,
      lesson_id: `lesson-${id}`,
      lesson_version: 1,
      current_step: 2,
      completed: false,
      stars: 0,
      mistakes: 1,
      hints_used: 0,
      score: null,
      updated_at: NOW,
      completed_at: null,
    }),
    daily_activity: () => ({
      user_id: owner,
      date: '2026-10-18',
      minutes: 5,
      puzzles: 1,
      games: 0,
      lessons: 0,
      goal_reached: false,
    }),
    theme_stats: () => ({ user_id: owner, theme: 'fork', attempts: 3, successes: 2 }),
    explanation_usage: () => ({ user_id: owner, date: '2026-10-18', count: 3 }),
    explanation_feedback: () => ({
      id,
      user_id: owner,
      context: 'analysis',
      ref: 'game-1:12',
      vote: 1,
      created_at: NOW,
    }),
  };
  return rows[table]() as TableRows[T];
}

/** Deterministic PRNG (mulberry32) for generated test sequences: `next()` in [0, 1). */
export function seededRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Integer in [min, max]. */
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
    /** Uniform number in [min, max). */
    real: (min: number, max: number): number => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    bool: (p = 0.5): boolean => next() < p,
  };
}
