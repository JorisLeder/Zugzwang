import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { paths } from '@/app/paths';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { BOT_ROSTER, recommendBot } from '@/bots';
import { DEFAULT_SETTINGS } from '@/core/profile';
import type { AppServices } from '@/core/services';
import {
  createFakeAppServices,
  createMemoryDataServices,
  FakeAnalysisService,
  FIXTURE_GAME,
  FIXTURE_GAME_ANALYSIS_SCRIPT,
  type MemoryDataServices,
} from '@/core/testing';
import { importedGameRecord, parsePgnWithDiagnostics } from '@/pgn';
import { Component as AnalysisHubPage } from './pages/AnalysisHubPage';
import { Component as GameReviewPage } from './pages/GameReviewPage';
import { currentEngineVersion } from './review';

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>;
}

function renderAt(url: string, services: AppServices) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/analysis" element={<AnalysisHubPage />} />
          <Route path="/analysis/board" element={<LocationProbe />} />
          <Route path="/analysis/:gameId" element={<GameReviewPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

class CountingAnalysis extends FakeAnalysisService {
  calls = 0;
  override analyseGame(...args: Parameters<FakeAnalysisService['analyseGame']>) {
    this.calls += 1;
    return super.analyseGame(...args);
  }
}

function fakeServices(data: MemoryDataServices = createMemoryDataServices(), analysis?: FakeAnalysisService) {
  return createFakeAppServices({
    data,
    botRoster: BOT_ROSTER,
    analysis:
      analysis ??
      new CountingAnalysis({ engineId: 'fake-analysis', engineVersion: currentEngineVersion('fake-analysis'), moves: FIXTURE_GAME_ANALYSIS_SCRIPT }),
  });
}

async function importFixture(data: MemoryDataServices): Promise<string> {
  const parsed = parsePgnWithDiagnostics(FIXTURE_GAME.pgn);
  if (!parsed.ok) throw new Error('fixture PGN');
  return (await data.progress.createGame(importedGameRecord(parsed.games[0]!, '2026-10-17T10:00:00.000Z'))).id;
}

function boardFen(): string {
  return screen.getByTestId('board').getAttribute('data-fen')!;
}

function square(sq: string): HTMLElement {
  return document.querySelector(`[data-testid="board"] [data-square="${sq}"]`) as HTMLElement;
}

async function clickMove(from: string, to: string) {
  fireEvent.click(square(from));
  fireEvent.click(square(to));
  await act(async () => {});
}

async function openBlunder(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('review-summary');
  const moments = screen.getByTestId('key-moments');
  await user.click(within(moments).getByRole('button', { name: /14\. Dc2/ }));
  await waitFor(() => expect(screen.getByTestId('move-detail')).toHaveAttribute('data-ply', '27'));
}

afterEach(() => useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS }));

