/**
 * Profil `/profile` (PRD Fortschritt §5): name, ratings, streak, daily goal (editable, saved immediately), mode and sync
 * status, links to the statistics and the settings, data export and account deletion (with confirmation).
 */
import { BarChart3, Cloud, HardDrive, Settings as SettingsIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { DAILY_GOAL_OPTIONS, SELF_ASSESSMENT_OPTIONS, type Profile } from '@/core/profile';
import type { RatingRecord } from '@/core/rating';
import { AccountSection } from '@/features/auth/AccountSection';
import { SYNC_STATUS_DE } from '@/features/sync/strings.de';
import { useSyncState } from '@/features/sync/useSyncState';
import { formatNumber } from '@/i18n';
import { Page } from '@/ui/layout';
import { Badge, Button, Card, SegmentedControl, Spinner, StreakBadge } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';
import { useLiveProfile, useRating, useStreak, useTodayActivity, useTodayKey } from '../useProgressData';

/** Maximum length of the display name. */
const MAX_NAME_LENGTH = 40;

/** Profile page (lazy route module). */
export function Component() {
  const profile = useLiveProfile();
  return (
    <Page title={STRINGS_DE.profile} subtitle={STRINGS_DE.profileSubtitle}>
      {profile === undefined ? (
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner size={20} />
          {STRINGS_DE.loading}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <NameCard profile={profile} />
            <RatingsCard profile={profile} />
            <GoalCard profile={profile} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <SyncCard />
            <LinksCard />
            <AccountSection />
          </div>
        </div>
      )}
    </Page>
  );
}

function NameCard({ profile }: { profile: Profile | null }) {
  const { data } = useServices();
  const id = useId();
  const stored = profile?.displayName ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const value = draft ?? stored;

  async function save() {
    const name = value.trim();
    if (!name) return setMessage({ tone: 'error', text: STRINGS_DE.nameEmpty });
    if (name.length > MAX_NAME_LENGTH) return setMessage({ tone: 'error', text: STRINGS_DE.nameTooLong(MAX_NAME_LENGTH) });
    setBusy(true);
    try {
      await data.progress.saveProfile({ displayName: name });
      setDraft(null);
      setMessage({ tone: 'ok', text: STRINGS_DE.nameSaved });
    } catch {
      setMessage({ tone: 'error', text: STRINGS_DE.saveFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="profile-name">
      <h2 className="text-h2 text-text">{STRINGS_DE.nameTitle}</h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`${id}-name`} className="text-body-sm text-text">
          {STRINGS_DE.nameLabel}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={`${id}-name`}
            value={value}
            maxLength={MAX_NAME_LENGTH + 10}
            autoComplete="nickname"
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              setDraft(e.target.value);
              setMessage(null);
            }}
            className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-2 px-3 text-body text-text"
          />
          <Button type="submit" variant="secondary" loading={busy} disabled={busy || value.trim() === stored}>
            {STRINGS_DE.nameSave}
          </Button>
        </div>
        <p id={`${id}-hint`} className="text-caption text-muted">
          {STRINGS_DE.nameHint}
        </p>
        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-body-sm text-danger-text' : 'text-body-sm text-muted'}>
            {message.text}
          </p>
        )}
      </form>
    </Card>
  );
}

function RatingRow({ label, rating, testId }: { label: string; rating: RatingRecord | null | undefined; testId: string }) {
  const rated = !!rating && rating.gamesCount > 0;
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3" data-testid={testId}>
      <span className="text-body text-muted">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
        {rating === undefined ? (
          <Spinner size={16} />
        ) : rating === null ? (
          <span className="text-body text-text">{STRINGS_DE.noRatingYet}</span>
        ) : (
          <>
            <span className="text-h3 tabular-nums text-text">{formatNumber(Math.round(rating.rating))}</span>
            <span className="text-caption text-muted">{rated ? STRINGS_DE.ratedCount(rating.gamesCount) : STRINGS_DE.startValue}</span>
            {rating.provisional && <Badge>{STRINGS_DE.provisional}</Badge>}
          </>
        )}
      </span>
    </div>
  );
}

