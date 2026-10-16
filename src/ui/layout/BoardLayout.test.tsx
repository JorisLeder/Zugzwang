import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BoardLayout } from './BoardLayout';
import { ShellContext } from './shellContext';

describe.each(['dark', 'light'] as const)('BoardLayout (%s)', (theme) => {
  it('renders board, panel and actions slots, top bar with back link', () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    render(
      <MemoryRouter>
        <BoardLayout
          title="Weiß am Zug"
          backTo="/puzzles"
          board={(size) => <div data-testid="the-board">{size}</div>}
          panelTabs={<p>Panel-Inhalt</p>}
          actions={<button type="button">Hinweis</button>}
          playerTop={<span>Gegner</span>}
          playerBottom={<span>Du</span>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Weiß am Zug' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück' })).toHaveAttribute('href', '/puzzles');
    expect(screen.getByTestId('the-board')).toHaveTextContent('320');
    expect(screen.getByTestId('board-container')).toHaveStyle({ width: '320px', height: '320px' });
    expect(screen.getByText('Panel-Inhalt')).toBeInTheDocument();
    expect(screen.getByTestId('action-bar')).toContainElement(screen.getByRole('button', { name: 'Hinweis' }));
    expect(screen.getByText('Gegner')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('registers itself as board screen with the shell while mounted (D-40)', () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    const unregister = vi.fn();
    const registerBoardScreen = vi.fn(() => unregister);
    const { unmount } = render(
      <ShellContext.Provider value={{ registerBoardScreen }}>
        <MemoryRouter>
          <BoardLayout title="Analysebrett" board={<div />} />
        </MemoryRouter>
      </ShellContext.Provider>,
    );
    expect(registerBoardScreen).toHaveBeenCalledTimes(1);
    unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