describe('Analyse (hub)', () => {
  it('empty state suggests a bot that fits the rating and links to /play', async () => {
    const user = userEvent.setup();
    renderAt(paths.analysis(), fakeServices());
    expect(await screen.findByRole('heading', { level: 1, name: 'Analyse' })).toBeInTheDocument();
    const bot = recommendBot(null, BOT_ROSTER);
    expect(await screen.findByText(new RegExp(`Spiel eine Partie gegen ${bot.name} \\(${bot.elo}\\)`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PGN importieren' })).toHaveAttribute('href', '/analysis/import');
    expect(screen.getByRole('link', { name: 'Analysebrett' })).toHaveAttribute('href', '/analysis/board');
    await user.click(screen.getByRole('link', { name: 'Partie starten' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/play');
  });

  it('lists imported and finished bot games with date, opponent, result and accuracy once analysed', async () => {
    const data = createMemoryDataServices();
    const services = fakeServices(data);
    const id = await importFixture(data);
    const parsed = parsePgnWithDiagnostics('1. e4 e5 *');
    if (!parsed.ok) throw new Error('pgn');
    const bot = BOT_ROSTER[0]!;
    const base = importedGameRecord(parsed.games[0]!, '2026-10-17T10:00:00.000Z');
    await data.progress.createGame({ ...base, source: 'bot', externalId: null, botId: bot.id, userColor: 'w', assistance: 'coach', status: 'active' });
    const finished = await data.progress.createGame({
      ...base,
      source: 'bot',
      externalId: null,
      botId: bot.id,
      userColor: 'w',
      assistance: 'competition',
      result: '1-0',
      headers: { BlackElo: String(bot.elo) },
    });
    const analysis = await services.analysis.analyseGame({ gameId: id, startFen: FIXTURE_GAME.startFen, moves: FIXTURE_GAME.moves });
    await data.progress.saveAnalysis(analysis);
    renderAt(paths.analysis(), services);
    const list = await screen.findByTestId('analysis-games');
    const cards = within(list).getAllByRole('link');
    expect(cards).toHaveLength(2);
    const imported = cards.find((c) => c.getAttribute('data-game-id') === id)!;
    expect(imported).toHaveTextContent('Testspieler – Testbot');
    expect(imported).toHaveTextContent('16.10.2026');
    await waitFor(() => expect(within(imported).getByTestId('game-accuracy')).toHaveTextContent(/Genauigkeit .*% \(Weiß\)/));
    expect(within(imported).getByText('1 Patzer')).toBeInTheDocument();
    const botCard = cards.find((c) => c.getAttribute('data-game-id') === finished.id)!;
    expect(botCard).toHaveTextContent(`gegen ${bot.name} (${bot.elo})`);
    expect(within(botCard).getByTestId('game-result')).toHaveTextContent('Gewonnen');
    expect(within(botCard).getByTestId('game-accuracy')).toHaveTextContent('Noch nicht analysiert');
    expect(imported).toHaveAttribute('href', paths.analysisGame(id));
  });
});

describe('Partieanalyse', () => {
  it('analyses automatically and shows accuracy, counts, eval graph, key moments and the best move', async () => {
    const data = createMemoryDataServices();
    const analysis = new CountingAnalysis({
      engineId: 'fake-analysis',
      engineVersion: currentEngineVersion('fake-analysis'),
      moves: FIXTURE_GAME_ANALYSIS_SCRIPT,
      delayPerMoveMs: 2,
    });
    const services = fakeServices(data, analysis);
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), services);
    const progress = await screen.findByTestId('analysis-progress');
    expect(within(progress).getByText(/Analysiere Zug \d+ von 80/)).toBeInTheDocument();
    expect(within(progress).getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    const summary = await screen.findByTestId('review-summary', {}, { timeout: 15_000 });
    expect(screen.queryByTestId('analysis-progress')).toBeNull();
    expect(within(summary).getByTestId('accuracy-w')).toHaveTextContent(/\d+,\d\s%/);
    expect(within(summary).getByTestId('accuracy-b')).toHaveTextContent('100,0');
    expect(within(summary).getByTestId('count-blunder-w')).toHaveTextContent('1');
    expect(within(summary).getByTestId('count-best-b')).toHaveTextContent('40');
    const graph = within(summary).getByRole('slider', { name: /Bewertungsverlauf/ });
    expect(graph).toHaveAttribute('aria-valuemax', '80');
    expect(within(summary).getByRole('table', { name: /Gewinnchance von Weiß/ })).toBeInTheDocument();
    expect(within(summary).getByTestId('key-moments')).toHaveTextContent('14. Dc2');
    expect(await data.repos.gameAnalyses.get(id)).not.toBeNull();
    // Start position: best move of the first position.
    expect(screen.getByTestId('move-detail')).toHaveTextContent('Bester Zug in dieser Stellung: e4');
    // Keyboard: → / End / Home and the graph slider.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByTestId('move-detail')).toHaveAttribute('data-ply', '1'));
    expect(screen.getByTestId('move-detail')).toHaveTextContent('Das war der beste Zug.');
    expect(screen.getByTestId('board').querySelector('[data-annotation="e4"] [data-classification="best"]')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'End' });
    await waitFor(() => expect(screen.getByTestId('move-detail')).toHaveAttribute('data-ply', '80'));
    fireEvent.keyDown(window, { key: 'Home' });
    await waitFor(() => expect(screen.getByTestId('move-detail')).toHaveAttribute('data-ply', '0'));
    fireEvent.keyDown(graph, { key: 'End' });
    await waitFor(() => expect(boardFen()).toBe(FIXTURE_GAME.finalFen));
    // ↓ / ↑ jump between key moments.
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByTestId('move-detail')).toHaveAttribute('data-ply', '27'));
    expect(analysis.calls).toBe(1);
  });

  it('marks the blunder on the board and in the move list; explanation, better move and line after the reveal; thumbs are stored', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), fakeServices(data));
    await openBlunder(user);
    const detail = screen.getByTestId('move-detail');
    expect(detail).toHaveAttribute('data-classification', 'blunder');
    expect(screen.getByTestId('board').querySelector('[data-annotation="c2"] [data-classification="blunder"]')).not.toBeNull();
    // The better move is not shown before the reveal.
    expect(within(detail).getByTestId('explanation-teaser')).toHaveTextContent('Dc2');
    expect(detail).not.toHaveTextContent('Txf2');
    expect(screen.getByTestId('board').querySelector('[data-arrow="f1-f2"]')).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Besseren Zug zeigen' }));
    const revealed = screen.getByTestId('move-detail');
    expect(within(revealed).getByTestId('explanation')).toHaveAttribute('data-source', 'rule');
    expect(within(revealed).getAllByTestId('best-move')[0]).toHaveTextContent('Besser war: Txf2');
    expect(screen.getByTestId('board').querySelector('[data-arrow="f1-f2"][data-arrow-kind="best"]')).not.toBeNull();
    await user.click(within(revealed).getByRole('button', { name: 'Ja, hilfreich' }));
    await waitFor(async () => expect((await data.repos.explanationFeedback.get('analysis', `${id}:27`))?.vote).toBe(1));
    expect(within(revealed).getByRole('button', { name: 'Ja, hilfreich' })).toHaveAttribute('aria-pressed', 'true');
    // Move list: badge in the list.
    await user.click(screen.getByRole('tab', { name: 'Züge' }));
    const listMove = document.querySelector('[data-ply="27"]') as HTMLElement;
    expect(listMove.querySelector('[data-classification="blunder"]')).not.toBeNull();
  });

  it('"Nochmal versuchen" – success path with the engine move', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), fakeServices(data));
    await openBlunder(user);
    await user.click(within(screen.getByTestId('move-detail')).getByRole('button', { name: 'Nochmal versuchen' }));
    expect(boardFen()).toBe(FIXTURE_GAME.blunder.fenBefore);
    expect(screen.getByTestId('retry-task')).toHaveTextContent('Weiß am Zug. Finde einen besseren Zug.');
    await user.click(screen.getByRole('button', { name: 'Hinweis' }));
    expect(screen.getByTestId('retry-hint')).toHaveTextContent('Schau dir den Turm auf f1 an.');
    await user.click(screen.getByRole('button', { name: 'Noch ein Hinweis' }));
    expect(screen.getAllByTestId('retry-hint')[1]).toHaveTextContent('Er will nach f2.');
    await clickMove('f1', 'f2');
    expect(await screen.findByTestId('retry-result')).toHaveTextContent('Genau! Das war der bessere Zug.');
    expect(screen.getByTestId('retry-panel')).toHaveAttribute('data-phase', 'success');
    await user.click(screen.getByRole('button', { name: 'Zurück zur Partie' }));
    // After the retry the full explanation is shown at this move.
    expect(within(screen.getByTestId('move-detail')).getByTestId('explanation')).toBeInTheDocument();
  });

  it('"Nochmal versuchen" – reveal path after three wrong tries, and an assessed alternative succeeds', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), fakeServices(data));
    await openBlunder(user);
    await user.click(within(screen.getByTestId('move-detail')).getByRole('button', { name: 'Nochmal versuchen' }));
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(screen.getByTestId('retry-panel')).toHaveAttribute('data-phase', 'thinking'), { timeout: 2_000 });
      await clickMove('d1', 'c2');
      await waitFor(() => expect(screen.getByTestId('retry-panel')).not.toHaveAttribute('data-phase', 'thinking'));
    }
    await waitFor(() => expect(screen.getByTestId('retry-panel')).toHaveAttribute('data-phase', 'revealed'), { timeout: 2_000 });
    expect(screen.getByTestId('retry-result')).toHaveTextContent('Der bessere Zug war: Txf2');
    expect(boardFen()).toBe(FIXTURE_GAME.blunder.fenBefore);
    expect(screen.getByTestId('board').querySelector('[data-arrow="f1-f2"]')).not.toBeNull();

    // A second retry: another move with a small loss (fake assessment: 0) counts as found.
    await user.click(screen.getByRole('button', { name: 'Zurück zur Partie' }));
    await user.click(screen.getByRole('button', { name: 'Zum Anfang' }));
    await openBlunder(user);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.queryByTestId('retry-panel')).toBeNull(); // already revealed → no retry via Enter
  });

  it('a different move assessed with a loss ≤ 0.02 succeeds', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), fakeServices(data));
    await openBlunder(user);
    fireEvent.keyDown(window, { key: 'Enter' });
    await screen.findByTestId('retry-panel');
    await clickMove('b4', 'b5');
    expect(await screen.findByTestId('retry-result')).toHaveTextContent('Gut gefunden! Auch dieser Zug ist stark.');
    expect(screen.getByTestId('retry-panel')).toHaveTextContent('Die Engine spielt: Txf2');
  });

  it('"Variante erkunden" opens the analysis board at the current position', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    renderAt(paths.analysisGame(id), fakeServices(data));
    await openBlunder(user);
    await user.click(within(screen.getByTestId('move-detail')).getByRole('button', { name: 'Variante erkunden' }));
    const fenAfter = FIXTURE_GAME_AFTER_BLUNDER();
    expect(screen.getByTestId('location')).toHaveTextContent(paths.analysisBoard({ fen: fenAfter }));
  });

  it('deep link after reload: a remount on the same data reuses the stored analysis', async () => {
    const data = createMemoryDataServices();
    const analysis = new CountingAnalysis({ engineId: 'fake-analysis', engineVersion: currentEngineVersion('fake-analysis'), moves: FIXTURE_GAME_ANALYSIS_SCRIPT });
    const id = await importFixture(data);
    const first = renderAt(paths.analysisGame(id), fakeServices(data, analysis));
    await screen.findByTestId('review-summary');
    first.unmount();
    renderAt(paths.analysisGame(id), fakeServices(data, analysis));
    await screen.findByTestId('review-summary');
    expect(screen.queryByTestId('analysis-progress')).toBeNull();
    expect(analysis.calls).toBe(1);
    const stored = await data.repos.gameAnalyses.get(id);
    const blunder = stored!.moves[FIXTURE_GAME.blunder.ply - 1]!;
    expect(typeof blunder.explanation?.plain).toBe('string');
    expect(blunder.explanation?.segments.length).toBeGreaterThan(0);
  });

  it('shows "nicht gefunden" for an unknown game', async () => {
    renderAt(paths.analysisGame('unknown'), fakeServices());
    expect(await screen.findByRole('heading', { level: 1, name: 'Partie nicht gefunden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Analyse-Übersicht' })).toHaveAttribute('href', '/analysis');
  });

  it('cancel stops the analysis and offers a restart', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const id = await importFixture(data);
    const analysis = new CountingAnalysis({ engineId: 'fake-analysis', engineVersion: currentEngineVersion('fake-analysis'), delayPerMoveMs: 30 });
    renderAt(paths.analysisGame(id), fakeServices(data, analysis));
    const progress = await screen.findByTestId('analysis-progress');
    await user.click(within(progress).getByRole('button', { name: 'Abbrechen' }));
    expect(await screen.findByText('Analyse abgebrochen.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Analyse starten' }));
    expect(await screen.findByTestId('analysis-progress')).toBeInTheDocument();
    expect(analysis.calls).toBe(2);
  });
});

function FIXTURE_GAME_AFTER_BLUNDER(): string {
  // Position after 14.Qc2 (ply 27).
  const parsed = parsePgnWithDiagnostics(FIXTURE_GAME.pgn);
  if (!parsed.ok) throw new Error('pgn');
  return parsed.games[0]!.moves[FIXTURE_GAME.blunder.ply - 1]!.fenAfter;
}
