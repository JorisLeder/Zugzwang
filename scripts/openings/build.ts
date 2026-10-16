/**
 * `npm run openings:build` – builds `src/analysis/openings/openings.json` from lichess-org/chess-openings (CC0-1.0).
 * Owned by WP-02.
 *
 * Downloads `a.tsv` … `e.tsv` (columns `eco`, `name`, `pgn`) from GitHub raw at a pinned commit, replays every line
 * with `@/lib/chess` (chess.js – a line with an illegal move aborts the build) and writes one entry per position:
 * `[epd, eco, name]`, where `epd` is the position key (placement, side to move, castling, e.p. square only when an
 * e.p. capture is legal – the same convention as the data set's `epd` column).
 *
 * - The final position of every line is a **named** position (several lines with the same position: the shortest line
 *   wins, then file order).
 * - Every intermediate position of a line is a **book** position too and gets the name of the deepest named position
 *   before it on that line (the way Lichess names a game: walk back to the last named position); without one, the
 *   line's own name. Between several lines the deepest named ancestor wins.
 *
 * Flags: `--ref <commit|branch>` (default: the pinned commit below), `--from <dir>` (read the TSV files from a local
 * directory instead of downloading), `--out <file>` (default `src/analysis/openings/openings.json`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_FEN } from '@/core/chess';
import { ChessGame, positionKey } from '@/lib/chess';

/** Source repository and the commit the committed JSON was built from. */
export const OPENINGS_REPO = 'lichess-org/chess-openings';
export const OPENINGS_DEFAULT_REF = 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a';
export const OPENINGS_FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'] as const;

/** One opening line of the TSV files. */
export interface OpeningLine {
  eco: string;
  name: string;
  pgn: string;
  /** `file:line` for error messages. */
  origin: string;
}

/** Shape of `openings.json`. */
export interface OpeningBookFile {
  source: string;
  commit: string;
  license: string;
  files: string[];
  /** Number of opening lines replayed. */
  lines: number;
  /** Number of named positions (final positions of lines). */
  named: number;
  /** `[epd, eco, name]`, sorted by epd. */
  entries: Array<[string, string, string]>;
}

/** Parses one TSV file (header `eco\tname\tpgn`). */
export function parseOpeningsTsv(text: string, file: string): OpeningLine[] {
  const rows = text.split(/\r?\n/);
  const header = rows[0]?.split('\t') ?? [];
  const col = (name: string) => header.indexOf(name);
  const [ieco, iname, ipgn] = [col('eco'), col('name'), col('pgn')];
  if (ieco < 0 || iname < 0 || ipgn < 0) throw new Error(`${file}: unexpected header "${rows[0] ?? ''}"`);
  const out: OpeningLine[] = [];
  rows.slice(1).forEach((row, i) => {
    if (!row.trim()) return;
    const cells = row.split('\t');
    out.push({ eco: cells[ieco]!.trim(), name: cells[iname]!.trim(), pgn: cells[ipgn]!.trim(), origin: `${file}:${i + 2}` });
  });
  return out;
}

/** SAN moves of a PGN move text (`1. e4 e5 2. Nf3`). */
export function pgnMoves(pgn: string): string[] {
  return pgn
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^\d+\.(\.\.)?/, ''))
    .filter((t) => t !== '' && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

/** Position keys after every ply of a line (throws on an illegal move). */
export function replayLine(line: OpeningLine): string[] {
  const game = ChessGame.fromFen(START_FEN);
  return pgnMoves(line.pgn).map((san) => {
    const rec = game.move(san);
    if (!rec) throw new Error(`${line.origin}: illegal move "${san}" in "${line.pgn}" (${line.name})`);
    return positionKey(rec.fenAfter);
  });
}

interface Named {
  eco: string;
  name: string;
  plies: number;
}

/** Builds the book from parsed lines (pure; used by the CLI and the tests). */
export function buildOpeningBook(lines: OpeningLine[], meta: { commit: string; files: string[] }): OpeningBookFile {
  const replayed = lines.map((line) => ({ line, keys: replayLine(line) }));
  const named = new Map<string, Named>();
  for (const { line, keys } of replayed) {
    const key = keys[keys.length - 1];
    if (!key) continue;
    const existing = named.get(key);
    if (!existing || keys.length < existing.plies) named.set(key, { eco: line.eco, name: line.name, plies: keys.length });
  }
  const book = new Map<string, { eco: string; name: string; depth: number }>();
  for (const [key, n] of named) book.set(key, { eco: n.eco, name: n.name, depth: Number.POSITIVE_INFINITY });
  for (const { line, keys } of replayed) {
    let ancestor: { eco: string; name: string; depth: number } | null = null;
    keys.forEach((key, ply) => {
      const n = named.get(key);
      if (n) {
        ancestor = { eco: n.eco, name: n.name, depth: ply };
        return;
      }
      const candidate = ancestor ?? { eco: line.eco, name: line.name, depth: -1 };
      const existing = book.get(key);
      if (!existing || candidate.depth > existing.depth) book.set(key, candidate);
    });
  }
  const entries = [...book.entries()]
    .map(([epd, v]): [string, string, string] => [epd, v.eco, v.name])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    source: `https://github.com/${OPENINGS_REPO}`,
    commit: meta.commit,
    license: 'CC0-1.0',
    files: meta.files,
    lines: lines.length,
    named: named.size,
    entries,
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readSource(file: string, ref: string, fromDir: string | undefined): Promise<string> {
  if (fromDir) return readFileSync(join(fromDir, file), 'utf8');
  const url = `https://raw.githubusercontent.com/${OPENINGS_REPO}/${ref}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ref = arg('--ref') ?? OPENINGS_DEFAULT_REF;
  const fromDir = arg('--from');
  const out = resolve(arg('--out') ?? join(rootDir, 'src', 'analysis', 'openings', 'openings.json'));
  const lines: OpeningLine[] = [];
  for (const file of OPENINGS_FILES) lines.push(...parseOpeningsTsv(await readSource(file, ref, fromDir), file));
  const book = buildOpeningBook(lines, { commit: ref, files: [...OPENINGS_FILES] });
  mkdirSync(dirname(out), { recursive: true });
  // One entry per line keeps diffs readable.
  const { entries, ...head } = book;
  const json = `${JSON.stringify(head, null, 2).replace(/\n}$/, '')},\n  "entries": [\n${entries
    .map((e) => `    ${JSON.stringify(e)}`)
    .join(',\n')}\n  ]\n}\n`;
  writeFileSync(out, json);
  console.log(
    `openings:build – ${book.lines} lines from ${OPENINGS_REPO}@${ref}: ${book.named} named positions, ` +
      `${book.entries.length} book positions → ${out}`,
  );
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e: unknown) => {
    console.error(`openings:build failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
