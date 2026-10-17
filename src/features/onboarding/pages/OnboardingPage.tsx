/**
 * Erster Start (PRD Kern-Ablauf 1, User Story Onboarding 3, D-10): self-assessment (4 options) and daily goal
 * (10/20/30/60 min, default 20). Saving initialises puzzle and bot rating from the self-assessment
 * (`initializeFromSelfAssessment`) and marks the onboarding as completed; the dashboard then shows the first course,
 * a fitting bot and the puzzle start rating.
 *
 * Ratings that already count games (e.g. puzzles solved before the onboarding) are never reset.
 */
import { CircleCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useServices } from '@/app/services';
import { DAILY_GOAL_OPTIONS, DEFAULT_DAILY_GOAL_MINUTES, SELF_ASSESSMENT_OPTIONS, type SelfAssessment } from '@/core/profile';
import { useLiveProfile } from '@/features/profile/useProgressData';
import { Page } from '@/ui/layout';
import { Button, Card, RadioGroup, SegmentedControl, Spinner } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/** Onboarding page (lazy route module). */
export function Component() {
  const profile = useLiveProfile();

  if (profile === undefined) {
    return (
      <Page title={STRINGS_DE.onboarding}>
        <div className="flex items-center gap-3 text-muted" role="status">
          <Spinner size={20} />
          {STRINGS_DE.loading}
        </div>
      </Page>
    );
  }

  if (profile?.onboardingCompleted) {
    return (
      <Page title={STRINGS_DE.onboarding}>
        <Card className="flex max-w-xl flex-col gap-4" data-testid="onboarding-done">
          <div className="flex items-center gap-3">
            <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-accent-text" />
            <h2 className="text-h2 text-text">{STRINGS_DE.doneTitle}</h2>
          </div>
          <p className="text-body text-muted">{STRINGS_DE.doneText}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={paths.home()}>{STRINGS_DE.toDashboard}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={paths.profile()}>{STRINGS_DE.toProfile}</Link>
            </Button>
          </div>
        </Card>
      </Page>
    );
  }

  return <OnboardingForm initialChoice={profile?.selfAssessment ?? undefined} initialGoal={profile?.dailyGoalMinutes} />;
}

function OnboardingForm({ initialChoice, initialGoal }: { initialChoice?: SelfAssessment; initialGoal?: number }) {
  const { data } = useServices();
  const navigate = useNavigate();
  const id = useId();
  const [choice, setChoice] = useState<SelfAssessment | undefined>(initialChoice);
  const [goal, setGoal] = useState<number>(initialGoal && DAILY_GOAL_OPTIONS.includes(initialGoal) ? initialGoal : DEFAULT_DAILY_GOAL_MINUTES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (!choice) {
      setError(STRINGS_DE.chooseFirst);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [puzzle, bot] = await Promise.all([data.repos.ratings.get('puzzle'), data.repos.ratings.get('bot')]);
      const played = (puzzle?.gamesCount ?? 0) > 0 || (bot?.gamesCount ?? 0) > 0;
      if (!played) await data.progress.initializeFromSelfAssessment(choice);
      await data.progress.saveProfile({ selfAssessment: choice, dailyGoalMinutes: goal, onboardingCompleted: true });
      await navigate(paths.home(), { replace: true });
    } catch (err) {
      console.warn('Onboarding could not be saved', err);
      setError(STRINGS_DE.failed);
      setBusy(false);
    }
  }

  return (
    <Page title={STRINGS_DE.onboarding} subtitle={STRINGS_DE.subtitle}>
      <form
        className="flex max-w-xl flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void finish();
        }}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <Card className="flex flex-col gap-3">
          <h2 id={`${id}-assessment`} className="text-h2 text-text">
            {STRINGS_DE.assessmentTitle}
          </h2>
          <p className="text-body-sm text-muted">{STRINGS_DE.assessmentHint}</p>
          <RadioGroup<SelfAssessment>
            label={STRINGS_DE.assessmentLabel}
            value={choice}
            onValueChange={(v) => {
              setChoice(v);
              setError(null);
            }}
            options={SELF_ASSESSMENT_OPTIONS.map((o) => ({ value: o.id, label: o.labelDe, description: o.descriptionDe }))}
          />
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-h2 text-text">{STRINGS_DE.goalTitle}</h2>
          <p className="text-body-sm text-muted">{STRINGS_DE.goalHint}</p>
          <SegmentedControl<string>
            label={STRINGS_DE.goalLabel}
            value={String(goal)}
            onValueChange={(v) => setGoal(Number(v))}
            options={DAILY_GOAL_OPTIONS.map((m) => ({ value: String(m), label: STRINGS_DE.goalOption(m), description: STRINGS_DE.goalOptionDescription(m) }))}
          />
        </Card>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" size="lg" loading={busy} disabled={busy}>
            {busy ? STRINGS_DE.saving : STRINGS_DE.submit}
          </Button>
        </div>
      </form>
    </Page>
  );
}
