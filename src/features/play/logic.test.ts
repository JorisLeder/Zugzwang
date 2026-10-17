import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { FIXTURE_BOTS } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import {
  capturedBy,
  checkPosition,
  claimMessageDe,
  endMessageDe,
  gameHeaders,
  isAnotherDeviceActive,
  lastUsedLevel,
  materialLead,
  newBotGame,
  normalizeFenInput,
  pgnDate,
  resolveColor,
  takebackPlies,
  userOutcome,
  yourPieceAccusativeDe,
} from './logic';

const bot = FIXTURE_BOTS[0]!;

describe('new games and headers', () => {
  it('resolves the colour choice', () => {
    expect(resolveColor('w')).toBe('w');
    expect(resolveColor('b')).toBe('b');
    expect(resolveColor('random', () => 0.2)).toBe('w');
    expect(resolveColor('random', () => 0.7)).toBe('b');
  });

  it('writes the bot’s Elo on its side and "Du" for the user', () => {
    const d = new Date(2026, 9, 16, 12);
    expect(pgnDate(d)).toBe('2026.10.16');
    expect(gameHeaders(bot, 'w', d)).toMatchObject({ White: 'Du', Black: bot.name, BlackElo: String(bot.elo), Date: '2026.10.16', Result: '*' });
    expect(gameHeaders(bot, 'w', d).WhiteElo).toBeUndefined();
    expect(gameHeaders(bot, 'b', d)).toMatchObject({ White: bot.name, Black: 'Du', WhiteElo: String(bot.elo) });
  });

  it('newBotGame: source bot, untimed, active on this device', () => {
    const g = newBotGame({ bot, userColor: 'b', assistance: 'coach', startFen: START_FEN, origin: { type: 'new' }, deviceId: 'dev', now: new Date('2026-10-16T10:00:00Z') });
    expect(g).toMatchObject({
      source: 'bot',
      botId: bot.id,
      userColor: 'b',
      assistance: 'coach',
      timeControl: { kind: 'none' },
      status: 'active',
      result: '*',
      activeDeviceId: 'dev',
      activeHeartbeatAt: '2026-10-16T10:00:00.000Z',
    });
  });

  it('preselects the last used level, else Coach', () => {
    expect(lastUsedLevel([])).toBe('coach');
    expect(
      lastUsedLevel([
        { source: 'bot', assistance: 'training', createdAt: '2026-10-01T00:00:00Z' },
        { source: 'bot', assistance: 'competition', createdAt: '2026-10-02T00:00:00Z' },
        { source: 'pgn', assistance: null, createdAt: '2026-10-03T00:00:00Z' },
      ]),
    ).toBe('competition');
  });
});

describe('takeback plies', () => {
  const history = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5', 'g1f3']).history();
  it('takes back the bot reply and the own move', () => {
    expect(takebackPlies(history.slice(0, 2), 'w')).toBe(2);
    expect(takebackPlies(history, 'w')).toBe(1);
    expect(takebackPlies(history.slice(0, 2), 'b')).toBe(1);
    expect(takebackPlies(history.slice(0, 1), 'b')).toBe(0);
    expect(takebackPlies([], 'w')).toBe(0);
  });
});

describe('two devices', () => {
  const now = new Date('2026-10-16T12:00:30Z');
  const base = { status: 'active' as const, activeDeviceId: 'other', activeHeartbeatAt: '2026-10-16T12:00:10Z' };
  it('another device is active when its heartbeat is younger than 30 s', () => {
    expect(isAnotherDeviceActive(base, 'me', now)).toBe(true);
    expect(isAnotherDeviceActive({ ...base, activeHeartbeatAt: '2026-10-16T11:59:59Z' }, 'me', now)).toBe(false);
    expect(isAnotherDeviceActive({ ...base, activeDeviceId: 'me' }, 'me', now)).toBe(false);
    expect(isAnotherDeviceActive({ ...base, status: 'finished' }, 'me', now)).toBe(false);
    expect(isAnotherDeviceActive({ ...base, activeDeviceId: null }, 'me', now)).toBe(false);
  });
});

