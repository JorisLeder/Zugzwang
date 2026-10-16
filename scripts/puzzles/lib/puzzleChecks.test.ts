import { describe, expect, it } from 'vitest';
import type { EngineLine, Score } from '@/core/engine';
import type { Puzzle } from '@/core/puzzles';
import { FakeEngineService, FIXTURE_PUZZLES } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import {
  checkPuzzleStructure,
  checkPuzzleWithEngine,
  countSentences,
  matingMoves,
  renderPlainDe,
  replayLine,
  solverMateIn,
} from './puzzleChecks';

const fixture = (id: string): Puzzle => structuredClone(FIXTURE_PUZZLES.find((p) => p.id === id)!);

function line(uci: string, score: Score, multipv = 1): EngineLine {
  return { multipv, depth: 18, score, pv: [uci] };
}

/** FEN before the solver move at `ply`. */
function fenAt(p: Puzzle, ply: number): string {
  return ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
}

describe('helpers', () => {
  it('counts sentences', () => {
    expect(countSentences('Eins. Zwei! Drei?')).toBe(3);
    expect(countSentences('Te8# setzt matt.')).toBe(1);
    expect(countSentences('Ohne Punkt')).toBe(1);
  });

  it('renders plain text in German notation', () => {
    expect(renderPlainDe({ segments: [{ type: 'text', text: 'Mit ' }, { type: 'move', san: 'Nxh4' }, { type: 'text', text: ' gewinnst du.' }] })).toBe(
      'Mit Sxh4 gewinnst du.',
    );
  });

  it('replays a line and reports the first illegal move', () => {
    const p = fixture('fixture-knight-fork');
    expect(replayLine(p.fen, p.moves).illegalAt).toBeNull();
    expect(replayLine(p.fen, ['c7c6', 'd5d7']).illegalAt).toBe(1);
  });

  it('finds every mating move', () => {
    const p = fixture('fixture-two-mates');
    expect(matingMoves(fenAt(p, 1)).sort()).toEqual(['Ra8#', 'Rb8#']);
  });

  it('reads the solver mate distance from a White-POV score', () => {
    expect(solverMateIn(line('a1a8', { type: 'mate', value: 2 }), 'w')).toBe(2);
    expect(solverMateIn(line('a1a8', { type: 'mate', value: -2 }), 'b')).toBe(2);
    expect(solverMateIn(line('a1a8', { type: 'mate', value: -2 }), 'w')).toBeNull();
    expect(solverMateIn(line('a1a8', { type: 'cp', value: 900 }), 'w')).toBeNull();
  });
});

