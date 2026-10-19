/**
 * Puzzle bank loading (D-25): `public/data/puzzles/manifest.json` lists chunk files in Lichess format. The bank is
 * written to the local puzzle repository (IndexedDB in the real data layer) on first start and whenever the manifest
 * version changes; afterwards puzzles work offline.
 *
 * Loading is idempotent and concurrent calls for the same repository share one load. Without network the stored bank
 * is used (`offline: true`); without network and without a stored bank a `PuzzleBankError` is thrown.
 */
import type { Puzzle, PuzzleBankManifest } from '@/core/puzzles';
import { puzzleBankManifestSchema, puzzleChunkSchema } from '@/core/schemas';
import type { PuzzleRepository } from '@/core/storage';

/** Folder of the bank below the app's base URL. */
export const PUZZLE_BANK_DIR = 'data/puzzles/';

/** Name of the manifest file inside `PUZZLE_BANK_DIR`. */
export const PUZZLE_BANK_MANIFEST = 'manifest.json';

/** Result of `loadPuzzleBank`. */
export interface PuzzleBankStatus {
  /** Manifest version of the stored bank. */
  version: string;
  /** Number of puzzles in the repository. */
  count: number;
  /** The bank was (re)written in this call. */
  updated: boolean;
  /** The manifest could not be fetched (offline) or read; the stored bank is used. */
  offline: boolean;
}

/** The bank could not be loaded (no network and nothing stored, or invalid files). */
export class PuzzleBankError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'PuzzleBankError';
  }
}

/** Options of `loadPuzzleBank`. */
export interface LoadPuzzleBankOptions {
  /** App base URL (`import.meta.env.BASE_URL`, default `/`). */
  baseUrl?: string;
  /** Fetch implementation (tests). */
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

const inFlight = new WeakMap<PuzzleRepository, Promise<PuzzleBankStatus>>();

function bankUrl(baseUrl: string, file: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${PUZZLE_BANK_DIR}${file}`;
}

async function fetchJson(doFetch: typeof fetch, url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await doFetch(url, { signal, cache: 'no-cache' });
  if (!res.ok) throw new PuzzleBankError(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Parses and validates the manifest (zod). */
export function parseManifest(raw: unknown): PuzzleBankManifest {
  const r = puzzleBankManifestSchema.safeParse(raw);
  if (!r.success) throw new PuzzleBankError(`Invalid puzzle manifest: ${r.error.message}`);
  return r.data;
}

/** Parses and validates one chunk file (zod). */
export function parseChunk(raw: unknown, file: string): Puzzle[] {
  const r = puzzleChunkSchema.safeParse(raw);
  if (!r.success) throw new PuzzleBankError(`Invalid puzzle chunk ${file}: ${r.error.message}`);
  return r.data;
}

async function load(repo: PuzzleRepository, opts: LoadPuzzleBankOptions): Promise<PuzzleBankStatus> {
  const doFetch = opts.fetch ?? fetch;
  const baseUrl = opts.baseUrl ?? '/';
  const stored = await repo.bankVersion();
  let manifest: PuzzleBankManifest;
  try {
    manifest = parseManifest(await fetchJson(doFetch, bankUrl(baseUrl, PUZZLE_BANK_MANIFEST), opts.signal));
  } catch (e) {
    if (stored !== null) return { version: stored, count: await repo.count(), updated: false, offline: true };
    throw e instanceof PuzzleBankError ? e : new PuzzleBankError('Puzzle bank unavailable', e);
  }
  if (stored === manifest.version && (await repo.count()) > 0) {
    return { version: stored, count: await repo.count(), updated: false, offline: false };
  }
  const chunks = await Promise.all(
    manifest.chunks.map(async (c) => parseChunk(await fetchJson(doFetch, bankUrl(baseUrl, c.file), opts.signal), c.file)),
  );
  // All chunks of the new version are loaded: replace (not merge) so puzzles removed from the bank disappear. A failed
  // chunk download throws above and leaves the old bank and its version untouched.
  await repo.replaceAll(chunks.flat());
  await repo.setBankVersion(manifest.version);
  return { version: manifest.version, count: await repo.count(), updated: true, offline: false };
}

/**
 * Loads the bank into `repo` if the stored version differs from the manifest (idempotent; concurrent calls share
 * one load). See the file header for offline behaviour.
 */
export function loadPuzzleBank(repo: PuzzleRepository, opts: LoadPuzzleBankOptions = {}): Promise<PuzzleBankStatus> {
  const running = inFlight.get(repo);
  if (running) return running;
  const p = load(repo, opts).finally(() => inFlight.delete(repo));
  inFlight.set(repo, p);
  return p;
}
