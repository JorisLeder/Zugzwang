/**
 * Every primitive renders in the dark (default) and light theme with its accessible roles/labels (BACKLOG 2.11 #10).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Banner,
  Button,
  Card,
  CardMeta,
  CardTitle,
  Chip,
  Dialog,
  DialogContent,
  DialogTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  ProgressBar,
  ProgressRing,
  RadioGroup,
  RatingDelta,
  SegmentedControl,
  Select,
  Spinner,
  Stars,
  StreakBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  ToastProvider,
  Tooltip,
  useToast,
} from './index';

const THEMES = ['dark', 'light'] as const;

function withTheme(theme: (typeof THEMES)[number]) {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

describe.each(THEMES)('primitives in the %s theme', (theme) => {
  it('Button: variants, loading state, asChild', async () => {
    withTheme(theme);
    const onClick = vi.fn();
    render(
      <div>
        <Button onClick={onClick}>Partie starten</Button>
        <Button variant="secondary" size="lg">
          Nochmal versuchen
        </Button>
        <Button variant="danger" loading onClick={onClick}>
          Aufgeben
        </Button>
        <Button asChild variant="link">
          <a href="/x">Mehr erfahren</a>
        </Button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Partie starten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aufgeben' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Aufgeben' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('link', { name: 'Mehr erfahren' })).toHaveAttribute('href', '/x');
    expect(screen.getByRole('button', { name: 'Partie starten' }).className).toContain('bg-accent');
  });

  it('IconButton has a German aria-label; Tooltip wraps triggers', () => {
    withTheme(theme);
    render(
      <div>
        <IconButton label="Brett drehen" icon={<Star />} />
        <Tooltip content="Hinweis">
          <button type="button">H</button>
        </Tooltip>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Brett drehen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H' })).toBeInTheDocument();
  });

  it('Card, Badge, Chip, Spinner', () => {
    withTheme(theme);
    render(
      <Card hero>
        <CardTitle>Nächste Lektion</CardTitle>
        <CardMeta>Die Gabel</CardMeta>
        <Badge tone="warning">vorläufig</Badge>
        <Chip selected>Gabel</Chip>
        <Spinner label="Wird geladen …" />
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Nächste Lektion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gabel' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Wird geladen …');
  });

  it('Tabs switch panels', async () => {
    withTheme(theme);
    render(
      <Tabs defaultValue="coach">
        <TabsList aria-label="Panel">
          <TabsTrigger value="coach">Coach</TabsTrigger>
          <TabsTrigger value="moves">Züge</TabsTrigger>
        </TabsList>
        <TabsContent value="coach">Coach-Inhalt</TabsContent>
        <TabsContent value="moves">Zugliste</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Coach-Inhalt');
    await userEvent.click(screen.getByRole('tab', { name: 'Züge' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Zugliste');
  });

  it('Dialog opens with title and closes with the close button', async () => {
    withTheme(theme);
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Öffnen</button>
        </DialogTrigger>
        <DialogContent title="Partie wirklich aufgeben?" description="Das kann nicht rückgängig gemacht werden.">
          <Button variant="danger">Aufgeben</Button>
        </DialogContent>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    const dialog = screen.getByRole('dialog', { name: 'Partie wirklich aufgeben?' });
    expect(dialog).toHaveAccessibleDescription('Das kann nicht rückgängig gemacht werden.');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ProgressBar and ProgressRing expose progressbar semantics', () => {
    withTheme(theme);
    render(
      <div>
        <ProgressBar value={18} max={40} label="Analyse läuft … 18 von 40 Zügen" />
        <ProgressRing value={12} max={20} label="Tagesziel: 12 von 20 Minuten" centerText="12/20" centerCaption="Min." />
        <ProgressRing value={20} max={20} size={40} label="Tagesziel erreicht" />
      </div>,
    );
    expect(screen.getByRole('progressbar', { name: 'Analyse läuft … 18 von 40 Zügen' })).toHaveAttribute('aria-valuenow', '18');
    expect(screen.getByRole('progressbar', { name: 'Tagesziel: 12 von 20 Minuten' })).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByText('12/20')).toBeInTheDocument();
  });

  it('Switch, SegmentedControl, RadioGroup and Select', async () => {
    withTheme(theme);
    function Form() {
      const [sound, setSound] = useState(true);
      const [level, setLevel] = useState<'competition' | 'training' | 'coach'>('training');
      const [self, setSelf] = useState<'newcomer' | 'beginner' | undefined>(undefined);
      return (
        <div>
          <Switch checked={sound} onCheckedChange={setSound} label="Töne" description="Zug, Schlag, Schach, Erfolg, Fehler" />
          <SegmentedControl
            label="Hilfe-Stufe"
            value={level}
            onValueChange={setLevel}
            options={[
              { value: 'competition', label: 'Wettkampf', description: 'Keine Hilfen.' },
              { value: 'training', label: 'Training', description: 'Zurücknehmen und Hinweise.' },
              { value: 'coach', label: 'Coach' },
            ]}
          />
          <RadioGroup
            label="Selbsteinschätzung"
            value={self}
            onValueChange={setSelf}
            options={[
              { value: 'newcomer', label: 'Neuling', description: 'Ich kenne die Regeln kaum.' },
              { value: 'beginner', label: 'Einsteiger' },
            ]}
          />
          <Select label="Notation" value="de" onValueChange={() => {}} options={[{ value: 'de', label: 'Deutsch' }]} />
          <output data-testid="state">{`${sound}|${level}|${self}`}</output>
        </div>
      );
    }
    render(<Form />);
    await userEvent.click(screen.getByRole('switch', { name: 'Töne' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Coach' }));
    await userEvent.click(screen.getByRole('radio', { name: /Neuling/ }));
    expect(screen.getByTestId('state')).toHaveTextContent('false|coach|newcomer');
    expect(screen.getByRole('combobox', { name: 'Notation' })).toBeInTheDocument();
  });

  it('Banner, EmptyState and ErrorState', async () => {
    withTheme(theme);
    const onDismiss = vi.fn();
    const onRetry = vi.fn();
    render(
      <div>
        <Banner tone="info" onDismiss={onDismiss}>
          Lokaler Modus: Dein Fortschritt wird nur auf diesem Gerät gespeichert.
        </Banner>
        <EmptyState icon={<Star />} title="Noch keine Partien" text="Spiel eine Partie." action={<Button>Partie starten</Button>} />
        <ErrorState onRetry={onRetry} />
      </div>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Lokaler Modus');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Das hat nicht geklappt. Versuch es nochmal.');
  });

  it('Stars, RatingDelta and StreakBadge', () => {
    withTheme(theme);
    render(
      <div>
        <Stars value={2} />
        <RatingDelta value={8} />
        <RatingDelta value={-6} />
        <RatingDelta value={0} />
        <StreakBadge days={5} trainedToday />
        <StreakBadge days={3} trainedToday={false} />
        <StreakBadge days={0} trainedToday={false} />
      </div>,
    );
    expect(screen.getByRole('img', { name: '2 von 3 Sternen' })).toBeInTheDocument();
    expect(screen.getByText('+8')).toHaveClass('text-accent-text');
    expect(screen.getByText('\u22126')).toHaveClass('text-muted');
    expect(screen.getByText('±0')).toBeInTheDocument();
    expect(screen.getByLabelText('Streak: 5 Tage')).toBeInTheDocument();
    expect(screen.getByLabelText('Streak: 3 Tage – Heute noch offen')).toBeInTheDocument();
    expect(screen.getByText('Starte heute deinen Streak')).toBeInTheDocument();
  });

  it('Toast shows a queued message', async () => {
    withTheme(theme);
    function Trigger() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast({ title: 'Export erstellt.', tone: 'success' })}>
          Export
        </button>
      );
    }
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Export erstellt.')).toBeInTheDocument();
  });
});
