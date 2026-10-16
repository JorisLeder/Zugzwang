/**
 * `GameController` – framework-free controller of one bot game (P0-07, P0-08, P0-09, D-04, D-36, D-41).
 * The React hook `useGameController` wraps it; unit tests drive it directly with fakes.
 *
 * - **Persistence/resume (P0-09):** the position is always the fold of the event log (`movesFromEvents`) replayed with
 *   `ChessGame.fromMoves` from the game's start FEN (repetition history kept). Every move and takeback is appended as
 *   an event right away (in order, one write chain).
 * - **Turns:** after every position change `continuePlay()` ends the game (`ChessGame.status()` only – never
 *   chess.js `isGameOver`), offers a draw claim, lets the bot move (repertoire/engine via `BotEngine`, artificial
 *   think time, abortable) or starts the user's turn (coach `prepare`, threat check, eval bar).
 * - **Assistance levels:** Wettkampf = no help, rated by `progress.finishGame`; Training = takeback (own move + bot
 *   reply), hints (stage 1 piece, stage 2 best-move arrow), eval bar; Coach = Training + warning before a move that
 *   loses ≥ 0.20 expected points (the move is held at most `coachHoldMs`, then played without warning), threats after
 *   the bot's moves, praise for best/great/brilliant moves (at most once every 3 own moves).
 * - **Draw claims (RULES §5.2):** the user may claim on their turn, and right after the move that made the claim
 *   possible (the bot waits). The bot claims on its turn when `shouldClaimDraw` says so (own eval ≤ 0).
 * - **Two devices (P0-02):** heartbeat every 10 s while this device plays. A fresh heartbeat of another device opens
 *   the takeover question; when another device takes over, this one becomes read-only and mirrors the moves.
 */
import { CLASSIFICATION_META, type MoveAssessment, type MoveClassification } from '@/core/analysis';
import type { BotProfile } from '@/core/bots';
import type { Arrow, Color, DrawClaim, Fen, GameEndReason, GameResult, GameStatus, MoveInput, MoveRecord, San, Square, Uci } from '@/core/chess';
import type { Score } from '@/core/engine';
import type { ExplanationText } from '@/core/explain';
import { movesFromEvents, type Game, type GameMoveEvent } from '@/core/games';
import type { RatingRecord } from '@/core/rating';
import type { AppServices } from '@/core/services';
import { chatLine, endChatEvent } from '@/bots';
import { ChessGame, parseUci } from '@/lib/chess';
import { createValueStore, type ValueStore } from '@/lib/observable';
import { HEARTBEAT_MS, isAnotherDeviceActive, takebackPlies, type Claimant } from './logic';
import { STRINGS_DE } from './strings.de';

/** A coach warning appears before moves that lose at least this many expected points (P0-08, D-07). */
export const COACH_WARNING_LOSS = 0.2;
/** The move is held at most this long while the coach checks it (DESIGN §8.2, D-41). */
export const COACH_HOLD_MS = 800;
/** Hold time in e2e runs (cold engines on a shared CI machine; the UX budget is measured separately by WP-12). */
export const COACH_HOLD_MS_E2E = 5000;
/** Praise at most once every N own moves (DESIGN §8.2). */
export const PRAISE_EVERY = 3;
/** Classifications that earn praise in Coach mode. */
export const PRAISED: readonly MoveClassification[] = ['brilliant', 'great', 'best'];
/** Eval bar search (Training/Coach) on the `play` engine. */
export const EVAL_SEARCH = { depth: 12, movetimeMs: 400 } as const;
/** Hint search on the `play` engine. */
export const HINT_SEARCH = { depth: 14, movetimeMs: 800 } as const;

/** Lifecycle of the screen. */
export type GamePhase = 'loading' | 'missing' | 'error' | 'active' | 'finished';

/** One coach bubble (newest first in `notes`). */
export interface CoachNote {
  id: number;
  tone: 'neutral' | 'praise' | 'warning';
  /** Short German lead ("Achtung:", "Starker Zug!"). */
  lead: string;
  /** Explanation (segments with moves in English SAN), or `null` for plain text notes. */
  explanation: ExplanationText | null;
  /** Plain German text when there is no explanation. */
  text?: string;
}

