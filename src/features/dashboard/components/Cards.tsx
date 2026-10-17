/**
 * Dashboard cards: "Nächste Lektion" (`nextLessonFor`), "Als Nächstes trainieren" (`recommendTraining`) and the
 * fitting bot (`recommendBot`, also the empty state "keine Partien → passender Bot").
 */
import { GraduationCap, Swords, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import type { BotProfile } from '@/core/bots';
import { MOTIF_LABELS_DE } from '@/core/explain';
import { puzzleThemeById } from '@/core/puzzles';
import { BotAvatar } from '@/features/play/components/BotAvatar';
import { useLesson } from '@/features/lessons/useLessonData';
import { formatPercent } from '@/i18n';
import { canResume, type NextLesson } from '@/lessons';
import type { TrainingRecommendation } from '@/stats';
import { Button, Card, CardMeta, CardTitle } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

function CardShell({ title, testId, icon, children }: { title: string; testId: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full min-w-0 flex-col gap-3" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-h3 text-text">
        <span aria-hidden="true" className="inline-flex text-accent-text [&_svg]:size-5">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Skeleton() {
  return <div aria-hidden="true" className="h-16 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />;
}

/** "Nächste Lektion". `next === undefined` while loading; `hasCourses` distinguishes "all done" from "no content". */
export function NextLessonCard({ next, hasCourses }: { next: NextLesson | null | undefined; hasCourses: boolean }) {
  return (
    <CardShell title={STRINGS_DE.nextLessonTitle} testId="dashboard-next-lesson" icon={<GraduationCap />}>
      {next === undefined ? (
        <Skeleton />
      ) : next === null ? (
        <>
          <p className="text-body text-muted">{hasCourses ? STRINGS_DE.nextLessonAllDone : STRINGS_DE.nextLessonNone}</p>
          <div className="mt-auto">
            <Button asChild variant="secondary">
              <Link to={paths.learn()}>{STRINGS_DE.toLearnPath}</Link>
            </Button>
          </div>
        </>
      ) : (
        <NextLessonBody next={next} />
      )}
    </CardShell>
  );
}

function NextLessonBody({ next }: { next: NextLesson }) {
  const loaded = useLesson(next.courseId, next.lessonId);
  const lesson = loaded.status === 'ready' && loaded.result.ok ? loaded.result.lesson : null;
  const resume = lesson && canResume(lesson, next.progress) ? next.progress : null;
  const action = next.kind === 'course_test' ? STRINGS_DE.nextLessonTest : resume ? STRINGS_DE.nextLessonContinue : STRINGS_DE.nextLessonStart;
  const title = lesson?.titleDe ?? next.course.titleDe;
  return (
    <>
      <div className="min-w-0" data-course-id={next.courseId} data-lesson-id={next.lessonId}>
        <CardTitle className="break-words" data-testid="dashboard-next-lesson-title">
          {title}
        </CardTitle>
        <CardMeta className="mt-1" data-testid="dashboard-next-lesson-course">
          {next.course.titleDe}
        </CardMeta>
      </div>
      <div className="mt-auto">
        <Button asChild>
          <Link to={paths.lesson(next.courseId, next.lessonId)} aria-label={`${action}: ${title}`}>
            {action}
          </Link>
        </Button>
      </div>
    </>
  );
}

/** "Als Nächstes trainieren". `rec === undefined` while loading. */
export function TrainNextCard({ rec, bot }: { rec: TrainingRecommendation | null | undefined; bot: BotProfile | null }) {
  let body: ReactNode;
  if (rec === undefined) body = <Skeleton />;
  else {
    let text: string;
    let action: string;
    let to: string;
    if (rec === null) {
      text = STRINGS_DE.trainNothing;
      action = STRINGS_DE.trainPuzzlesAction;
      to = paths.puzzlesRated();
    } else if (rec.kind === 'theme') {
      const label = puzzleThemeById(rec.themeId)?.labelDe ?? rec.themeId;
      text =
        rec.reason === 'weak_theme'
          ? STRINGS_DE.trainWeakTheme(label, formatPercent(rec.rate, 0), rec.attempts)
          : STRINGS_DE.trainGameMotif(MOTIF_LABELS_DE[rec.motif], rec.count);
      action = STRINGS_DE.trainThemeAction(label);
      to = paths.puzzleTheme(rec.themeId);
    } else if (rec.kind === 'lesson') {
      text = STRINGS_DE.trainLesson;
      action = STRINGS_DE.nextLessonStart;
      to = paths.lesson(rec.courseId, rec.lessonId);
    } else {
      text = bot ? STRINGS_DE.trainBot(bot.name, bot.elo) : STRINGS_DE.trainNothing;
      action = STRINGS_DE.botAction;
      to = paths.play();
    }
    body = (
      <>
        <p className="text-body text-text" data-testid="dashboard-train-text" data-kind={rec?.kind ?? 'none'} data-reason={rec?.reason ?? 'none'}>
          {text}
        </p>
        <div className="mt-auto">
          <Button asChild variant="secondary">
            <Link to={to}>{action}</Link>
          </Button>
        </div>
      </>
    );
  }
  return (
    <CardShell title={STRINGS_DE.trainTitle} testId="dashboard-train-next" icon={<Target />}>
      {body}
    </CardShell>
  );
}

/** The fitting bot (`bot === undefined` while loading). */
export function FittingBotCard({ bot }: { bot: BotProfile | null | undefined }) {
  return (
    <CardShell title={STRINGS_DE.botTitle} testId="dashboard-bot" icon={<Swords />}>
      {bot === undefined ? (
        <Skeleton />
      ) : bot === null ? (
        <div className="mt-auto">
          <Button asChild variant="secondary">
            <Link to={paths.play()}>{STRINGS_DE.botAction}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-3" data-bot-id={bot.id}>
            <BotAvatar bot={bot} size="md" />
            <div className="min-w-0">
              <CardTitle data-testid="dashboard-bot-name">{bot.name}</CardTitle>
              <CardMeta>{STRINGS_DE.botMeta(bot.elo, bot.styleLabelDe)}</CardMeta>
            </div>
          </div>
          <div className="mt-auto">
            <Button asChild variant="secondary">
              <Link to={paths.play()} aria-label={`${STRINGS_DE.botAction}: ${bot.name}`}>
                {STRINGS_DE.botAction}
              </Link>
            </Button>
          </div>
        </>
      )}
    </CardShell>
  );
}
