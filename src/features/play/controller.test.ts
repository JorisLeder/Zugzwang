/**
 * GameController against the in-memory data layer and fakes (wave-1 rule D-50: "after reload" = a second controller on
 * the same `createMemoryDataServices()` instance; two devices = two controllers with different `deviceId`s).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoveAssessment, ThreatInfo } from '@/core/analysis';
import type { BotEngine, BotMove, BotMoveRequest } from '@/core/bots';
import { START_FEN, type Fen, type Uci } from '@/core/chess';
import type { AssistanceLevel } from '@/core/games';
import { movesFromEvents } from '@/core/games';
import { createFakeAppServices, createMemoryDataServices, FakeAnalysisService, FIXTURE_BOTS, moveKey, type MemoryDataServices } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { GameController } from './controller';
import type { ColorChoice } from './logic';
import { startBotGame } from './startGame';

/** Bot that plays scripted moves by ply (fallback: first legal move). */
class ScriptedBot implements BotEngine {
  readonly requests: BotMoveRequest[] = [];
  constructor(
    private readonly script: Record<number, Uci> = {},
    private readonly claims = false,
    private readonly thinkTimeMs = 0,
  ) {}
  async chooseMove(req: BotMoveRequest): Promise<BotMove> {
    this.requests.push(req);
    const game = ChessGame.fromMoves(req.startFen, req.moves);
    const uci = this.script[req.moves.length] ?? game.legalMoves()[0]!.uci;
    return { uci, source: 'engine', thinkTimeMs: this.thinkTimeMs, computeMs: 1 };
  }
  async shouldClaimDraw(): Promise<boolean> {
    return this.claims;
  }
}

const controllers: GameController[] = [];
afterEach(() => {
  for (const c of controllers.splice(0)) c.dispose();
});

interface SetupOptions {
  assistance?: AssistanceLevel;
  color?: ColorChoice;
  startFen?: Fen;
  bot?: BotEngine;
  analysis?: FakeAnalysisService;
  data?: MemoryDataServices;
  moveConfirmation?: boolean;
  coachHoldMs?: number;
}

async function setup(o: SetupOptions = {}) {
  const data = o.data ?? createMemoryDataServices({ deviceId: 'device-a' });
  await data.progress.initializeFromSelfAssessment('beginner');
  const services = createFakeAppServices({ data, bots: o.bot ?? new ScriptedBot(), ...(o.analysis ? { analysis: o.analysis } : {}) });
  const bot = FIXTURE_BOTS.find((b) => b.id === 'fixture-bot-easy')!;
  const game = await startBotGame(services, {
    bot,
    color: o.color ?? 'w',
    assistance: o.assistance ?? 'competition',
    startFen: o.startFen ?? START_FEN,
    origin: o.startFen ? { type: 'fen' } : { type: 'new' },
  });
  const c = open(services, game.id, o);
  await c.load();
  return { c, data, services, game };
}

function open(services: ReturnType<typeof createFakeAppServices>, gameId: string, o: SetupOptions = {}): GameController {
  const c = new GameController({
    services,
    gameId,
    moveConfirmation: () => o.moveConfirmation ?? false,
    heartbeatMs: 1_000_000,
    ...(o.coachHoldMs ? { coachHoldMs: o.coachHoldMs } : {}),
  });
  controllers.push(c);
  return c;
}

/** Plays a user move through the board protocol (attempt → commit). */
async function play(c: GameController, uci: Uci): Promise<boolean> {
  const fen = c.get().fen;
  const rec = ChessGame.fromFen(fen).move(uci);
  if (!rec) throw new Error(`illegal test move ${uci}`);
  const ok = await c.attemptMove({ from: rec.from, to: rec.to, ...(rec.promotion ? { promotion: rec.promotion } : {}) });
  if (ok) c.commitMove(rec);
  return ok;
}

