import { describe, expect, it } from 'vitest';
import type { AnalysedMove, GameAnalysis } from '@/core/analysis';
import { START_FEN } from '@/core/chess';
import type { Game, GameMoveEvent } from '@/core/games';
import { FakeAnalysisService, FIXTURE_BOTS, FIXTURE_GAME, FIXTURE_GAME_ANALYSIS_SCRIPT } from '@/core/testing';
import { GRAPH_HEIGHT, GRAPH_WIDTH, graphGeometry, plyAtX, plyX } from './evalGraph';
import {
  accuracyText,
  annotationFor,
  bestMoveArrows,
  canRetry,
  classificationsByPly,
  currentEngineVersion,
  displayKeyMoments,
  evalAtPly,
  gameDateLabel,
  gameTitle,
  isAnalysisCurrent,
  keyMomentFrom,
  lineSan,
  loadGameLine,
  playerInfo,
  resultLabel,
  reviewableGames,
  summaryCategories,
} from './review';

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    source: 'pgn',
    externalId: 'x',
    botId: null,
    userColor: null,
    assistance: null,
    timeControl: { kind: 'none' },
    startFen: START_FEN,
    pgn: FIXTURE_GAME.pgn,
    headers: { White: 'Anna', Black: 'Ben', Date: '2025.03.12' },
    status: 'finished',
    result: '1-0',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    finishedAt: '2026-10-16T10:30:00.000Z',
    ...over,
  };
}

function events(moves: string[]): GameMoveEvent[] {
  return moves.map((uci, i) => ({ id: `e${i}`, gameId: 'g1', seq: i + 1, kind: 'move', ply: i + 1, uci, createdAt: '' }));
}

async function fixtureAnalysis(): Promise<GameAnalysis> {
  const svc = new FakeAnalysisService({ moves: FIXTURE_GAME_ANALYSIS_SCRIPT });
  return svc.analyseGame({ gameId: 'g1', startFen: START_FEN, moves: FIXTURE_GAME.moves });
}

