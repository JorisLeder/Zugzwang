/**
 * Review controller (P0-10, P0-11): loads a game by id (deep link `/analysis/:gameId`), its main line and a stored
 * analysis; starts `analysis.analyseGame` automatically when there is no current analysis (none stored, other engine
 * version or other moves), reports progress, can be cancelled, stores the result with `progress.saveAnalysis` and
 * reuses it on reopen. Every mistake, miss and blunder gets an explanation stored in the analysis: the rule-based text
 * at once, then – where the LLM path is available – the validated LLM text (cache key `${gameId}:${ply}`).
 *
 * A small external store (`subscribe`/`getState`) for `useSyncExternalStore`; `start()` may be called again after
 * `dispose()` (React StrictMode).
 */
import type { GameAnalysis } from '@/core/analysis';
import type { AnalysisProgress } from '@/core/analysis';
import type { Fen, MoveRecord } from '@/core/chess';
import { START_FEN } from '@/core/chess';
import type { Game } from '@/core/games';
import type { AppServices } from '@/core/services';
import { isAnalysisCurrent, loadGameLine } from './review';
import { STRINGS_DE } from './strings.de';

/** Loading state of the page. */
export type ReviewStatus = 'loading' | 'missing' | 'error' | 'ready';
/** State of the analysis run. */
export type RunState = 'idle' | 'running' | 'cancelled' | 'failed' | 'done';

/** Everything the review page shows. */
export interface ReviewState {
  status: ReviewStatus;
  game: Game | null;
  startFen: Fen;
  moves: MoveRecord[];
  analysis: GameAnalysis | null;
  run: RunState;
  progress: AnalysisProgress | null;
  errorDe: string | null;
}

/** Options of the controller. */
export interface ReviewControllerOptions {
  /** Cloud mode: how long to wait for a game that is not on this device yet (sync), before "nicht gefunden". */
  waitForGameMs?: number;
}

const INITIAL: ReviewState = {
  status: 'loading',
  game: null,
  startFen: START_FEN,
  moves: [],
  analysis: null,
  run: 'idle',
  progress: null,
  errorDe: null,
};

function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

/** Adds the rule-based explanation to every analysed move that has facts but no explanation yet. */
export function withRuleExplanations(analysis: GameAnalysis, explain: AppServices['explain']): GameAnalysis {
  let changed = false;
  const moves = analysis.moves.map((m) => {
    if (!m.facts || m.explanation) return m;
    changed = true;
    return { ...m, explanation: explain.explainRuleBased(m.facts) };
  });
  return changed ? { ...analysis, moves } : analysis;
}