/** Waits until it is the user's turn again (bot answered) or the game is over. */
async function userTurn(c: GameController): Promise<void> {
  await vi.waitFor(() => {
    const v = c.get();
    expect(v.botThinking).toBe(false);
    expect(v.phase === 'finished' || v.ownClaim !== null || v.status.turn === v.userColor).toBe(true);
  });
}

async function storedMoves(data: MemoryDataServices, gameId: string): Promise<Uci[]> {
  return movesFromEvents(await data.repos.gameMoves.list(gameId));
}

describe('playing and persistence (P0-09)', () => {
  it('stores every move as an event and the bot replies', async () => {
    const { c, data, game } = await setup();
    expect(c.get().phase).toBe('active');
    expect(await play(c, 'e2e4')).toBe(true);
    await userTurn(c);
    await c.flush();
    expect(c.get().history).toHaveLength(2);
    const events = await data.repos.gameMoves.list(game.id);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[0]).toMatchObject({ kind: 'move', uci: 'e2e4', san: 'e4', ply: 1 });
    expect(events[0]!.fenAfter).toContain('4P3');
  });

  it('a remount on the same data resumes at the same move (replay from the start FEN)', async () => {
    const { c, data, services, game } = await setup();
    await play(c, 'e2e4');
    await userTurn(c);
    await play(c, 'g1f3');
    await userTurn(c);
    await c.flush();
    const fen = c.get().fen;
    c.dispose();
    const again = open(services, game.id);
    await again.load();
    expect(again.get().fen).toBe(fen);
    expect(again.get().history.map((m) => m.uci)).toEqual(await storedMoves(data, game.id));
    expect(again.get().status.turn).toBe('w');
  });

  it('the bot moves first when the user plays Black, also after a reload before its reply', async () => {
    const bot = new ScriptedBot({ 0: 'd2d4', 2: 'c2c4' });
    const { c, data, services, game } = await setup({ color: 'b', bot });
    await userTurn(c);
    expect(c.get().history.map((m) => m.uci)).toEqual(['d2d4']);
    // The user's move is stored, the page is closed before the bot answered → the bot answers after the reload.
    const rec = ChessGame.fromFen(c.get().fen).move('d7d5')!;
    c.dispose();
    await data.progress.appendGameEvent({ gameId: game.id, seq: 2, kind: 'move', ply: 2, uci: rec.uci, san: rec.san, fenAfter: rec.fenAfter });
    const again = open(services, game.id, { bot } as SetupOptions);
    await again.load();
    await userTurn(again);
    expect(again.get().history.map((m) => m.uci)).toEqual(['d2d4', 'd7d5', 'c2c4']);
  });

  it('writes the PGN headers with the bot’s Elo on its side (CONVENTIONS §15)', async () => {
    const { game } = await setup({ color: 'b' });
    expect(game.headers).toMatchObject({ White: 'Testbot Leicht', Black: 'Du', WhiteElo: '400' });
    expect(game.headers.BlackElo).toBeUndefined();
    expect(game.timeControl).toEqual({ kind: 'none' });
    expect(game.source).toBe('bot');
  });
});