describe('loadGameLine', () => {
  it('reads imported games from the PGN and bot games from the event log (takebacks folded)', () => {
    const pgn = loadGameLine(game(), []);
    expect(pgn.ok && pgn.moves.map((m) => m.uci)).toEqual(FIXTURE_GAME.moves);
    const evs = [...events(['e2e4', 'e7e5', 'g1f3'])];
    evs.push({ id: 't', gameId: 'g1', seq: 4, kind: 'takeback', ply: 2, plies: 1, createdAt: '' });
    evs.push({ id: 'm', gameId: 'g1', seq: 5, kind: 'move', ply: 3, uci: 'f1c4', createdAt: '' });
    const bot = loadGameLine(game({ source: 'bot', pgn: '' }), evs);
    expect(bot.ok && bot.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Bc4']);
  });

  it('reports a German error for an unreadable PGN', () => {
    const r = loadGameLine(game({ pgn: '1. e4 e5 2. Ke3 *' }), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorDe.length).toBeGreaterThan(5);
  });
});

describe('isAnalysisCurrent', () => {
  it('needs the current engine version and the same moves', async () => {
    const a = { ...(await fixtureAnalysis()), engineVersion: currentEngineVersion('sf') };
    expect(isAnalysisCurrent(a, 'sf', FIXTURE_GAME.moves)).toBe(true);
    expect(isAnalysisCurrent({ ...a, engineVersion: 'sf+zz-analysis-0' }, 'sf', FIXTURE_GAME.moves)).toBe(false);
    expect(isAnalysisCurrent(a, 'other', FIXTURE_GAME.moves)).toBe(false);
    expect(isAnalysisCurrent(a, 'sf', FIXTURE_GAME.moves.slice(0, 10))).toBe(false);
  });
});

describe('labels', () => {
  it('names the players, the result and the date', () => {
    const imported = game();
    expect(gameTitle(imported, FIXTURE_BOTS)).toBe('Anna – Ben');
    expect(resultLabel(imported)).toBe('1:0');
    expect(gameDateLabel(imported)).toBe('12.03.2025');
    const bot = FIXTURE_BOTS[0]!;
    const botGame = game({ source: 'bot', botId: bot.id, userColor: 'b', headers: { WhiteElo: String(bot.elo) }, result: '1-0' });
    expect(playerInfo(botGame, FIXTURE_BOTS).b).toEqual({ name: 'Du', isUser: true });
    expect(gameTitle(botGame, FIXTURE_BOTS)).toBe(`gegen ${bot.name} (${bot.elo})`);
    expect(resultLabel(botGame)).toBe('Verloren');
    expect(resultLabel(game({ source: 'bot', userColor: 'w', result: '1/2-1/2' }))).toBe('Remis');
    expect(gameDateLabel(botGame)).toBe('16.10.2026');
  });

  it('formats accuracy 0–100 with one decimal', () => {
    expect(accuracyText(87.44)).toBe('87,4 %');
    expect(accuracyText(100)).toBe('100,0 %');
    expect(accuracyText(-3)).toBe('0,0 %');
  });

  it('lists finished bot games and every imported game', () => {
    const list = [game({ id: 'a' }), game({ id: 'b', source: 'bot', status: 'active' }), game({ id: 'c', source: 'bot', status: 'finished' })];
    expect(reviewableGames(list).map((g) => g.id)).toEqual(['a', 'c']);
  });
});

describe('board helpers', () => {
  it('shows the classification at the destination and the best move as arrow (mistakes after the reveal)', async () => {
    const a = await fixtureAnalysis();
    const blunder = a.moves[FIXTURE_GAME.blunder.ply - 1]!;
    expect(blunder.classification).toBe('blunder');
    expect(annotationFor(blunder)).toEqual([{ square: 'c2', classification: 'blunder' }]);
    expect(bestMoveArrows(blunder, false)).toEqual([]);
    expect(bestMoveArrows(blunder, true)).toEqual([{ from: 'f1', to: 'f2', kind: 'best' }]);
    expect(canRetry(blunder)).toBe(true);
    const best = a.moves[0]!;
    expect(bestMoveArrows(best, true)).toEqual([]);
    expect(canRetry(best)).toBe(false);
    const inaccuracy: AnalysedMove = { ...best, classification: 'inaccuracy', bestMove: 'd2d4', bestMoveSan: 'd4' };
    expect(bestMoveArrows(inaccuracy, false)).toEqual([{ from: 'd2', to: 'd4', kind: 'best' }]);
    expect(classificationsByPly(a)[27]).toBe('blunder');
    expect(evalAtPly(a, 0)).toEqual({ type: 'cp', value: 0 });
    expect(evalAtPly(a, 27)).toEqual(FIXTURE_GAME.blunder.evalAfter);
    expect(lineSan(blunder.fenBefore, blunder.bestLine)).toEqual(['Rxf2']);
  });
});

describe('key moments', () => {
  it('keeps the analysis key moments and fills up to three with the largest other losses', async () => {
    const a = await fixtureAnalysis();
    expect(displayKeyMoments(a)).toEqual([27]);
    const moves = a.moves.map((m) => (m.ply === 40 ? { ...m, expectedPointsLoss: 0.06 } : m.ply === 9 ? { ...m, expectedPointsLoss: 0.03 } : m));
    expect(displayKeyMoments({ ...a, moves })).toEqual([9, 27, 40]);
    expect(displayKeyMoments({ ...a, keyMoments: [3, 5, 7, 9, 11, 13] })).toEqual([3, 5, 7, 9, 11]);
    expect(displayKeyMoments(null)).toEqual([]);
    expect(keyMomentFrom([27, 40, 9], 10, 1)).toBe(27);
    expect(keyMomentFrom([27, 40, 9], 27, -1)).toBe(9);
    expect(keyMomentFrom([27], 30, 1)).toBeNull();
  });

  it('lists the main categories in the summary and rare ones only when they occur', async () => {
    const a = await fixtureAnalysis();
    expect(summaryCategories(a)).toEqual(['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder']);
    const withBook = { ...a, counts: { ...a.counts, w: { ...a.counts.w, book: 3 } } };
    expect(summaryCategories(withBook)).toContain('book');
  });
});

describe('eval graph geometry', () => {
  it('maps plies to x and win% to y and back', () => {
    const geo = graphGeometry([
      { ply: 2, winPctWhite: 25 },
      { ply: 0, winPctWhite: 50 },
      { ply: 1, winPctWhite: 120 },
    ]);
    expect(geo.maxPly).toBe(2);
    expect(geo.points.map((p) => [p.ply, p.x, p.y])).toEqual([
      [0, 0, GRAPH_HEIGHT / 2],
      [1, GRAPH_WIDTH / 2, 0],
      [2, GRAPH_WIDTH, GRAPH_HEIGHT * 0.75],
    ]);
    expect(geo.area.startsWith(`M0 ${GRAPH_HEIGHT}`)).toBe(true);
    expect(geo.area.endsWith('Z')).toBe(true);
    expect(plyAtX(GRAPH_WIDTH * 0.74, 2)).toBe(1);
    expect(plyAtX(-10, 2)).toBe(0);
    expect(plyAtX(GRAPH_WIDTH * 2, 2)).toBe(2);
    expect(plyX(1, 0)).toBe(GRAPH_WIDTH / 2);
    expect(graphGeometry([]).area).toBe('');
  });
});
