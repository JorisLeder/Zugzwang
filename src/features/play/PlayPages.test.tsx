import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { paths } from '@/app/paths';
import { ServicesProvider, useSettingsStore } from '@/app/services';
import { BOT_ROSTER } from '@/bots';
import type { BotEngine, BotMove, BotMoveRequest } from '@/core/bots';
import { START_FEN, type Uci } from '@/core/chess';
import type { AssistanceLevel } from '@/core/games';
import { DEFAULT_SETTINGS } from '@/core/profile';
import type { AppServices } from '@/core/services';
import { createFakeAppServices, createMemoryDataServices, FakeAnalysisService, FIXTURE_BOTS, moveKey, type MemoryDataServices } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { Component as GamePage } from './pages/GamePage';
import { Component as PlayFromPositionPage } from './pages/PlayFromPositionPage';
import { Component as PlayHubPage } from './pages/PlayHubPage';
import { startBotGame } from './startGame';

class ScriptedBot implements BotEngine {
  constructor(private readonly script: Record<number, Uci> = {}) {}
  async chooseMove(req: BotMoveRequest): Promise<BotMove> {
    const uci = this.script[req.moves.length] ?? ChessGame.fromMoves(req.startFen, req.moves).legalMoves()[0]!.uci;
    return { uci, source: 'engine', thinkTimeMs: 0, computeMs: 1 };
  }
  async shouldClaimDraw(): Promise<boolean> {
    return false;
  }
}

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{`${loc.pathname}${loc.search}`}</p>;
}

function renderAt(url: string, services: AppServices) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/play" element={<PlayHubPage />} />
          <Route path="/play/position" element={<PlayFromPositionPage />} />
          <Route path="/play/game/:gameId" element={<GamePage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

function fakeServices(o: { data?: MemoryDataServices; bot?: BotEngine; analysis?: FakeAnalysisService; roster?: typeof BOT_ROSTER } = {}) {
  return createFakeAppServices({
    data: o.data ?? createMemoryDataServices({ deviceId: 'device-a' }),
    bots: o.bot ?? new ScriptedBot(),
    botRoster: o.roster ?? BOT_ROSTER,
    ...(o.analysis ? { analysis: o.analysis } : {}),
  });
}

function boardFen(): string {
  return screen.getByTestId('board').getAttribute('data-fen')!;
}

async function clickMove(from: string, to: string) {
  const sq = (s: string) => document.querySelector(`[data-testid="board"] [data-square="${s}"]`) as HTMLElement;
  fireEvent.click(sq(from));
  fireEvent.click(sq(to));
  await act(async () => {});
}

async function newGame(services: AppServices, assistance: AssistanceLevel, color: 'w' | 'b' = 'w', startFen = START_FEN) {
  return startBotGame(services, { bot: services.botRoster[0]!, color, assistance, startFen, origin: { type: 'new' } });
}

afterEach(() => useSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS }));

