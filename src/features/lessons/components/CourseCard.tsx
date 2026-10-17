import { CheckCircle2, Lock, Star } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import type { CourseMeta } from '@/core/lessons';
import { cn } from '@/lib/cn';
import { courseLessonCounts, courseStars, type UnlockContext } from '@/lessons';
import { Badge, Card, CardMeta, CardTitle, ProgressBar } from '@/ui/primitives';
import { courseStatus } from '../logic';
import { STRINGS_DE } from '../strings.de';

/** One course of the Lernpfad: title, description, lessons done/total, stars and progress (DESIGN §5.2). */
export function CourseCard({ course, ctx, highlighted }: { course: CourseMeta; ctx: UnlockContext; highlighted: boolean }) {
  const status = courseStatus(course, ctx);
  const counts = courseLessonCounts(course, ctx.progress);
  const stars = courseStars(course, ctx.progress);
  const body = (
    <>
      <div className="flex items-start gap-2">
        <CardTitle className="min-w-0 flex-1">{course.titleDe}</CardTitle>
        {status === 'planned' && <Badge tone="neutral">{STRINGS_DE.planned}</Badge>}
        {status === 'locked' && <Lock role="img" aria-label={STRINGS_DE.courseLocked} className="size-5 shrink-0 text-muted" />}
        {status === 'completed' && <CheckCircle2 role="img" aria-label={STRINGS_DE.courseCompleted} className="size-5 shrink-0 text-accent-text" />}
      </div>
      <CardMeta className="mt-1">{course.descriptionDe}</CardMeta>
      {highlighted && (
        <Badge tone="accent" className="mt-3">
          {STRINGS_DE.nextLesson}
        </Badge>
      )}
      {status !== 'planned' && counts.total > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <ProgressBar value={counts.done} max={counts.total} label={STRINGS_DE.lessonsDone(counts.done, counts.total)} />
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Star aria-hidden="true" className="size-4 fill-warning text-warning-text" />
            <span>{STRINGS_DE.starsEarned(stars.earned, stars.max)}</span>
          </div>
        </div>
      )}
    </>
  );
  const data = { 'data-course-id': course.id, 'data-status': status, 'data-next': highlighted ? 'true' : undefined };
  if (status === 'planned' || status === 'locked') {
    return (
      <Card {...data} className={cn('h-full', status === 'planned' && 'border-dashed')}>
        {body}
      </Card>
    );
  }
  return (
    <Card asChild interactive hero={highlighted} {...data} className="h-full">
      <Link to={paths.course(course.id)}>{body}</Link>
    </Card>
  );
}
