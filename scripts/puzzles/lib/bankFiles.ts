/**
 * Writing the static puzzle bank (D-25): chunk files plus `manifest.json` in the format of
 * `puzzleBankManifestSchema` (`@/core/schemas`). Used by the seed build and the Lichess importer.
 *
 * The manifest version is derived from the chunk hashes, so it changes exactly when the content changes – the app
 * re-imports the bank into IndexedDB only then.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Puzzle, PuzzleBankManifest } from '@/core/puzzles';

/** File name of the manifest inside the bank directory. */
export const MANIFEST_FILE = 'manifest.json';

/** sha256 (hex) of a string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Serialises a chunk exactly as it is written to disk (the hash in the manifest covers these bytes). */
export function serializeChunk(puzzles: readonly Puzzle[], pretty = false): string {
  return `${JSON.stringify(puzzles, null, pretty ? 1 : undefined)}\n`;
}

/** One chunk to write. */
export interface BankChunk {
  file: string;
  source: Puzzle['source'];
  puzzles: Puzzle[];
}

/** Builds the manifest from chunk entries with known hashes; the version is derived from all hashes. */
export function manifestFromHashes(prefix: string, chunks: ReadonlyArray<PuzzleBankManifest['chunks'][number]>): PuzzleBankManifest {
  return {
    version: `${prefix}-${sha256Hex(chunks.map((c) => c.sha256).join(':')).slice(0, 12)}`,
    chunks: chunks.map((c) => ({ file: c.file, count: c.count, source: c.source, sha256: c.sha256 })),
  };
}

/** Builds the manifest for serialised chunks; `prefix` starts the version string (e.g. `seed`, `lichess`). */
export function buildManifest(prefix: string, chunks: Array<{ file: string; source: Puzzle['source']; count: number; text: string }>): PuzzleBankManifest {
  return manifestFromHashes(
    prefix,
    chunks.map((c) => ({ file: c.file, count: c.count, source: c.source, sha256: sha256Hex(c.text) })),
  );
}

/** Writes the chunks and the manifest to `dir` (created if needed). Returns the manifest. */
export function writeBank(dir: string, prefix: string, chunks: readonly BankChunk[], opts: { pretty?: boolean } = {}): PuzzleBankManifest {
  mkdirSync(dir, { recursive: true });
  const serialised = chunks.map((c) => ({ file: c.file, source: c.source, count: c.puzzles.length, text: serializeChunk(c.puzzles, opts.pretty) }));
  for (const c of serialised) writeFileSync(join(dir, c.file), c.text);
  const manifest = buildManifest(prefix, serialised);
  writeFileSync(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
