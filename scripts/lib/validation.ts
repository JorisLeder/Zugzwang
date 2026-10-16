/**
 * Content validation framework (BACKLOG 2.8). Owned by WP-00 (frozen).
 *
 * A validator is a module `scripts/validate/<name>.ts` whose default export is
 * `async (ctx: ValidationContext) => ValidationReport`. The aggregator `scripts/validate-content.ts` discovers and
 * runs them. Engine results are cached in `.cache/validate/` (key = sha256(content + engine id + validator version)).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineService } from '@/core/engine';
import { createNodeEngineService, NODE_ENGINE_ID } from '@/lib/uci/node';

/** One problem found by a validator. Messages may be German (content authors) or English (developers). */
export interface ValidationIssue {
  /** File (repo-relative) and/or item id (puzzle id, lesson/step id). */
  file?: string;
  id?: string;
  message: string;
}

/** Result of one validator. */
export interface ValidationReport {
  /** Validator name (defaults to the file name). */
  name?: string;
  /** Number of items checked (puzzles, steps …). */
  checked: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Simple logger (prefixed, quiet in tests). */
export interface ValidationLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** JSON cache for expensive (engine) results. */
export interface ValidationCache {
  /** sha256(content + engine id + validator version). */
  key(content: string, validatorVersion: string): string;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  /** Returns the cached value or computes, stores and returns it. */
  getOrCompute<T>(key: string, compute: () => Promise<T>): Promise<T>;
}

/** Passed to every validator. */
export interface ValidationContext {
  /** Repository root. */
  rootDir: string;
  /** `--quick`: skip engine checks (structure/legality only). */
  quick: boolean;
  /** Shared Node Stockfish engine (lazy – created on first call). */
  engine(): Promise<EngineService>;
  /** Engine id used in cache keys. */
  engineId: string;
  cache: ValidationCache;
  log: ValidationLogger;
}

/** A validator module's default export. */
export type Validator = (ctx: ValidationContext) => Promise<ValidationReport>;

/** Creates a file-based cache in `dir` (one JSON file per key). */
export function createFileCache(dir: string, engineId: string): ValidationCache {
  mkdirSync(dir, { recursive: true });
  const file = (key: string) => join(dir, `${key}.json`);
  const cache: ValidationCache = {
    key: (content, validatorVersion) => createHash('sha256').update(`${content}\u0000${engineId}\u0000${validatorVersion}`).digest('hex'),
    get<T>(key: string) {
      try {
        return JSON.parse(readFileSync(file(key), 'utf8')) as T;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      writeFileSync(file(key), JSON.stringify(value));
    },
    async getOrCompute<T>(key: string, compute: () => Promise<T>) {
      const hit = cache.get<T>(key);
      if (hit !== undefined) return hit;
      const value = await compute();
      cache.set(key, value);
      return value;
    },
  };
  return cache;
}

/** Options of `createValidationContext`. */
export interface ValidationContextOptions {
  rootDir: string;
  quick?: boolean;
  cacheDir?: string;
  log?: ValidationLogger;
}

/** Creates a context with a lazy shared engine; call `dispose()` when all validators are done. */
export function createValidationContext(opts: ValidationContextOptions): ValidationContext & { dispose(): void } {
  let engine: EngineService | null = null;
  const log: ValidationLogger = opts.log ?? {
    info: (m) => console.log(m),
    warn: (m) => console.warn(m),
    error: (m) => console.error(m),
  };
  return {
    rootDir: opts.rootDir,
    quick: opts.quick ?? false,
    engineId: NODE_ENGINE_ID,
    async engine() {
      if (opts.quick) throw new Error('Engine checks are disabled with --quick');
      if (!engine) {
        engine = createNodeEngineService();
        await engine.init();
      }
      return engine;
    },
    cache: createFileCache(opts.cacheDir ?? join(opts.rootDir, '.cache', 'validate'), NODE_ENGINE_ID),
    log,
    dispose() {
      engine?.dispose();
      engine = null;
    },
  };
}

/** Outcome of running all validators. */
export interface ValidationRun {
  reports: Array<ValidationReport & { name: string; durationMs: number; crashed?: boolean }>;
  ok: boolean;
}

/** Runs validators in order; a crashing validator counts as one error. */
export async function runValidators(validators: Array<{ name: string; run: Validator }>, ctx: ValidationContext): Promise<ValidationRun> {
  const reports: ValidationRun['reports'] = [];
  for (const v of validators) {
    const t0 = Date.now();
    try {
      const r = await v.run(ctx);
      reports.push({ ...r, name: r.name ?? v.name, durationMs: Date.now() - t0 });
    } catch (e) {
      reports.push({
        name: v.name,
        checked: 0,
        errors: [{ message: `Validator crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}` }],
        warnings: [],
        durationMs: Date.now() - t0,
        crashed: true,
      });
    }
  }
  return { reports, ok: reports.every((r) => r.errors.length === 0) };
}

/** Formats the summary table and issue list. */
export function formatSummary(run: ValidationRun): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);
  lines.push(`${pad('validator', 24)} ${pad('checked', 8)} ${pad('errors', 7)} ${pad('warnings', 9)} time`);
  for (const r of run.reports) {
    lines.push(`${pad(r.name, 24)} ${pad(String(r.checked), 8)} ${pad(String(r.errors.length), 7)} ${pad(String(r.warnings.length), 9)} ${(r.durationMs / 1000).toFixed(1)}s`);
  }
  for (const r of run.reports) {
    for (const e of r.errors) lines.push(`ERROR   [${r.name}] ${[e.file, e.id].filter(Boolean).join(' ')}${e.file || e.id ? ': ' : ''}${e.message}`);
    for (const w of r.warnings) lines.push(`WARNING [${r.name}] ${[w.file, w.id].filter(Boolean).join(' ')}${w.file || w.id ? ': ' : ''}${w.message}`);
  }
  return lines.join('\n');
}
