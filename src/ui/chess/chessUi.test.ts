import { describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import { ChessGame } from '@/lib/chess';
import { evalWords, leadingSide, whiteShare } from './evalBarModel';
import { movePairs } from './moveListModel';
import { CHESS_UI_DE } from './strings.de';

describe('whiteShare (PRD win-percentage formula)', () => {
  it('is 50 for an equal or unknown position and symmetric', () => {
    expect(whiteShare(null)).toBe(50);
    expect(whiteShare({ type: 'cp', value: 0 })).toBe(50);
    expect(whiteShare({ type: 'cp', value: 200 }) + whiteShare({ type: 'cp', value: -200 })).toBeCloseTo(100);
  });

  it('matches W(cp) and clamps to 3–97 %', () => {
    const w100 = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * 100)) - 1);
    expect(whiteShare({ type: 'cp', value: 100 })).toBeCloseTo(w100);
    expect(whiteShare({ type: 'cp', value: 5000 })).toBe(97);
    expect(whiteShare({ type: 'cp', value: -5000 })).toBe(3);
  });

  it('is 100/0 for forced mates', () => {
    expect(whiteShare({ type: 'mate', value: 2 })).toBe(100);
    expect(whiteShare({ type: 'mate', value: -1 })).toBe(0);
    expect(leadingSide({ type: 'mate', value: -1 })).toBe('b');
  });
});

describe('evalWords', () => {
  it('describes the evaluation in German', () => {
    expect(evalWords({ type: 'cp', value: 10 })).toBe('Die Stellung ist ausgeglichen');
    expect(evalWords({ type: 'cp', value: 60 })).toBe('Weiß steht etwas besser');
    expect(evalWords({ type: 'cp', value: -150 })).toBe('Schwarz steht besser');
    expect(evalWords({ type: 'cp', value: 400 })).toBe('Weiß steht deutlich besser');
    expect(evalWords({ type: 'mate', value: 1 })).toBe('Weiß setzt in einem Zug matt');
    expect(evalWords({ type: 'mate', value: -4 })).toBe('Schwarz setzt in 4 Zügen matt');
    expect(evalWords({ type: 'mate', value: 0 })).toBe('Matt');
  });
});

describe('movePairs', () => {
  it('pairs half-moves by move number', () => {
    const moves = ChessGame.fromMoves(START_FEN, ['e2e4', 'e7e5', 'g1f3']).history();
    const pairs = movePairs(moves);
    expect(pairs.map((p) => [p.number, p.white?.san, p.black?.san])).toEqual([
      [1, 'e4', 'e5'],
      [2, 'Nf3', undefined],
    ]);
  });
});

describe('move words', () => {
  it('reads moves for screen readers', () => {
    const g = ChessGame.fromMoves(START_FEN, ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5e5']);
    const words = g.history().map((m) => CHESS_UI_DE.moveInWords(m));
    expect(words).toEqual(['Bauer e4', 'Bauer d5', 'Bauer schlägt d5', 'Dame schlägt d5', 'Springer c3', 'Dame e5, Schach']);
  });
});
