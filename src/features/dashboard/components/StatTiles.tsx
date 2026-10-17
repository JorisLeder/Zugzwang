/**
 * The four value tiles of the dashboard: Puzzle-Rating, Bot-Rating, Serie (streak) and Tagesziel (progress ring).
 * Each tile is a single link to the matching area.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import type { RatingRecord } from '@/core/rating';
import type { StreakInfo } from '@/data';
import { formatNumber } from '@/i18n';
import { Badge, Card, ProgressRing, StreakBadge } from '@/ui/primitives';
import { dailyGoalProgress } from '../logic';
import { STRINGS_DE } from '../strings.de';

function Tile({ to, label, testId, children, meta }: { to: string; label: string; testId: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <Card interactive asChild className="h-full min-w-0">
      <Link to={to} data-testid={testId} className="flex min-w-0 flex-col gap-1">
        <span className="text-caption text-muted">{label}</span>
        {children}
        {meta && <span className="text-body-sm text-muted">{meta}</span>}
      </Link>
    </Card>
  );
}

function Pending() {
  return (
    <span aria-hidden="true" className="h-8 w-20 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
  );
}

/** Puzzle-Rating tile. */
export function PuzzleRatingTile({ rating }: { rating: RatingRecord | null | undefined }) {
  const value = rating ? formatNumber(Math.round(rating.rating)) : null;
  return (
    <Tile
      to={paths.puzzlesRated()}
      label={STRINGS_DE.puzzleRating}
      testId="dashboard-puzzle-rating"
      meta={
        rating === undefined
          ? undefined
          : rating === null
            ? STRINGS_DE.puzzleRatingNone
            : rating.gamesCount === 0
              ? STRINGS_DE.puzzleRatingNew
              : STRINGS_DE.puzzleRatingCount(rating.gamesCount)
      }
    >
      {rating === undefined ? (
        <Pending />
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-h1 tabular-nums text-text" data-testid="dashboard-puzzle-rating-value">
            {value ?? '–'}
          </span>
          {rating?.provisional && <Badge>{STRINGS_DE.provisional}</Badge>}
        </span>
      )}
    </Tile>
  );
}

/** Bot-Rating tile ("noch keine Wertung" until a competition game counted). */
export function BotRatingTile({ rating }: { rating: RatingRecord | null | undefined }) {
  const rated = !!rating && rating.gamesCount > 0;
  return (
    <Tile
      to={paths.play()}
      label={STRINGS_DE.botRating}
      testId="dashboard-bot-rating"
      meta={rating === undefined ? undefined : rated ? STRINGS_DE.botRatingCount(rating.gamesCount) : STRINGS_DE.botRatingNone}
    >
      {rating === undefined ? (
        <Pending />
      ) : rated ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-h1 tabular-nums text-text" data-testid="dashboard-bot-rating-value">
            {formatNumber(Math.round(rating.rating))}
          </span>
          {rating.provisional && <Badge>{STRINGS_DE.provisional}</Badge>}
        </span>
      ) : (
        <span className="text-h3 text-text" data-testid="dashboard-bot-rating-value">
          {STRINGS_DE.noRatingYet}
        </span>
      )}
    </Tile>
  );
}

/** Streak tile. */
export function StreakTile({ streak }: { streak: StreakInfo | undefined }) {
  return (
    <Tile
      to={paths.stats()}
      label={STRINGS_DE.streak}
      testId="dashboard-streak"
      meta={streak === undefined ? undefined : streak.longest > 0 ? STRINGS_DE.streakLongest(streak.longest) : STRINGS_DE.streakNone}
    >
      {streak === undefined ? (
        <Pending />
      ) : (
        <span className="flex" data-testid="dashboard-streak-value" data-days={streak.current} data-trained-today={streak.trainedToday}>
          <StreakBadge days={streak.current} trainedToday={streak.trainedToday} />
        </span>
      )}
    </Tile>
  );
}

/** Daily goal tile with the progress ring (minutes today / goal). */
export function DailyGoalTile({ minutes, goal }: { minutes: number | undefined; goal: number }) {
  const p = dailyGoalProgress(minutes, goal);
  return (
    <Tile
      to={paths.profile()}
      label={STRINGS_DE.dailyGoal}
      testId="dashboard-daily-goal"
      meta={minutes === undefined ? undefined : p.reached ? STRINGS_DE.dailyGoalReached : STRINGS_DE.dailyGoalRemaining(p.remaining)}
    >
      {minutes === undefined ? (
        <Pending />
      ) : (
        <span className="flex items-center gap-3" data-testid="dashboard-daily-goal-value" data-minutes={p.minutes} data-goal={p.goal}>
          <ProgressRing value={p.minutes} max={Math.max(1, p.goal)} size={72} label={STRINGS_DE.dailyGoalRing(p.minutes, p.goal)} centerText={`${p.minutes}/${p.goal}`} centerCaption={STRINGS_DE.minutesShort} />
        </span>
      )}
    </Tile>
  );
}
