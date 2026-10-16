import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { BOT_ROSTER, botById, botGroup, chatForMove, chatLine, createSeededRandom, endChatEvent, recommendBot } from './index';
import { isStandardStart, nextBookMoves, repertoireLines, repertoireMove } from './repertoire';
import { ChessGame } from '@/lib/chess';
import { botModel, eloParams, humanParams, skillParams } from './params';
import { THINK_TIME_RANGE_MS, thinkTimeMs } from './thinkTime';
import { softmaxWeights, weightedPick } from './random';

describe('BOT_ROSTER (P0-07, D-17)', () => {
  it('has 14 bots from 100 to 2500 Elo, five below 800, sorted by Elo', () => {
    expect(BOT_ROSTER).toHaveLength(14);
    expect(BOT_ROSTER.map((b) => b.elo)).toEqual([100, 250, 400, 550, 700, 850, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
    expect(BOT_ROSTER.filter((b) => b.elo < 800)).toHaveLength(5);
  });

  it('uses the engine of its strength band (D-16)', () => {
    for (const bot of BOT_ROSTER) {
      const expected = bot.elo < 800 ? 'stockfish-skill' : bot.elo <= 2000 ? 'stockfish-human' : 'stockfish-elo';
      expect(bot.engine, bot.id).toBe(expected);
    }
  });

  it('every bot has name, avatar, style, description, repertoire and all chat lines', () => {
    const ids = new Set<string>();
    for (const bot of BOT_ROSTER) {
      expect(ids.has(bot.id)).toBe(false);
      ids.add(bot.id);
      expect(bot.name.length).toBeGreaterThan(1);
      expect(bot.avatar).toBe(`/avatars/bots/${bot.id}.svg`);
      expect(bot.styleLabelDe).not.toBe('');
      expect(bot.descriptionDe).not.toBe('');
      expect(bot.repertoire.white.length).toBeGreaterThanOrEqual(2);
      expect(bot.repertoire.black.length).toBeGreaterThanOrEqual(2);
      for (const key of ['greeting', 'onCapture', 'onCheck', 'onWin', 'onLoss', 'onDraw'] as const) {
        expect(bot.chat[key].length, `${bot.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('botById finds bots and returns undefined otherwise', () => {
    expect(botById('zora')?.elo).toBe(2500);
    expect(botById('nobody')).toBeUndefined();
    expect(botById(null)).toBeUndefined();
  });
});

describe('recommendBot / botGroup', () => {
  it('picks the bot with the closest Elo (ties → weaker)', () => {
    expect(recommendBot(200).id).toBe('lotte');
    expect(recommendBot(175).id).toBe('pip');
    expect(recommendBot(1100).id).toBe('theo');
    expect(recommendBot(3000).id).toBe('zora');
    expect(recommendBot(0).id).toBe('pip');
  });

  it('uses the Einsteiger start value without a rating', () => {
    expect(recommendBot(null).elo).toBe(400);
    expect(recommendBot(undefined).elo).toBe(400);
    expect(recommendBot(Number.NaN).elo).toBe(400);
  });

  it('groups by strength', () => {
    expect(botGroup({ elo: 700 })).toBe('beginner');
    expect(botGroup({ elo: 800 })).toBe('intermediate');
    expect(botGroup({ elo: 1599 })).toBe('intermediate');
    expect(botGroup({ elo: 1600 })).toBe('strong');
  });
});

describe('repertoire', () => {
  const emil = botById('emil')!;

  it('recognises the standard start position (move counters ignored)', () => {
    expect(isStandardStart(START_FEN)).toBe(true);
    expect(isStandardStart(START_FEN.replace(' 0 1', ' 3 7'))).toBe(true);
    expect(isStandardStart('8/8/8/8/8/8/4k3/4K3 w - - 0 1')).toBe(false);
    expect(isStandardStart('not a fen')).toBe(false);
  });

  it('nextBookMoves returns the next move of every matching line', () => {
    const lines = [['e4', 'e5', 'Nf3'], ['e4', 'e5', 'Bc4'], ['d4']];
    expect(nextBookMoves(lines, [])).toEqual(['e4', 'e4', 'd4']);
    expect(nextBookMoves(lines, ['e4', 'e5'])).toEqual(['Nf3', 'Bc4']);
    expect(nextBookMoves(lines, ['e4', 'c5'])).toEqual([]);
    expect(nextBookMoves(lines, ['e4', 'e5', 'Nf3'])).toEqual([]);
  });

  it('plays the book move while the game follows a line, then leaves the book', () => {
    const random = createSeededRandom(3);
    const first = repertoireMove(emil, START_FEN, [], random);
    expect(first).toBe('e2e4');
    // 1.e4 e5 → Emil's lines continue with Qh5 or Bc4.
    const second = repertoireMove(emil, START_FEN, ['e2e4', 'e7e5'], random);
    expect(['d1h5', 'f1c4']).toContain(second);
    // 1.e4 c5 is not in his book.
    expect(repertoireMove(emil, START_FEN, ['e2e4', 'c7c5'], random)).toBeNull();
  });

  it('never uses the book from a custom start position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'.replace('PPPPPPPP', 'PPPPPPP1');
    expect(repertoireMove(emil, fen, [], createSeededRandom(1))).toBeNull();
  });

  it('every repertoire line of every bot is legal SAN from the start position', () => {
    for (const bot of BOT_ROSTER) {
      for (const color of ['w', 'b'] as const) {
        for (const line of repertoireLines(bot, color)) {
          const game = ChessGame.fromFen(START_FEN);
          for (const san of line) expect(game.move(san)?.san, `${bot.id} ${line.join(' ')}`).toBe(san);
        }
      }
    }
  });
});

describe('chat', () => {
  const pip = botById('pip')!;

  it('returns lines of the requested kind', () => {
    expect(pip.chat.greeting).toContain(chatLine(pip, 'greeting', createSeededRandom(1)));
  });

  it('comments checks before captures and stays silent on quiet moves', () => {
    const always = () => 0;
    expect(pip.chat.onCheck).toContain(chatForMove(pip, { isCheck: true, captured: 'p' }, always));
    expect(pip.chat.onCapture).toContain(chatForMove(pip, { isCheck: false, captured: 'n' }, always));
    expect(chatForMove(pip, { isCheck: false }, always)).toBeUndefined();
    expect(chatForMove(pip, { isCheck: true }, () => 0.99)).toBeUndefined();
  });

  it('maps a result to the bot’s end event', () => {
    expect(endChatEvent('1-0', 'w')).toBe('onWin');
    expect(endChatEvent('1-0', 'b')).toBe('onLoss');
    expect(endChatEvent('0-1', 'b')).toBe('onWin');
    expect(endChatEvent('1/2-1/2', 'w')).toBe('onDraw');
    expect(endChatEvent('*', 'w')).toBeNull();
  });
});

describe('model parameters (D-16)', () => {
  it('maps engines to models (maia → human)', () => {
    expect(botModel({ engine: 'stockfish-skill' })).toBe('skill');
    expect(botModel({ engine: 'stockfish-human' })).toBe('human');
    expect(botModel({ engine: 'maia' })).toBe('human');
    expect(botModel({ engine: 'stockfish-elo' })).toBe('elo');
  });

  it('weak bots: Skill Level 0–3 and gross errors that get rarer with Elo', () => {
    const elos = [100, 250, 400, 550, 700];
    const ps = elos.map(skillParams);
    for (const p of ps) {
      expect(p.skillLevel).toBeGreaterThanOrEqual(0);
      expect(p.skillLevel).toBeLessThanOrEqual(3);
    }
    for (let i = 1; i < ps.length; i++) expect(ps[i]!.grossErrorRate).toBeLessThan(ps[i - 1]!.grossErrorRate);
  });

  it('human model: 8–12 candidates, deeper search, lower temperature and less blindness with Elo', () => {
    const elos = [850, 1000, 1200, 1400, 1600, 1800, 2000];
    const ps = elos.map((e) => humanParams(e));
    for (const p of ps) {
      expect(p.multiPv).toBeGreaterThanOrEqual(8);
      expect(p.multiPv).toBeLessThanOrEqual(12);
      expect(p.movetimeMs).toBeLessThanOrEqual(1000);
    }
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]!.temperature).toBeLessThan(ps[i - 1]!.temperature);
      expect(ps[i]!.blindness).toBeLessThanOrEqual(ps[i - 1]!.blindness);
      expect(ps[i]!.depth).toBeGreaterThanOrEqual(ps[i - 1]!.depth);
    }
  });

  it('strong bots use UCI_Elo = their Elo', () => {
    expect(eloParams(2200).uciElo).toBe(2200);
    expect(eloParams(2500).movetimeMs).toBeLessThanOrEqual(1000);
  });
});

describe('think time (1–8 s by complexity)', () => {
  const base = { legalMoves: 30, captures: 2, inCheck: false, spread: 0.1, book: false, elo: 1200 };

  it('stays within 1–8 s', () => {
    const random = createSeededRandom(9);
    for (let i = 0; i < 200; i++) {
      const t = thinkTimeMs({ ...base, legalMoves: Math.floor(random() * 60), captures: Math.floor(random() * 6), spread: random() < 0.2 ? null : random(), elo: 100 + random() * 2400 }, random);
      expect(t).toBeGreaterThanOrEqual(THINK_TIME_RANGE_MS.min);
      expect(t).toBeLessThanOrEqual(THINK_TIME_RANGE_MS.max);
    }
  });

  it('is short for forced and book moves and longer for hard decisions', () => {
    const mid = () => 0.5;
    expect(thinkTimeMs({ ...base, legalMoves: 1 }, mid)).toBe(1000);
    expect(thinkTimeMs({ ...base, book: true }, mid)).toBeLessThanOrEqual(2000);
    const easy = thinkTimeMs({ ...base, spread: 0.5, captures: 0, legalMoves: 10 }, mid);
    const hard = thinkTimeMs({ ...base, spread: 0, captures: 4, legalMoves: 40 }, mid);
    expect(hard).toBeGreaterThan(easy);
  });
});

describe('random helpers', () => {
  it('seeded random is reproducible', () => {
    const a = createSeededRandom(5);
    const b = createSeededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('softmax favours higher scores; weightedPick respects weights', () => {
    const w = softmaxWeights([0, -0.1, -1], 0.1);
    expect(w[0]).toBe(1);
    expect(w[1]!).toBeGreaterThan(w[2]!);
    expect(weightedPick(['a', 'b'], [0, 1], () => 0.3)).toBe('b');
    expect(weightedPick([], [], () => 0.3)).toBeUndefined();
    expect(weightedPick(['a', 'b'], [0, 0], () => 0.6)).toBe('b');
  });
});
