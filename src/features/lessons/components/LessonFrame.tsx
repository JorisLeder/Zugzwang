/**
 * Frame of the lesson player: `BoardLayout` for steps with a board (board as large as possible, text in the panel,
 * on phones the text below the board and the actions fixed at the bottom), and the same top bar / action bar around
 * a text column for steps without a position (quiz without FEN, end screen).
 */
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { BoardLayout, usePageTitle, useRegisterBoardScreen } from '@/ui/layout';
import { Badge, ProgressBar } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Props of `LessonFrame`. */
export interface LessonFrameProps {
  /** Lesson title (the screen's h1). */
  title: string;
  courseTitle: string;
  backTo: string;
  /** Shown step (0-based); `stepCount` = end screen. */
  stepIndex: number;
  stepCount: number;
  isTest: boolean;
  /** Board element; omitted → text layout. */
  board?: ReactNode | ((size: number) => ReactNode);
  /** ⋮ menu in the phone top bar (board steps). */
  menu?: ReactNode;
  panel: ReactNode;
  actions: ReactNode;
}

function StepHeader({ courseTitle, backTo, stepIndex, stepCount, isTest, title, showTitle }: Omit<LessonFrameProps, 'board' | 'panel' | 'actions' | 'menu'> & { showTitle: boolean }) {
  const shown = Math.min(stepIndex + 1, stepCount);
  return (
    <div className="flex flex-col gap-2" data-testid="lesson-header">
      <p className="flex flex-wrap items-center gap-2 text-caption text-muted">
        <Link to={backTo} className="underline-offset-4 hover:text-text hover:underline" data-testid="lesson-course-link">
          {courseTitle || STRINGS_DE.learn}
        </Link>
        {isTest && <Badge tone="info">{STRINGS_DE.testBadge}</Badge>}
      </p>
      {showTitle && (
        <p aria-hidden="true" className="text-h3 text-text">
          {title}
        </p>
      )}
      <ProgressBar
        value={Math.min(stepIndex, stepCount)}
        max={stepCount}
        label={stepIndex >= stepCount ? STRINGS_DE.stepProgress : STRINGS_DE.stepOf(shown, stepCount)}
      />
    </div>
  );
}

/** Lesson screen frame (see file header). */
export function LessonFrame(props: LessonFrameProps) {
  const { title, backTo, board, menu, panel, actions } = props;
  usePageTitle(title);
  if (board !== undefined) {
    return (
      <BoardLayout
        title={title}
        backTo={backTo}
        menu={menu}
        board={board}
        panelHeader={<StepHeader {...props} showTitle />}
        panelTabs={
          <div className="flex flex-col gap-4">
            <div className="lg:hidden">
              <StepHeader {...props} showTitle={false} />
            </div>
            {panel}
          </div>
        }
        actions={actions}
      />
    );
  }
  return <TextFrame {...props} />;
}

function TextFrame(props: LessonFrameProps) {
  const { title, backTo, panel, actions } = props;
  // Same shell behaviour as a board screen: the phone tab bar gives way to the fixed action bar (D-40).
  useRegisterBoardScreen();
  return (
    <div data-testid="lesson-text-layout" className="flex min-h-dvh flex-col lg:min-h-0 lg:p-6">
      <header className="sticky top-0 z-20 flex h-[var(--zz-topbar-board-h)] shrink-0 items-center gap-1 bg-bg px-1 lg:static lg:h-auto lg:px-0">
        <Link
          to={backTo}
          aria-label={STRINGS_DE.backToCourse}
          className="inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-surface-2 lg:hidden"
        >
          <ChevronLeft aria-hidden="true" className="size-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold text-text lg:sr-only">{title}</h1>
      </header>
      <div
        className={cn(
          'mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-[var(--zz-gutter)] py-3 pb-[calc(var(--zz-actionbar-h)+16px)]',
          'lg:flex-none lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-6',
        )}
      >
        <StepHeader {...props} showTitle />
        {panel}
        <div
          data-testid="action-bar"
          className={cn(
            'fixed inset-x-0 bottom-0 z-20 flex h-[var(--zz-actionbar-h)] items-center gap-2 border-t border-border bg-surface px-4 pb-[env(safe-area-inset-bottom,0px)]',
            'md:left-[var(--zz-sidebar-w)] lg:static lg:mt-2 lg:h-auto lg:border-t lg:bg-transparent lg:px-0 lg:pt-4 lg:pb-0',
          )}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
