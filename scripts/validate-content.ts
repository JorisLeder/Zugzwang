/**
 * `npm run validate:content` – content validation aggregator (BACKLOG 2.8). Owned by WP-00 (frozen).
 *
 * Discovers every `scripts/validate/*.ts` module (except `*.test.ts`), runs its default export with a shared
 * `ValidationContext`, prints a summary and exits 1 if any validator reports an error.
 *
 * Flags: `--quick` (skip engine checks), `--only <name>` (run one validator), `--dir <path>` (validator directory,
 * default scripts/validate – used by tests).
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createValidationContext, formatSummary, runValidators, type Validator } from './lib/validation';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const quick = process.argv.includes('--quick');
  const only = arg('--only');
  const dir = resolve(arg('--dir') ?? join(rootDir, 'scripts', 'validate'));
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
        .filter((f) => !only || basename(f, '.ts') === only)
        .sort()
    : [];
  if (files.length === 0) {
    console.log('validate:content – no validators');
    return 0;
  }
  const validators: Array<{ name: string; run: Validator }> = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(dir, f)).href)) as { default?: Validator };
    if (typeof mod.default !== 'function') {
      console.error(`validate:content – ${f} has no default export function`);
      return 1;
    }
    validators.push({ name: basename(f, '.ts'), run: mod.default });
  }
  const ctx = createValidationContext({ rootDir, quick });
  console.log(`validate:content – ${validators.length} validator(s)${quick ? ' (quick: engine checks skipped)' : ''}`);
  try {
    const run = await runValidators(validators, ctx);
    console.log(formatSummary(run));
    console.log(run.ok ? 'validate:content – OK' : 'validate:content – FAILED');
    return run.ok ? 0 : 1;
  } finally {
    ctx.dispose();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
