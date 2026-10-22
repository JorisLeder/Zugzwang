/**
 * "Weiter, wo du aufgehört hast" (PRD P0-14): the first resume target is the main action (running game → lesson in
 * progress → last puzzle mode); further open targets are listed below it. Empty state: start with rated puzzles.
 */
import { GraduationCap, Play, Puzzle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { puzzleThemeById } from '@/core/puzzles';
import { useLesson } from '@/features/lessons/useLessonData';
import { Button, Card, CardMeta, CardTitle, EmptyState } from '@/ui/primitives';
import { lessonResumeKind, type ResumeTarget } from '../logic';
import { STRINGS_DE } from '../strings.de';
import { useGamePlies } from '../useDashboardData';

interface TargetView {
  icon: ReactNode;
  title: string;
  meta: string;
  action: string;
  to: string;
}

function puzzleView(target: Extract<ResumeTarget, { kind: 'puzzles' }>): TargetView {
  const theme = target.themeId ? puzzleThemeById(target.themeId) : undefined;
  const to =
    target.mode === 'rated'
      ? paths.puzzlesRated()
      : target.mode === 'learning'
        ? paths.puzzlesLearn()
        : target.mode === 'theme'
          ? theme
            ? paths.puzzleTheme(theme.id)
            : paths.puzzleThemes()
          : paths.puzzles();
  return {
    icon: <Puzzle />,
    title: theme && target.mode === 'theme' ? STRINGS_DE.puzzleThemeMode(theme.labelDe) : STRINGS_DE.puzzleModes[target.mode],
    meta: STRINGS_DE.resumePuzzlesMeta,
    action: STRINGS_DE.resumePuzzlesAction,
    to,
  };
}

function GameView({ target, children }: { target: Extract<ResumeTarget, { kind: 'game' }>; children: (v: TargetView) => ReactNode }) {
  const { botRoster } = useServices();
  const plies = useGamePlies(target.game.id);
  const bot = botRoster.find((b) => b.id === target.game.botId);
  return children({
    icon: <Play />,
    title: bot ? STRINGS_DE.resumeGame(bot.name) : STRINGS_DE.resumeGameUnknownBot,
    meta: STRINGS_DE.resumeGameMeta(plies),
    action: STRINGS_DE.resumeGameAction,
    to: paths.playGame(target.game.id),
  });
}

function LessonView({ target, children }: { target: Extract<ResumeTarget, { kind: 'lesson' }>; children: (v: TargetView) => ReactNode }) {
  const loaded = useLesson(target.course.id, target.lessonId);
  const lesson = loaded.status === 'ready' && loaded.result.ok ? loaded.result.lesson : null;
  const kind = lesson ? lessonResumeKind(lesson, target.progress) : 'restart';
  const retryTest = kind === 'retry_test';
  return children({
    icon: <GraduationCap />,
    title: lesson?.titleDe ?? target.course.titleDe,
    meta:
      lesson && kind === 'resume'
        ? STRINGS_DE.resumeLessonMeta(target.course.titleDe, target.progress.currentStep + 1, lesson.steps.length)
        : retryTest
          ? STRINGS_DE.resumeTestRetryMeta(target.course.titleDe)
          : STRINGS_DE.resumeLessonMetaShort(target.course.titleDe),
    action: retryTest ? STRINGS_DE.resumeTestRetryAction : STRINGS_DE.resumeLessonAction,
    to: paths.lesson(target.course.id, target.lessonId),
  });
}

/** Renders `children` with the view of a target (each kind loads only what it needs). */
function TargetViewOf({ target, children }: { target: ResumeTarget; children: (v: TargetView) => ReactNode }) {
  if (target.kind === 'game') return <GameView target={target}>{children}</GameView>;
  if (target.kind === 'lesson') return <LessonView target={target}>{children}</LessonView>;
  return <>{children(puzzleView(target))}</>;
}

function MainTarget({ view, kind }: { view: TargetView; kind: ResumeTarget['kind'] }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center" data-testid="dashboard-resume-main" data-kind={kind}>
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-accent-text [&_svg]:size-5">
        {view.icon}
      </span>
      <div className="min-w-0 flex-1">
        <CardTitle className="break-words">{view.title}</CardTitle>
        <CardMeta className="mt-1">{view.meta}</CardMeta>
      </div>
      <Button asChild size="lg">
        <Link to={view.to} aria-label={`${view.action}: ${view.title}`}>
          {view.action}
        </Link>
      </Button>
    </div>
  );
}

function SecondaryTarget({ view, kind }: { view: TargetView; kind: ResumeTarget['kind'] }) {
  return (
    <li>
      <Link
        to={view.to}
        data-testid="dashboard-resume-more"
        data-kind={kind}
        className="focus-inset flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2"
      >
        <span aria-hidden="true" className="inline-flex shrink-0 text-muted [&_svg]:size-5">
          {view.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-text">{view.title}</span>
          <span className="block truncate text-body-sm text-muted">{view.meta}</span>
        </span>
        <span className="shrink-0 text-body-sm font-medium text-accent-text">{view.action}</span>
      </Link>
    </li>
  );
}

/** The resume card. `targets === undefined` while loading. */
export function ResumeCard({ targets }: { targets: ResumeTarget[] | undefined }) {
  const [main, ...more] = targets ?? [];
  return (
    <section aria-labelledby="dashboard-resume-title">
      <Card hero className="flex flex-col gap-4" data-testid="dashboard-resume">
        <h2 id="dashboard-resume-title" className="text-h2 text-text">
          {STRINGS_DE.resumeTitle}
        </h2>
        {targets === undefined ? (
          <div aria-hidden="true" className="h-14 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
        ) : main ? (
          <>
            <TargetViewOf target={main}>{(view) => <MainTarget view={view} kind={main.kind} />}</TargetViewOf>
            {more.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <p className="text-caption text-muted">{STRINGS_DE.resumeAlso}</p>
                <ul className="flex flex-col">
                  {more.map((t) => (
                    <TargetViewOf key={t.kind} target={t}>
                      {(view) => <SecondaryTarget view={view} kind={t.kind} />}
                    </TargetViewOf>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Puzzle />}
            title={STRINGS_DE.resumeEmptyTitle}
            text={STRINGS_DE.resumeEmptyText}
            action={
              <Button asChild>
                <Link to={paths.puzzlesRated()}>{STRINGS_DE.resumeEmptyAction}</Link>
              </Button>
            }
            className="py-2"
          />
        )}
      </Card>
    </section>
  );
}
