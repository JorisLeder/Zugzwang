import { describe, expect, it } from 'vitest';
import type { AnalysedMove, GameAnalysis, GamePhase, MoveClassification } from '@/core/analysis';
import type { Color } from '@/core/chess';
import type { MotifId } from '@/core/explain';
import type { ThemeStat } from '@/core/profile';
import {
  downsample,
  isSkillTheme,
  mistakeCounts,
  mistakeMotifs,
  MOTIF_THEME,
  pairAnalyses,
  phaseAccuracy,
  ratingSeries,
  recommendTraining,
  themeSuccess,
  userColors,
  weakestTheme,
  weaknessProfile,
  weakPhases,
  weakThemes,
  type AnalysedGame,
} from './index';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface MoveSpec {
  color: Color;
  phase: GamePhase;
  accuracy: number;
  cls?: MoveClassification;
  motifs?: MotifId[];
}

function move(ply: number, s: MoveSpec): AnalysedMove {
  return {
    ply,
    color: s.color,
    san: 'e4',
    uci: 'e2e4',
    fenBefore: START,
    fenAfter: START,
    evalBefore: { type: 'cp', value: 0 },
    evalAfter: { type: 'cp', value: 0 },
    bestMove: 'e2e4',
    bestMoveSan: 'e4',
    bestLine: [],
    playedLine: [],
    winPctBefore: 50,
    winPctAfter: 50,
    expectedPointsLoss: 0,
    accuracy: s.accuracy,
    classification: s.cls ?? 'good',
    phase: s.phase,
    facts: s.motifs
      ? { kind: 'mistake', mover: s.color, fenBefore: START, bestLine: [], refutation: [], motifs: s.motifs.map((id) => ({ id, squares: [], pieces: [] })) }
      : undefined,
  };
}

function analysis(gameId: string, moves: MoveSpec[], createdAt = '2026-10-01T10:00:00.000Z'): GameAnalysis {
  const counts = { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 };
  return {
    gameId,
    engineId: 'test',
    engineVersion: '1',
    depth: 12,
    createdAt,
    accuracy: { w: 80, b: 80 },
    counts: { w: { ...counts }, b: { ...counts } },
    moves: moves.map((m, i) => move(i + 1, m)),
    keyMoments: [],
    evalGraph: [],
  };
}

const botWhite: AnalysedGame['game'] = { source: 'bot', userColor: 'w' };
const imported: AnalysedGame['game'] = { source: 'pgn', userColor: null };

describe('ratingSeries', () => {
  it('summarises an empty history', () => {
    expect(ratingSeries([])).toEqual({ points: [], count: 0, current: null, first: null, delta: 0, min: null, max: null, peak: null });
  });

  it('sorts by time, ignores invalid points and reports current, delta, min, max and peak', () => {
    const s = ratingSeries([
      { at: '2026-10-03T00:00:00.000Z', rating: 640 },
      { at: '2026-10-01T00:00:00.000Z', rating: 600 },
      { at: '2026-10-02T00:00:00.000Z', rating: 700 },
      { at: '2026-10-04T00:00:00.000Z', rating: Number.NaN },
    ]);
    expect(s.points.map((p) => p.rating)).toEqual([600, 700, 640]);
    expect(s).toMatchObject({ count: 3, first: 600, current: 640, delta: 40, min: 600, max: 700 });
    expect(s.peak).toEqual({ at: '2026-10-02T00:00:00.000Z', rating: 700 });
  });

  it('downsamples long histories but keeps the first and the last point', () => {
    const history = Array.from({ length: 500 }, (_, i) => ({ at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), rating: 1000 + i }));
    const s = ratingSeries(history, { maxPoints: 50 });
    expect(s.points).toHaveLength(50);
    expect(s.points[0]!.rating).toBe(1000);
    expect(s.points.at(-1)!.rating).toBe(1499);
    expect(s.count).toBe(500);
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });
});