/** The coach warning that holds a move (P0-08). */
export interface PendingWarning {
  uci: Uci;
  san: San;
  from: Square;
  to: Square;
  explanation: ExplanationText;
  /** The opponent's refutation, drawn as a threat arrow. */
  refutation: { from: Square; to: Square } | null;
  assessment: MoveAssessment;
}

/** Final result shown in the result dialog. */
export interface GameOutcome {
  result: GameResult;
  reason: GameEndReason;
  claimant?: Claimant;
  rating: RatingRecord | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

/** Everything the game screen renders. */
export interface GameView {
  phase: GamePhase;
  /** Fatal load error (German). */
  error: string | null;
  /** Retryable error of a bot move or a save (German). */
  actionError: string | null;
  game: Game | null;
  bot: BotProfile | null;
  userColor: Color;
  startFen: Fen;
  history: MoveRecord[];
  fen: Fen;
  status: GameStatus;
  botThinking: boolean;
  /** Move waiting for the user's confirmation (`settings.moveConfirmation`). */
  confirm: { uci: Uci; san: San } | null;
  warning: PendingWarning | null;
  /** Draw claim the user may make right after their own move (the bot waits). */
  ownClaim: DrawClaim[] | null;
  evaluation: Score | null;
  hint: { stage: 0 | 1 | 2; move: Uci | null; loading: boolean; failed: boolean };
  threat: { from: Square; to: Square } | null;
  notes: CoachNote[];
  /** Praise badge for the user's last move while it is the last move. */
  praise: { ply: number; square: Square; classification: MoveClassification } | null;
  botChat: string | null;
  readOnly: boolean;
  takeoverPrompt: boolean;
  takenOver: boolean;
  outcome: GameOutcome | null;
  /** The analysis engine is loaded (Coach mode can check moves). */
  coachReady: boolean;
}

/** Dependencies of the controller. */
export interface GameControllerDeps {
  services: AppServices;
  gameId: string;
  /** Current move-confirmation setting. */
  moveConfirmation: () => boolean;
  /** Called after every bot move (sounds). */
  onBotMove?: (move: MoveRecord) => void;
  now?: () => Date;
  random?: () => number;
  /** Coach hold time (default `COACH_HOLD_MS`, `COACH_HOLD_MS_E2E` when `config.e2e`). */
  coachHoldMs?: number;
  heartbeatMs?: number;
}

const START_STATUS: GameStatus = { isOver: false, result: '*', reason: null, turn: 'w', inCheck: false, claimableDraws: [] };

function initialView(): GameView {
  return {
    phase: 'loading',
    error: null,
    actionError: null,
    game: null,
    bot: null,
    userColor: 'w',
    startFen: '',
    history: [],
    fen: '',
    status: START_STATUS,
    botThinking: false,
    confirm: null,
    warning: null,
    ownClaim: null,
    evaluation: null,
    hint: { stage: 0, move: null, loading: false, failed: false },
    threat: null,
    notes: [],
    praise: null,
    botChat: null,
    readOnly: false,
    takeoverPrompt: false,
    takenOver: false,
    outcome: null,
    coachReady: false,
  };
}

const NO_HINT: GameView['hint'] = { stage: 0, move: null, loading: false, failed: false };

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

/** Controller of one bot game (see the file header). */
export class GameController {
  private readonly store: ValueStore<GameView> = createValueStore(initialView());
  private readonly s: AppServices;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly holdMs: number;
  private readonly heartbeatMs: number;
  private chess: ChessGame | null = null;
  /** Incremented on every position change, takeover or dispose; async continuations compare it. */
  private gen = 0;
  private nextSeq = 1;
  private writes: Promise<void> = Promise.resolve();
  private botAbort: AbortController | null = null;
  private evalAbort: AbortController | null = null;
  private threatAbort: AbortController | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private unsubs: Array<() => void> = [];
  private pendingAnswer: ((ok: boolean) => void) | null = null;
  private lastAssessment: { fen: Fen; uci: Uci; assessment: MoveAssessment } | null = null;
  private movesSincePraise = PRAISE_EVERY;
  private noteId = 0;
  private finishing = false;
  private disposed = false;
  /** Incremented by every `load()`/`dispose()`; a load continues only while its session is current. */
  private session = 0;
  private claimant: Claimant | undefined;

