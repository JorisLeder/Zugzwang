import { useState } from 'react';
import { useServices } from '@/app/services';
import { SELF_ASSESSMENT_OPTIONS, type SelfAssessment } from '@/core/profile';
import { Page } from '@/ui/layout';
import { Button, ErrorState, RadioGroup } from '@/ui/primitives';
import { STRINGS_DE } from '../strings.de';

/**
 * Self-assessment before the first rated puzzle (P0-04, D-10): sets the start ratings through
 * `progress.initializeFromSelfAssessment` – the same call the onboarding (WP-09) uses.
 */
export function SelfAssessmentPrompt({ title }: { title: string }) {
  const { data } = useServices();
  const [choice, setChoice] = useState<SelfAssessment>('beginner');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await data.progress.initializeFromSelfAssessment(choice);
    } catch (e) {
      console.warn('Self-assessment not saved', e);
      setFailed(true);
      setSaving(false);
    }
  };
  return (
    <Page title={title}>
      <div className="flex max-w-xl flex-col gap-4">
        <h2 className="text-h2 text-text">{STRINGS_DE.selfAssessmentTitle}</h2>
        <p className="text-body text-muted">{STRINGS_DE.selfAssessmentText}</p>
        <RadioGroup<SelfAssessment>
          label={STRINGS_DE.selfAssessmentLabel}
          value={choice}
          onValueChange={setChoice}
          options={SELF_ASSESSMENT_OPTIONS.map((o) => ({
            value: o.id,
            label: o.labelDe,
            description: `${o.descriptionDe} ${STRINGS_DE.selfAssessmentStartValue(o.puzzleRating)}`,
          }))}
        />
        {failed && <ErrorState />}
        <div>
          <Button size="lg" loading={saving} onClick={() => void start()}>
            {STRINGS_DE.selfAssessmentStart}
          </Button>
        </div>
      </div>
    </Page>
  );
}
