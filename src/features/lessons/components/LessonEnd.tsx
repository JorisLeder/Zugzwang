/**
 * End screen of a lesson (PRD Lektionen §4 "Bewertung", "Verzahnung"): stars, "Nächste Lektion", matching puzzles and
 * a practice game against the bot nearest to the learner's bot rating; for tests the score and the pass threshold.
 */
import { Puzzle, RotateCcw, Swords } from 'lucide-react';
import { useState, type ReactElement, type Ref } from 'react';
import { Link, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { START_FEN } from '@/core/chess';
import type { CourseMeta, Lesson, LessonProgress } from '@/core/lessons';
import { startBotGame } from '@/features/play/startGame';
import { formatPercent } from '@/i18n';
import { nextLessonFor, practiceBot, type LessonResult, type UnlockContext } from '@/lessons';
import { Button, ErrorState, Stars } from '@/ui/primitives';
import { nextAfter, practicePuzzles } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { useBotRating } from '../useLessonData';
import type { FrameParts } from './steps/stepTypes';

/** Props of `LessonEnd`. */
export interface LessonEndProps {
  lesson: Lesson;
  course: CourseMeta | undefined;
  result: LessonResult;
  /** Unlock context including this run's record. */
  ctx: UnlockContext;
  /** Best stored result before this run (D-13: the best is kept). */
  previous: LessonProgress | null;
  onRepeat: () => void;
  primaryRef?: Ref<HTMLAnchorElement & HTMLButtonElement>;
  /** Wraps panel and actions into the lesson frame. */
  frame: (parts: FrameParts) => ReactElement;
}

/** Where "Nächste Lektion" leads. */
function nextTarget(ctx: UnlockContext, course: CourseMeta | undefined, lesson: Lesson): { to: string; label: string } {
  const inCourse = nextAfter(ctx, course, lesson.id);
  if (course && inCourse.lessonId) {
    return {
      to: paths.lesson(course.id, inCourse.lessonId),
      label: inCourse.kind === 'course_test' ? STRINGS_DE.toCourseTest : STRINGS_DE.nextLessonButton,
    };
  }
  const next = nextLessonFor(ctx);
  if (next) return { to: paths.lesson(next.courseId, next.lessonId), label: STRINGS_DE.nextLessonButton };
  return { to: paths.learn(), label: STRINGS_DE.toLearnPath };
}

/** End screen. */
export function LessonEnd({ lesson, course, result, ctx, previous, onRepeat, primaryRef, frame }: LessonEndProps) {
  const services = useServices();
  const navigate = useNavigate();
  const botRating = useBotRating();
  const [starting, setStarting] = useState(false);
  const [gameError, setGameError] = useState(false);
  const test = result.test;
  const isSkip = lesson.kind === 'skip_test';
  const passed = result.completed;
  const bot = botRating === undefined ? null : practiceBot(services.botRoster, botRating?.rating ?? null, course?.stage ?? 0);
  const puzzles = practicePuzzles(lesson);
  const next = nextTarget(ctx, course, lesson);

  const startPractice = async () => {
    if (!bot) return;
    setStarting(true);
    setGameError(false);
    try {
      const game = await startBotGame(services, {
        bot,
        color: 'w',
        assistance: 'coach',
        startFen: START_FEN,
        origin: { type: 'lesson', ref: lesson.id },
      });
      await navigate(paths.playGame(game.id));
    } catch (err) {
      console.warn('Practice game could not be started', err);
      setGameError(true);
      setStarting(false);
    }
  };

  const title = test ? (passed ? STRINGS_DE.testPassedTitle : STRINGS_DE.testFailedTitle) : STRINGS_DE.endTitle;
  const bestStars = Math.max(previous?.stars ?? 0, result.stars);

  const panel = (
    <div className="flex flex-col gap-5" data-testid="lesson-end" data-passed={passed} data-stars={result.stars}>
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-h2 text-text" tabIndex={-1} data-testid="lesson-end-title">
          {title}
        </h2>
        {!test && (
          <>
            <Stars value={result.stars} size={40} />
            <p className="text-body text-text" data-testid="lesson-end-summary">
              {STRINGS_DE.endSummary(result.mistakes, result.hintsUsed)}
            </p>
            {bestStars > result.stars && <p className="text-body-sm text-muted">{STRINGS_DE.bestStars(bestStars)}</p>}
          </>
        )}
        {test && (
          <>
            <p className="text-body-lg text-text" data-testid="test-score">
              {STRINGS_DE.testScoreLine(test.correct, test.total, formatPercent(test.score * 100, 0))}
            </p>
            <p className="text-body-sm text-muted">{STRINGS_DE.testThreshold(formatPercent(test.threshold * 100, 0))}</p>
            {passed && isSkip && <p className="text-body text-accent-text">{STRINGS_DE.skipPassedText}</p>}
            {passed && !isSkip && course && <p className="text-body text-accent-text">{STRINGS_DE.courseDone(course.titleDe)}</p>}
            {!passed && <p className="text-body text-text">{isSkip ? STRINGS_DE.skipFailedText : STRINGS_DE.testFailedText}</p>}
          </>
        )}
      </div>
      {!isSkip && passed && (
        <section aria-labelledby="lesson-practice" className="flex flex-col gap-2">
          <h3 id="lesson-practice" className="text-h3 text-text">
            {STRINGS_DE.practiceTitle}
          </h3>
          <Button asChild variant="secondary" fullWidth>
            <Link to={puzzles.to} data-testid="matching-puzzles">
              <Puzzle aria-hidden="true" />
              {puzzles.labelDe ? STRINGS_DE.matchingPuzzlesTheme(puzzles.labelDe) : STRINGS_DE.matchingPuzzles}
            </Link>
          </Button>
          {bot && (
            <Button variant="secondary" fullWidth icon={<Swords />} loading={starting} onClick={() => void startPractice()} data-testid="practice-game" data-bot-id={bot.id}>
              {STRINGS_DE.practiceGame(bot.name, bot.elo)}
            </Button>
          )}
          {gameError && <ErrorState message={STRINGS_DE.practiceGameError} />}
        </section>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {passed && !isSkip && (
          <Button variant="ghost" icon={<RotateCcw />} onClick={onRepeat}>
            {test ? STRINGS_DE.retryTest : STRINGS_DE.repeatLesson}
          </Button>
        )}
        {course && !isSkip && (
          <Button asChild variant="ghost">
            <Link to={paths.course(course.id)}>{STRINGS_DE.backToCourse}</Link>
          </Button>
        )}
      </div>
    </div>
  );

  let primary;
  if (test && !passed) {
    primary = (
      <Button ref={primaryRef} variant="primary" className="ml-auto flex-1 lg:flex-none" icon={<RotateCcw />} onClick={onRepeat} data-testid="lesson-primary">
        {STRINGS_DE.retryTest}
      </Button>
    );
    if (isSkip) {
      primary = (
        <>
          <Button variant="secondary" onClick={onRepeat}>
            {STRINGS_DE.retryTest}
          </Button>
          <Button asChild variant="primary" className="ml-auto flex-1 lg:flex-none">
            <Link ref={primaryRef} to={paths.learn()} data-testid="lesson-primary">
              {STRINGS_DE.startStageZero}
            </Link>
          </Button>
        </>
      );
    }
  } else {
    const target = isSkip ? { to: paths.learn(), label: STRINGS_DE.toStageOne } : next;
    primary = (
      <Button asChild variant="primary" className="ml-auto flex-1 lg:flex-none">
        <Link ref={primaryRef} to={target.to} data-testid="lesson-primary">
          {target.label}
        </Link>
      </Button>
    );
  }
  return frame({ panel, actions: primary });
}
