/**
 * `UciTransport` over a Web Worker running stockfish.js (`public/engine/stockfish-19-lite-single.js`).
 *
 * - Commands are posted as strings; engine output arrives as `message` events with one or more lines.
 * - Download progress of the `.wasm`: stockfish.js reports it on a `MessagePort` handed over with
 *   `{ progressPort }` (`{ percent, loaded, total }` messages until `percent` reaches 1).
 * - Load errors (missing/blocked `.wasm`, crash) surface as the worker's `error` event → `onError`.
 */
import type { UciTransport } from '@/core/engine';

/** The part of `Worker` the transport needs (a test double can implement it). */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
}

/** Callbacks of `createWorkerTransport`. */
export interface WorkerTransportOptions {
  /** Download progress of the engine files, 0–1. */
  onProgress?: (fraction: number) => void;
  /** The worker reported an error (load failure or crash). */
  onError?: (message: string) => void;
}

/** Wraps a worker as a line-based UCI transport. */
export function createWorkerTransport(worker: WorkerLike, opts: WorkerTransportOptions = {}): UciTransport {
  const listeners = new Set<(line: string) => void>();
  let terminated = false;
  let progressPort: MessagePort | null = null;

  worker.onmessage = (ev: MessageEvent) => {
    if (terminated || typeof ev.data !== 'string') return;
    for (const line of ev.data.split('\n')) {
      if (line.trim()) for (const cb of [...listeners]) cb(line);
    }
  };
  worker.onerror = (ev: ErrorEvent) => {
    ev.preventDefault?.();
    if (terminated) return;
    const message: unknown = ev.message;
    opts.onError?.(typeof message === 'string' && message ? message : 'worker error');
  };

  const { onProgress } = opts;
  if (onProgress && typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    progressPort = channel.port1;
    channel.port1.onmessage = (ev: MessageEvent) => {
      const percent = Number((ev.data as { percent?: unknown } | null)?.percent);
      if (!Number.isFinite(percent)) return;
      onProgress(Math.min(1, Math.max(0, percent)));
      if (percent >= 1) {
        channel.port1.close();
        progressPort = null;
      }
    };
    try {
      worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
    } catch {
      channel.port1.close();
      progressPort = null;
    }
  }

  return {
    send(cmd) {
      if (!terminated) worker.postMessage(cmd);
    },
    onLine(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      listeners.clear();
      progressPort?.close();
      progressPort = null;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    },
  };
}
