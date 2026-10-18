/**
 * Einstellungen `/settings` (PRD §6): Design (Dunkel/Hell, no "System" option), Brettdesign (Moos/Holz), Figuren
 * (react-chessboard default set only), Koordinaten, Mögliche Züge, Zugbestätigung, Töne, Animationen, Notation
 * (Deutsch/Englisch), Sprache (Deutsch; Englisch "in Vorbereitung"), Tagesziel and the account section (export,
 * delete). Every change applies immediately and is persisted in the profile.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useServices, useSettings, useUpdateSettings } from '@/app/services';
import { DAILY_GOAL_OPTIONS, DEFAULT_DAILY_GOAL_MINUTES, type Settings } from '@/core/profile';
import { AccountSection } from '@/features/auth/AccountSection';
import { useLiveProfile } from '@/features/profile/useProgressData';
import { formatSan } from '@/lib/chess';
import { Page } from '@/ui/layout/Page';
import { Card, RadioGroup, SegmentedControl, Switch } from '@/ui/primitives';
import { notationExample } from '../notationExample';
import { STRINGS_DE } from '../strings.de';

function Section({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <Card className="flex flex-col gap-5">
        <h2 id={id} className="text-h2 text-text">
          {title}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-h3 text-text">{label}</h3>
      {children}
      {hint && <p className="text-body-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Small checker swatch in the current board colours (follows the Brettdesign setting immediately). */
function BoardSwatch({ name }: { name: string }) {
  return (
    <div role="img" aria-label={STRINGS_DE.boardPreview(name)} className="grid w-32 grid-cols-4 overflow-hidden rounded-[var(--zz-radius-board)]" data-testid="settings-board-swatch">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="aspect-square" style={{ background: (i + Math.floor(i / 4)) % 2 === 0 ? 'var(--zz-sq-light)' : 'var(--zz-sq-dark)' }} />
      ))}
    </div>
  );
}

