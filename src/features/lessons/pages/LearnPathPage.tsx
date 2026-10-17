import { GraduationCap, Lock, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { canResume, nextLessonFor, STAGES, type NextLesson, type SkipTestRef, type UnlockContext } from '@/lessons';
import { Page } from '@/ui/layout';
import { Badge, Button, Card, CardMeta, CardTitle, Spinner } from '@/ui/primitives';
import { ContentErrors } from '../components/ContentErrors';
import { CourseCard } from '../components/CourseCard';
import { stageState, type StageState } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { useLesson, useLessonCatalog, useSkipTest, useUnlockContext } from '../useLessonData';

const STAGE_BADGE: Record<StageState['status'], { label: string; tone: 'neutral' | 'accent' | 'info' }> = {
  planned: { label: STRINGS_DE.planned, tone: 'neutral' },
  locked: { label: STRINGS_DE.stageLocked, tone: 'neutral' },
  open: { label: STRINGS_DE.stageOpen, tone: 'info' },
  completed: { label: STRINGS_DE.stageCompleted, tone: 'accent' },
};

/** Lernpfad (PRD Lektionen §4): stages 0–4 with their courses, progress and stars; the next lesson is highlighted. */
export function Component() {
  const { data } = useServices();
  data.activity.useTracking('lessons');
  const catalog = useLessonCatalog();
  const ctx = useUnlockContext(catalog);
  const skipTest = useSkipTest(catalog);

  if (!catalog || !ctx) {
    return (
      <Page title={STRINGS_DE.learn} subtitle={STRINGS_DE.learnSubtitle}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner size={20} />
          {STRINGS_DE.loading}
        </div>
      </Page>
    );
  }

  const next = nextLessonFor(ctx);
  const stageOneOpen = stageState(1, ctx).reason !== null;

  return (
    <Page title={STRINGS_DE.learn} subtitle={STRINGS_DE.learnSubtitle}>
      <ContentErrors errors={catalog.errors} />
      <div className="flex flex-col gap-8">
        {next ? (
          <NextLessonCard next={next} />
        ) : (
          [...ctx.progress.values()].some((p) => p.completed) && <p className="text-body text-muted">{STRINGS_DE.allDone}</p>
        )}
        {STAGES.map((stage) => {
          const state = stageState(stage.id, ctx);
          const courses = ctx.courses.filter((c) => c.stage === stage.id);
          const badge = STAGE_BADGE[state.status];
          return (
            <section key={stage.id} aria-labelledby={`stage-${stage.id}`} data-stage-id={stage.id} data-status={state.status} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id={`stage-${stage.id}`} className="text-h2 text-text">
                  {stage.titleDe}
                </h2>
                <Badge tone={badge.tone}>{badge.label}</Badge>
                <span className="text-body-sm text-muted">{stage.eloDe}</span>
              </div>
              {state.status === 'locked' && (
                <p className="flex items-center gap-2 text-body-sm text-muted">
                  <Lock aria-hidden="true" className="size-4 shrink-0" />
                  {STRINGS_DE.stageLockedText(stage.id)}
                </p>
              )}
              {state.reason && state.reason !== 'always' && state.status !== 'planned' && (
                <p className="text-body-sm text-muted">{STRINGS_DE.stageReason[state.reason]}</p>
              )}
              {stage.id === 0 && skipTest && <SkipTestCard skipTest={skipTest} ctx={ctx} stageOneOpen={stageOneOpen} />}
              {courses.length === 0 ? (
                <p className="text-body-sm text-muted">{STRINGS_DE.plannedStage}</p>
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {courses.map((course) => (
                    <li key={course.id}>
                      <CourseCard course={course} ctx={ctx} highlighted={next?.courseId === course.id} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </Page>
  );
}

/** Hero card with the next lesson (resumes a started lesson at its step). */
function NextLessonCard({ next }: { next: NextLesson }) {
  const loaded = useLesson(next.courseId, next.lessonId);
  const lesson = loaded.status === 'ready' && loaded.result.ok ? loaded.result.lesson : null;
  const resume = lesson && canResume(lesson, next.progress) ? next.progress : null;
  const label = next.kind === 'course_test' ? STRINGS_DE.startTest : resume ? STRINGS_DE.continueLesson : STRINGS_DE.startLesson;
  return (
    <Card hero data-testid="next-lesson" className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-caption text-muted">{STRINGS_DE.nextLessonTitle}</p>
        <CardTitle className="mt-1">{lesson?.titleDe ?? next.course.titleDe}</CardTitle>
        <CardMeta className="mt-1">
          {lesson ? `${next.course.titleDe} · ` : ''}
          {resume && lesson ? STRINGS_DE.continueAt(resume.currentStep + 1, lesson.steps.length) : (lesson?.summaryDe ?? next.course.descriptionDe)}
        </CardMeta>
      </div>
      <Button asChild variant="primary">
        <Link to={paths.lesson(next.courseId, next.lessonId)}>
          <GraduationCap aria-hidden="true" />
          {label}
        </Link>
      </Button>
    </Card>
  );
}

/** Stufe-0 skip test: "Regeln schon bekannt?" (D-38). */
function SkipTestCard({ skipTest, ctx, stageOneOpen }: { skipTest: SkipTestRef; ctx: UnlockContext; stageOneOpen: boolean }) {
  const passed = ctx.learner?.stageZeroSkipped === true;
  if (passed) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-accent-text" data-testid="skip-test-passed">
        <Sparkles aria-hidden="true" className="size-4" />
        {STRINGS_DE.skipPassed}
      </p>
    );
  }
  if (stageOneOpen) return null;
  return (
    <Card data-testid="skip-test" className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <CardTitle>{STRINGS_DE.skipTitle}</CardTitle>
        <CardMeta className="mt-1">{STRINGS_DE.skipText}</CardMeta>
      </div>
      <Button asChild variant="secondary">
        <Link to={paths.lesson(skipTest.courseId, skipTest.lessonId)}>{STRINGS_DE.skipStart}</Link>
      </Button>
    </Card>
  );
}
