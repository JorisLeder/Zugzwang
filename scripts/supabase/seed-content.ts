/**
 * `npm run supabase:seed-content [-- --out <file>] [--no-verify]`
 *
 * Writes the static content seed (bots, courses, lessons, lesson steps, puzzle bank + demo puzzles) as idempotent SQL
 * to `supabase/seed.sql` and test-applies it to the real migrations in PGlite. Apply it to a Supabase project with
 * `npx supabase db push --include-seed` (README, "Cloud-Sync einrichten (Supabase)"). Details: `seedContent.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadStaticContent, SEED_ORDER, SEED_SQL_FILE, seedSql, verifySeed } from './seedContent';
import { ROOT_DIR } from './testDb';

const USAGE = `Usage: npm run supabase:seed-content [-- options]

Options:
  --out <file>   output file (default ${SEED_SQL_FILE})
  --no-verify    skip the test run of the seed against the migrations (PGlite)
  --help         show this help`;

async function main(): Promise<void> {
  let values: { out?: string; 'no-verify'?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: { out: { type: 'string' }, 'no-verify': { type: 'boolean' }, help: { type: 'boolean' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const started = Date.now();
  const content = loadStaticContent(ROOT_DIR);
  if (content.errors.length > 0) {
    console.error(`Seed not written – ${content.errors.length} content error(s):`);
    for (const e of content.errors.slice(0, 50)) console.error(`  ${e}`);
    if (content.errors.length > 50) console.error(`  … and ${content.errors.length - 50} more`);
    process.exitCode = 1;
    return;
  }
  const sql = seedSql(content);
  const out = resolve(ROOT_DIR, values.out ?? SEED_SQL_FILE);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql);
  console.log(`seed:     ${relative(ROOT_DIR, out)} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KiB, puzzle bank ${content.bankVersion})`);
  console.log(`rows:     ${SEED_ORDER.map((t) => `${t} ${content.rows[t].length}`).join(', ')} (puzzles incl. ${content.demoPuzzles} demo)`);

  if (!values['no-verify']) {
    try {
      const counts = await verifySeed(sql, content.rows);
      console.log(`verified: migrations + seed applied twice in PGlite, every row read back unchanged; anon sees ${counts.anonPuzzles} demo puzzles`);
    } catch (e) {
      console.error(`Verification failed: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`time:     ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
