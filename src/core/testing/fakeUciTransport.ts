/**
 * Scriptable fake UCI engine speaking the protocol over a `UciTransport` – for unit tests of code that drives a UCI
 * engine (`createUciEngineService`, browser worker wrappers). Records every command it receives.
 */
import type { Fen } from '../chess';
import type { UciTransport } from '../engine';

/** Behaviour of the fake engine for one `go`. */
export interface FakeUciSearch {
  /** `info` lines to print (without `info ` prefix is not allowed – give full lines). */
  info: string[];
  /** Best move (`(none)` for no legal move). */
  bestmove: string;
  /** Delay before printing (ms). With `Infinity` the search only ends on `stop`. */
  delayMs?: number;
}

/** Options of `createFakeUciTransport`. */
export interface FakeUciOptions {
  /** Returns the search result for the current position and `go` command. Default: `bestmove e2e4`, cp 20. */
  search?: (fen: Fen, go: string, options: Record<string, string>) => FakeUciSearch;
  /** Engine name for `id name`. */
  name?: string;
}

/** Fake transport plus its command log. */
export interface FakeUciTransport extends UciTransport {
  /** Every command received, in order. */
  readonly commands: string[];
  /** Current `setoption` values. */
  readonly options: Record<string, string>;
  readonly terminated: boolean;
}

/** Creates a fake UCI engine (asynchronous output via `setTimeout`, like a worker). */
export function createFakeUciTransport(opts: FakeUciOptions = {}): FakeUciTransport {
  const listeners = new Set<(line: string) => void>();
  const commands: string[] = [];
  const options: Record<string, string> = {};
  let fen: Fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  let pending: { timer: ReturnType<typeof setTimeout> | null; bestmove: string } | null = null;
  let terminated = false;

  const emit = (line: string) => setTimeout(() => !terminated && listeners.forEach((l) => l(line)), 0);
  const finish = () => {
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    const best = pending.bestmove;
    pending = null;
    emit(`bestmove ${best}`);
  };

  const transport: FakeUciTransport = {
    commands,
    options,
    get terminated() {
      return terminated;
    },
    send(cmd: string) {
      commands.push(cmd);
      if (cmd === 'uci') {
        emit(`id name ${opts.name ?? 'FakeFish 1'}`);
        emit('id author Zugzwang tests');
        emit('option name MultiPV type spin default 1 min 1 max 500');
        emit('option name Skill Level type spin default 20 min 0 max 20');
        emit('option name UCI_LimitStrength type check default false');
        emit('option name UCI_Elo type spin default 1320 min 1320 max 3190');
        emit('uciok');
      } else if (cmd === 'isready') {
        emit('readyok');
      } else if (cmd.startsWith('setoption name ')) {
        const m = /^setoption name (.+) value (.*)$/.exec(cmd);
        if (m) options[m[1]!] = m[2]!;
      } else if (cmd.startsWith('position fen ')) {
        fen = cmd.slice('position fen '.length);
      } else if (cmd.startsWith('go')) {
        const result = opts.search?.(fen, cmd, { ...options }) ?? {
          info: ['info depth 10 seldepth 12 multipv 1 score cp 20 nodes 1000 nps 100000 time 10 pv e2e4 e7e5'],
          bestmove: 'e2e4',
        };
        const print = () => {
          for (const line of result.info) listeners.forEach((l) => l(line));
          finish();
        };
        pending = { timer: null, bestmove: result.bestmove };
        if (result.delayMs !== Infinity) {
          pending.timer = setTimeout(print, result.delayMs ?? 1);
        } else {
          for (const line of result.info) emit(line);
        }
      } else if (cmd === 'stop') {
        finish();
      }
    },
    onLine(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    terminate() {
      terminated = true;
      if (pending?.timer) clearTimeout(pending.timer);
      pending = null;
      listeners.clear();
    },
  };
  return transport;
}
