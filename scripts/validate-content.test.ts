/**
 * Tests of the validation aggregator (BACKLOG 2.8): zero validators → exit 0; a validator reporting an error →
 * exit 1; `--quick` disables the engine; the cache computes once.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFileCache, createValidationContext, runValidators } from './lib/validation';

const root = resolve(__dirname, '..');
const base = join(root, '.cache', 'test-validators', String(process.pid));
const tsx = join(root, 'node_modules', '.bin', 'tsx');

function makeDir(name: string, files: Record<string, string>): string {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  for (const [f, content] of Object.entries(files)) writeFileSync(join(dir, f), content);
  return dir;
}

function run(dir: string, extra: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync(tsx, ['scripts/validate-content.ts', '--dir', dir, ...extra], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('validate-content aggregator', () => {
  it('exits 0 with zero validators', () => {
    const r = run(makeDir('empty', {}));
    expect(r.code).toBe(0);
    expect(r.out).toContain('no validators');
  });

  it('exits 1 when a validator reports an error', () => {
    const dir = makeDir('failing', {
      'dummy.ts': "export default async () => ({ checked: 1, errors: [{ id: 'x', message: 'kaputt' }], warnings: [] });\n",
      'fine.ts': 'export default async () => ({ checked: 2, errors: [], warnings: [] });\n',
      'helper.test.ts': 'throw new Error("test files are not validators");\n',
    });
    const r = run(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('ERROR   [dummy] x: kaputt');
    expect(r.out).toMatch(/fine\s+2\s+0/);
  });

  it('exits 0 when all validators pass; --quick disables the engine', () => {
    const dir = makeDir('quick', {
      'quick.ts':
        "export default async (ctx) => { let blocked = false; try { await ctx.engine(); } catch { blocked = true; } return { checked: 1, errors: ctx.quick && blocked ? [] : [{ message: 'engine not blocked' }], warnings: [] }; };\n",
    });
    expect(run(dir, ['--quick']).code).toBe(0);
  });

  it('counts a crashing validator as an error', async () => {
    const ctx = createValidationContext({ rootDir: root, quick: true, cacheDir: join(base, 'cache-crash') });
    const res = await runValidators([{ name: 'boom', run: async () => { throw new Error('boom'); } }], ctx);
    ctx.dispose();
    expect(res.ok).toBe(false);
    expect(res.reports[0]!.errors[0]!.message).toContain('boom');
  });

  it('caches results by content, engine id and validator version', async () => {
    const cache = createFileCache(join(base, 'cache'), 'engine-a');
    const k1 = cache.key('content', 'v1');
    expect(cache.key('content', 'v1')).toBe(k1);
    expect(cache.key('content', 'v2')).not.toBe(k1);
    expect(createFileCache(join(base, 'cache'), 'engine-b').key('content', 'v1')).not.toBe(k1);
    let calls = 0;
    const compute = async () => {
      calls += 1;
      return { best: 'e2e4' };
    };
    expect(await cache.getOrCompute(k1, compute)).toEqual({ best: 'e2e4' });
    expect(await cache.getOrCompute(k1, compute)).toEqual({ best: 'e2e4' });
    expect(calls).toBe(1);
  });
});
