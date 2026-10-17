import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import type { AppServices } from '@/core/services';
import { DEFAULT_SETTINGS, type SelfAssessment } from '@/core/profile';
import type { Puzzle } from '@/core/puzzles';
import { createFakeAppServices, createMemoryDataServices, FakeExplanationService, FIXTURE_PUZZLES, seededRandom, type MemoryDataServices } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { DEMO_PUZZLES, puzzleStartFen } from '@/puzzles';
import { Component as DemoPage } from './pages/DemoPuzzlesPage';
import { Component as HubPage } from './pages/PuzzlesHubPage';
import { Component as LearningPage } from './pages/LearningPuzzlesPage';
import { Component as RatedPage } from './pages/RatedPuzzlesPage';
import { Component as ThemePage } from './pages/ThemePage';
import { Component as ThemesPage } from './pages/ThemesPage';

const fixture = (id: string): Puzzle => structuredClone(FIXTURE_PUZZLES.find((p) => p.id === id)!);
const WAIT = { timeout: 3000 };

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>;
}

interface SetupOptions {
  puzzles?: Puzzle[];
  assessment?: SelfAssessment;
  /** Mark the bank as loaded (the fetch of the manifest fails in jsdom → the stored bank is used). */
  bankLoaded?: boolean;
  explain?: AppServices['explain'];
  /** Reuse a data layer (remount = "after reload" on the wave-1 memory data layer, D-50). */
  data?: MemoryDataServices;
}

async function setup(url: string, { puzzles = FIXTURE_PUZZLES, assessment, bankLoaded = true, explain, data: shared }: SetupOptions = {}) {
  const data = shared ?? createMemoryDataServices({ puzzles, random: seededRandom(5), timeZone: 'Europe/Berlin' });
  if (bankLoaded) await data.repos.puzzles.setBankVersion('test');
  if (assessment) await data.progress.initializeFromSelfAssessment(assessment);
  const services = createFakeAppServices({ data, ...(explain ? { explain } : {}) });
  const router = createMemoryRouter(
    [
      { path: '/puzzles', element: <HubPage /> },
      { path: '/puzzles/rated', element: <RatedPage /> },
      { path: '/puzzles/learn', element: <LearningPage /> },
      { path: '/puzzles/themes', element: <ThemesPage /> },
      { path: '/puzzles/themes/:themeId', element: <ThemePage /> },
      { path: '/puzzles/demo', element: <DemoPage /> },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [url] },
  );
  const view = render(
    <ServicesProvider services={services}>
      <RouterProvider router={router} />
    </ServicesProvider>,
  );
  return { data: data as MemoryDataServices, router, unmount: view.unmount };
}

function square(sq: string): HTMLElement {
  return document.querySelector(`[data-testid="board"] [data-square="${sq}"]`) as HTMLElement;
}

function boardFen(): string {
  return screen.getByTestId('board').getAttribute('data-fen')!;
}

function highlights(sq: string): string {
  return square(sq).querySelector('[data-highlights]')?.getAttribute('data-highlights') ?? '';
}

async function move(uci: string) {
  fireEvent.click(square(uci.slice(0, 2)));
  fireEvent.click(square(uci.slice(2, 4)));
  await act(async () => {});
}

/** Waits until the learner is to move in the task position of `p` (after the opponent's first move). */
async function waitForTask(p: Puzzle) {
  const fen = puzzleStartFen(p);
  await waitFor(() => expect(boardFen()).toBe(fen), WAIT);
  await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'user'), WAIT);
}

/** Waits until the board shows the position after the first `ply` moves of the line. */
async function waitForPly(p: Puzzle, ply: number) {
  const fen = ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
  await waitFor(() => expect(boardFen()).toBe(fen), WAIT);
  await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', ply >= p.moves.length ? 'done' : 'user'), WAIT);
}

/** Plays the complete solution of `p` (the learner's moves), waiting for every opponent reply. */
async function solve(p: Puzzle) {
  for (let ply = 1; ply < p.moves.length; ply += 2) {
    await waitForPly(p, ply);
    await move(p.moves[ply]!);
  }
  await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'done'), WAIT);
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline in tests'))));
});
afterEach(() => {
  vi.unstubAllGlobals();
  useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS });
});

