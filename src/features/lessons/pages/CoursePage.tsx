import { CheckCircle2, ClipboardCheck, Lock, SearchX } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import type { CourseMeta, Lesson } from '@/core/lessons';
import { formatPercent } from '@/i18n';
import { cn } from '@/lib/cn';
import { courseItemIds, courseLessonCounts, isCourseCompleted, nextLessonFor, stageMeta, type UnlockContext } from '@/lessons';
import { Page } from '@/ui/layout';
import { Badge, Button, EmptyState, ProgressBar, Spinner, Stars } from '@/ui/primitives';
import { ContentErrors } from '../components/ContentErrors';
import { courseStatus, lessonRowState, type LessonRowState } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { useCourseLessons, useLessonCatalog, useUnlockContext } from '../useLessonData';

/** Kurs: its lessons in order (locked/new/started/completed with stars) and the course test (D-38). */
export function Component() {
  const { courseId = '' } = useParams();
  const { data } = useServices();
  data.activity.useTracking('lessons');
  const catalog = useLessonCatalog();
  const ctx = useUnlockContext(catalog);
  const course = catalog?.courses.find((c) => c.id === courseId) ?? null;
  const lessons = useCourseLessons(course?.status === 'available' ? course : null);

  if (!catalog || !ctx) return <LoadingPage />;
  if (!course) {
    return (
      <Page title={STRINGS_DE.courseNotFound}>
        <EmptyState
          icon={<SearchX />}
          title={STRINGS_DE.courseNotFound}
          text={STRINGS_DE.courseNotFoundText}
          action={
            <Button asChild variant="primary">
              <Link to={paths.learn()}>{STRINGS_DE.toLearnPath}</Link>
            </Button>
          }
        />
      </Page>
    );
  }
  const status = courseStatus(course, ctx);
  const stage = stageMeta(course.stage);
  const counts = courseLessonCounts(course, ctx.progress);
  return (
    <Page title={course.titleDe} subtitle={`${stage.titleDe} · ${course.descriptionDe}`}>
      <p className="-mt-4 mb-6">
        <Link to={paths.learn()} className="text-body-sm text-accent-text underline-offset-4 hover:underline">
          {STRINGS_DE.toLearnPath}
        </Link>
      </p>
      {lessons && <ContentErrors errors={lessons.errors} />}
      {status === 'planned' && <p className="text-body text-muted">{STRINGS_DE.coursePlannedText}</p>}
      {status === 'locked' && (
        <p className="mb-4 flex items-center gap-2 text-body text-muted" data-testid="course-locked">
          <Lock aria-hidden="true" className="size-5 shrink-0" />
          {STRINGS_DE.stageLockedText(course.stage)}
        </p>
      )}
      {status !== 'planned' && (
        <div className="flex flex-col gap-6">
          {isCourseCompleted(course, ctx.progress) && (
            <p className="flex items-center gap-2 text-body text-accent-text" data-testid="course-completed">
              <CheckCircle2 aria-hidden="true" className="size-5" />
              {STRINGS_DE.courseDone(course.titleDe)}
            </p>
          )}
          {counts.total > 0 && <ProgressBar value={counts.done} max={counts.total} label={STRINGS_DE.lessonsDone(counts.done, counts.total)} />}
          {!lessons ? (
            <div className="flex items-center gap-3 text-muted" role="status">
              <Spinner size={20} />
              {STRINGS_DE.loading}
            </div>
          ) : (
            <LessonList course={course} ctx={ctx} lessons={lessons.byId} />
          )}
        </div>
      )}
    </Page>
  );
}

function LoadingPage() {
  return (
    <Page title={STRINGS_DE.course}>
      <div className="flex items-center gap-3 text-muted" role="status">
        <Spinner size={20} />
        {STRINGS_DE.loading}
      </div>
    </Page>
  );
}

function LessonList({ course, ctx, lessons }: { course: CourseMeta; ctx: UnlockContext; lessons: ReadonlyMap<string, Lesson> }) {
  const next = nextLessonFor(ctx);
  const ids = courseItemIds(course);
  return (
    <ol className="flex flex-col gap-3">
      {ids.map((id, index) => {
        const lesson = lessons.get(id);
        const isTest = id === course.testLessonId && !course.lessonIds.includes(id);
        const state = lessonRowState(ctx, course, id, lesson);
        const required = state.status === 'locked' ? state.access : null;
        const requiredTitle =
          required && !required.unlocked && required.requiredLessonId ? lessons.get(required.requiredLessonId)?.titleDe : undefined;
        return (
          <li key={id}>
            <LessonRow
              courseId={course.id}
              lessonId={id}
              number={index + 1}
              lesson={lesson}
              isTest={isTest}
              state={state}
              highlighted={next?.courseId === course.id && next.lessonId === id}
              lockedText={
                isTest ? STRINGS_DE.courseTestLocked : requiredTitle ? STRINGS_DE.lessonLocked(requiredTitle) : STRINGS_DE.lessonLockedShort
              }
            />
          </li>
        );
      })}
    </ol>
  );
}

interface LessonRowProps {
  courseId: string;
  lessonId: string;
  number: number;
  lesson: Lesson | undefined;
  isTest: boolean;
  state: LessonRowState;
  highlighted: boolean;
  lockedText: string;
}

function LessonRow({ courseId, lessonId, number, lesson, isTest, state, highlighted, lockedText }: LessonRowProps) {
  const title = lesson?.titleDe ?? (isTest ? STRINGS_DE.courseTest : STRINGS_DE.lessonNumber(number));
  const locked = state.status === 'locked';
  const available = !!lesson && !locked;
  const status = (() => {
    switch (state.status) {
      case 'locked':
        return lockedText;
      case 'new':
        return lesson ? STRINGS_DE.statusNew : STRINGS_DE.lessonUnavailable;
      case 'started':
        return STRINGS_DE.statusStarted(state.step + 1, lesson?.steps.length ?? 0);
      case 'completed':
        return STRINGS_DE.statusCompleted;
    }
  })();
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full text-body font-semibold tabular-nums',
          state.status === 'completed' ? 'bg-accent-subtle text-accent-text' : 'bg-surface-3 text-text',
        )}
      >
        {locked ? <Lock className="size-5" /> : isTest ? <ClipboardCheck className="size-5" /> : number}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-text">{title}</span>
          {isTest && <Badge tone="info">{STRINGS_DE.courseTest}</Badge>}
          {highlighted && <Badge tone="accent">{STRINGS_DE.nextLesson}</Badge>}
        </span>
        {lesson && !locked && <span className="text-body-sm text-muted">{lesson.summaryDe}</span>}
        <span className="text-body-sm text-muted">{status}</span>
        {state.status === 'completed' && state.score !== undefined && (
          <span className="text-body-sm text-muted">{STRINGS_DE.testScore(formatPercent(state.score * 100, 0))}</span>
        )}
      </span>
      {state.status === 'completed' && !isTest && <Stars value={state.stars} className="shrink-0" />}
    </>
  );
  const classes = cn(
    'flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-1',
    highlighted && 'border-l-2 border-l-accent',
    available ? 'transition-colors duration-[var(--zz-dur-fast)] hover:bg-surface-2' : 'text-muted',
  );
  const data = { 'data-lesson-id': lessonId, 'data-status': state.status };
  if (!available) {
    return (
      <div className={classes} {...data} aria-disabled="true">
        {content}
      </div>
    );
  }
  return (
    <Link to={paths.lesson(courseId, lessonId)} className={classes} {...data}>
      {content}
    </Link>
  );
}