  constructor(private readonly deps: GameControllerDeps) {
    this.s = deps.services;
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? Math.random;
    this.holdMs = deps.coachHoldMs ?? (deps.services.config.e2e ? COACH_HOLD_MS_E2E : COACH_HOLD_MS);
    this.heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  }

  /** Current view. */
  get(): GameView {
    return this.store.get();
  }

  /** Subscribes to view changes (called immediately with the current view). */
  subscribe(cb: (v: GameView) => void): () => void {
    return this.store.subscribe(cb);
  }

  private set(patch: Partial<GameView>): void {
    if (this.disposed) return;
    this.store.set({ ...this.store.get(), ...patch });
  }

  private get botColor(): Color {
    return this.get().userColor === 'w' ? 'b' : 'w';
  }

  private get assistance() {
    return this.get().game?.assistance ?? 'competition';
  }

  /** Position fields of the view from the current `ChessGame`. */
  private positionPatch(): Partial<GameView> {
    const c = this.chess!;
    return { history: c.history(), fen: c.fen(), status: c.status() };
  }

  // ------------------------------------------------------------------------------------------------------- loading

  /** Loads the game and its events, decides about the takeover question and starts playing. */
  async load(): Promise<void> {
    const session = ++this.session;
    this.disposed = false;
    this.finishing = false;
    this.lastAssessment = null;
    this.claimant = undefined;
    if (this.store.get().phase !== 'loading') this.store.set(initialView());
    const { repos } = this.s.data;
    let game: Game | null;
    let events: GameMoveEvent[];
    try {
      game = await repos.games.get(this.deps.gameId);
      if (session !== this.session) return;
      if (!game) return this.set({ phase: 'missing' });
      events = await repos.gameMoves.list(game.id);
    } catch (e) {
      console.error('GameController: load failed', e);
      return this.set({ phase: 'error', error: STRINGS_DE.loadError });
    }
    if (session !== this.session) return;
    const bot = this.s.botRoster.find((b) => b.id === game.botId) ?? null;
    if (!bot || game.source !== 'bot') return this.set({ phase: 'error', error: STRINGS_DE.loadError });
    try {
      this.rebuild(game.startFen, events);
    } catch (e) {
      console.error('GameController: replay failed', e);
      return this.set({ phase: 'error', error: STRINGS_DE.loadError });
    }
    const userColor = game.userColor ?? 'w';
    this.set({ game, bot, userColor, startFen: this.chess!.startFen(), ...this.positionPatch() });
    this.watchEngine();

    if (game.status !== 'active') {
      this.showFinished(game);
      return;
    }
    if (isAnotherDeviceActive(game, this.s.data.deviceId, this.now())) {
      this.set({ phase: 'active', readOnly: true, takeoverPrompt: true });
      this.observe();
      return;
    }
    try {
      await repos.games.takeOver(game.id, this.s.data.deviceId);
    } catch (e) {
      console.error('GameController: takeover failed', e);
    }
    if (session !== this.session) return;
    this.set({ phase: 'active' });
    this.startHeartbeat();
    this.observe();
    this.continuePlay();
  }

  private rebuild(startFen: Fen, events: GameMoveEvent[]): void {
    this.chess = ChessGame.fromMoves(startFen, movesFromEvents(events));
    this.nextSeq = events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  }

  /** Shows a finished game (stored result; claims/resignations are not visible in the replayed position). */
  private showFinished(game: Game): void {
    const c = this.chess!;
    const status = c.status();
    const reason = game.endReason ?? status.reason ?? 'aborted';
    this.set({
      phase: 'finished',
      game,
      readOnly: true,
      ...this.positionPatch(),
      status: { ...status, isOver: true, result: game.result, reason, claimableDraws: [] },
      outcome: { result: game.result, reason, rating: null, ratingBefore: game.ratingBefore, ratingAfter: game.ratingAfter },
    });
  }

