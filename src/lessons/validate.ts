/**
 * Runtime checks of lesson content before it is shown (D-26): zod schema (`lessonSchema`), file path consistency and
 * chess legality of every position and move via `@/lib/chess`. Engine claims ("best move", "mate in N") are checked
 * at build time by `npm run validate:content` (WP-07); here we only make sure nothing can crash the player.
 */
import type { MoveTreeNode, Lesson } from '@/core/lessons';
import { lessonSchema } from '@/core/schemas';
import { ChessGame, validateFen } from '@/lib/chess';
import { LESSONS_DE } from './strings.de';

const E = LESSONS_DE.errors;

/** zod issues as one German line (first three issues with their paths). */
export function formatSchemaIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  const parts = issues.slice(0, 3).map((i) => (i.path.length > 0 ? `${i.path.map(String).join('.')}: ${i.message}` : i.message));
  const more = issues.length > 3 ? ` (+${issues.length - 3})` : '';
  return parts.join('; ') + more;
}

function checkFen(fen: string, where: string, errors: string[]): boolean {
  const v = validateFen(fen);
  if (!v.ok) errors.push(E.illegalFen(where, v.errorDe ?? ''));
  return v.ok;
}

function checkTree(fen: string, nodes: readonly MoveTreeNode[], where: string, errors: string[], depth = 0): void {
  if (depth > 64) return;
  for (const node of nodes) {
    let game: ChessGame;
    try {
      game = ChessGame.fromFen(fen);
    } catch {
      return;
    }
    const record = game.move(node.move);
    if (!record) {
      errors.push(E.illegalMove(where, node.move));
      continue;
    }
    checkTree(record.fenAfter, node.children, where, errors, depth + 1);
  }
}

/** Legality errors of a schema-valid lesson (empty = fine). */
export function lessonPositionErrors(lesson: Lesson): string[] {
  const errors: string[] = [];
  for (const step of lesson.steps) {
    const where = E.step(step.id);
    switch (step.type) {
      case 'explanation':
        if (step.fen) checkFen(step.fen, where, errors);
        break;
      case 'demo': {
        if (!checkFen(step.startFen, where, errors)) break;
        try {
          const game = ChessGame.fromFen(step.startFen);
          for (const m of step.moves) {
            if (!game.move(m.uci)) {
              errors.push(E.illegalMove(where, m.uci));
              break;
            }
          }
        } catch {
          errors.push(E.illegalFen(where, step.startFen));
        }
        break;
      }
      case 'find_move':
        if (checkFen(step.fen, where, errors)) checkTree(step.fen, step.solution, where, errors);
        break;
      case 'quiz':
        if (step.fen) checkFen(step.fen, where, errors);
        step.asserts?.forEach((a, n) => checkFen(a.fen, E.assert(step.id, n), errors));
        break;
      case 'play_out':
        checkFen(step.fen, where, errors);
        break;
    }
  }
  return errors;
}

/** Result of `parseLessonFile`. */
export type ParsedLesson = { ok: true; lesson: Lesson } | { ok: false; messageDe: string };

/**
 * Validates raw JSON of `content/lessons/<courseId>/<lessonId>.json`: schema, `id`/`courseId` equal to the path,
 * legal positions and moves.
 */
export function parseLessonFile(raw: unknown, courseId: string, lessonId: string): ParsedLesson {
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, messageDe: `${E.schema}: ${formatSchemaIssues(parsed.error.issues)}` };
  const lesson = parsed.data as Lesson;
  if (lesson.id !== lessonId) return { ok: false, messageDe: E.idMismatch('id', lessonId, lesson.id) };
  if (lesson.courseId !== courseId) return { ok: false, messageDe: E.idMismatch('courseId', courseId, lesson.courseId) };
  const errors = lessonPositionErrors(lesson);
  if (errors.length > 0) return { ok: false, messageDe: errors.slice(0, 3).join(' ') + (errors.length > 3 ? ` (+${errors.length - 3})` : '') };
  return { ok: true, lesson };
}
