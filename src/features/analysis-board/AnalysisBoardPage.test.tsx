import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paths } from '@/app/paths';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { START_FEN } from '@/core/chess';
import { DEFAULT_SETTINGS } from '@/core/profile';
import { createFakeAppServices, FakeEngineService } from '@/core/testing';
import { Component as AnalysisBoardPage } from './pages/AnalysisBoardPage';

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>;
}

function renderPage(url: string = paths.analysisBoard(), engine = new FakeEngineService({ id: 'fake-analysis' })) {
  const services = createFakeAppServices({ engines: { play: new FakeEngineService({ id: 'fake-play' }), analysis: engine } });
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/analysis/board" element={<AnalysisBoardPage />} />
          <Route path="/play/position" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
  return { services, engine };
}

function square(sq: string): HTMLElement {
  return document.querySelector(`[data-testid="board"] [data-square="${sq}"]`) as HTMLElement;
}

function fen(): string {
  return screen.getByTestId('board').getAttribute('data-fen')!;
}

async function click(from: string, to: string) {
  fireEvent.click(square(from));
  fireEvent.click(square(to));
  await act(async () => {});
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});
afterEach(() => useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS }));

describe('Analysebrett', () => {
  it('starts from the initial position, plays both sides and lists the moves in German notation', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Analysebrett' })).toBeInTheDocument();
    expect(fen()).toBe(START_FEN);
    await click('e2', 'e4');
    await click('e7', 'e5');
    await click('g1', 'f3');
    expect(screen.getByTestId('position-status')).toHaveTextContent('Schwarz am Zug');
    await user.click(screen.getByRole('tab', { name: 'Züge' }));
    const list = screen.getByRole('list', { name: 'Zugliste' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['e4', 'e5', 'Sf3']);
  });

  it('loads ?fen= and orients the board for the side to move', () => {
    renderPage(paths.analysisBoard({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' }));
    expect(fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
  });

  it('shows a German error for an invalid ?fen=', () => {
    renderPage(paths.analysisBoard({ fen: '4k3/4R3/8/8/8/8/8/4K3 w - - 0 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Diese Stellung kann nicht geladen werden. Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.',
    );
    expect(screen.getByRole('link', { name: 'Leeres Analysebrett öffnen' })).toHaveAttribute('href', '/analysis/board');
  });

  it('loads ?pgn= at the end and navigates with buttons and arrow keys', async () => {
    renderPage(paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 *' }));
    const end = fen();
    expect(end).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(fen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    fireEvent.keyDown(document.body, { key: 'Home' });
    expect(fen()).toBe(START_FEN);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    fireEvent.keyDown(document.body, { key: 'End' });
    expect(fen()).toBe(end);
  });

  it('asks before a move at an earlier ply replaces the later moves', async () => {
    const user = userEvent.setup();
    renderPage(paths.analysisBoard({ pgn: '1. e4 e5 2. Nf3 Nc6 *' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zum Anfang' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
    // Same move as in the line: just steps forward, no question.
    await click('e7', 'e5');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    // Another move: confirmation, cancel keeps everything.
    await click('d2', 'd4');
    const dialog = await screen.findByRole('dialog', { name: 'Spätere Züge ersetzen?' });
    expect(dialog).toHaveTextContent('werden die 2 folgenden Züge gelöscht');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    await act(async () => {});
    expect(fen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    fireEvent.click(screen.getByRole('button', { name: 'Zum Ende' }));
    expect(fen()).toBe('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    // Confirm: the line is replaced.
    fireEvent.click(screen.getByRole('button', { name: 'Zum Anfang' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
    await click('d2', 'd4');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Züge ersetzen' }));
    await waitFor(() => expect(fen()).toBe('rnbqkbnr/pppp1ppp/8/4p3/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2'));
    expect(screen.getByRole('button', { name: 'Vor' })).toBeDisabled();
  });

  it('shows the top 2 engine lines with evaluation and depth, a best-move arrow and the eval bar', async () => {
    const user = userEvent.setup();
    const engine = new FakeEngineService({
      id: 'fake-analysis',
      lines: {
        [START_FEN]: [
          { multipv: 1, depth: 14, score: { type: 'cp', value: 30 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
          { multipv: 2, depth: 14, score: { type: 'cp', value: 20 }, pv: ['d2d4', 'd7d5'] },
        ],
      },
    });
    renderPage(paths.analysisBoard(), engine);
    expect(screen.queryByTestId('engine-lines')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Engine' }));
    const lines = await screen.findAllByTestId('engine-line');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('+0,3');
    expect(lines[0]).toHaveTextContent('1. e4 e5 2. Sf3');
    expect(lines[0]).toHaveTextContent('Tiefe 14');
    expect(lines[1]).toHaveTextContent('1. d4 d5');
    expect(engine.calls.at(-1)).toMatchObject({ method: 'analyse', fen: START_FEN, opts: { multiPv: 2 } });
    expect(document.querySelector('[data-arrow="e2-e4"]')).toHaveAttribute('data-arrow-kind', 'best');
    expect(screen.getAllByRole('img', { name: /^Bewertung: / }).length).toBeGreaterThan(0);
    // Clicking a line plays its first move.
    await user.click(lines[0]!);
    await waitFor(() => expect(fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'));
    expect(engine.calls.at(-1)?.fen).toBe(fen());
  });

  it('shows the engine error card when the engine cannot start', async () => {
    const user = userEvent.setup();
    renderPage(paths.analysisBoard(), new FakeEngineService({ id: 'broken', failInit: 'worker failed' }));
    await user.click(screen.getByRole('switch', { name: 'Engine' }));
    expect(await screen.findByText('Die Engine konnte nicht starten. Lade die Seite neu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument();
  });

  it('builds a position in the editor, rejects illegal ones in German and applies legal ones', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Stellung aufbauen' }));
    expect(screen.getByRole('application', { name: 'Stellungseditor' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Brett leeren' }));
    expect(screen.getByTestId('editor-validation')).toHaveTextContent('Weiß braucht genau einen König.');
    const apply = screen.getByRole('button', { name: 'Stellung übernehmen' });
    expect(apply).toBeDisabled();
    // White king (selected by default) on e1, black king on e8, white rook on e7 → Black in check with White to move.
    fireEvent.click(square('e1'));
    await user.click(screen.getByRole('button', { name: 'Schwarz: König setzen' }));
    fireEvent.click(square('e8'));
    await user.click(screen.getByRole('button', { name: 'Weiß: Turm setzen' }));
    fireEvent.click(square('e7'));
    expect(screen.getByTestId('editor-validation')).toHaveTextContent(
      'Schwarz ist nicht am Zug, steht aber im Schach – diese Stellung kann nicht entstehen.',
    );
    expect(apply).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Schwarz am Zug' }));
    expect(screen.getByTestId('editor-validation')).toHaveTextContent('Die Stellung ist gültig.');
    await user.click(screen.getByRole('button', { name: 'Stellung übernehmen' }));
    expect(fen()).toBe('4k3/4R3/8/8/8/8/8/4K3 b - - 0 1');
    expect(screen.getByRole('application', { name: 'Schachbrett, du spielst Weiß' })).toBeInTheDocument();
  });

  it('imports and exports FEN and PGN', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    const input = screen.getByRole('textbox', { name: 'FEN oder PGN laden' });
    await user.type(input, 'kaputt');
    await user.click(screen.getByRole('button', { name: 'Laden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Die PGN konnte nicht gelesen werden.');
    await user.clear(input);
    fireEvent.change(input, { target: { value: '8/8/8/8/8/8/8/8 w - - 0 1' } });
    await user.click(screen.getByRole('button', { name: 'Laden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Weiß braucht genau einen König.');
    fireEvent.change(input, { target: { value: '1. d4 d5 2. c4 *' } });
    await user.click(screen.getByRole('button', { name: 'Laden' }));
    expect(fen()).toBe('rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2');
    expect(screen.getByTestId('fen-output')).toHaveValue(fen());
    await user.click(screen.getByRole('button', { name: 'FEN kopieren' }));
    expect(writeText).toHaveBeenLastCalledWith(fen());
    expect(await screen.findByText('FEN kopiert.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'PGN kopieren' }));
    expect(writeText.mock.calls.at(-1)?.[0]).toMatch(/1\. d4 d5 2\. c4 \*$/);
  });

  it('"Gegen Bot ausspielen" opens /play/position with the shown FEN', async () => {
    const user = userEvent.setup();
    renderPage();
    await click('e2', 'e4');
    await user.click(screen.getByRole('button', { name: 'Gegen Bot ausspielen' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/play/position?fen=${encodeURIComponent('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')}`.replace(/%20/g, '+'),
    );
  });

  it('flips the board with the button and the F key', () => {
    renderPage();
    const board = screen.getByTestId('board');
    fireEvent.click(screen.getAllByRole('button', { name: 'Brett drehen' })[0]!);
    expect(board).toHaveAttribute('data-orientation', 'black');
    act(() => board.focus());
    fireEvent.keyDown(board, { key: 'f' });
    expect(board).toHaveAttribute('data-orientation', 'white');
  });
});
