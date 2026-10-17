/**
 * Machine check of the fixture course (every FEN, move and claim, via `@/lib/chess`): schema and legality
 * (`parseLessonFile`), quiz asserts, the correct quiz options, forced mates of the "Finde den Zug" claims (all first
 * moves that force the mate are accepted) and that every "Ausspielen" goal can be forced within `maxMoves`.
 */
import { describe, expect, it } from 'vitest';
import type { Lesson, MoveTreeNode, QuizAssert } from '@/core/lessons';
import { ChessGame } from '@/lib/chess';
import * as fixtures from './__fixtures__';
import { parseCatalog } from './loader';
import { parseLessonFile } from './validate';

function load(key: string): Lesson {
  const [courseId, lessonId] = key.split('/') as [string, string];
  const parsed = parseLessonFile(fixtures.lessons[key], courseId, lessonId);
  if (!parsed.ok) throw new Error(`${key}: ${parsed.messageDe}`);
  return parsed.lesson;
}

/** Whether the side to move can force mate within `n` own moves. */
function forcesMate(fen: string, n: number): boolean {
  if (n <= 0) return false;
  const game = ChessGame.fromFen(fen);
  return game.legalMoves().some((m) => {
    const g = ChessGame.fromFen(fen);
    const r = g.move(m.uci)!;
    if (r.isCheckmate) return true;
    if (g.status().isOver) return false;
    const replies = g.legalMoves();
    return replies.every((reply) => {
      const h = ChessGame.fromFen(r.fenAfter);
      const rr = h.move(reply.uci)!;
      return !h.status().isOver && forcesMate(rr.fenAfter, n - 1);
    });
  });
}

/** First moves that force mate within `n` moves. */
function matingFirstMoves(fen: string, n: number): string[] {
  return ChessGame.fromFen(fen)
    .legalMoves()
    .filter((m) => {
      const g = ChessGame.fromFen(fen);
      const r = g.move(m.uci)!;
      if (r.isCheckmate) return true;
      if (g.status().isOver || n <= 1) return false;
      return g.legalMoves().every((reply) => {
        const h = ChessGame.fromFen(r.fenAfter);
        const rr = h.move(reply.uci)!;
        return !h.status().isOver && forcesMate(rr.fenAfter, n - 1);
      });
    })
    .map((m) => m.uci);
}

function checkAssert(a: QuizAssert): boolean {
  const game = ChessGame.fromFen(a.fen);
  const status = game.status();
  switch (a.kind) {
    case 'isCheckmate':
      return (status.reason === 'checkmate') === a.expect;
    case 'isStalemate':
      return (status.reason === 'stalemate') === a.expect;
    case 'isCheck':
      return status.inCheck === a.expect;
    case 'isInsufficientMaterial':
      return (status.reason === 'insufficient_material') === a.expect;
    case 'isLegalMove':
      return (game.move(a.move) !== null) === a.expect;
    case 'bestMove':
      return game.move(a.move) !== null;
  }
}

/** Every line of a move tree ends with the user's mate. */
function linesEndInMate(fen: string, nodes: readonly MoveTreeNode[]): boolean {
  return nodes.every((node) => {
    const game = ChessGame.fromFen(fen);
    const r = game.move(node.move);
    if (!r) return false;
    if (node.children.length === 0) return r.isCheckmate;
    return node.children.every((reply) => {
      const g = ChessGame.fromFen(r.fenAfter);
      const rr = g.move(reply.move);
      return !!rr && reply.children.length > 0 && linesEndInMate(rr.fenAfter, reply.children);
    });
  });
}

const KEYS = Object.keys(fixtures.lessons);

describe('fixture course', () => {
  it('catalog is valid; every listed lesson exists and the skip test is not listed', () => {
    const catalog = parseCatalog({ courses: fixtures.courses });
    expect(catalog.errors).toEqual([]);
    const course = catalog.courses[0]!;
    for (const id of [...course.lessonIds, course.testLessonId!]) expect(KEYS).toContain(`${course.id}/${id}`);
    expect([...course.lessonIds, course.testLessonId]).not.toContain(fixtures.skipTest!.split('/')[1]);
    expect(load(fixtures.skipTest!).kind).toBe('skip_test');
    expect(load('fixture-course/fixture-test').kind).toBe('course_test');
  });

  it('the first lesson uses all five step types', () => {
    expect(new Set(load('fixture-course/fixture-lesson').steps.map((s) => s.type))).toEqual(
      new Set(['explanation', 'demo', 'find_move', 'quiz', 'play_out']),
    );
  });

  for (const key of KEYS) {
    describe(key, () => {
      const lesson = load(key);

      it('passes schema and legality checks', () => {
        expect(lesson.id).toBe(key.split('/')[1]);
      });

      for (const step of lesson.steps) {
        if (step.type === 'quiz') {
          it(`quiz ${step.id}: asserts hold and exactly one option is correct`, () => {
            for (const a of step.asserts ?? []) expect(checkAssert(a), JSON.stringify(a)).toBe(true);
            expect(step.options.filter((o) => o.correct)).toHaveLength(1);
            expect(step.options.every((o) => !!o.feedbackDe)).toBe(true);
          });
        }
        if (step.type === 'find_move') {
          it(`find_move ${step.id}: every line ends in mate and all forcing first moves are accepted`, () => {
            expect(step.claim.kind).toBe('mate');
            const n = step.claim.kind === 'mate' ? step.claim.mateIn : 0;
            expect(linesEndInMate(step.fen, step.solution)).toBe(true);
            expect(forcesMate(step.fen, n)).toBe(true);
            expect(forcesMate(step.fen, n - 1)).toBe(false);
            const accepted = step.solution.map((s) => s.move).sort();
            expect(matingFirstMoves(step.fen, n).sort()).toEqual(accepted);
          });
        }
        if (step.type === 'demo') {
          it(`demo ${step.id}: all moves are legal; a "Matt" comment is a real mate`, () => {
            const game = ChessGame.fromFen(step.startFen);
            for (const m of step.moves) {
              const r = game.move(m.uci);
              expect(r, m.uci).not.toBeNull();
              if (m.commentDe?.includes('Matt')) expect(r!.isCheckmate).toBe(true);
            }
          });
        }
        if (step.type === 'play_out') {
          it(`play_out ${step.id}: the goal can be forced within maxMoves`, () => {
            expect(step.goal).toBe('checkmate');
            expect(ChessGame.fromFen(step.fen).turn()).toBe(step.userColor);
            expect(forcesMate(step.fen, step.maxMoves)).toBe(true);
          });
        }
      }
    });
  }

  it('quiz texts match the positions (fixture-lesson-2: only Td8 mates)', () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1';
    const mates = ChessGame.fromFen(fen)
      .legalMoves()
      .filter((m) => ChessGame.fromFen(fen).move(m.uci)!.isCheckmate)
      .map((m) => m.uci);
    expect(mates).toEqual(['d1d8']);
    expect(ChessGame.fromFen(fen).move('d1d7')!.isCheck).toBe(false);
    expect(ChessGame.fromFen(fen).move('g1f1')!.isCheck).toBe(false);
  });
});