describe('German end texts (DSB terms, RULES §3)', () => {
  it('names every end reason', () => {
    expect(userOutcome('1-0', 'w')).toBe('win');
    expect(userOutcome('1-0', 'b')).toBe('loss');
    expect(userOutcome('1/2-1/2', 'b')).toBe('draw');
    expect(userOutcome('*', 'b')).toBeNull();
    expect(endMessageDe('checkmate', '1-0', 'w', 'Pip')).toBe('Schachmatt – du hast gewonnen!');
    expect(endMessageDe('checkmate', '1-0', 'b', 'Pip')).toBe('Schachmatt – Pip gewinnt.');
    expect(endMessageDe('stalemate', '1/2-1/2', 'w', 'Pip')).toMatch(/^Patt – Remis/);
    expect(endMessageDe('insufficient_material', '1/2-1/2', 'w', 'Pip')).toBe('Remis: Keine Seite kann mehr mattsetzen.');
    expect(endMessageDe('fivefold_repetition', '1/2-1/2', 'w', 'Pip')).toBe('Remis durch fünfmalige Stellungswiederholung.');
    expect(endMessageDe('seventyfive_moves', '1/2-1/2', 'w', 'Pip')).toBe('Remis nach der 75-Züge-Regel.');
    expect(endMessageDe('threefold_repetition_claim', '1/2-1/2', 'w', 'Pip', 'bot')).toMatch(/Pip hat Remis beantragt/);
    expect(endMessageDe('threefold_repetition_claim', '1/2-1/2', 'w', 'Pip', 'user')).toMatch(/du hast Remis beantragt/);
    expect(endMessageDe('fifty_moves_claim', '1/2-1/2', 'w', 'Pip')).toBe('Remis nach der 50-Züge-Regel.');
    expect(endMessageDe('resignation', '0-1', 'w', 'Pip')).toBe('Du hast aufgegeben.');
    expect(endMessageDe('resignation', '1/2-1/2', 'w', 'Pip')).toMatch(/Pip kann dich nicht mehr mattsetzen/);
  });

  it('claim texts (RULES finding R-03 wording)', () => {
    expect(claimMessageDe(['threefold_repetition'], false)).toMatch(/mindestens zum dritten Mal.*Remis beantragen/);
    expect(claimMessageDe(['fifty_moves'], false)).toMatch(/50 Züge/);
    expect(claimMessageDe(['threefold_repetition'], true)).toMatch(/^Mit deinem Zug/);
  });
});

describe('player bar helpers', () => {
  it('lists captured pieces and the material lead', () => {
    const history = ChessGame.fromMoves(START_FEN, ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a2', 'a1a2']).history();
    const captured = capturedBy(history);
    expect(captured).toEqual({ w: ['q', 'p'], b: ['p', 'p'] });
    expect(materialLead(captured, 'w')).toBe(8);
    expect(materialLead(captured, 'b')).toBe(0);
  });

  it('German accusative for hints', () => {
    expect(yourPieceAccusativeDe('n')).toBe('deinen Springer');
    expect(yourPieceAccusativeDe('q')).toBe('deine Dame');
  });
});

describe('play from FEN (criterion 8)', () => {
  it('accepts valid FENs (also without move counters) and normalises them', () => {
    expect(normalizeFenInput('  8/8/8/8/8/8/4k3/4K3   w - - ')).toBe('8/8/8/8/8/8/4k3/4K3 w - - 0 1');
    const ok = checkPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(ok).toMatchObject({ ok: true, turn: 'b', standard: false });
    expect(checkPosition(START_FEN)).toMatchObject({ ok: true, standard: true });
    expect(checkPosition(null)).toBeNull();
  });

  it('rejects invalid positions with a German error', () => {
    const bad = checkPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1');
    expect(bad).toMatchObject({ ok: false });
    expect(bad && !bad.ok && bad.error).toMatch(/^Diese Stellung geht nicht: /);
    expect(checkPosition('')).toEqual({ ok: false, error: 'Bitte gib eine FEN ein.' });
    // Side not to move in check (FIDE 3.10.3)
    expect(checkPosition('k6R/8/8/8/8/8/8/K7 w - - 0 1')).toMatchObject({ ok: false });
    expect(checkPosition('4k3/8/8/8/8/8/8/R3K3 b - - 0 1')).toMatchObject({ ok: true });
    // Finished positions cannot be played.
    expect(checkPosition('7k/5QQ1/8/8/8/8/8/K7 b - - 0 1')).toEqual({ ok: false, error: 'In dieser Stellung ist die Partie schon zu Ende.' });
  });
});