/** Settings page (lazy route module). */
export function Component() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [error, setError] = useState<string | null>(null);
  const example = useMemo(() => notationExample(), []);

  const update = (patch: Partial<Settings>) => {
    setError(null);
    updateSettings(patch).catch((err: unknown) => {
      console.warn('Settings could not be saved', err);
      setError(STRINGS_DE.saveFailed);
    });
  };

  const exampleText = example
    .map((m) => `${m.color === 'w' ? `${m.moveNumber}. ` : ''}${formatSan(m.san, settings.notation)}`)
    .join(' ');

  return (
    <Page title={STRINGS_DE.title} subtitle={STRINGS_DE.subtitle}>
      <div className="flex max-w-2xl flex-col gap-6">
        {error && (
          <p role="alert" className="text-body-sm text-danger-text">
            {error}
          </p>
        )}
        <Section title={STRINGS_DE.appearanceTitle} testId="settings-appearance">
          <Field label={STRINGS_DE.theme}>
            <SegmentedControl<'dark' | 'light'>
              label={STRINGS_DE.theme}
              value={settings.theme === 'light' ? 'light' : 'dark'}
              onValueChange={(theme) => update({ theme })}
              options={[
                { value: 'dark', label: STRINGS_DE.themeDark },
                { value: 'light', label: STRINGS_DE.themeLight },
              ]}
            />
          </Field>
          <Field label={STRINGS_DE.board}>
            <SegmentedControl<Settings['boardTheme']>
              label={STRINGS_DE.board}
              value={settings.boardTheme}
              onValueChange={(boardTheme) => update({ boardTheme })}
              options={[
                { value: 'moos', label: STRINGS_DE.boardMoos },
                { value: 'holz', label: STRINGS_DE.boardHolz },
              ]}
            />
            <BoardSwatch name={settings.boardTheme === 'holz' ? STRINGS_DE.boardHolz : STRINGS_DE.boardMoos} />
          </Field>
          <Field label={STRINGS_DE.pieces}>
            <RadioGroup<Settings['pieceSet']>
              label={STRINGS_DE.pieces}
              value={settings.pieceSet}
              onValueChange={(pieceSet) => update({ pieceSet })}
              options={[{ value: 'default', label: STRINGS_DE.piecesDefault, description: STRINGS_DE.piecesHint }]}
            />
          </Field>
        </Section>

        <Section title={STRINGS_DE.boardTitle} testId="settings-board">
          <div className="flex flex-col gap-3">
            <Switch
              label={STRINGS_DE.coordinates}
              description={STRINGS_DE.coordinatesHint}
              checked={settings.showCoordinates}
              onCheckedChange={(showCoordinates) => update({ showCoordinates })}
            />
            <Switch
              label={STRINGS_DE.legalMoves}
              description={STRINGS_DE.legalMovesHint}
              checked={settings.showLegalMoves}
              onCheckedChange={(showLegalMoves) => update({ showLegalMoves })}
            />
            <Switch
              label={STRINGS_DE.moveConfirmation}
              description={STRINGS_DE.moveConfirmationHint}
              checked={settings.moveConfirmation}
              onCheckedChange={(moveConfirmation) => update({ moveConfirmation })}
            />
          </div>
        </Section>

        <Section title={STRINGS_DE.soundTitle} testId="settings-sound">
          <div className="flex flex-col gap-3">
            <Switch label={STRINGS_DE.sound} description={STRINGS_DE.soundHint} checked={settings.sound} onCheckedChange={(sound) => update({ sound })} />
            <Switch
              label={STRINGS_DE.animations}
              description={STRINGS_DE.animationsHint}
              checked={settings.animations}
              onCheckedChange={(animations) => update({ animations })}
            />
          </div>
        </Section>

        <Section title={STRINGS_DE.languageTitle} testId="settings-language">
          <Field label={STRINGS_DE.notation}>
            <RadioGroup<Settings['notation']>
              label={STRINGS_DE.notation}
              value={settings.notation}
              onValueChange={(notation) => update({ notation })}
              options={[
                { value: 'de', label: STRINGS_DE.notationDe },
                { value: 'en', label: STRINGS_DE.notationEn },
              ]}
            />
            <p className="break-words text-body-sm text-muted" data-testid="settings-notation-example">
              {STRINGS_DE.notationExample(exampleText)}
            </p>
          </Field>
          <Field label={STRINGS_DE.language}>
            <RadioGroup<Settings['language']>
              label={STRINGS_DE.language}
              value="de"
              onValueChange={(language) => language === 'de' && update({ language })}
              options={[
                { value: 'de', label: STRINGS_DE.languageDe },
                { value: 'en', label: STRINGS_DE.languageEn, disabled: true },
              ]}
            />
          </Field>
        </Section>

        <Section title={STRINGS_DE.goalTitle} testId="settings-goal">
          <DailyGoalField onError={() => setError(STRINGS_DE.saveFailed)} />
        </Section>

        <AccountSection />
      </div>
    </Page>
  );
}

function DailyGoalField({ onError }: { onError: () => void }) {
  const { data } = useServices();
  const profile = useLiveProfile();
  const [pending, setPending] = useState<number | null>(null);
  const goal = pending ?? profile?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
  return (
    <Field label={STRINGS_DE.goal}>
      <SegmentedControl<string>
        label={STRINGS_DE.goal}
        value={String(goal)}
        onValueChange={(v) => {
          const minutes = Number(v);
          setPending(minutes);
          // The chosen value stays shown (no flicker back while the live profile catches up).
          data.progress.saveProfile({ dailyGoalMinutes: minutes }).then(
            () => undefined,
            (err: unknown) => {
              console.warn('Daily goal could not be saved', err);
              setPending(null);
              onError();
            },
          );
        }}
        options={DAILY_GOAL_OPTIONS.map((m) => ({ value: String(m), label: STRINGS_DE.goalOption(m), description: STRINGS_DE.goalOptionDescription(m) }))}
      />
    </Field>
  );
}