  private watchEngine(): void {
    const engine = this.s.engines.analysis;
    const update = () => {
      const st = engine.status().state;
      this.set({ coachReady: st === 'ready' || st === 'busy' });
    };
    update();
    this.unsubs.push(engine.onStatus(update));
    if (this.assistance === 'coach') void engine.init().catch(() => undefined);
  }

  private observe(): void {
    const { repos } = this.s.data;
    const id = this.deps.gameId;
    this.unsubs.push(
      repos.games.observe(id).subscribe((game) => {
        if (!game || this.disposed) return;
        const v = this.get();
        if (v.phase === 'active' && !v.readOnly && game.status === 'active' && game.activeDeviceId && game.activeDeviceId !== this.s.data.deviceId) {
          // Another device took the game over ("Hier übernehmen" there): stop and watch.
          this.gen++;
          this.stopHeartbeat();
          this.abortAll();
          this.answer(false);
          this.set({ readOnly: true, takenOver: true, botThinking: false, warning: null, confirm: null, ownClaim: null, game });
          return;
        }
        if (v.readOnly && v.phase === 'active' && game.status !== 'active') {
          void repos.gameMoves.list(id).then((events) => {
            if (this.disposed) return;
            this.rebuild(game.startFen, events);
            this.showFinished(game);
          });
        }
      }),
    );
    this.unsubs.push(
      repos.gameMoves.observe(id).subscribe((events) => {
        const v = this.get();
        if (this.disposed || !v.readOnly || v.phase !== 'active' || !v.game) return;
        const last = events.reduce((m, e) => Math.max(m, e.seq), 0);
        if (last + 1 === this.nextSeq) return;
        try {
          this.rebuild(v.game.startFen, events);
          this.set({ ...this.positionPatch(), hint: NO_HINT, threat: null, praise: null });
        } catch (e) {
          console.error('GameController: mirror failed', e);
        }
      }),
    );
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.s.data.repos.games.heartbeat(this.deps.gameId, this.s.data.deviceId).catch(() => undefined);
    }, this.heartbeatMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private abortAll(): void {
    for (const c of [this.botAbort, this.evalAbort, this.threatAbort]) c?.abort();
    this.botAbort = this.evalAbort = this.threatAbort = null;
  }

  /** Stops timers, searches and subscriptions. */
  dispose(): void {
    this.session++;
    this.gen++;
    this.answer(false);
    this.abortAll();
    this.stopHeartbeat();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.disposed = true;
  }

  // ------------------------------------------------------------------------------------------------- two devices

  /** "Hier übernehmen": this device becomes the active one and continues from the stored events. */
  async takeOver(): Promise<void> {
    const { repos } = this.s.data;
    const v = this.get();
    if (!v.game || v.phase !== 'active') return;
    this.gen++;
    try {
      await repos.games.takeOver(v.game.id, this.s.data.deviceId);
      const [game, events] = await Promise.all([repos.games.get(v.game.id), repos.gameMoves.list(v.game.id)]);
      if (this.disposed || !game) return;
      this.rebuild(game.startFen, events);
      if (game.status !== 'active') return this.showFinished(game);
      this.set({ game, readOnly: false, takeoverPrompt: false, takenOver: false, ...this.positionPatch(), hint: NO_HINT, threat: null, praise: null });
      this.startHeartbeat();
      this.continuePlay();
    } catch (e) {
      console.error('GameController: takeover failed', e);
      this.set({ actionError: STRINGS_DE.saveError });
    }
  }

  /** Closes the takeover question; the game stays read-only on this device. */
  dismissTakeover(): void {
    this.set({ takeoverPrompt: false });
  }

  // ---------------------------------------------------------------------------------------------------- turn flow

  private canUserMove(): boolean {
    const v = this.get();
    return (
      v.phase === 'active' &&
      !v.readOnly &&
      !this.finishing &&
      this.chess !== null &&
      !this.chess.status().isOver &&
      this.chess.turn() === v.userColor &&
      !v.botThinking &&
      v.warning === null &&
      v.confirm === null &&
      v.ownClaim === null
    );
  }