describe('Spielen (hub)', () => {
  it('lists ≥ 10 bots grouped by strength with the recommended bot, and starts a game from the setup dialog', async () => {
    const user = userEvent.setup();
    const services = fakeServices();
    await services.data.progress.initializeFromSelfAssessment('beginner'); // bot rating 400 → Emil
    renderAt(paths.play(), services);
    expect(screen.getByRole('heading', { level: 1, name: 'Spielen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zum Einstieg (bis 800)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mittel (800–1600)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stark (ab 1600)' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-bot-id]')).toHaveLength(14);
    await waitFor(() => expect(within(document.querySelector('[data-bot-id="emil"]')!).getByText('Passt zu dir')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^Theo, 1000 Elo/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Partie gegen Theo' });
    // Coach preselected (no previous game); rated line follows the level.
    expect(within(dialog).getByText('Zählt fürs Bot-Rating: nein')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Wettkampf' }));
    expect(within(dialog).getByText('Keine Hilfen. Zählt für dein Bot-Rating.')).toBeInTheDocument();
    expect(within(dialog).getByText('Zählt fürs Bot-Rating: ja')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Bedenkzeit/)).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'Schwarz' }));
    await user.click(within(dialog).getByRole('button', { name: 'Partie starten' }));

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Partie gegen Theo' })).toBeInTheDocument());
    const [game] = await services.data.repos.games.list({ source: 'bot' });
    expect(game).toMatchObject({ botId: 'theo', userColor: 'b', assistance: 'competition', status: 'active', headers: { WhiteElo: '1000', Black: 'Du' } });
  });

  it('shows running games as "Partie fortsetzen"', async () => {
    const services = fakeServices();
    const game = await newGame(services, 'training');
    renderAt(paths.play(), services);
    const link = await screen.findByRole('link', { name: /Weiterspielen: Partie gegen Pip/ });
    expect(link).toHaveAttribute('href', paths.playGame(game.id));
  });
});

describe('Partie (game screen)', () => {
  it('plays a move, the bot answers, and a remount resumes at the same move (D-50)', async () => {
    const data = createMemoryDataServices({ deviceId: 'device-a' });
    const services = fakeServices({ data, bot: new ScriptedBot({ 1: 'e7e5' }) });
    const game = await newGame(services, 'competition');
    const view = renderAt(paths.playGame(game.id), services);
    await screen.findByTestId('board');
    expect(screen.getByTestId('game-status')).toHaveTextContent('Du bist am Zug.');
    await clickMove('e2', 'e4');
    await waitFor(() => expect(boardFen()).toBe(ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']).fen()));
    // Wettkampf: no takeback/hint, but "Aufgeben".
    expect(screen.queryByRole('button', { name: 'Zurücknehmen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aufgeben' })).toBeInTheDocument();
    view.unmount();

    renderAt(paths.playGame(game.id), services);
    await screen.findByTestId('board');
    await waitFor(() => expect(boardFen()).toBe(ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']).fen()));
    expect(screen.getByTestId('game-status')).toHaveTextContent('Du bist am Zug.');
  });

  it('resign with confirmation shows the result with the German reason and actions', async () => {
    const user = userEvent.setup();
    const services = fakeServices();
    const game = await newGame(services, 'competition');
    renderAt(paths.playGame(game.id), services);
    await screen.findByTestId('board');
    await user.click(screen.getByRole('button', { name: 'Aufgeben' }));
    const confirm = await screen.findByRole('dialog', { name: 'Partie wirklich aufgeben?' });
    await user.click(within(confirm).getByRole('button', { name: 'Aufgeben' }));
    const result = await screen.findByRole('dialog', { name: 'Verloren' });
    expect(within(result).getByText('Du hast aufgegeben.')).toBeInTheDocument();
    expect(within(result).getByText(/^Bot-Rating/)).toBeInTheDocument();
    expect(within(result).getByRole('button', { name: 'Analyse ansehen' })).toBeInTheDocument();
    expect(within(result).getByRole('button', { name: 'Revanche' })).toBeInTheDocument();
    await user.click(within(result).getByRole('button', { name: 'Analyse ansehen' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(paths.analysisGame(game.id)));
  });

  it('Training: eval bar, takeback and hints in the action bar; takeback restores the position', async () => {
    const user = userEvent.setup();
    const services = fakeServices({ bot: new ScriptedBot({ 1: 'e7e5' }) });
    const game = await newGame(services, 'training');
    renderAt(paths.playGame(game.id), services);
    await screen.findByTestId('board');
    expect(screen.getAllByTestId('eval-bar').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Coach' })).toHaveAttribute('aria-selected', 'true');
    await clickMove('e2', 'e4');
    await waitFor(() => expect(boardFen()).toBe(ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']).fen()));
    await user.click(screen.getByRole('button', { name: 'Zurücknehmen' }));
    await waitFor(() => expect(boardFen()).toBe(START_FEN));
    await user.click(screen.getByRole('button', { name: 'Hinweis' }));
    await waitFor(() => expect(screen.getByTestId('hint-text')).toHaveTextContent(/^Schau dir dein/));
    await user.click(screen.getByRole('button', { name: 'Noch ein Hinweis' }));
    await waitFor(() => expect(screen.getByTestId('hint-text')).toHaveTextContent(/^Der beste Zug ist/));
    expect(document.querySelector('[data-arrow]')).not.toBeNull();
  });

  it('Coach: warning bubble before a losing move with "Nochmal überlegen" / "Trotzdem ziehen"', async () => {
    const user = userEvent.setup();
    const fenBefore = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5']).fen();
    const analysis = new FakeAnalysisService({
      assessments: { [moveKey(fenBefore, 'd1h5')]: { expectedPointsLoss: 0.3, classification: 'blunder', bestMove: 'g1f3', playedLine: ['d1h5', 'g8f6'] } },
    });
    const services = fakeServices({ bot: new ScriptedBot({ 1: 'e7e5' }), analysis });
    const game = await newGame(services, 'coach');
    renderAt(paths.playGame(game.id), services);
    await screen.findByTestId('board');
    await clickMove('e2', 'e4');
    await waitFor(() => expect(boardFen()).toBe(fenBefore));
    await clickMove('d1', 'h5');
    const warning = await screen.findByTestId('coach-warning');
    expect(warning).toHaveTextContent(/^Bist du sicher\?/);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nochmal überlegen' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Nochmal überlegen' }));
    await waitFor(() => expect(screen.queryByTestId('coach-warning')).toBeNull());
    expect(boardFen()).toBe(fenBefore);
    await clickMove('d1', 'h5');
    await screen.findByTestId('coach-warning');
    await user.click(screen.getByRole('button', { name: 'Trotzdem ziehen' }));
    await waitFor(() => expect(boardFen()).not.toBe(fenBefore));
    expect(screen.queryByTestId('coach-warning')).toBeNull();
  });

  it('two pages on the same data: the second asks to take over, the first becomes read-only', async () => {
    const user = userEvent.setup();
    const shared = createMemoryDataServices({ deviceId: 'device-a' });
    const servicesA = fakeServices({ data: shared });
    const game = await newGame(servicesA, 'training');
    const a = renderAt(paths.playGame(game.id), servicesA);
    await screen.findByTestId('board');
    a.unmount(); // page A stays "active" (fresh heartbeat) – simulate the second device with a new render
    const servicesB = fakeServices({ data: { ...shared, deviceId: 'device-b' } as MemoryDataServices });
    renderAt(paths.playGame(game.id), servicesB);
    const dialog = await screen.findByRole('dialog', { name: 'Partie läuft auf einem anderen Gerät – hier übernehmen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Hier übernehmen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await shared.repos.games.get(game.id))!.activeDeviceId).toBe('device-b');
    expect(screen.getByRole('button', { name: 'Zurücknehmen' })).toBeInTheDocument();
  });

  it('an unknown game id shows "Partie nicht gefunden"', async () => {
    renderAt(paths.playGame('nope'), fakeServices());
    expect(await screen.findByRole('heading', { level: 1, name: 'Partie nicht gefunden' })).toBeInTheDocument();
  });
});

describe('Aus Stellung spielen (criterion 8)', () => {
  it('shows a German error for an invalid FEN', async () => {
    renderAt(paths.playFromPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1'), fakeServices());
    expect(await screen.findByTestId('fen-error')).toHaveTextContent(/^Diese Stellung geht nicht: /);
    expect(screen.queryByRole('button', { name: 'Partie starten' })).toBeNull();
  });

  it('validates typed input and starts an unrated game from a valid position', async () => {
    const user = userEvent.setup();
    const services = fakeServices();
    renderAt(paths.playFromPosition(''), services);
    const input = screen.getByLabelText('FEN der Stellung');
    await user.type(input, 'kaputt');
    await user.click(screen.getByRole('button', { name: 'Stellung laden' }));
    expect(await screen.findByTestId('fen-error')).toHaveTextContent(/^Diese Stellung geht nicht/);
    await user.clear(input);
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1';
    fireEvent.change(input, { target: { value: fen } });
    await user.click(screen.getByRole('button', { name: 'Stellung laden' }));
    await screen.findByText('Schwarz ist am Zug.');
    expect(screen.queryByRole('radio', { name: 'Wettkampf' })).toBeNull();
    expect(screen.getByText('Partien aus einer eigenen Stellung zählen nicht fürs Bot-Rating.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Partie starten' }));
    await waitFor(() => expect(screen.getByTestId('board')).toBeInTheDocument());
    const [game] = await services.data.repos.games.list({ source: 'bot' });
    expect(game).toMatchObject({ startFen: fen, origin: { type: 'fen' }, userColor: 'b', assistance: 'coach' });
  });
});

describe('fixture roster', () => {
  it('works with the small fixture roster too', async () => {
    renderAt(paths.play(), fakeServices({ roster: FIXTURE_BOTS }));
    expect(document.querySelectorAll('[data-bot-id]')).toHaveLength(FIXTURE_BOTS.length);
  });
});
