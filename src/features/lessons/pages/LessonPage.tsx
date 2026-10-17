import { Lock, SearchX } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { lessonAccess } from '@/lessons';
import { Page } from '@/ui/layout';
import { Button, EmptyState, Spinner } from '@/ui/primitives';
import { ContentErrors } from '../components/ContentErrors';
import { LessonPlayer } from '../components/LessonPlayer';
import { STRINGS_DE } from '../strings.de';
import { useLesson, useLessonCatalog, useUnlockContext } from '../useLessonData';

/** Lektion `/learn/:courseId/:lessonId`: loads the lesson and its saved progress, checks the unlock rules (D-38). */
export function Component() {
  const { courseId = '', lessonId = '' } = useParams();
  const { data } = useServices();
  data.activity.useTracking('lessons');
  const catalog = useLessonCatalog();
  const ctx = useUnlockContext(catalog);
  const loaded = useLesson(courseId, lessonId);

  if (!catalog || !ctx || loaded.status === 'loading') {
    return (
      <Page title={STRINGS_DE.lesson}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner size={20} />
          {STRINGS_DE.loading}
        </div>
      </Page>
    );
  }

  const course = catalog.courses.find((c) => c.id === courseId);
  if (!loaded.result.ok) {
    return (
      <Page title={STRINGS_DE.lessonNotFound}>
        <ContentErrors errors={[loaded.result.error]} />
        <EmptyState
          icon={<SearchX />}
          title={STRINGS_DE.lessonNotFound}
          text={STRINGS_DE.lessonNotFoundText}
          action={
            <Button asChild variant="primary">
              <Link to={course ? paths.course(course.id) : paths.learn()}>{course ? STRINGS_DE.toCourse : STRINGS_DE.toLearnPath}</Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const lesson = loaded.result.lesson;
  const access = lessonAccess(ctx, courseId, lessonId, lesson.kind);
  if (!access.unlocked) {
    const required = access.requiredLessonId;
    const text =
      access.reason === 'stage_locked' && course
        ? STRINGS_DE.stageLockedText(course.stage)
        : access.reason === 'lessons_missing'
          ? STRINGS_DE.courseTestLocked
          : access.reason === 'course_planned'
            ? STRINGS_DE.coursePlannedText
            : STRINGS_DE.lessonLockedShort;
    return (
      <Page title={lesson.titleDe}>
        <EmptyState
          icon={<Lock />}
          title={STRINGS_DE.lessonLockedTitle}
          text={text}
          action={
            <Button asChild variant="primary">
              <Link to={required ? paths.lesson(courseId, required) : course ? paths.course(course.id) : paths.learn()} data-testid="lesson-locked-action">
                {required ? STRINGS_DE.toRequired : course ? STRINGS_DE.toCourse : STRINGS_DE.toLearnPath}
              </Link>
            </Button>
          }
        />
      </Page>
    );
  }

  return <LessonPlayer key={`${courseId}/${lessonId}`} lesson={lesson} course={course} saved={loaded.saved} ctx={ctx} />;
}