function RatingsCard({ profile }: { profile: Profile | null }) {
  const puzzle = useRating('puzzle');
  const bot = useRating('bot');
  const today = useTodayKey();
  const activity = useTodayActivity(today);
  const streak = useStreak(today, activity);
  const assessment = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === profile?.selfAssessment);
  return (
    <Card className="flex flex-col gap-3" data-testid="profile-ratings">
      <h2 className="text-h2 text-text">{STRINGS_DE.ratingsTitle}</h2>
      <RatingRow label={STRINGS_DE.puzzleRating} rating={puzzle} testId="profile-puzzle-rating" />
      <RatingRow label={STRINGS_DE.botRating} rating={bot} testId="profile-bot-rating" />
      <div className="flex min-w-0 items-center justify-between gap-3" data-testid="profile-streak">
        <span className="text-body text-muted">{STRINGS_DE.streakTitle}</span>
        {streak ? (
          <span className="flex flex-col items-end gap-1">
            <StreakBadge days={streak.current} trainedToday={streak.trainedToday} />
            {streak.longest > 0 && <span className="text-caption text-muted">{STRINGS_DE.streakLongest(streak.longest)}</span>}
          </span>
        ) : (
          <Spinner size={16} />
        )}
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="text-body text-muted">{STRINGS_DE.selfAssessment}</span>
        {assessment ? (
          <span className="text-body text-text">{assessment.labelDe}</span>
        ) : (
          <Link to={paths.onboarding()} className="text-body text-accent-text underline-offset-4 hover:underline">
            {STRINGS_DE.toOnboarding}
          </Link>
        )}
      </div>
      <div>
        <Button asChild variant="secondary">
          <Link to={paths.stats()}>
            <BarChart3 aria-hidden="true" />
            {STRINGS_DE.toStats}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function GoalCard({ profile }: { profile: Profile | null }) {
  const { data } = useServices();
  const today = useTodayKey();
  const activity = useTodayActivity(today);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const goal = profile?.dailyGoalMinutes ?? 20;
  const [pending, setPending] = useState<number | null>(null);
  const shown = pending ?? goal;
  return (
    <Card className="flex flex-col gap-3" data-testid="profile-goal">
      <h2 className="text-h2 text-text">{STRINGS_DE.goalTitle}</h2>
      <SegmentedControl<string>
        label={STRINGS_DE.goalLabel}
        value={String(shown)}
        onValueChange={(v) => {
          const minutes = Number(v);
          setPending(minutes);
          setMessage(null);
          data.progress.saveProfile({ dailyGoalMinutes: minutes }).then(
            // The chosen value stays shown (no flicker back while the live profile catches up).
            () => setMessage({ tone: 'ok', text: STRINGS_DE.goalSaved }),
            () => {
              setPending(null);
              setMessage({ tone: 'error', text: STRINGS_DE.saveFailed });
            },
          );
        }}
        options={DAILY_GOAL_OPTIONS.map((m) => ({ value: String(m), label: STRINGS_DE.goalOption(m) }))}
      />
      <p className="text-body-sm text-muted">{STRINGS_DE.goalToday(Math.floor(activity?.minutes ?? 0), shown)}</p>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-body-sm text-danger-text' : 'text-body-sm text-muted'}>
          {message.text}
        </p>
      )}
    </Card>
  );
}

const DATE_TIME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

function SyncCard() {
  const { data } = useServices();
  const sync = useSyncState();
  const cloud = data.auth.mode === 'cloud';
  const status = SYNC_STATUS_DE[sync.status];
  const Icon = cloud ? Cloud : HardDrive;
  return (
    <Card className="flex flex-col gap-3" data-testid="profile-sync" data-mode={data.auth.mode} data-status={sync.status}>
      <h2 className="text-h2 text-text">{STRINGS_DE.syncTitle}</h2>
      <p className="flex items-center gap-2 text-body text-text">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-muted" />
        {cloud ? STRINGS_DE.modeCloud : STRINGS_DE.modeLocal}
      </p>
      <p className="text-body-sm text-muted">{cloud ? STRINGS_DE.modeCloudText : STRINGS_DE.modeLocalText}</p>
      <p className="text-body-sm text-text">{STRINGS_DE.syncStatus(status.label)}</p>
      <p className="text-body-sm text-muted">{status.description}</p>
      {cloud && sync.pending > 0 && <p className="text-body-sm text-muted">{STRINGS_DE.pending(sync.pending)}</p>}
      {cloud && sync.lastSyncedAt && <p className="text-caption text-muted">{STRINGS_DE.lastSynced(DATE_TIME.format(new Date(sync.lastSyncedAt)))}</p>}
    </Card>
  );
}

function LinksCard() {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h2 text-text">{STRINGS_DE.linksTitle}</h2>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary">
          <Link to={paths.stats()}>
            <BarChart3 aria-hidden="true" />
            {STRINGS_DE.stats}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={paths.settings()}>
            <SettingsIcon aria-hidden="true" />
            {STRINGS_DE.toSettings}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
