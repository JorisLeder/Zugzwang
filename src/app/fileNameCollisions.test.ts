/**
 * Windows and macOS file systems are case-insensitive. Two files in one folder whose names differ only in case
 * (e.g. `EvalBar.tsx` and `evalBar.ts`) make an extensionless import like `./EvalBar` resolve to the wrong file there,
 * while Linux CI stays green. This test fails as soon as such a pair exists.
 */
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const SCAN = ['src', 'scripts', 'e2e', 'content', 'supabase'];
const SKIP = new Set(['node_modules', '.git', 'dist', '.build', '.cache']);

/** Module name an extensionless import would use: `EvalBar.test.tsx` -> `evalbar.test`, `EvalBar.tsx` -> `evalbar`. */
function importStem(file: string): string {
  return file.replace(/\.(d\.ts|[cm]?[jt]sx?|json)$/i, '').toLowerCase();
}

function collisions(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const byStem = new Map<string, Set<string>>();
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    if (e.isDirectory()) {
      collisions(join(dir, e.name), out);
      continue;
    }
    const stem = importStem(e.name);
    const exact = e.name.replace(/\.(d\.ts|[cm]?[jt]sx?|json)$/i, '');
    const set = byStem.get(stem) ?? new Set<string>();
    set.add(exact);
    byStem.set(stem, set);
  }
  for (const [, names] of byStem) {
    if (names.size > 1) out.push(`${dir.slice(ROOT.length + 1)}: ${[...names].join(' / ')}`);
  }
}

describe('file names', () => {
  it('has no two modules in one folder whose names differ only in case', () => {
    const found: string[] = [];
    for (const d of SCAN) collisions(join(ROOT, d), found);
    expect(found).toEqual([]);
  });
});