describe('checkPuzzleStructure', () => {
  it('accepts every fixture puzzle', () => {
    for (const p of FIXTURE_PUZZLES) expect(checkPuzzleStructure(p).errors, p.id).toEqual([]);
  });

  it('rejects schema errors, illegal moves and illegal FENs', () => {
    expect(checkPuzzleStructure({ id: 'x' }).errors[0]!.message).toMatch(/^Schema/);
    const illegal = { ...fixture('fixture-knight-fork'), moves: ['c7c6', 'd5d7'] };
    expect(checkPuzzleStructure(illegal).errors.map((e) => e.message).join()).toMatch(/Zug 2 .* nicht legal/);
    const badFen = { ...fixture('fixture-knight-fork'), fen: '8/8/8/8/8/8/8/8 w - - 0 1' };
    expect(checkPuzzleStructure(badFen).errors[0]!.message).toMatch(/Ungültige FEN/);
  });

  it('needs an even number of moves, a known theme, a rating in range and the right mate theme', () => {
    const p = fixture('fixture-knight-fork');
    const odd = checkPuzzleStructure({ ...p, moves: p.moves.slice(0, 3) }).errors.map((e) => e.message);
    expect(odd.join()).toMatch(/gerade Anzahl/);
    expect(checkPuzzleStructure({ ...p, themes: [...p.themes, 'noSuchTheme'] }).errors[0]!.message).toMatch(/Unbekanntes Thema/);
    expect(checkPuzzleStructure({ ...p, rating: 3500 }).errors[0]!.message).toMatch(/außerhalb/);
    expect(checkPuzzleStructure({ ...p, themes: [...p.themes, 'mateIn2'] }).errors.map((e) => e.message).join()).toMatch(/Matt-Thema/);
    const mate = fixture('fixture-smothered-mate');
    const wrongLength = checkPuzzleStructure({ ...mate, themes: mate.themes.map((t) => (t === 'mateIn2' ? 'mateIn3' : t)) });
    expect(wrongLength.errors[0]!.message).toMatch(/mateIn3, aber die Lösung hat 2 Züge/);
  });

  it('requires an explanation unless the puzzle is from Lichess', () => {
    const { explanation: _omit, ...rest } = fixture('fixture-hanging-queen');
    expect(checkPuzzleStructure(rest).errors[0]!.message).toMatch(/Erklärung fehlt/);
    expect(checkPuzzleStructure({ ...rest, source: 'lichess' }).errors).toEqual([]);
  });

  it('allows other mating moves in the explanation but no foreign moves, and at most 3 sentences', () => {
    expect(checkPuzzleStructure(fixture('fixture-two-mates')).errors).toEqual([]); // mentions Ra8# as well
    const p = fixture('fixture-hanging-queen');
    const foreign = { ...p, explanation: { ...p.explanation!, segments: [...p.explanation!.segments, { type: 'move' as const, san: 'Qxh4' }] } };
    expect(checkPuzzleStructure(foreign).errors.map((e) => e.message).join()).toMatch(/„Qxh4“, der nicht zur Lösung gehört/);
    const long = { ...p, explanation: { ...p.explanation!, plain: 'Eins. Zwei. Drei. Vier.' } };
    expect(checkPuzzleStructure(long).errors.map((e) => e.message).join()).toMatch(/4 Sätze/);
  });

  it('rejects a line in which the game ends before the last move', () => {
    const p = fixture('fixture-scholars-mate');
    // Qxf7# mates already – a further pair of moves cannot follow.
    const r = checkPuzzleStructure({ ...p, moves: [...p.moves, 'e8e7', 'f7e7'] });
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('checkPuzzleWithEngine', () => {
  it('accepts a unique best move (margin ≥ 0.10) and skips immediate mates', async () => {
    const p = fixture('fixture-knight-fork');
    const engine = new FakeEngineService({
      lines: {
        [fenAt(p, 1)]: [line('d5e7', { type: 'cp', value: 900 }), line('e1e8', { type: 'cp', value: 50 }, 2)],
        [fenAt(p, 3)]: [line('e7c6', { type: 'cp', value: 900 }), line('e7d5', { type: 'cp', value: 0 }, 2)],
      },
    });
    expect(await checkPuzzleWithEngine(p, engine)).toEqual({ errors: [], warnings: [] });
    expect(engine.calls.every((c) => c.opts.depth === 18 && 'multiPv' in c.opts && c.opts.multiPv === 2)).toBe(true);
    const mate = new FakeEngineService();
    expect((await checkPuzzleWithEngine(fixture('fixture-two-mates'), mate)).errors).toEqual([]);
    expect(mate.calls).toHaveLength(0);
  });

  it('rejects a solution move that is not unique or not the best', async () => {
    const p = fixture('fixture-knight-fork');
    const close = new FakeEngineService({
      lines: {
        [fenAt(p, 1)]: [line('d5e7', { type: 'cp', value: 900 }), line('e1e8', { type: 'cp', value: 0 }, 2)],
        [fenAt(p, 3)]: [line('e7c6', { type: 'cp', value: 900 }), line('e7d5', { type: 'cp', value: 850 }, 2)],
      },
    });
    expect((await checkPuzzleWithEngine(p, close)).errors[0]!.message).toMatch(/Zug 2 \(Nxc6\) ist nicht eindeutig/);
    const other = new FakeEngineService({ lines: { [fenAt(p, 1)]: [line('e1e8', { type: 'cp', value: 900 }), line('d5e7', { type: 'cp', value: 0 }, 2)] } });
    expect((await checkPuzzleWithEngine(p, other)).errors[0]!.message).toMatch(/nicht der beste Zug \(Engine: e1e8\)/);
  });

  it('checks forced mates: fastest mate, no equally fast alternative, mateInN theme', async () => {
    const p = fixture('fixture-smothered-mate'); // Black POV of scores: White mates → positive
    const unique = new FakeEngineService({
      lines: { [fenAt(p, 1)]: [line('d5g8', { type: 'mate', value: 2 }), line('h6f7', { type: 'cp', value: 300 }, 2)] },
    });
    expect((await checkPuzzleWithEngine(p, unique)).errors).toEqual([]);
    const twin = new FakeEngineService({
      lines: { [fenAt(p, 1)]: [line('d5g8', { type: 'mate', value: 2 }), line('h6f7', { type: 'mate', value: 2 }, 2)] },
    });
    expect((await checkPuzzleWithEngine(p, twin)).errors[0]!.message).toMatch(/setzt ebenfalls in 2 Zügen matt/);
    const slower = new FakeEngineService({
      lines: { [fenAt(p, 1)]: [line('d5g8', { type: 'mate', value: 3 }), line('h6f7', { type: 'cp', value: 0 }, 2)] },
    });
    expect((await checkPuzzleWithEngine(p, slower)).errors[0]!.message).toMatch(/mateIn2, aber die Engine sieht Matt in 3/);
    const notFastest = new FakeEngineService({
      lines: { [fenAt(p, 1)]: [line('h6f7', { type: 'mate', value: 2 }), line('d5d8', { type: 'mate', value: 3 }, 2)] },
    });
    expect((await checkPuzzleWithEngine(p, notFastest)).errors[0]!.message).toMatch(/nicht das schnellste Matt/);
  });
});
