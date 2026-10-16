import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Puzzle } from '@/core/puzzles';
import { FakeEngineService, FIXTURE_PUZZLES } from '@/core/testing';
import { ChessGame } from '@/lib/chess';
import { createValidationContext, type ValidationCache, type ValidationContext } from '../lib/validation';
import { writeBank } from '../puzzles/lib/bankFiles';
import validatePuzzles, { readBank, validatePuzzleGroups } from './puzzles';

const repoRoot = resolve(__dirname, '../..');
const silent = { info: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'zz-puzzles-'));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function memoryCache(): ValidationCache {
  const m = new Map<string, unknown>();
  const cache: ValidationCache = {
    key: (content, version) => `${version}:${content}`,
    get: <T>(k: string) => m.get(k) as T | undefined,
    set: (k, v) => void m.set(k, v),
    getOrCompute: async <T>(k: string, compute: () => Promise<T>) => {
      if (!m.has(k)) m.set(k, await compute());
      return m.get(k) as T;
    },
  };
  return cache;
}

function fakeContext(engine: FakeEngineService, quick = false): ValidationContext {
  return { rootDir: tempDir(), quick, engine: async () => engine, engineId: 'fake', cache: memoryCache(), log: silent };
}

const fork = (): Puzzle => structuredClone(FIXTURE_PUZZLES.find((p) => p.id === 'fixture-knight-fork')!);

describe('readBank', () => {
  it('reads the chunks of the manifest and checks hash, count and source', () => {
    const root = tempDir();
    const dir = join(root, 'public/data/puzzles');
    writeBank(dir, 'seed', [{ file: 'seed.json', source: 'seed', puzzles: FIXTURE_PUZZLES }]);
    const ok = readBank(root);
    expect(ok.errors).toEqual([]);
    expect(ok.groups[0]!.items).toHaveLength(5);

    writeFileSync(join(dir, 'seed.json'), JSON.stringify(FIXTURE_PUZZLES.slice(0, 4)));
    const messages = readBank(root).errors.map((e) => e.message).join('\n');
    expect(messages).toMatch(/sha256/);
    expect(messages).toMatch(/Manifest nennt 5 Puzzles, die Datei hat 4/);
  });

  it('reports a missing manifest or chunk and a wrong source', () => {
    expect(readBank(tempDir()).errors[0]!.message).toMatch(/Manifest fehlt/);
    const root = tempDir();
    const dir = join(root, 'public/data/puzzles');
    writeBank(dir, 'seed', [{ file: 'lichess.json', source: 'lichess', puzzles: FIXTURE_PUZZLES }]);
    expect(readBank(root).errors.map((e) => e.message).join()).toMatch(/Quelle „seed“ passt nicht/);
    rmSync(join(dir, 'lichess.json'));
    expect(readBank(root).errors[0]!.message).toMatch(/fehlt/);
  });
});

describe('validatePuzzleGroups', () => {
  it('reports structural errors and duplicate ids without the engine in quick mode', async () => {
    const engine = new FakeEngineService();
    const broken = { ...fork(), id: 'broken', moves: ['c7c6', 'd5d7'] };
    const r = await validatePuzzleGroups([{ file: 'a.json', items: [fork(), fork(), broken] }], fakeContext(engine, true));
    expect(r.checked).toBe(3);
    expect(r.errors.map((e) => e.message).join('\n')).toMatch(/Doppelte Puzzle-ID/);
    expect(r.errors.find((e) => e.id === 'broken')!.message).toMatch(/nicht legal/);
    expect(engine.calls).toHaveLength(0);
  });

  it('runs the engine checks once per line (cached) and reports a non-unique solution', async () => {
    const p = fork();
    const before = (ply: number) => ChessGame.fromMoves(p.fen, p.moves.slice(0, ply)).fen();
    const engine = new FakeEngineService({
      lines: {
        [before(1)]: [
          { multipv: 1, depth: 18, score: { type: 'cp', value: 900 }, pv: ['d5e7'] },
          { multipv: 2, depth: 18, score: { type: 'cp', value: 850 }, pv: ['e1e8'] },
        ],
      },
    });
    const ctx = fakeContext(engine);
    const first = await validatePuzzleGroups([{ file: 'a.json', items: [p] }], ctx);
    expect(first.errors[0]).toMatchObject({ file: 'a.json', id: p.id });
    expect(first.errors[0]!.message).toMatch(/nicht eindeutig/);
    const calls = engine.calls.length;
    await validatePuzzleGroups([{ file: 'a.json', items: [{ ...p, explanation: undefined, source: 'lichess' }] }], ctx);
    expect(engine.calls.length).toBe(calls); // explanation changes do not invalidate the engine cache
  });
});

describe('validatePuzzles (repository content, quick)', () => {
  it('finds the seed bank, the demo puzzles and the fixtures without structural errors', async () => {
    const ctx = createValidationContext({ rootDir: repoRoot, quick: true, cacheDir: tempDir(), log: silent });
    try {
      const report = await validatePuzzles(ctx);
      expect(report.errors).toEqual([]);
      expect(report.checked).toBeGreaterThanOrEqual(40 + 5 + 5);
    } finally {
      ctx.dispose();
    }
  });
});
