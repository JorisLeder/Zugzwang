import { describe, expect, it } from 'vitest';
import {
  APPEND_ONLY_TABLES,
  CLASSIFICATION_META,
  DEFAULT_SETTINGS,
  MOTIF_LABELS_DE,
  MOVE_CLASSIFICATIONS,
  PUZZLE_THEMES,
  RATING_DEFAULTS,
  SELF_ASSESSMENT_OPTIONS,
  TABLE_NAMES,
  USER_ID_COLUMN,
  USER_TABLES,
  explainRequestSchema,
  explainResponseSchema,
  fromRow,
  gameImportRequestSchema,
  lessonSchema,
  movesFromEvents,
  puzzleBankManifestSchema,
  settingsSchema,
  toRow,
} from '@/core';
import { FIXTURE_COURSE, FIXTURE_GAME, FIXTURE_LESSON, FIXTURE_PUZZLES, FIXTURE_BOTS } from '@/core/testing';

describe('constants', () => {
  it('PUZZLE_THEMES: ≥ 30 themes, ≥ 20 trainable, unique ids, German labels', () => {
    expect(PUZZLE_THEMES.length).toBeGreaterThanOrEqual(30);
    expect(PUZZLE_THEMES.filter((t) => t.trainable).length).toBeGreaterThanOrEqual(20);
    expect(new Set(PUZZLE_THEMES.map((t) => t.id)).size).toBe(PUZZLE_THEMES.length);
    const required = [
      'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'hangingPiece', 'trappedPiece', 'deflection', 'attraction',
      'capturingDefender', 'sacrifice', 'intermezzo', 'clearance', 'interference', 'xRayAttack', 'exposedKing', 'backRankMate',
      'smotheredMate', 'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'promotion', 'underPromotion', 'advancedPawn',
      'zugzwang', 'enPassant', 'castling', 'endgame', 'pawnEndgame', 'rookEndgame', 'queenEndgame', 'opening', 'middlegame',
    ];
    for (const id of required) expect(PUZZLE_THEMES.find((t) => t.id === id)?.trainable, id).toBe(true);
    for (const id of ['oneMove', 'short', 'long', 'veryLong', 'mate', 'crushing', 'advantage', 'equality']) {
      expect(PUZZLE_THEMES.find((t) => t.id === id)?.trainable, id).toBe(false);
    }
    for (const t of PUZZLE_THEMES) {
      expect(t.labelDe.length).toBeGreaterThan(1);
      expect(t.descriptionDe).toMatch(/[.!]$/);
    }
  });

  it('SELF_ASSESSMENT_OPTIONS match D-10', () => {
    expect(SELF_ASSESSMENT_OPTIONS.map((o) => [o.id, o.puzzleRating, o.botRating, o.startStage])).toEqual([
      ['newcomer', 400, 200, 0],
      ['beginner', 600, 400, 1],
      ['club', 1000, 1000, 1],
      ['advanced', 1500, 1600, 1],
    ]);
  });

  it('DEFAULT_SETTINGS and RATING_DEFAULTS match BACKLOG/D-09', () => {
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: 'dark',
      boardTheme: 'moos',
      notation: 'de',
      sound: true,
      animations: true,
      showCoordinates: true,
      showLegalMoves: true,
      moveConfirmation: false,
    });
    expect(RATING_DEFAULTS).toMatchObject({ rd: 350, volatility: 0.06, tau: 0.5, minRd: 45, maxRd: 350, puzzleRd: 80, botRd: 50 });
  });

  it('CLASSIFICATION_META covers all 10 categories with exactly one of symbol/icon (DESIGN §2.3)', () => {
    expect(MOVE_CLASSIFICATIONS).toHaveLength(10);
    for (const c of MOVE_CLASSIFICATIONS) {
      const m = CLASSIFICATION_META[c];
      expect(Boolean(m.symbol) !== Boolean(m.icon), c).toBe(true);
      expect(m.fillVar).toBe(`--zz-cls-${c}`);
      expect(m.inkVar).toBe(`--zz-cls-${c}-ink`);
      expect(m.plainDe.length).toBeGreaterThan(10);
    }
    expect(MOVE_CLASSIFICATIONS.map((c) => CLASSIFICATION_META[c].labelDe)).toEqual([
      'Brillant', 'Großartig', 'Bester Zug', 'Exzellent', 'Gut', 'Buchzug', 'Ungenauigkeit', 'Fehler', 'Verpasst', 'Patzer',
    ]);
    expect(Object.keys(MOTIF_LABELS_DE)).toHaveLength(14);
  });
});

