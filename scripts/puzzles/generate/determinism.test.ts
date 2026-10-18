/**
 * Determinism: a game's result depends only on (seed, index, config) – not on what the engines searched before, nor
 * on whether it ran in-process or on a worker process – and the assembled bank is the same for the same results.
 * Small search depths keep the test fast; the production config only differs in depths and lengths.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadOpeningBook, type OpeningBook } from '@/analysis';
import { createAccumulator } from './index';
import { createWorkerPool, runGamesInOrder } from './pool';
import { DEFAULT_GENERATOR_CONFIG, playGame, type GameResult, type GeneratorConfig } from './selfplay';
import { createGameEngines, disposeGameEngines } from './worker';

const SEED = 42;
const config: GeneratorConfig = { ...DEFAULT_GENERATOR_CONFIG, screenDepth: 6, maxPlies: 50, solution: { depth: 10, maxAdvantageMoves: 3 }, checkDepth: 10 };
const engines = createGameEngines();
let book: OpeningBook;

beforeAll(async () => {
  book = await loadOpeningBook();
});
afterAll(() => disposeGameEngines(engines));

describe('generator determinism', () => {
  let first: GameResult;

  it('replays a game identically after the engines searched other positions', async () => {
    first = await playGame(engines, book, SEED, 7, config);
    expect(first.puzzles.length).toBeGreaterThan(0);
    await playGame(engines, book, SEED, 4, config);
    expect(await playGame(engines, book, SEED, 7, config)).toEqual(first);
  }, 60_000);

  it('gives a different game for another seed or index', async () => {
    const other = await playGame(engines, book, SEED + 1, 7, config);
    expect(other).not.toEqual(first);
  }, 60_000);

  it('gives the same results on a worker process, in index order', async () => {
    const runner = createWorkerPool(1, SEED, config);
    const seen: GameResult[] = [];
    try {
      await runGamesInOrder({ runner, window: 2, maxGames: 2, cache: null, consume: (r) => (seen.push(r), false) });
    } finally {
      runner.close();
    }
    expect(seen.map((r) => r.index)).toEqual([0, 1]);
    expect(seen[0]).toEqual(await playGame(engines, book, SEED, 0, config));
  }, 120_000);

  it('assembles the same puzzles (ids, ratings, explanations) from the same games', () => {
    const build = () => {
      const acc = createAccumulator(1, []);
      acc.add(first);
      return JSON.stringify(acc.generated);
    };
    const a = build();
    expect(a).toBe(build());
    expect(JSON.parse(a)).toHaveLength(first.puzzles.length);
  });
});