  /** Decides what happens in the current position (see the file header). */
  private continuePlay(): void {
    const v = this.get();
    if (v.phase !== 'active' || v.readOnly || !this.chess || this.finishing) return;
    const status = this.chess.status();
    this.refreshEval();
    if (status.isOver) {
      void this.finish();
      return;
    }
    if (this.chess.turn() === this.botColor) {
      if (!v.ownClaim) void this.botTurn(this.gen);
      return;
    }
    this.userTurn();
  }

  private userTurn(): void {
    if (this.assistance !== 'coach' || !this.chess) return;
    const fen = this.chess.fen();
    this.s.analysis.prepare(fen);
    const last = this.chess.lastMove();
    if (!last || last.color !== this.botColor) return;
    const gen = this.gen;
    this.threatAbort?.abort();
    const ctrl = new AbortController();
    this.threatAbort = ctrl;
    this.s.analysis
      .findThreats(fen, { signal: ctrl.signal })
      .then((t) => {
        if (!t || gen !== this.gen || (t.materialGain < 2 && t.mateIn === undefined)) return;
        const mv = parseUci(t.move);
        const note = this.addNote({ tone: 'warning', lead: STRINGS_DE.threatLead, explanation: this.s.explain.explainRuleBased(t.facts) });
        this.set({ threat: mv ? { from: mv.from, to: mv.to } : null });
        void this.s.explain
          .explain(t.facts, { signal: ctrl.signal })
          .then((x) => gen === this.gen && this.updateNote(note, x))
          .catch(() => undefined);
      })
      .catch((e: unknown) => {
        if (!isAbort(e)) console.warn('GameController: threat check failed', e);
      });
  }

  private async botTurn(gen: number): Promise<void> {
    const bot = this.get().bot;
    const chess = this.chess;
    if (!bot || !chess) return;
    const claimable = chess.status().claimableDraws;
    if (claimable.length > 0) {
      let claim = false;
      try {
        claim = await this.s.bots.shouldClaimDraw(chess.fen(), bot);
      } catch {
        claim = false;
      }
      if (gen !== this.gen) return;
      if (claim && chess.claimDraw(claimable[0]!)) {
        this.claimant = 'bot';
        this.set(this.positionPatch());
        void this.finish();
        return;
      }
    }
    const ctrl = new AbortController();
    this.botAbort = ctrl;
    this.set({ botThinking: true, actionError: null });
    const t0 = Date.now();
    try {
      const move = await this.s.bots.chooseMove({ bot, startFen: chess.startFen(), moves: chess.uciMoves(), signal: ctrl.signal });
      const wait = move.thinkTimeMs - (Date.now() - t0);
      if (wait > 0) await sleep(wait, ctrl.signal);
      if (gen !== this.gen || ctrl.signal.aborted) return;
      const rec = chess.move(move.uci);
      if (!rec) throw new Error(`Illegal bot move ${move.uci}`);
      this.gen++;
      this.persistMove(rec);
      this.deps.onBotMove?.(rec);
      this.set({ ...this.positionPatch(), botThinking: false, botChat: move.chat ?? null, hint: NO_HINT, threat: null, praise: null });
      this.continuePlay();
    } catch (e) {
      if (isAbort(e) || gen !== this.gen) return;
      console.error('GameController: bot move failed', e);
      this.set({ botThinking: false, actionError: STRINGS_DE.botError });
    } finally {
      if (this.botAbort === ctrl) this.botAbort = null;
    }
  }

  /** Retries after a bot error. */
  retry(): void {
    this.set({ actionError: null });
    this.continuePlay();
  }

  // --------------------------------------------------------------------------------------------------- user moves

