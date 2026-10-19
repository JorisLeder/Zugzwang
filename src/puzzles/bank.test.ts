import { describe, expect, it, vi } from 'vitest';
import type { Puzzle, PuzzleBankManifest } from '@/core/puzzles';
import { createMemoryDataServices, FIXTURE_PUZZLES } from '@/core/testing';
import { loadPuzzleBank, PuzzleBankError } from './bank';

const SHA = 'a'.repeat(64);

function manifest(version: string, files: string[]): PuzzleBankManifest {
  return { version, chunks: files.map((file) => ({ file, count: 1, source: 'seed', sha256: SHA })) };
}

/** Fake fetch serving JSON by URL; `offline` makes every request fail like a network error. */
function fakeFetch(files: Record<string, unknown>) {
  const state = { offline: false };
  const fn = vi.fn(async (url: string | URL | Request) => {
    if (state.offline) throw new TypeError('Failed to fetch');
    const key = String(url);
    if (!(key in files)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(files[key]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { fn: fn as unknown as typeof fetch, calls: fn, state, files };
}

const [p1, p2, p3] = FIXTURE_PUZZLES as [Puzzle, Puzzle, Puzzle];

describe('loadPuzzleBank', () => {
  it('loads manifest and chunks into the repository once and skips an unchanged version', async () => {
    const data = createMemoryDataServices();
    const net = fakeFetch({
      '/app/data/puzzles/manifest.json': manifest('v1', ['a.json', 'b.json']),
      '/app/data/puzzles/a.json': [p1, p2],
      '/app/data/puzzles/b.json': [p3],
    });
    const first = await loadPuzzleBank(data.repos.puzzles, { baseUrl: '/app/', fetch: net.fn });
    expect(first).toEqual({ version: 'v1', count: 3, updated: true, offline: false });
    expect(await data.repos.puzzles.bankVersion()).toBe('v1');
    const again = await loadPuzzleBank(data.repos.puzzles, { baseUrl: '/app', fetch: net.fn });
    expect(again).toEqual({ version: 'v1', count: 3, updated: false, offline: false });
    expect(net.calls).toHaveBeenCalledTimes(4); // manifest, two chunks, manifest
  });

  it('re-imports when the manifest version changes (idempotent upsert)', async () => {
    const data = createMemoryDataServices();
    const net = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [p1] });
    await loadPuzzleBank(data.repos.puzzles, { fetch: net.fn });
    net.files['/data/puzzles/manifest.json'] = manifest('v2', ['a.json', 'b.json']);
    net.files['/data/puzzles/b.json'] = [p1, p2];
    const r = await loadPuzzleBank(data.repos.puzzles, { fetch: net.fn });
    expect(r).toMatchObject({ version: 'v2', count: 2, updated: true });
  });

  it('replaces the bank on a version change: removed puzzles disappear (PR-4)', async () => {
    const data = createMemoryDataServices();
    const repo = data.repos.puzzles;
    const net = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [p1, p2] });
    await loadPuzzleBank(repo, { fetch: net.fn });
    expect(await repo.count()).toBe(2);
    net.files['/data/puzzles/manifest.json'] = manifest('v2', ['a.json']);
    net.files['/data/puzzles/a.json'] = [p1];
    const r = await loadPuzzleBank(repo, { fetch: net.fn });
    expect(r).toMatchObject({ version: 'v2', count: 1, updated: true });
    expect(await repo.get(p2.id)).toBeNull();
    expect(await repo.get(p1.id)).not.toBeNull();
  });

  it('a failed chunk download of a new version keeps the old bank and version', async () => {
    const data = createMemoryDataServices();
    const repo = data.repos.puzzles;
    const net = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [p1, p2] });
    await loadPuzzleBank(repo, { fetch: net.fn });
    net.files['/data/puzzles/manifest.json'] = manifest('v2', ['a.json', 'missing.json']);
    net.files['/data/puzzles/a.json'] = [p1];
    await expect(loadPuzzleBank(repo, { fetch: net.fn })).rejects.toBeInstanceOf(PuzzleBankError);
    expect(await repo.bankVersion()).toBe('v1');
    expect(await repo.count()).toBe(2);
    expect(await repo.get(p2.id)).not.toBeNull();
  });

  it('works offline with a stored bank and fails clearly without one', async () => {
    const data = createMemoryDataServices();
    const net = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [p1] });
    await loadPuzzleBank(data.repos.puzzles, { fetch: net.fn });
    net.state.offline = true;
    expect(await loadPuzzleBank(data.repos.puzzles, { fetch: net.fn })).toEqual({ version: 'v1', count: 1, updated: false, offline: true });
    await expect(loadPuzzleBank(createMemoryDataServices().repos.puzzles, { fetch: net.fn })).rejects.toBeInstanceOf(PuzzleBankError);
  });

  it('rejects an invalid manifest or chunk without writing anything', async () => {
    const data = createMemoryDataServices();
    const badManifest = fakeFetch({ '/data/puzzles/manifest.json': { version: '' } });
    await expect(loadPuzzleBank(data.repos.puzzles, { fetch: badManifest.fn })).rejects.toThrow(/Invalid puzzle manifest/);
    const badChunk = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [{ id: 'x' }] });
    await expect(loadPuzzleBank(data.repos.puzzles, { fetch: badChunk.fn })).rejects.toThrow(/Invalid puzzle chunk a.json/);
    const missing = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']) });
    await expect(loadPuzzleBank(data.repos.puzzles, { fetch: missing.fn })).rejects.toThrow(/HTTP 404/);
    expect(await data.repos.puzzles.count()).toBe(0);
    expect(await data.repos.puzzles.bankVersion()).toBeNull();
  });

  it('shares one load between concurrent callers of the same repository', async () => {
    const data = createMemoryDataServices();
    const net = fakeFetch({ '/data/puzzles/manifest.json': manifest('v1', ['a.json']), '/data/puzzles/a.json': [p1] });
    const [a, b] = await Promise.all([loadPuzzleBank(data.repos.puzzles, { fetch: net.fn }), loadPuzzleBank(data.repos.puzzles, { fetch: net.fn })]);
    expect(a).toBe(b);
    expect(net.calls).toHaveBeenCalledTimes(2);
  });
});
