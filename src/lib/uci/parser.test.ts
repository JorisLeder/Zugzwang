import { describe, expect, it } from 'vitest';
import { infoToEngineLine, parseUciLine, toWhitePov, type UciInfo } from './parser';

describe('parseUciLine', () => {
  it('parses handshake lines', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ type: 'readyok' });
    expect(parseUciLine('id name Stockfish 19 Lite WASM')).toEqual({ type: 'id', name: 'Stockfish 19 Lite WASM' });
    expect(parseUciLine('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      type: 'option',
      name: 'UCI_Elo',
      optionType: 'spin',
      default: '1320',
      min: 1320,
      max: 3190,
    });
    expect(parseUciLine('option name Skill Level type spin default 20 min 0 max 20')).toMatchObject({ name: 'Skill Level', max: 20 });
  });

  it('parses info with cp score, multipv and pv', () => {
    const m = parseUciLine(
      'info depth 12 seldepth 14 multipv 2 score cp -31 nodes 12743 nps 303404 hashfull 4 time 42 pv e2e4 c7c5 b1c3',
    ) as UciInfo;
    expect(m).toEqual({
      type: 'info',
      depth: 12,
      seldepth: 14,
      multipv: 2,
      score: { type: 'cp', value: -31 },
      nodes: 12743,
      nps: 303404,
      hashfull: 4,
      timeMs: 42,
      pv: ['e2e4', 'c7c5', 'b1c3'],
    });
  });

  it('parses mate scores and bounds', () => {
    expect(parseUciLine('info depth 3 score mate 1 pv d1d8')).toMatchObject({ score: { type: 'mate', value: 1 }, pv: ['d1d8'] });
    expect(parseUciLine('info depth 20 score mate -3 pv a1a2')).toMatchObject({ score: { type: 'mate', value: -3 } });
    expect(parseUciLine('info depth 18 score cp 45 lowerbound nodes 5 pv e2e4')).toMatchObject({ bound: 'lower', nodes: 5 });
    expect(parseUciLine('info depth 18 score cp 40 upperbound pv e2e4')).toMatchObject({ bound: 'upper' });
  });

  it('parses info string and currmove lines without a pv', () => {
    expect(parseUciLine('info string NNUE evaluation using nn.nnue')).toEqual({ type: 'info', string: 'NNUE evaluation using nn.nnue' });
    expect(parseUciLine('info depth 10 currmove e2e4 currmovenumber 1')).toMatchObject({ depth: 10, currmove: 'e2e4' });
  });

  it('parses bestmove incl. (none) and ponder', () => {
    expect(parseUciLine('bestmove e2e4 ponder c7c5')).toEqual({ type: 'bestmove', move: 'e2e4', ponder: 'c7c5' });
    expect(parseUciLine('bestmove d1d8')).toEqual({ type: 'bestmove', move: 'd1d8' });
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: null });
  });

  it('returns unknown for anything else', () => {
    expect(parseUciLine('Stockfish 19 Lite WASM by the Stockfish developers')).toMatchObject({ type: 'unknown' });
  });
});

describe('White point of view (D-08)', () => {
  it('keeps White-to-move scores and negates Black-to-move scores', () => {
    expect(toWhitePov({ type: 'cp', value: 35 }, 'w')).toEqual({ type: 'cp', value: 35 });
    expect(toWhitePov({ type: 'cp', value: 35 }, 'b')).toEqual({ type: 'cp', value: -35 });
    expect(toWhitePov({ type: 'mate', value: 2 }, 'b')).toEqual({ type: 'mate', value: -2 });
    expect(toWhitePov({ type: 'mate', value: -1 }, 'b')).toEqual({ type: 'mate', value: 1 });
    expect(toWhitePov({ type: 'mate', value: 0 }, 'b')).toEqual({ type: 'mate', value: 0 });
  });

  it('builds EngineLines and flips bounds with the score', () => {
    const info = parseUciLine('info depth 18 multipv 1 score cp 45 lowerbound pv e7e5') as UciInfo;
    expect(infoToEngineLine(info, 'b')).toEqual({ multipv: 1, depth: 18, score: { type: 'cp', value: -45 }, bound: 'upper', pv: ['e7e5'] });
    expect(infoToEngineLine(info, 'w')?.bound).toBe('lower');
    expect(infoToEngineLine(parseUciLine('info depth 0 score mate 0') as UciInfo, 'w')).toBeNull();
  });
});