describe('schemas', () => {
  it('explain request/response', () => {
    const facts = {
      kind: 'mistake' as const,
      mover: 'w' as const,
      fenBefore: FIXTURE_GAME.blunder.fenBefore,
      playedMove: { uci: 'd1c2', san: 'Qc2' },
      bestMove: { uci: 'f1f2', san: 'Rxf2' },
      bestLine: ['Rxf2'],
      refutation: ['Nxd3+'],
      motifs: [],
    };
    expect(explainRequestSchema.safeParse({ context: 'analysis', facts, language: 'de' }).success).toBe(true);
    expect(explainRequestSchema.safeParse({ context: 'analysis', facts, language: 'en' }).success).toBe(false);
    expect(explainResponseSchema.safeParse({ ok: true, segments: [{ type: 'text', text: 'Hallo' }], model: 'claude-opus-5-5' }).success).toBe(true);
    expect(explainResponseSchema.safeParse({ ok: false, error: 'refused' }).success).toBe(true);
    expect(explainResponseSchema.safeParse({ ok: false, error: 'boom' }).success).toBe(false);
  });

  it('game import request', () => {
    expect(gameImportRequestSchema.safeParse({ pgn: FIXTURE_GAME.pgn }).success).toBe(true);
    expect(gameImportRequestSchema.safeParse({ source: 'lichess', externalId: 'abcd1234' }).success).toBe(true);
    expect(gameImportRequestSchema.safeParse({}).success).toBe(false);
  });

  it('manifest and lesson validation errors', () => {
    expect(puzzleBankManifestSchema.safeParse({ version: '1', chunks: [{ file: 'seed.json', count: 5, source: 'seed', sha256: 'a'.repeat(64) }] }).success).toBe(true);
    expect(puzzleBankManifestSchema.safeParse({ version: '1', chunks: [{ file: 'x', count: 1, source: 'seed', sha256: 'nope' }] }).success).toBe(false);
    const dupSteps = { ...FIXTURE_LESSON, steps: [FIXTURE_LESSON.steps[0]!, FIXTURE_LESSON.steps[0]!] };
    expect(lessonSchema.safeParse(dupSteps).success).toBe(false);
    const badQuiz = {
      ...FIXTURE_LESSON,
      steps: [{ id: 'q', type: 'quiz', questionDe: 'Frage?', options: [{ id: 'a', textDe: 'A', correct: true }, { id: 'b', textDe: 'B', correct: true }] }],
    };
    expect(lessonSchema.safeParse(badQuiz).success).toBe(false);
  });
});

describe('tables', () => {
  it('table lists are consistent', () => {
    for (const t of USER_TABLES) expect(TABLE_NAMES).toContain(t);
    for (const t of APPEND_ONLY_TABLES) expect(USER_TABLES as readonly string[]).toContain(t);
    expect(Object.keys(USER_ID_COLUMN).sort()).toEqual([...USER_TABLES].sort());
    expect(TABLE_NAMES).toHaveLength(17);
  });

  it('toRow/fromRow round-trip entities', () => {
    const u = 'user-1';
    for (const p of FIXTURE_PUZZLES) expect(fromRow.puzzle(toRow.puzzle(p))).toEqual(p);
    expect(fromRow.course(toRow.course(FIXTURE_COURSE))).toEqual(FIXTURE_COURSE);
    expect(fromRow.lesson(toRow.lesson(FIXTURE_LESSON), toRow.lessonSteps(FIXTURE_LESSON))).toEqual(FIXTURE_LESSON);
    expect(fromRow.bot(toRow.bot(FIXTURE_BOTS[0]!))).toEqual(FIXTURE_BOTS[0]);
    const attempt = { id: 'a1', puzzleId: 'p', mode: 'rated' as const, solved: true, firstTry: true, hintsUsed: 0 as const, solutionShown: false, timeMs: 1, themes: ['fork'], puzzleRating: 500, ratingBefore: 600, ratingAfter: 610, createdAt: 'x' };
    const row = toRow.puzzleAttempt(attempt, u, 80);
    expect(row).toMatchObject({ user_id: u, puzzle_rd: 80, first_try: true });
    expect(fromRow.puzzleAttempt(row)).toEqual(attempt);
    const event = { id: 'e', gameId: 'g', seq: 1, kind: 'move' as const, ply: 1, uci: 'e2e4', san: 'e4', fenAfter: 'f', createdAt: 'x' };
    expect(fromRow.gameMove(toRow.gameMove(event, u))).toEqual(event);
    const progress = { lessonId: 'l', lessonVersion: 1, currentStep: 2, completed: false, stars: 0 as const, mistakes: 1, hintsUsed: 0, updatedAt: 'x', completedAt: null };
    expect(fromRow.lessonProgress(toRow.lessonProgress(progress, u))).toEqual(progress);
  });

  it('movesFromEvents folds takebacks', () => {
    const e = (seq: number, kind: 'move' | 'takeback', extra: object) => ({ id: String(seq), gameId: 'g', seq, kind, ply: 0, createdAt: '', ...extra });
    expect(movesFromEvents([e(3, 'takeback', { plies: 1 }), e(1, 'move', { uci: 'e2e4' }), e(2, 'move', { uci: 'e7e5' }), e(4, 'move', { uci: 'c7c5' })])).toEqual([
      'e2e4',
      'c7c5',
    ]);
  });
});