describe('Bewertete Puzzles', () => {
  it('asks for the self-assessment first and then starts at the matching rating', async () => {
    const { data } = await setup('/puzzles/rated', { puzzles: [fixture('fixture-knight-fork')] });
    expect(await screen.findByRole('heading', { name: 'Wie gut spielst du schon?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Clubspieler/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Los geht’s' }));
    await waitForTask(fixture('fixture-knight-fork'));
    expect((await data.repos.ratings.get('puzzle'))!.rating).toBe(1000);
    expect(screen.getAllByTestId('rating-chip')[0]).toHaveTextContent('Dein Rating 1.000');
  });

  it('auto-plays the opponent move, accepts the solution and shows the new rating with delta (AC 1, 5)', async () => {
    const p = fixture('fixture-knight-fork');
    const { data } = await setup('/puzzles/rated', { puzzles: [p], assessment: 'club' });
    await waitFor(() => expect(boardFen()).toBe(ChessGame.fromFen(p.fen).fen()), WAIT); // before the opponent's move
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Weiß am Zug. Finde den besten Zug.');
    await solve(p);
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Gelöst!');
    const result = await screen.findByTestId('rating-result');
    const attempts = await data.repos.puzzleAttempts.list();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ mode: 'rated', solved: true, firstTry: true, hintsUsed: 0, puzzleId: p.id });
    const after = Math.round(attempts[0]!.ratingAfter!);
    expect(after).toBeGreaterThan(1000);
    expect(result).toHaveTextContent(`Puzzle-Rating ${after.toLocaleString('de-DE')}`);
    expect(result).toHaveTextContent(`+${after - 1000}`);
    expect(screen.getByTestId('puzzle-difficulty')).toHaveTextContent('800');
    expect(screen.getByTestId('puzzle-explanation')).toHaveTextContent('Gabel');
    await waitFor(() => expect(screen.getByTestId('next-puzzle')).toHaveFocus());
  });

  it('marks a wrong move immediately, records the failure at once and takes the move back (AC 1)', async () => {
    const p = fixture('fixture-knight-fork');
    const { data } = await setup('/puzzles/rated', { puzzles: [p], assessment: 'club' });
    await waitForTask(p);
    await move('e1e8');
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Leider falsch – das Puzzle zählt als nicht gelöst.');
    expect(highlights('e8')).toContain('wrong');
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    const [attempt] = await data.repos.puzzleAttempts.list();
    expect(attempt).toMatchObject({ solved: false, firstTry: false });
    expect(attempt!.ratingAfter!).toBeLessThan(1000);
    expect(await screen.findByTestId('rating-result')).toHaveTextContent('−');
    await waitForTask(p); // move taken back after 700 ms
    // The learner may keep trying; finishing does not record a second attempt.
    await solve(p);
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('für dein Rating zählt es als nicht gelöst');
    expect(await data.repos.puzzleAttempts.list()).toHaveLength(1);
  });

  it('a hint needs a confirmation and counts as not solved (AC 3)', async () => {
    const p = fixture('fixture-knight-fork');
    const { data } = await setup('/puzzles/rated', { puzzles: [p], assessment: 'club' });
    await waitForTask(p);
    fireEvent.click(screen.getByTestId('hint-button'));
    expect(screen.getByTestId('hint-warning')).toHaveTextContent('Ein Hinweis zählt das Puzzle als nicht gelöst.');
    expect(await data.repos.puzzleAttempts.list()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('hint-button'));
    expect(screen.getByTestId('puzzle-hint')).toHaveTextContent('Schau dir deinen Springer auf d5 an.');
    expect(highlights('d5')).toContain('hint-piece');
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    expect((await data.repos.puzzleAttempts.list())[0]).toMatchObject({ solved: false, hintsUsed: 1 });
  });

  it('asks before leaving an unfinished rated puzzle and records it as not solved', async () => {
    const p = fixture('fixture-knight-fork');
    const { data, router } = await setup('/puzzles/rated', { puzzles: [p], assessment: 'club' });
    await waitForTask(p);
    await act(async () => {
      void router.navigate('/puzzles');
    });
    const dialog = await screen.findByRole('dialog', { name: 'Puzzle verlassen?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weiterlösen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/puzzles/rated');
    await act(async () => {
      void router.navigate('/puzzles');
    });
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Verlassen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/puzzles'));
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    expect((await data.repos.puzzleAttempts.list())[0]).toMatchObject({ mode: 'rated', solved: false });
  });

  it('serves the next puzzle after "Nächstes Puzzle" and never repeats a rated one', async () => {
    const a = fixture('fixture-hanging-queen');
    const b = fixture('fixture-scholars-mate');
    const { data } = await setup('/puzzles/rated', { puzzles: [a, b], assessment: 'newcomer' });
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'user'), WAIT);
    const firstId = screen.getByTestId('puzzle-panel').getAttribute('data-puzzle-id')!;
    const first = firstId === a.id ? a : b;
    const second = firstId === a.id ? b : a;
    await solve(first);
    fireEvent.click(await screen.findByTestId('next-puzzle'));
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-puzzle-id', second.id), WAIT);
    await solve(second);
    fireEvent.click(await screen.findByTestId('next-puzzle'));
    expect(await screen.findByRole('heading', { name: 'Alle bewerteten Puzzles gelöst' }, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Lernmodus' })).toHaveAttribute('href', '/puzzles/learn');
    expect((await data.repos.puzzleAttempts.ratedPuzzleIds()).size).toBe(2);
  });
});

