import { useState } from 'react';
import type { BotProfile } from '@/core/bots';
import type { AssistanceLevel } from '@/core/games';
import { Button, SegmentedControl, Select } from '@/ui/primitives';
import type { ColorChoice } from '../logic';
import { STRINGS_DE } from '../strings.de';

/** What the learner chose in the setup. */
export interface SetupChoice {
  bot: BotProfile;
  assistance: AssistanceLevel;
  color: ColorChoice;
}

/** Props of `SetupForm`. */
export interface SetupFormProps {
  /** Bots to choose from; with `showBotSelect` a select is shown, otherwise the first bot is used. */
  bots: BotProfile[];
  initialBotId: string;
  initialLevel: AssistanceLevel;
  initialColor: ColorChoice;
  /** Offered levels (default: all three). */
  levels?: AssistanceLevel[];
  showBotSelect?: boolean;
  /** Extra one-line note (e.g. "Partien aus einer eigenen Stellung zählen nicht fürs Bot-Rating."). */
  note?: string;
  onStart: (choice: SetupChoice) => Promise<void>;
}

const ALL_LEVELS: AssistanceLevel[] = ['competition', 'training', 'coach'];

/**
 * Game setup (DESIGN §3.6): Hilfe-Stufe (segmented, one-line description + "zählt fürs Bot-Rating: ja/nein"),
 * Farbe (Weiß · Zufall · Schwarz), "Ohne Uhr" (no time control in V1, D-06/D-31) and the primary "Partie starten".
 */
export function SetupForm({ bots, initialBotId, initialLevel, initialColor, levels = ALL_LEVELS, showBotSelect = false, note, onStart }: SetupFormProps) {
  const [botId, setBotId] = useState(initialBotId);
  const [level, setLevel] = useState<AssistanceLevel>(levels.includes(initialLevel) ? initialLevel : levels[levels.length - 1]!);
  const [color, setColor] = useState<ColorChoice>(initialColor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bot = bots.find((b) => b.id === botId) ?? bots[0];

  const start = async () => {
    if (!bot || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onStart({ bot, assistance: level, color });
    } catch (e) {
      console.error('SetupForm: start failed', e);
      setError(STRINGS_DE.startError);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {showBotSelect && (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-text">
            {STRINGS_DE.opponentLabel}
          </p>
          <Select
            value={botId}
            onValueChange={setBotId}
            label={STRINGS_DE.opponentLabel}
            options={bots.map((b) => ({ value: b.id, label: `${b.name} (${b.elo}) – ${b.styleLabelDe}` }))}
            className="w-full"
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text">{STRINGS_DE.levelLabel}</p>
        <SegmentedControl
          label={STRINGS_DE.levelLabel}
          value={level}
          onValueChange={setLevel}
          options={levels.map((l) => ({ value: l, label: STRINGS_DE.levels[l], description: STRINGS_DE.levelDescriptions[l] }))}
        />
        <p className="text-body-sm text-muted" data-testid="setup-rated">
          {level === 'competition' ? STRINGS_DE.ratedYes : STRINGS_DE.ratedNo}
        </p>
        {note && <p className="text-body-sm text-muted">{note}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-text">{STRINGS_DE.colorLabel}</p>
        <SegmentedControl
          label={STRINGS_DE.colorLabel}
          value={color}
          onValueChange={setColor}
          options={(['w', 'random', 'b'] as const).map((c) => ({ value: c, label: STRINGS_DE.colors[c] }))}
        />
      </div>
      <p className="text-body-sm text-muted">{STRINGS_DE.noClock}</p>
      {error && (
        <p role="alert" className="text-body-sm text-danger-text">
          {error}
        </p>
      )}
      <Button size="lg" fullWidth loading={busy} onClick={() => void start()}>
        {STRINGS_DE.start}
      </Button>
    </div>
  );
}