describe('theme success', () => {
  const stats: ThemeStat[] = [
    { theme: 'fork', attempts: 10, successes: 4 },
    { theme: 'pin', attempts: 6, successes: 3 },
    { theme: 'mateIn1', attempts: 4, successes: 0 },
    { theme: 'short', attempts: 30, successes: 1 }, // meta tag – never reported
    { theme: 'unknownTheme', attempts: 9, successes: 0 },
    { theme: 'skewer', attempts: 8, successes: 7 },
  ];

  it('reports skill themes only, most attempts first, with the rate in percent', () => {
    const rows = themeSuccess(stats);
    expect(rows.map((r) => r.theme.id)).toEqual(['fork', 'skewer', 'pin', 'mateIn1']);
    expect(rows[0]).toMatchObject({ attempts: 10, successes: 4, rate: 40 });
    expect(rows[0]!.theme.labelDe).toBe('Gabel');
    expect(isSkillTheme('short')).toBe(false);
    expect(isSkillTheme('fork')).toBe(true);
  });

  it('merges duplicate rows and clamps broken counts', () => {
    const rows = themeSuccess([
      { theme: 'fork', attempts: 3, successes: 5 },
      { theme: 'fork', attempts: 2, successes: -1 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attempts: 5, successes: 3, rate: 60 });
  });

  it('weak themes need ≥ 5 attempts and < 60 %, weakest first', () => {
    expect(weakThemes(stats).map((t) => t.theme.id)).toEqual(['fork', 'pin']);
    expect(weakestTheme(stats)?.theme.id).toBe('fork');
    expect(weakestTheme([{ theme: 'fork', attempts: 5, successes: 3 }])).toBeNull(); // exactly 60 % is not weak
    expect(weakestTheme([{ theme: 'fork', attempts: 4, successes: 0 }])).toBeNull(); // too few attempts
    // Tie on the rate: more attempts first.
    expect(weakThemes([
      { theme: 'pin', attempts: 5, successes: 1 },
      { theme: 'fork', attempts: 10, successes: 2 },
    ]).map((t) => t.theme.id)).toEqual(['fork', 'pin']);
  });
});

describe('game statistics', () => {
  const games: AnalysedGame[] = [
    {
      game: botWhite,
      analysis: analysis('g1', [
        { color: 'w', phase: 'opening', accuracy: 100 },
        { color: 'b', phase: 'opening', accuracy: 0, cls: 'blunder', motifs: ['pin'] }, // the bot's move – ignored
        { color: 'w', phase: 'opening', accuracy: 80 },
        { color: 'w', phase: 'middlegame', accuracy: 40, cls: 'blunder', motifs: ['fork', 'fork'] },
        { color: 'w', phase: 'middlegame', accuracy: 60, cls: 'mistake', motifs: ['fork', 'hanging_piece'] },
        { color: 'w', phase: 'middlegame', accuracy: 70, cls: 'inaccuracy' },
      ], '2026-10-01T10:00:00.000Z'),
    },
    {
      game: imported,
      analysis: analysis('g2', [
        { color: 'w', phase: 'endgame', accuracy: 50, cls: 'miss', motifs: ['back_rank'] },
        { color: 'b', phase: 'endgame', accuracy: 30, cls: 'blunder', motifs: ['hanging_piece'] },
      ], '2026-10-05T10:00:00.000Z'),
    },
  ];

  it('knows whose moves count', () => {
    expect(userColors(botWhite)).toEqual(['w']);
    expect(userColors(imported)).toEqual(['w', 'b']);
    expect(userColors(null)).toEqual(['w', 'b']);
  });

  it('averages the user move accuracy per phase', () => {
    expect(phaseAccuracy(games)).toEqual([
      { phase: 'opening', moves: 2, accuracy: 90, games: 1 },
      { phase: 'middlegame', moves: 3, accuracy: (40 + 60 + 70) / 3, games: 1 },
      { phase: 'endgame', moves: 2, accuracy: 40, games: 1 },
    ]);
    expect(phaseAccuracy([]).map((p) => p.accuracy)).toEqual([null, null, null]);
  });

  it('counts mistake classifications of the user', () => {
    expect(mistakeCounts(games)).toEqual([
      { classification: 'inaccuracy', count: 1 },
      { classification: 'mistake', count: 1 },
      { classification: 'miss', count: 1 },
      { classification: 'blunder', count: 2 },
    ]);
  });

  it('ranks mistake motifs (once per move, recent first on ties)', () => {
    const motifs = mistakeMotifs(games);
    expect(motifs.map((m) => [m.motif, m.count])).toEqual([
      ['hanging_piece', 2], // tie with fork – seen more recently
      ['fork', 2],
      ['back_rank', 1],
    ]);
    expect(motifs[0]!.lastAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('pairs analyses with their games', () => {
    const a = analysis('x', []);
    const paired = pairAnalyses([a, analysis('missing', [])], [{ id: 'x', source: 'bot', userColor: 'b' } as never]);
    expect(paired[0]!.game).toMatchObject({ userColor: 'b' });
    expect(paired[1]!.game).toBeNull();
  });

  it('builds the weakness profile', () => {
    const many: AnalysedGame[] = [
      {
        game: botWhite,
        analysis: analysis('g3', Array.from({ length: 12 }, () => ({ color: 'w' as const, phase: 'endgame' as const, accuracy: 55 }))),
      },
      {
        game: botWhite,
        analysis: analysis('g4', Array.from({ length: 12 }, () => ({ color: 'w' as const, phase: 'opening' as const, accuracy: 95 }))),
      },
    ];
    expect(weakPhases(many).map((p) => p.phase)).toEqual(['endgame']);
    const profile = weaknessProfile({ themeStats: [{ theme: 'pin', attempts: 6, successes: 1 }], games: [...games, ...many] });
    expect(profile.themes.map((t) => t.theme.id)).toEqual(['pin']);
    expect(profile.phases.map((p) => p.phase)).toEqual(['endgame']);
    expect(profile.motifs.map((m) => m.motif)).toEqual(['hanging_piece', 'fork', 'back_rank']);
    expect(profile.empty).toBe(false);
    expect(weaknessProfile({ themeStats: [], games: [] }).empty).toBe(true);
  });
});

describe('recommendTraining', () => {
  const base = { themeStats: [], games: [], nextLesson: null, fittingBotId: null };

  it('1. recommends the weakest theme with enough attempts', () => {
    expect(
      recommendTraining({
        ...base,
        themeStats: [
          { theme: 'fork', attempts: 10, successes: 5 },
          { theme: 'pin', attempts: 5, successes: 1 },
        ],
        nextLesson: { courseId: 'c', lessonId: 'l' },
      }),
    ).toEqual({ kind: 'theme', reason: 'weak_theme', themeId: 'pin', rate: 20, attempts: 5 });
  });

  it('2. else the most frequent mistake motif from analysed games, mapped to a theme', () => {
    const games: AnalysedGame[] = [
      {
        game: botWhite,
        analysis: analysis('g', [
          { color: 'w', phase: 'middlegame', accuracy: 10, cls: 'blunder', motifs: ['missed_win'] },
          { color: 'w', phase: 'middlegame', accuracy: 10, cls: 'blunder', motifs: ['missed_win', 'back_rank'] },
          { color: 'w', phase: 'middlegame', accuracy: 10, cls: 'mistake', motifs: ['skewer'] },
        ]),
      },
    ];
    // missed_win has no theme → the next motif with a theme wins.
    expect(recommendTraining({ ...base, games, themeStats: [{ theme: 'fork', attempts: 4, successes: 0 }] })).toEqual({
      kind: 'theme',
      reason: 'game_motif',
      themeId: 'backRankMate',
      motif: 'back_rank',
      count: 1,
    });
    // Themes without puzzles in the bank are skipped when the caller knows the bank.
    expect(recommendTraining({ ...base, games, availableThemes: new Set(['skewer']) })).toMatchObject({ themeId: 'skewer', motif: 'skewer' });
  });

  it('3. else the next lesson, 4. else a fitting bot, else nothing', () => {
    expect(recommendTraining({ ...base, nextLesson: { courseId: 'c', lessonId: 'l' }, fittingBotId: 'pip' })).toEqual({
      kind: 'lesson',
      reason: 'next_lesson',
      courseId: 'c',
      lessonId: 'l',
    });
    expect(recommendTraining({ ...base, fittingBotId: 'pip' })).toEqual({ kind: 'bot', reason: 'fitting_bot', botId: 'pip' });
    expect(recommendTraining(base)).toBeNull();
  });

  it('maps every motif to a trainable theme or to nothing', () => {
    for (const theme of Object.values(MOTIF_THEME)) if (theme) expect(isSkillTheme(theme)).toBe(true);
  });
});