/** The review controller (see the file header). */
export class ReviewController {
  private state: ReviewState = INITIAL;
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private analysisAbort: AbortController | null = null;
  private explainAbort: AbortController | null = null;
  private unsubscribeGame: (() => void) | null = null;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly services: AppServices,
    private readonly gameId: string,
    private readonly opts: ReviewControllerOptions = {},
  ) {}

  /** Store subscription (`useSyncExternalStore`). */
  readonly subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Current state (`useSyncExternalStore`). */
  readonly getState = (): ReviewState => this.state;

  /** Loads the game (and starts the analysis if needed). */
  start(): void {
    this.stopWork();
    this.generation += 1;
    this.state = INITIAL;
    void this.load(this.generation);
  }

  /** Stops everything (unmount). */
  dispose(): void {
    this.generation += 1;
    this.stopWork();
  }

  /** Starts (or restarts) the analysis of the loaded game. */
  analyse(): void {
    const { game, moves, startFen } = this.state;
    if (!game || moves.length === 0) return;
    this.analysisAbort?.abort();
    this.explainAbort?.abort();
    const ctrl = new AbortController();
    this.analysisAbort = ctrl;
    const gen = this.generation;
    this.set({ run: 'running', analysis: null, progress: { done: 0, total: moves.length + 1, phase: 'book' } });
    this.services.analysis
      .analyseGame(
        { gameId: game.id, startFen, moves: moves.map((m) => m.uci) },
        { signal: ctrl.signal, onProgress: (p) => gen === this.generation && !ctrl.signal.aborted && this.set({ progress: p }) },
      )
      .then(async (result) => {
        if (gen !== this.generation || ctrl.signal.aborted) return;
        const analysis = withRuleExplanations({ ...result, gameId: game.id }, this.services.explain);
        this.set({ analysis, run: 'done', progress: null });
        await this.save(analysis);
        void this.upgradeExplanations(gen);
      })
      .catch((e: unknown) => {
        if (gen !== this.generation) return;
        if (isAbort(e)) {
          this.set({ run: 'cancelled', progress: null });
        } else {
          console.warn('Game analysis failed', e);
          this.set({ run: 'failed', progress: null });
        }
      });
  }

  /** "Abbrechen" of a running analysis. */
  cancel(): void {
    this.analysisAbort?.abort();
  }

  // ------------------------------------------------------------------------------------------------------- internal

  private set(patch: Partial<ReviewState>): void {
    this.state = { ...this.state, ...patch };
    for (const cb of [...this.listeners]) cb();
  }

  private stopWork(): void {
    this.analysisAbort?.abort();
    this.explainAbort?.abort();
    this.analysisAbort = null;
    this.explainAbort = null;
    this.unsubscribeGame?.();
    this.unsubscribeGame = null;
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = null;
  }

  private async load(gen: number): Promise<void> {
    const { data, config } = this.services;
    let game: Game | null;
    try {
      game = await data.repos.games.get(this.gameId);
    } catch (e) {
      console.warn('Loading the game failed', e);
      if (gen === this.generation) this.set({ status: 'error', errorDe: STRINGS_DE.loadError });
      return;
    }
    if (gen !== this.generation) return;
    if (game) {
      await this.loadGame(game, gen);
      return;
    }
    // Not on this device (yet): in cloud mode the row may still arrive by sync; keep observing in both modes.
    const wait = config.mode === 'cloud' ? (this.opts.waitForGameMs ?? 10_000) : 0;
    this.set({ status: wait > 0 ? 'loading' : 'missing' });
    if (wait > 0) {
      this.waitTimer = setTimeout(() => {
        if (gen === this.generation && this.state.status === 'loading') this.set({ status: 'missing' });
      }, wait);
    }
    let unsubscribed = false;
    const unsubscribe = data.repos.games.observe(this.gameId).subscribe((g) => {
      if (!g || gen !== this.generation || this.state.game) return;
      unsubscribed = true;
      queueMicrotask(() => unsubscribe());
      void this.loadGame(g, gen);
    });
    this.unsubscribeGame = () => {
      if (!unsubscribed) unsubscribe();
    };
  }

  private async loadGame(game: Game, gen: number): Promise<void> {
    const { repos } = this.services.data;
    try {
      const events = await repos.gameMoves.list(game.id);
      if (gen !== this.generation) return;
      const line = loadGameLine(game, events);
      if (!line.ok) {
        this.set({ status: 'error', game, errorDe: line.errorDe });
        return;
      }
      const stored = await repos.gameAnalyses.get(game.id);
      if (gen !== this.generation) return;
      const uci = line.moves.map((m) => m.uci);
      const current = stored && isAnalysisCurrent(stored, this.services.engines.analysis.id, uci) ? stored : null;
      this.set({ status: 'ready', game, startFen: line.startFen, moves: line.moves, analysis: current, run: current ? 'done' : 'idle', errorDe: null });
      if (current) {
        const completed = withRuleExplanations(current, this.services.explain);
        if (completed !== current) {
          this.set({ analysis: completed });
          await this.save(completed);
        }
        void this.upgradeExplanations(gen);
      } else if (line.moves.length > 0) {
        this.analyse();
      }
    } catch (e) {
      console.warn('Loading the game failed', e);
      if (gen === this.generation) this.set({ status: 'error', game, errorDe: STRINGS_DE.loadError });
    }
  }

  private async save(analysis: GameAnalysis): Promise<void> {
    try {
      await this.services.data.progress.saveAnalysis(analysis);
    } catch (e) {
      console.warn('Saving the analysis failed', e);
    }
  }

  /** Replaces rule-based explanations by validated LLM texts where the service provides them (one at a time). */
  private async upgradeExplanations(gen: number): Promise<void> {
    const analysis = this.state.analysis;
    const game = this.state.game;
    if (!analysis || !game) return;
    this.explainAbort?.abort();
    const ctrl = new AbortController();
    this.explainAbort = ctrl;
    for (const m of analysis.moves) {
      if (!m.facts || m.explanation?.source === 'llm') continue;
      let text;
      try {
        text = await this.services.explain.explain(m.facts, { cacheKey: `${game.id}:${m.ply}`, signal: ctrl.signal });
      } catch {
        if (ctrl.signal.aborted) return;
        continue;
      }
      if (gen !== this.generation || ctrl.signal.aborted) return;
      if (text.source !== 'llm') continue;
      const latest = this.state.analysis;
      if (!latest) return;
      const next: GameAnalysis = { ...latest, moves: latest.moves.map((x) => (x.ply === m.ply ? { ...x, explanation: text } : x)) };
      this.set({ analysis: next });
      await this.save(next);
    }
  }
}