  /**
   * `Board.onMoveAttempt`: checks the move in Coach mode (warning, held ≤ `coachHoldMs`) and asks for confirmation when
   * `settings.moveConfirmation` is on. Resolves `true` when the move may be played.
   */
  async attemptMove(input: MoveInput): Promise<boolean> {
    if (!this.canUserMove() || !this.chess) return false;
    const fen = this.chess.fen();
    const gen = this.gen;
    const rec = ChessGame.fromFen(fen).move(input);
    if (!rec) return false;
    if (this.assistance === 'coach') {
      const assessment = await this.assess(fen, rec.uci);
      if (gen !== this.gen) return false;
      this.lastAssessment = assessment ? { fen, uci: rec.uci, assessment } : null;
      if (assessment && assessment.expectedPointsLoss >= COACH_WARNING_LOSS) {
        const ok = await this.askWarning(rec, assessment);
        return ok && gen === this.gen;
      }
    }
    if (this.deps.moveConfirmation()) {
      const ok = await new Promise<boolean>((resolve) => {
        this.pendingAnswer = resolve;
        this.set({ confirm: { uci: rec.uci, san: rec.san } });
      });
      return ok && gen === this.gen;
    }
    return gen === this.gen;
  }

  /** Coach check with the hold limit; `null` when the engine is too slow or fails. */
  private async assess(fen: Fen, uci: Uci): Promise<MoveAssessment | null> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        ctrl.abort();
        resolve(null);
      }, this.holdMs);
    });
    try {
      return await Promise.race([this.s.analysis.assessMove(fen, uci, { signal: ctrl.signal }), timeout]);
    } catch (e) {
      if (!isAbort(e)) console.warn('GameController: coach check failed', e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private askWarning(rec: MoveRecord, assessment: MoveAssessment): Promise<boolean> {
    const gen = this.gen;
    const refutationUci = assessment.playedLine[1];
    const refutation = refutationUci ? parseUci(refutationUci) : null;
    const warning: PendingWarning = {
      uci: rec.uci,
      san: rec.san,
      from: rec.from,
      to: rec.to,
      explanation: this.s.explain.explainRuleBased(assessment.facts),
      refutation: refutation ? { from: refutation.from, to: refutation.to } : null,
      assessment,
    };
    const ctrl = new AbortController();
    void this.s.explain
      .explain(assessment.facts, { signal: ctrl.signal })
      .then((x) => {
        const w = this.get().warning;
        if (gen === this.gen && w && w.uci === rec.uci) this.set({ warning: { ...w, explanation: x } });
      })
      .catch(() => undefined);
    return new Promise<boolean>((resolve) => {
      this.pendingAnswer = (ok) => {
        ctrl.abort();
        resolve(ok);
      };
      this.set({ warning });
    });
  }

  private answer(ok: boolean): void {
    const pending = this.pendingAnswer;
    this.pendingAnswer = null;
    if (this.get().warning || this.get().confirm) this.set({ warning: null, confirm: null });
    pending?.(ok);
  }

  /** Coach warning: "Trotzdem ziehen" (`true`) or "Nochmal überlegen" (`false`). */
  answerWarning(playAnyway: boolean): void {
    this.answer(playAnyway);
  }

  /** Move confirmation: play (`true`) or cancel. */
  answerConfirm(ok: boolean): void {
    this.answer(ok);
  }

  /** `Board.onMove`: applies the user's move, stores it and continues. */
  commitMove(move: MoveRecord): void {
    const chess = this.chess;
    const v = this.get();
    if (!chess || v.phase !== 'active' || v.readOnly || chess.turn() !== v.userColor) return;
    const fenBefore = chess.fen();
    const rec = chess.move(move.uci);
    if (!rec) return;
    this.gen++;
    this.threatAbort?.abort();
    this.persistMove(rec);
    const praise = this.praiseFor(fenBefore, rec);
    const status = chess.status();
    const ownClaim = !status.isOver && status.claimableDraws.length > 0 ? status.claimableDraws : null;
    this.set({ ...this.positionPatch(), hint: NO_HINT, threat: null, praise, ownClaim, botChat: null });
    this.continuePlay();
  }

  private praiseFor(fenBefore: Fen, rec: MoveRecord): GameView['praise'] {
    this.movesSincePraise++;
    const a = this.lastAssessment;
    this.lastAssessment = null;
    if (this.assistance !== 'coach' || !a || a.fen !== fenBefore || a.uci !== rec.uci) return null;
    const cls = a.assessment.classification;
    if (!PRAISED.includes(cls) || this.movesSincePraise < PRAISE_EVERY) return null;
    this.movesSincePraise = 0;
    const facts = { ...a.assessment.facts, kind: 'praise' as const };
    const gen = this.gen;
    if (facts.motifs.length > 0) {
      const note = this.addNote({ tone: 'praise', lead: STRINGS_DE.praiseLead, explanation: this.s.explain.explainRuleBased(facts) });
      void this.s.explain
        .explain(facts)
        .then((x) => gen === this.gen && this.updateNote(note, x))
        .catch(() => undefined);
    } else {
      this.addNote({ tone: 'praise', lead: STRINGS_DE.praiseLead, explanation: null, text: CLASSIFICATION_META[cls].plainDe });
    }
    return { ply: rec.ply, square: rec.to, classification: cls };
  }

  private addNote(note: Omit<CoachNote, 'id'>): number {
    const id = ++this.noteId;
    this.set({ notes: [{ ...note, id }, ...this.get().notes].slice(0, 20) });
    return id;
  }

  private updateNote(id: number, explanation: ExplanationText): void {
    this.set({ notes: this.get().notes.map((n) => (n.id === id ? { ...n, explanation } : n)) });
  }

  // ---------------------------------------------------------------------------------------------- persistence

  private persistMove(rec: MoveRecord): void {
    const seq = this.nextSeq++;
    const gameId = this.deps.gameId;
    this.enqueue(() =>
      this.s.data.progress
        .appendGameEvent({ gameId, seq, kind: 'move', ply: rec.ply, uci: rec.uci, san: rec.san, fenAfter: rec.fenAfter })
        .then(() => undefined),
    );
  }

  private enqueue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((e: unknown) => {
      console.error('GameController: save failed', e);
      this.set({ actionError: STRINGS_DE.saveError });
    });
  }

  /** Resolves when every queued write has finished (tests, before finishing). */
  flush(): Promise<void> {
    return this.writes;
  }

  // --------------------------------------------------------------------------------------------- aids and actions

  private refreshEval(): void {
    if (this.assistance === 'competition' || !this.chess) return;
    this.evalAbort?.abort();
    if (this.chess.status().isOver) return;
    const ctrl = new AbortController();
    this.evalAbort = ctrl;
    const fen = this.chess.fen();
    this.s.engines.play
      .analyse(fen, { depth: EVAL_SEARCH.depth, movetimeMs: EVAL_SEARCH.movetimeMs, signal: ctrl.signal })
      .then((a) => {
        const best = a.lines[0];
        if (!ctrl.signal.aborted && best && this.chess?.fen() === fen) this.set({ evaluation: best.score });
      })
      .catch((e: unknown) => {
        if (!isAbort(e)) console.warn('GameController: evaluation failed', e);
      });
  }

  /** Hint (Training/Coach, D-36): stage 1 = piece of the best move, stage 2 = best-move arrow. */
  async requestHint(): Promise<void> {
    const v = this.get();
    if (this.assistance === 'competition' || !this.canUserMove() || !this.chess || v.hint.loading) return;
    if (v.hint.stage === 1) return this.set({ hint: { ...v.hint, stage: 2 } });
    if (v.hint.stage === 2) return;
    const gen = this.gen;
    const fen = this.chess.fen();
    this.set({ hint: { ...NO_HINT, loading: true } });
    try {
      const a = await this.s.engines.play.analyse(fen, { depth: HINT_SEARCH.depth, movetimeMs: HINT_SEARCH.movetimeMs });
      if (gen !== this.gen) return;
      const move = a.bestMove ?? a.lines[0]?.pv[0] ?? null;
      this.set({ hint: move ? { stage: 1, move, loading: false, failed: false } : { ...NO_HINT, failed: true } });
    } catch (e) {
      if (gen !== this.gen) return;
      console.warn('GameController: hint failed', e);
      this.set({ hint: { ...NO_HINT, failed: true } });
    }
  }

  /** Whether "Zurücknehmen" is possible now. */
  canTakeback(): boolean {
    const v = this.get();
    return (
      this.assistance !== 'competition' &&
      v.phase === 'active' &&
      !v.readOnly &&
      !this.finishing &&
      v.warning === null &&
      v.confirm === null &&
      this.chess !== null &&
      takebackPlies(this.chess.history(), v.userColor) > 0
    );
  }

  /** Takes back the user's last move and the bot's reply (Training/Coach, unlimited; stored as a takeback event). */
  takeback(): void {
    if (!this.canTakeback() || !this.chess) return;
    const plies = takebackPlies(this.chess.history(), this.get().userColor);
    this.gen++;
    this.abortAll();
    for (let i = 0; i < plies; i++) this.chess.undo();
    const seq = this.nextSeq++;
    const gameId = this.deps.gameId;
    const ply = this.chess.ply();
    this.enqueue(() => this.s.data.progress.appendGameEvent({ gameId, seq, kind: 'takeback', plies, ply }).then(() => undefined));
    this.lastAssessment = null;
    this.set({ ...this.positionPatch(), botThinking: false, ownClaim: null, hint: NO_HINT, threat: null, praise: null, botChat: null, actionError: null });
    this.continuePlay();
  }

  /** The user claims a draw (on their turn, or right after the move that made it possible). */
  claimDraw(): void {
    const v = this.get();
    const chess = this.chess;
    if (!chess || v.phase !== 'active' || v.readOnly || this.finishing) return;
    const kinds = v.ownClaim ?? (chess.turn() === v.userColor ? chess.status().claimableDraws : []);
    const kind = kinds[0];
    if (!kind || !chess.claimDraw(kind)) return;
    this.gen++;
    this.abortAll();
    this.claimant = 'user';
    this.set({ ...this.positionPatch(), ownClaim: null, botThinking: false });
    void this.finish();
  }

  /** The user declines the claim offered after their move; the bot moves. */
  declineClaim(): void {
    if (!this.get().ownClaim) return;
    this.set({ ownClaim: null });
    this.continuePlay();
  }

  /** "Aufgeben" (after the confirmation dialog). FIDE 5.1.2: a draw if the bot cannot mate. */
  resign(): void {
    const v = this.get();
    const chess = this.chess;
    if (!chess || v.phase !== 'active' || v.readOnly || this.finishing) return;
    this.gen++;
    this.abortAll();
    this.answer(false);
    chess.resign(v.userColor);
    this.set({ ...this.positionPatch(), botThinking: false, ownClaim: null });
    void this.finish();
  }

  private async finish(): Promise<void> {
    const chess = this.chess;
    const v = this.get();
    if (!chess || !v.game || this.finishing) return;
    const status = chess.status();
    if (!status.isOver || !status.reason) return;
    this.finishing = true;
    this.stopHeartbeat();
    const { result, reason } = status;
    const pgn = chess.pgn({ ...v.game.headers, Result: result });
    await this.writes;
    try {
      const r = await this.s.data.progress.finishGame(v.game.id, result, reason, pgn);
      const event = endChatEvent(result, this.botColor);
      const chat = event && v.bot ? chatLine(v.bot, event, this.random) : undefined;
      this.set({
        phase: 'finished',
        readOnly: true,
        game: r.game,
        ...this.positionPatch(),
        botThinking: false,
        botChat: chat ?? null,
        outcome: {
          result,
          reason,
          ...(this.claimant ? { claimant: this.claimant } : {}),
          rating: r.rating,
          ratingBefore: r.game.ratingBefore,
          ratingAfter: r.game.ratingAfter,
        },
      });
    } catch (e) {
      console.error('GameController: finishing failed', e);
      this.finishing = false;
      this.set({ actionError: STRINGS_DE.saveError });
    }
  }

  // ------------------------------------------------------------------------------------------------ board props

  /** Arrows for the board: threat, warning refutation, hint stage 2. */
  arrows(): Arrow[] {
    const v = this.get();
    const out: Arrow[] = [];
    if (v.warning?.refutation) out.push({ ...v.warning.refutation, kind: 'threat' });
    else if (v.threat) out.push({ ...v.threat, kind: 'threat' });
    const hint = v.hint.move ? parseUci(v.hint.move) : null;
    if (hint && v.hint.stage === 2) out.push({ from: hint.from, to: hint.to, kind: 'best' });
    return out;
  }
}
