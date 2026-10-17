/**
 * Lesson player (P0-12): shows one step at a time, counts mistakes and hints, writes the progress after every
 * completed step (`recordLessonProgress`, resume at the saved step – also after a reload or on another device),
 * finishes with stars (D-13) or the test score, and sets `profile.stageZeroSkipped` for a passed skip test (D-38).
 *
 * Keyboard (DESIGN §7.4): Enter = "Weiter", ←/→ = Zurück/Weiter on explanations, ←/→/Home/End through the demo's
 * moves, H = Hinweis in "Finde den Zug".
 */
import { ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { CourseMeta, Lesson, LessonProgress } from '@/core/lessons';
import {
  completeStep,
  createLessonSession,
  goNext,
  goPrev,
  isExercise,
  isTest,
  progressRecord,
  recordHint,
  recordMistake,
  restartSession,
  type LessonSession,
  type UnlockContext,
} from '@/lessons';
import { BoardMenu } from '@/ui/board';
import { Button, IconButton } from '@/ui/primitives';
import { withProgress } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { useShortcut } from '../useShortcut';
import { LessonEnd } from './LessonEnd';
import { LessonFrame } from './LessonFrame';
import { DemoStepView } from './steps/DemoStepView';
import { ExplanationStepView } from './steps/ExplanationStepView';
import { FindMoveStepView } from './steps/FindMoveStepView';
import { PlayOutStepView } from './steps/PlayOutStepView';
import { QuizStepView } from './steps/QuizStepView';
import { LESSON_TIMINGS, type FrameParts, type LessonTimings } from './steps/stepTypes';

/** Props of `LessonPlayer`. Remount it (React `key`) for another lesson. */
export interface LessonPlayerProps {
  lesson: Lesson;
  course: CourseMeta | undefined;
  /** Progress saved when the lesson was opened (resume point). */
  saved: LessonProgress | null;
  /** Live unlock context (for "Nächste Lektion"). */
  ctx: UnlockContext;
  timings?: LessonTimings;
}

/** Lesson player. */
export function LessonPlayer({ lesson, course, saved, ctx, timings = LESSON_TIMINGS }: LessonPlayerProps) {
  const { data } = useServices();
  const [session, setSession] = useState<LessonSession>(() => createLessonSession(lesson, saved));
  const sessionRef = useRef(session);
  const [lastRecord, setLastRecord] = useState<LessonProgress | null>(null);
  const [run, setRun] = useState(0);
  const [resumeNotice, setResumeNotice] = useState(session.resumed);
  const nextRef = useRef<HTMLButtonElement>(null);
  const endPrimaryRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const update = useCallback((fn: (s: LessonSession) => LessonSession): LessonSession => {
    const next = fn(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
    return next;
  }, []);

  const persist = useCallback(
    (s: LessonSession) => {
      const record = progressRecord(s, lesson);
      setLastRecord(record);
      data.progress.recordLessonProgress(record).catch((err: unknown) => console.warn('Lesson progress could not be saved', err));
      if (s.result?.completed && lesson.kind === 'skip_test') {
        data.progress.saveProfile({ stageZeroSkipped: true }).catch((err: unknown) => console.warn('Profile could not be saved', err));
      }
    },
    [data, lesson],
  );

  const complete = useCallback(() => {
    const before = sessionRef.current;
    const next = update((s) => completeStep(s, lesson));
    if (next !== before) persist(next);
  }, [update, persist, lesson]);
  const mistake = useCallback(() => void update(recordMistake), [update]);
  const hint = useCallback(() => void update(recordHint), [update]);

  const index = session.index;
  const step = lesson.steps[index];
  const atEnd = index >= session.stepCount;
  const passive = !!step && !isExercise(step);
  const canNext = !atEnd && (index < session.done || passive);

  const next = useCallback(() => {
    const s = sessionRef.current;
    const current = lesson.steps[s.index];
    if (!current) return;
    if (s.index === s.done && !isExercise(current)) complete();
    update(goNext);
  }, [lesson, complete, update]);
  const prev = useCallback(() => void update(goPrev), [update]);
  const restart = useCallback(() => {
    update(() => restartSession(lesson));
    setRun((r) => r + 1);
    setResumeNotice(false);
  }, [update, lesson]);

  // Focus: the new step's region after navigation, "Weiter" once an exercise is solved, the end screen's action.
  const firstIndex = useRef(index);
  useEffect(() => {
    if (index === firstIndex.current) return;
    firstIndex.current = -1;
    if (index >= session.stepCount) endPrimaryRef.current?.focus();
    else regionRef.current?.focus();
  }, [index, session.stepCount]);
  const solvedHere = !!step && isExercise(step) && index < session.done;
  const focusedSolved = useRef<string | null>(solvedHere ? `${run}-${index}` : null);
  const solvedKey = solvedHere ? `${run}-${index}` : null;
  useEffect(() => {
    if (solvedKey && solvedKey !== focusedSolved.current) {
      focusedSolved.current = solvedKey;
      nextRef.current?.focus();
    }
  }, [solvedKey]);
  // "Erledigter Schritt" notice: only for steps that were already completed when the learner came to them.
  const stepKey = `${run}-${index}`;
  const [entry, setEntry] = useState({ key: stepKey, reviewing: index < session.done });
  if (entry.key !== stepKey) setEntry({ key: stepKey, reviewing: index < session.done });
  const reviewing = !atEnd && (entry.key === stepKey ? entry.reviewing : index < session.done);
  // The resume notice disappears once the learner moves on.
  const [resumeIndex] = useState(index);
  const showResume = resumeNotice && index === resumeIndex;

  useShortcut('Enter', canNext ? next : undefined);
  useShortcut('ArrowRight', step?.type === 'explanation' && canNext ? next : undefined, { overControls: true });
  useShortcut('ArrowLeft', step?.type === 'explanation' && index > 0 ? prev : undefined, { overControls: true });

  const frame = (parts: FrameParts): ReactElement => (
    <LessonFrame
      title={lesson.titleDe}
      courseTitle={course?.titleDe ?? ''}
      backTo={course ? paths.course(course.id) : paths.learn()}
      stepIndex={index}
      stepCount={session.stepCount}
      isTest={isTest(lesson)}
      board={parts.board}
      menu={parts.board !== undefined ? <BoardMenu /> : undefined}
      panel={
        <div
          ref={regionRef}
          tabIndex={-1}
          className="flex flex-col gap-4 focus:outline-none"
          data-testid="lesson-player"
          data-lesson-id={lesson.id}
          data-step-index={index}
          data-steps-done={session.done}
        >
          {showResume && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-info-subtle px-3 py-2 text-body-sm text-text" data-testid="resume-notice">
              <span>{STRINGS_DE.resumed(index + 1)}</span>
              <Button variant="link" size="sm" onClick={restart}>
                {STRINGS_DE.restart}
              </Button>
            </div>
          )}
          {reviewing && !showResume && <p className="text-caption text-muted">{STRINGS_DE.reviewNotice}</p>}
          {parts.panel}
        </div>
      }
      actions={
        <>
          {!atEnd && <IconButton label={STRINGS_DE.prev} icon={<ChevronLeft />} disabled={index === 0} onClick={prev} data-testid="lesson-prev" />}
          {parts.actions}
          {!atEnd && (
            <Button
              ref={nextRef}
              variant="primary"
              className="ml-auto flex-1 lg:flex-none"
              disabled={!canNext}
              onClick={next}
              aria-keyshortcuts="Enter"
              data-testid="lesson-next"
            >
              {index === session.stepCount - 1 ? STRINGS_DE.finish : STRINGS_DE.next}
            </Button>
          )}
        </>
      }
    />
  );

  if (atEnd || !step) {
    if (!session.result) {
      // Only reachable for a lesson without steps (the schema forbids it): show the frame with a way back.
      return frame({ panel: null });
    }
    return (
      <LessonEnd
        key={run}
        lesson={lesson}
        course={course}
        result={session.result}
        ctx={withProgress(ctx, lastRecord)}
        previous={saved}
        onRepeat={restart}
        primaryRef={endPrimaryRef}
        frame={frame}
      />
    );
  }

  const common = {
    active: index === session.done,
    completed: index < session.done,
    onComplete: complete,
    onMistake: mistake,
    onHint: hint,
    frame,
    timings,
  };
  const key = `${run}-${index}`;
  switch (step.type) {
    case 'explanation':
      return <ExplanationStepView key={key} step={step} {...common} />;
    case 'demo':
      return <DemoStepView key={key} step={step} {...common} />;
    case 'find_move':
      return <FindMoveStepView key={key} step={step} {...common} />;
    case 'quiz':
      return <QuizStepView key={key} step={step} {...common} />;
    case 'play_out':
      return <PlayOutStepView key={key} step={step} {...common} />;
  }
}
