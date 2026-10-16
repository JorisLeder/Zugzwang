import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CoachBubble } from './CoachBubble';
import { splitSentences } from './text';

describe.each(['dark', 'light'] as const)('CoachBubble (%s)', (theme) => {
  it('shows at most 3 sentences and moves the rest behind "Mehr erfahren"', async () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    render(
      <CoachBubble name="Coach">
        {'Dein Läufer auf c4 hängt. Der Springer kann ihn schlagen. Besser war Le2. Merke: Prüfe jede ungedeckte Figur.'}
      </CoachBubble>,
    );
    expect(screen.getByText('Dein Läufer auf c4 hängt. Der Springer kann ihn schlagen. Besser war Le2.')).toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'Mehr erfahren' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    expect(screen.getByText('Merke: Prüfe jede ungedeckte Figur.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('danger variant is an alert with actions; feedback row records votes', async () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    const onVote = vi.fn();
    render(
      <CoachBubble tone="danger" actions={<button type="button">Nochmal überlegen</button>} feedback={{ value: null, onVote }}>
        Bist du sicher? Dein Läufer auf c4 hängt.
      </CoachBubble>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bist du sicher?');
    expect(screen.getByRole('button', { name: 'Nochmal überlegen' })).toBeInTheDocument();
    expect(screen.getByText('War das hilfreich?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ja, hilfreich' }));
    expect(onVote).toHaveBeenCalledWith(1);
  });

  it('praise variant with details', () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    render(
      <CoachBubble tone="praise" details={<p>Variante: Sf3 Sc6</p>}>
        Starker Zug! Damit greifst du zwei Figuren an.
      </CoachBubble>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mehr erfahren' })).toBeInTheDocument();
  });
});

describe('splitSentences', () => {
  it('splits German text at sentence ends', () => {
    expect(splitSentences('Eins. Zwei! Drei? Vier')).toEqual(['Eins.', 'Zwei!', 'Drei?', 'Vier']);
  });
});