describe('assistance levels (P0-08)', () => {
  it('Wettkampf: no takeback, no hints, no eval; the finished game updates the bot rating', async () => {
    // Fool's mate: the bot (White) plays f3 and g4, the user mates with Qh4#.
    const bot = new ScriptedBot({ 0: 'f2f3', 2: 'g2g4' });
    const { c, data } = await setup({ color: 'b', bot });
    await userTurn(c);
    expect(c.canTakeback()).toBe(false);
    await c.requestHint();
    expect(c.get().hint.stage).toBe(0);
    await play(c, 'e7e5');
    await userTurn(c);
    await play(c, 'd8h4');
    await vi.waitFor(() => expect(c.get().phase).toBe('finished'));
    const v = c.get();
    expect(v.outcome).toMatchObject({ result: '0-1', reason: 'checkmate' });
    expect(v.outcome!.rating).not.toBeNull();
    expect(v.outcome!.ratingAfter!).toBeGreaterThan(v.outcome!.ratingBefore!);
    expect(v.evaluation).toBeNull();
    const stored = await data.repos.games.get(v.game!.id);
    expect(stored).toMatchObject({ status: 'finished', result: '0-1', endReason: 'checkmate' });
    expect(stored!.pgn).toContain('Qh4#');
    expect(stored!.pgn).toContain('[Result "0-1"]');
  });

  it('Training: unlimited takebacks (own move + bot reply) stored as takeback events; not rated', async () => {
    const { c, data, game } = await setup({ assistance: 'training' });
    await play(c, 'e2e4');
    await userTurn(c);
    await play(c, 'd2d4');
    await userTurn(c);
    expect(c.canTakeback()).toBe(true);
    c.takeback();
    await userTurn(c);
    expect(c.get().history).toHaveLength(2);
    c.takeback();
    await userTurn(c);
    expect(c.get().history).toHaveLength(0);
    expect(c.canTakeback()).toBe(false);
    await c.flush();
    const events = await data.repos.gameMoves.list(game.id);
    expect(events.filter((e) => e.kind === 'takeback').map((e) => e.plies)).toEqual([2, 2]);
    expect(await storedMoves(data, game.id)).toEqual([]);
    c.resign();
    await vi.waitFor(() => expect(c.get().phase).toBe('finished'));
    expect(c.get().outcome!.rating).toBeNull();
  });

  it('Training: takeback while the bot is thinking takes back only the user’s move', async () => {
    const { c, data, game } = await setup({ assistance: 'training', bot: new ScriptedBot({}, false, 2000) });
    await play(c, 'e2e4');
    await vi.waitFor(() => expect(c.get().botThinking).toBe(true));
    c.takeback();
    expect(c.get().botThinking).toBe(false);
    expect(c.get().history).toHaveLength(0);
    await c.flush();
    expect((await data.repos.gameMoves.list(game.id)).at(-1)).toMatchObject({ kind: 'takeback', plies: 1, ply: 0 });
  });

  it('Training: hint stage 1 marks the piece, stage 2 shows the best-move arrow (D-36); eval bar value', async () => {
    const { c } = await setup({ assistance: 'training' });
    await vi.waitFor(() => expect(c.get().evaluation).not.toBeNull());
    await c.requestHint();
    expect(c.get().hint).toMatchObject({ stage: 1, loading: false });
    expect(c.arrows()).toEqual([]);
    await c.requestHint();
    expect(c.get().hint.stage).toBe(2);
    const move = c.get().hint.move!;
    expect(c.arrows()).toEqual([{ from: move.slice(0, 2), to: move.slice(2, 4), kind: 'best' }]);
    await play(c, 'e2e4');
    expect(c.get().hint.stage).toBe(0);
  });

  it('Coach: a move losing ≥ 0.20 is held with a German warning; "Nochmal überlegen" keeps the piece', async () => {
    const assessment: Partial<MoveAssessment> = { expectedPointsLoss: 0.45, classification: 'blunder', bestMove: 'g1f3', playedLine: ['d1h5', 'g7g6'] };
    const analysis = new FakeAnalysisService({ assessments: { [moveKey(START_FEN, 'f2f3')]: assessment } });
    const { c, data, game } = await setup({ assistance: 'coach', analysis });
    expect(analysis.prepared[0]).toBe(START_FEN);
    const attempt = c.attemptMove({ from: 'f2', to: 'f3' });
    await vi.waitFor(() => expect(c.get().warning).not.toBeNull());
    const w = c.get().warning!;
    expect(w.uci).toBe('f2f3');
    expect(w.explanation.plain.length).toBeGreaterThan(0);
    c.answerWarning(false);
    expect(await attempt).toBe(false);
    expect(c.get().warning).toBeNull();
    expect(c.get().history).toHaveLength(0);
    // "Trotzdem ziehen" plays the move (the board commits it after `true`).
    const second = c.attemptMove({ from: 'f2', to: 'f3' });
    await vi.waitFor(() => expect(c.get().warning).not.toBeNull());
    c.answerWarning(true);
    expect(await second).toBe(true);
    c.commitMove(ChessGame.fromFen(START_FEN).move('f2f3')!);
    await userTurn(c);
    await c.flush();
    expect((await data.repos.gameMoves.list(game.id))[0]).toMatchObject({ uci: 'f2f3' });
  });

  it('Coach: no warning for good moves; praise for the best move (at most once every 3 own moves)', async () => {
    const analysis = new FakeAnalysisService(); // every move is "best" with loss 0
    const { c } = await setup({ assistance: 'coach', analysis });
    expect(await play(c, 'e2e4')).toBe(true);
    expect(c.get().warning).toBeNull();
    expect(c.get().notes[0]).toMatchObject({ tone: 'praise', lead: 'Starker Zug!' });
    await userTurn(c);
    await play(c, 'd2d4');
    await userTurn(c);
    await play(c, 'g1f3');
    await userTurn(c);
    expect(c.get().notes.filter((n) => n.tone === 'praise')).toHaveLength(1);
    await play(c, 'f1c4');
    expect(c.get().notes.filter((n) => n.tone === 'praise')).toHaveLength(2);
  });

  it('Coach: the move is played without warning when the check takes longer than the hold time', async () => {
    const analysis = new FakeAnalysisService();
    analysis.assessMove = () => new Promise<MoveAssessment>(() => undefined); // never answers
    const { c } = await setup({ assistance: 'coach', analysis, coachHoldMs: 30 });
    const t0 = Date.now();
    expect(await play(c, 'e2e4')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(c.get().warning).toBeNull();
  });

  it('Coach: shows the opponent’s threat after the bot’s move (arrow + note)', async () => {
    const analysis = new FakeAnalysisService();
    const threat: ThreatInfo = {
      move: 'd8h4',
      san: 'Qh4',
      line: ['d8h4'],
      materialGain: 0,
      mateIn: 1,
      facts: { kind: 'threat', mover: 'w', fenBefore: START_FEN, bestLine: [], refutation: ['Qh4#'], motifs: [] },
    };
    analysis.findThreats = async () => threat;
    const { c } = await setup({ assistance: 'coach', analysis, bot: new ScriptedBot({ 1: 'e7e5' }) });
    await play(c, 'f2f3');
    await userTurn(c);
    await vi.waitFor(() => expect(c.get().threat).toEqual({ from: 'd8', to: 'h4' }));
    expect(c.get().notes[0]).toMatchObject({ tone: 'warning', lead: 'Achtung:' });
    expect(c.arrows()).toContainEqual({ from: 'd8', to: 'h4', kind: 'threat' });
  });

  it('move confirmation holds the move until the user confirms', async () => {
    const { c } = await setup({ moveConfirmation: true });
    const attempt = c.attemptMove({ from: 'e2', to: 'e4' });
    await vi.waitFor(() => expect(c.get().confirm).toEqual({ uci: 'e2e4', san: 'e4' }));
    c.answerConfirm(true);
    expect(await attempt).toBe(true);
    const second = c.attemptMove({ from: 'd2', to: 'd4' });
    await vi.waitFor(() => expect(c.get().confirm).not.toBeNull());
    c.answerConfirm(false);
    expect(await second).toBe(false);
  });
});

describe('game end per FIDE (D-04, criterion 6)', () => {
  const cycle = { 1: 'g8f6', 3: 'f6g8', 5: 'g8f6', 7: 'f6g8', 9: 'g8f6', 11: 'f6g8', 13: 'g8f6', 15: 'f6g8' } as Record<number, Uci>;

  it('threefold repetition is a claim, not automatic; the user claims on their turn', async () => {
    const { c, data, game } = await setup({ bot: new ScriptedBot(cycle) });
    for (const m of ['g1f3', 'f3g1', 'g1f3', 'f3g1']) {
      await play(c, m);
      await userTurn(c);
      if (c.get().ownClaim) c.declineClaim();
      await userTurn(c);
    }
    // Start position for the third time, White (the user) to move.
    const v = c.get();
    expect(v.phase).toBe('active');
    expect(v.status.isOver).toBe(false);
    expect(v.status.claimableDraws).toContain('threefold_repetition');
    c.claimDraw();
    await vi.waitFor(() => expect(c.get().phase).toBe('finished'));
    expect(c.get().outcome).toMatchObject({ result: '1/2-1/2', reason: 'threefold_repetition_claim', claimant: 'user' });
    expect((await data.repos.games.get(game.id))!.endReason).toBe('threefold_repetition_claim');
  });

  it('with the move that repeats the position the user may claim before the bot replies (RULES §5.2)', async () => {
    const bot = new ScriptedBot(cycle);
    const { c } = await setup({ bot });
    for (const m of ['g1f3', 'f3g1', 'g1f3', 'f3g1']) {
      await play(c, m);
      await userTurn(c);
      if (c.get().ownClaim) c.declineClaim();
      await userTurn(c);
    }
    await play(c, 'g1f3'); // position after 1.Nf3 for the third time
    expect(c.get().ownClaim).toEqual(['threefold_repetition']);
    const requests = bot.requests.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(bot.requests.length).toBe(requests); // the bot waits
    c.declineClaim();
    await userTurn(c);
    expect(c.get().history.length).toBe(10);
  });

  it('the bot claims on its turn when its evaluation is ≤ 0', async () => {
    const { c } = await setup({ bot: new ScriptedBot(cycle, true) });
    for (const m of ['g1f3', 'f3g1', 'g1f3', 'f3g1', 'g1f3']) {
      await play(c, m);
      await userTurn(c);
      if (c.get().ownClaim) c.declineClaim();
      await userTurn(c);
      if (c.get().phase === 'finished') break;
    }
    expect(c.get().outcome).toMatchObject({ result: '1/2-1/2', reason: 'threefold_repetition_claim', claimant: 'bot' });
  });

  it('fivefold repetition ends the game automatically', async () => {
    const { c } = await setup({ bot: new ScriptedBot(cycle) });
    for (const m of ['g1f3', 'f3g1', 'g1f3', 'f3g1', 'g1f3', 'f3g1', 'g1f3', 'f3g1']) {
      await play(c, m);
      await userTurn(c);
      if (c.get().ownClaim) c.declineClaim();
      await userTurn(c);
    }
    await vi.waitFor(() => expect(c.get().phase).toBe('finished'));
    expect(c.get().outcome).toMatchObject({ result: '1/2-1/2', reason: 'fivefold_repetition' });
  });

  it('50-move rule: claimable at clock 100 (not automatic); 75-move rule ends the game at 150', async () => {
    const fifty = await setup({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 99 80' });
    await play(fifty.c, 'h1h2');
    expect(fifty.c.get().ownClaim).toEqual(['fifty_moves']);
    expect(fifty.c.get().status.isOver).toBe(false);
    fifty.c.claimDraw();
    await vi.waitFor(() => expect(fifty.c.get().outcome).toMatchObject({ reason: 'fifty_moves_claim', result: '1/2-1/2' }));

    const seventyFive = await setup({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 149 100' });
    await play(seventyFive.c, 'h1h2');
    await vi.waitFor(() => expect(seventyFive.c.get().outcome).toMatchObject({ reason: 'seventyfive_moves', result: '1/2-1/2' }));
  });

  it('stalemate and insufficient material end the game as a draw', async () => {
    const stalemate = await setup({ startFen: 'k7/8/8/2Q5/8/8/8/1K6 w - - 0 1' });
    await play(stalemate.c, 'c5c7');
    await vi.waitFor(() => expect(stalemate.c.get().outcome).toMatchObject({ reason: 'stalemate', result: '1/2-1/2' }));
    const dead = await setup({ startFen: 'k7/8/8/8/8/8/1p6/K7 w - - 0 1' });
    await play(dead.c, 'a1b2');
    await vi.waitFor(() => expect(dead.c.get().outcome).toMatchObject({ reason: 'insufficient_material', result: '1/2-1/2' }));
  });

  it('resignation loses – unless the bot cannot mate any more (FIDE 5.1.2)', async () => {
    const lost = await setup({ color: 'b' });
    await userTurn(lost.c);
    lost.c.resign();
    await vi.waitFor(() => expect(lost.c.get().outcome).toMatchObject({ reason: 'resignation', result: '1-0' }));
    const draw = await setup({ startFen: 'k7/8/8/8/8/8/8/K6R w - - 0 1' });
    draw.c.resign();
    await vi.waitFor(() => expect(draw.c.get().outcome).toMatchObject({ reason: 'resignation', result: '1/2-1/2' }));
  });

  it('a finished game opens read-only with its stored result', async () => {
    const { c, services, game } = await setup({ color: 'b' });
    await userTurn(c);
    c.resign();
    await vi.waitFor(() => expect(c.get().phase).toBe('finished'));
    const again = open(services, game.id);
    await again.load();
    expect(again.get()).toMatchObject({ phase: 'finished', readOnly: true });
    expect(again.get().outcome).toMatchObject({ reason: 'resignation', result: '1-0' });
    expect(again.get().status.isOver).toBe(true);
  });
});

describe('two devices (P0-02, criterion 7)', () => {
  it('the second device asks to take over, then the first becomes read-only and mirrors the moves', async () => {
    const shared = createMemoryDataServices({ deviceId: 'device-a' });
    const a = await setup({ data: shared });
    await play(a.c, 'e2e4');
    await userTurn(a.c);
    await a.c.flush();

    const deviceB = { ...shared, deviceId: 'device-b' } as MemoryDataServices;
    const servicesB = createFakeAppServices({ data: deviceB, bots: new ScriptedBot() });
    const b = open(servicesB, a.game.id);
    await b.load();
    expect(b.get()).toMatchObject({ takeoverPrompt: true, readOnly: true, phase: 'active' });
    expect(b.get().fen).toBe(a.c.get().fen);
    await b.takeOver();
    expect(b.get()).toMatchObject({ readOnly: false, takeoverPrompt: false });
    await vi.waitFor(() => expect(a.c.get()).toMatchObject({ readOnly: true, takenOver: true }));
    // A cannot move any more …
    expect(await a.c.attemptMove({ from: 'd2', to: 'd4' })).toBe(false);
    // … and shows B's moves.
    await play(b, 'd2d4');
    await userTurn(b);
    await b.flush();
    await vi.waitFor(() => expect(a.c.get().fen).toBe(b.get().fen));
  });

  it('a stale heartbeat (> 30 s) does not ask – the game is taken over directly', async () => {
    let now = new Date('2026-10-16T12:00:00Z');
    const shared = createMemoryDataServices({ deviceId: 'device-a', now: () => now });
    const a = await setup({ data: shared });
    a.c.dispose();
    now = new Date('2026-10-16T12:01:00Z');
    const deviceB = { ...shared, deviceId: 'device-b' } as MemoryDataServices;
    const servicesB = createFakeAppServices({ data: deviceB, bots: new ScriptedBot() });
    const b = new GameController({ services: servicesB, gameId: a.game.id, moveConfirmation: () => false, now: () => now, heartbeatMs: 1_000_000 });
    controllers.push(b);
    await b.load();
    expect(b.get()).toMatchObject({ takeoverPrompt: false, readOnly: false });
    expect((await shared.repos.games.get(a.game.id))!.activeDeviceId).toBe('device-b');
  });

  it('a missing game shows the missing state', async () => {
    const services = createFakeAppServices();
    const c = open(services, 'nope');
    await c.load();
    expect(c.get().phase).toBe('missing');
  });
});
