import { describe, expect, it } from 'vitest';
import { ChessGame, uciToSan, validateFen } from '@/lib/chess';
import { START_FEN } from '../chess';
import { lessonSchema, courseMetaSchema, puzzleSchema } from '../schemas';
import { puzzleThemeById } from '../puzzles';
import { FIXTURE_BOTS, FIXTURE_COURSE, FIXTURE_GAME, FIXTURE_LESSON, FIXTURE_PUZZLES } from './fixtures';

describe('FIXTURE_GAME', () => {
  it('is a legal 40-move game whose PGN, UCI and SAN lists agree', () => {
    const fromPgn = ChessGame.fromPgn(FIXTURE_GAME.pgn);
    expect(fromPgn.uciMoves()).toEqual(FIXTURE_GAME.moves);
    expect(FIXTURE_GAME.moves).toHaveLength(80);
    const replay = ChessGame.fromMoves(START_FEN, FIXTURE_GAME.moves);
    expect(replay.history().map((m) => m.san)).toEqual(FIXTURE_GAME.sans);
    expect(replay.fen()).toBe(FIXTURE_GAME.finalFen);
    expect(replay.status().isOver).toBe(false);
  });

  it('describes the known blunder consistently', () => {
    const b = FIXTURE_GAME.blunder;
    const rec = ChessGame.fromMoves(START_FEN, FIXTURE_GAME.moves).history()[b.ply - 1]!;
    expect(rec).toMatchObject({ uci: b.uci, san: b.san, color: b.color, fenBefore: b.fenBefore });
    expect(uciToSan(b.fenBefore, b.bestMove)).toBe(b.bestMoveSan);
    expect(b.expectedPointsLoss).toBeGreaterThanOrEqual(0.2);
  });
});

describe('FIXTURE_PUZZLES', () => {
  it('has 5 schema-valid, legal puzzles with known themes', () => {
    expect(FIXTURE_PUZZLES).toHaveLength(5);
    for (const p of FIXTURE_PUZZLES) {
      expect(puzzleSchema.parse(p)).toEqual(p);
      expect(validateFen(p.fen)).toEqual({ ok: true });
      for (const t of p.themes) expect(puzzleThemeById(t), `${p.id}: ${t}`).toBeDefined();
      const g = ChessGame.fromMoves(p.fen, p.moves);
      if (p.themes.includes('mate')) expect(g.status().reason, p.id).toBe('checkmate');
      // Explanations only name moves of the solution line.
      const sans = ChessGame.fromMoves(p.fen, p.moves).history().map((m) => m.san);
      for (const s of p.explanation?.segments ?? []) {
        if (s.type === 'move' && p.id !== 'fixture-two-mates') expect(sans).toContain(s.san);
      }
    }
  });

  it('includes a puzzle with two mating moves', () => {
    const p = FIXTURE_PUZZLES.find((x) => x.id === 'fixture-two-mates')!;
    const g = ChessGame.fromFen(p.fen);
    g.move(p.moves[0]!);
    const mates = g.legalMoves().filter((m) => {
      const probe = ChessGame.fromFen(g.fen());
      probe.move(m.uci);
      return probe.status().reason === 'checkmate';
    });
    expect(mates.map((m) => m.uci).sort()).toEqual(['a1a8', 'b1b8']);
  });
});

describe('FIXTURE_COURSE / FIXTURE_LESSON', () => {
  it('parse with the schemas and use all five step types', () => {
    expect(courseMetaSchema.parse(FIXTURE_COURSE)).toEqual(FIXTURE_COURSE);
    expect(lessonSchema.parse(FIXTURE_LESSON)).toEqual(FIXTURE_LESSON);
    expect(new Set(FIXTURE_LESSON.steps.map((s) => s.type))).toEqual(
      new Set(['explanation', 'demo', 'find_move', 'quiz', 'play_out']),
    );
  });

  it('contains only legal positions and moves', () => {
    for (const step of FIXTURE_LESSON.steps) {
      if (step.type === 'explanation' && step.fen) expect(validateFen(step.fen)).toEqual({ ok: true });
      if (step.type === 'demo') expect(() => ChessGame.fromMoves(step.startFen, step.moves.map((m) => m.uci))).not.toThrow();
      if (step.type === 'find_move') {
        const g = ChessGame.fromFen(step.fen);
        g.move(step.solution[0]!.move);
        expect(g.status().reason).toBe('checkmate');
      }
      if (step.type === 'quiz') {
        for (const a of step.asserts ?? []) {
          const s = ChessGame.fromFen(a.fen).status();
          if (a.kind === 'isStalemate') expect(s.reason === 'stalemate').toBe(a.expect);
          if (a.kind === 'isCheckmate') expect(s.reason === 'checkmate').toBe(a.expect);
        }
      }
      if (step.type === 'play_out') expect(validateFen(step.fen)).toEqual({ ok: true });
    }
  });
});

describe('FIXTURE_BOTS', () => {
  it('have legal repertoire lines', () => {
    for (const bot of FIXTURE_BOTS) {
      for (const line of [...bot.repertoire.white, ...bot.repertoire.black]) {
        const g = ChessGame.fromFen(START_FEN);
        for (const san of line) expect(g.move(san), `${bot.id}: ${san}`).not.toBeNull();
      }
    }
  });
});