describe('Bewertete Puzzles after a reload (remount on the same data layer, D-50)', () => {
  it('keeps the rating and never serves the rated puzzle again', async () => {
    const a = fixture('fixture-hanging-queen');
    const b = fixture('fixture-scholars-mate');
    const first = await setup('/puzzles/rated', { puzzles: [a, b], assessment: 'newcomer' });
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'user'), WAIT);
    const solvedId = screen.getByTestId('puzzle-panel').getAttribute('data-puzzle-id')!;
    await solve(solvedId === a.id ? a : b);
    await screen.findByTestId('rating-result');
    const rating = Math.round((await first.data.repos.ratings.get('puzzle'))!.rating);
    expect(rating).toBeGreaterThan(400);
    first.unmount();
    await setup('/puzzles/rated', { data: first.data });
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'user'), WAIT);
    expect(screen.getByTestId('puzzle-panel').getAttribute('data-puzzle-id')).toBe(solvedId === a.id ? b.id : a.id);
    expect(screen.getByTestId('rating-chip')).toHaveTextContent(`Dein Rating ${rating}`);
  });
});

describe('Lernmodus', () => {
  it('accepts any checkmating move and then shows motif tags and the explanation (AC 2, 7)', async () => {
    const p = fixture('fixture-two-mates');
    const { data } = await setup('/puzzles/learn?puzzle=fixture-two-mates');
    await waitForTask(p);
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Weiß am Zug. Setze matt in 1 Zug.');
    await move('a1a8'); // the second mating move (the stored solution is Rb8#)
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'done'));
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Gelöst!');
    const expl = screen.getByTestId('puzzle-explanation');
    expect(within(expl).getByText('Grundreihenmatt')).toBeInTheDocument();
    expect(expl).toHaveTextContent('Tb8# setzt matt'); // German notation by default
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    expect((await data.repos.puzzleAttempts.list())[0]).toMatchObject({ mode: 'learning', solved: true, firstTry: true });
    expect(await data.repos.ratings.get('puzzle')).toBeNull(); // unrated
  });

  it('allows retries after a wrong move and offers three hint stages ending in the playable solution (AC 3, 7)', async () => {
    const p = fixture('fixture-knight-fork');
    const { data } = await setup('/puzzles/learn?puzzle=fixture-knight-fork');
    await waitForTask(p);
    await move('e1e8');
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Nicht ganz. Versuch es nochmal.');
    await waitForTask(p);
    const hint = screen.getByTestId('hint-button');
    expect(hint).toHaveTextContent('Hinweis');
    fireEvent.click(hint);
    expect(screen.getByTestId('puzzle-hint')).toHaveTextContent('Schau dir deinen Springer auf d5 an. Denk an eine Gabel.');
    expect(highlights('d5')).toContain('hint-piece');
    expect(hint).toHaveTextContent('Noch ein Hinweis');
    fireEvent.click(hint);
    expect(screen.getByTestId('puzzle-hint')).toHaveTextContent('Er will nach e7.');
    expect(highlights('e7')).toContain('hint-target');
    expect(hint).toHaveTextContent('Lösung zeigen');
    fireEvent.click(hint);
    expect(screen.getByTestId('puzzle-status')).toHaveTextContent('Hier ist die Lösung.');
    await waitFor(() => expect(screen.getByTestId('puzzle-panel')).toHaveAttribute('data-phase', 'done'), { timeout: 5000 });
    expect(boardFen()).toBe(ChessGame.fromMoves(p.fen, p.moves).fen());
    // Step through the solution with Zurück/Vor.
    fireEvent.click(screen.getByRole('button', { name: 'Zum Anfang' }));
    expect(boardFen()).toBe(puzzleStartFen(p));
    fireEvent.click(screen.getByRole('button', { name: 'Vor' }));
    expect(boardFen()).toBe(ChessGame.fromMoves(p.fen, p.moves.slice(0, 2)).fen());
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    expect((await data.repos.puzzleAttempts.list())[0]).toMatchObject({ mode: 'learning', solved: false, solutionShown: true, hintsUsed: 3 });
  });

  it('uses the rule-based explanation for puzzles without a stored one (Lichess) and never shows an empty panel', async () => {
    const lichess: Puzzle = { ...fixture('fixture-knight-fork'), id: 'lichess-1', source: 'lichess', explanation: undefined };
    await setup('/puzzles/learn?puzzle=lichess-1', { puzzles: [lichess] });
    await solve(lichess);
    // FakeExplanationService.explainRuleBased renders the best move of the puzzle facts.
    expect(screen.getByTestId('puzzle-explanation')).toHaveTextContent('Besser: Se7+.');
    expect(within(screen.getByTestId('puzzle-explanation')).getByText('Gabel')).toBeInTheDocument();
  });

  it('shows a short note when no explanation can be produced', async () => {
    const lichess: Puzzle = { ...fixture('fixture-hanging-queen'), id: 'lichess-2', source: 'lichess', explanation: undefined };
    const broken = new FakeExplanationService();
    broken.explainRuleBased = () => {
      throw new Error('no template');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await setup('/puzzles/learn?puzzle=lichess-2', { puzzles: [lichess], explain: broken });
    await solve(lichess);
    expect(screen.getByTestId('puzzle-explanation')).toHaveTextContent('Für dieses Puzzle gibt es noch keine Erklärung.');
    warn.mockRestore();
  });

  it('keyboard: H gives a hint, F flips the board', async () => {
    const p = fixture('fixture-knight-fork');
    await setup('/puzzles/learn?puzzle=fixture-knight-fork');
    await waitForTask(p);
    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.getByTestId('puzzle-hint')).toBeInTheDocument();
    expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'white');
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByTestId('board')).toHaveAttribute('data-orientation', 'black');
  });

  it('offers "Gegen Bot ausspielen" from the task position after the end', async () => {
    const p = fixture('fixture-hanging-queen');
    const { router } = await setup('/puzzles/learn?puzzle=fixture-hanging-queen');
    await solve(p);
    fireEvent.click(screen.getByRole('button', { name: 'Gegen Bot ausspielen' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play/position'));
    expect(new URLSearchParams(router.state.location.search).get('fen')).toBe(puzzleStartFen(p));
  });
});

describe('Themen-Training', () => {
  it('lists at least 20 motifs with counts, filters by difficulty and shows the success rate (AC 8)', async () => {
    const { data } = await setup('/puzzles/themes', { assessment: 'beginner' });
    const list = await screen.findByTestId('theme-list', undefined, WAIT);
    const cards = within(list).getAllByTestId('theme-card');
    expect(cards.length).toBeGreaterThanOrEqual(20);
    const fork = cards.find((c) => c.getAttribute('data-theme') === 'fork')!;
    expect(fork).toHaveTextContent('1 Puzzle');
    expect(fork).toHaveTextContent('Noch nicht trainiert');
    // Leicht = 300–500 around 600: the fork fixture (800) drops out, the mate in 1 fixtures stay.
    fireEvent.click(screen.getByRole('radio', { name: 'Leicht' }));
    await waitFor(() => expect(within(screen.getByTestId('theme-list')).getAllByTestId('theme-card').find((c) => c.getAttribute('data-theme') === 'fork')).toHaveTextContent('Noch keine Puzzles'));
    const mate1 = within(screen.getByTestId('theme-list')).getAllByTestId('theme-card').find((c) => c.getAttribute('data-theme') === 'mateIn1')!;
    expect(mate1).toHaveTextContent('2 Puzzles');
    expect(mate1).toHaveAttribute('href', '/puzzles/themes/mateIn1?d=easy');
    // A theme attempt updates the stored success rate.
    await act(async () => {
      await data.progress.recordPuzzleAttempt({ ...attemptBase('fixture-two-mates'), themes: ['mateIn1'], mode: 'theme', solved: true, firstTry: true });
    });
    await waitFor(() =>
      expect(within(screen.getByTestId('theme-list')).getAllByTestId('theme-card').find((c) => c.getAttribute('data-theme') === 'mateIn1')).toHaveTextContent(
        '100 % gelöst',
      ),
    );
  });

  it('trains one motif and records attempts with mode "theme"', async () => {
    const p = fixture('fixture-knight-fork');
    const { data } = await setup('/puzzles/themes/fork');
    await solve(p);
    await waitFor(async () => expect(await data.repos.puzzleAttempts.list()).toHaveLength(1));
    expect((await data.repos.puzzleAttempts.list())[0]).toMatchObject({ mode: 'theme', solved: true });
    expect((await data.repos.themeStats.list()).find((s) => s.theme === 'fork')).toEqual({ theme: 'fork', attempts: 1, successes: 1 });
  });

  it('shows the empty state for a filter without puzzles and resets it', async () => {
    const { router } = await setup('/puzzles/themes/fork?d=hard', { assessment: 'advanced' });
    expect(await screen.findByRole('heading', { name: 'Keine Puzzles für diesen Filter' }, WAIT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter zurücksetzen' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitForTask(fixture('fixture-knight-fork'));
  });
});

describe('Demo', () => {
  it('shows exactly 5 puzzles, ends with the login call to action and persists nothing (AC 9)', async () => {
    const { data } = await setup('/puzzles/demo', { puzzles: [], bankLoaded: false });
    const before = data.testing.changeCount();
    for (let i = 0; i < 5; i++) {
      expect(await screen.findByTestId('demo-progress')).toHaveTextContent(`Demo-Puzzle ${i + 1} von 5`);
      await solve(DEMO_PUZZLES[i]!);
      if (i < 4) fireEvent.click(screen.getByTestId('next-puzzle'));
    }
    expect(screen.queryByTestId('next-puzzle')).not.toBeInTheDocument();
    expect(screen.getByTestId('demo-done')).toHaveTextContent('Das waren deine 5 Demo-Puzzles.');
    expect(screen.getByTestId('demo-cta')).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Gegen Bot ausspielen' })).not.toBeInTheDocument();
    expect(data.testing.changeCount()).toBe(before);
    expect(await data.repos.puzzleAttempts.list()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled(); // the demo does not even load the bank
  }, 30_000);
});

describe('Puzzles hub', () => {
  it('links the three modes and shows the rating', async () => {
    await setup('/puzzles', { assessment: 'beginner' });
    expect(await screen.findByText('Dein Puzzle-Rating: 600')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bewertete Puzzles/ })).toHaveAttribute('href', '/puzzles/rated');
    expect(screen.getByRole('link', { name: /Lernmodus/ })).toHaveAttribute('href', '/puzzles/learn');
    expect(screen.getByRole('link', { name: /Themen-Training/ })).toHaveAttribute('href', '/puzzles/themes');
  });
});

function attemptBase(puzzleId: string) {
  return { puzzleId, hintsUsed: 0 as const, solutionShown: false, timeMs: 1000, puzzleRating: 450, puzzleRd: 80 };
}
