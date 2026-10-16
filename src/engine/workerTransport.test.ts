import { describe, expect, it, vi } from 'vitest';
import { createWorkerTransport, type WorkerLike } from './workerTransport';

class ScriptedWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  terminated = false;
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('createWorkerTransport', () => {
  it('posts commands as strings and splits multi-line output', () => {
    const worker = new ScriptedWorker();
    const t = createWorkerTransport(worker);
    const lines: string[] = [];
    t.onLine((l) => lines.push(l));
    t.send('uci');
    worker.emit('id name Stockfish\nuciok\n');
    worker.emit({ not: 'a line' });
    expect(worker.posted).toEqual(['uci']);
    expect(lines).toEqual(['id name Stockfish', 'uciok']);
  });

  it('hands a progress port to stockfish.js and reports the download progress', async () => {
    const worker = new ScriptedWorker();
    const progress: number[] = [];
    createWorkerTransport(worker, { onProgress: (p) => progress.push(p) });
    const msg = worker.posted[0] as { progressPort: MessagePort };
    expect(msg.progressPort).toBeDefined();
    msg.progressPort.postMessage({ percent: 0.25, loaded: 1, total: 4 });
    msg.progressPort.postMessage({ percent: 1, loaded: 4, total: 4 });
    await vi.waitFor(() => expect(progress).toEqual([0.25, 1]));
  });

  it('reports worker errors and stops after terminate', () => {
    const worker = new ScriptedWorker();
    const onError = vi.fn();
    const t = createWorkerTransport(worker, { onError });
    const lines: string[] = [];
    t.onLine((l) => lines.push(l));
    const event = { message: 'wasm 404', preventDefault: vi.fn() } as unknown as ErrorEvent;
    worker.onerror?.(event);
    expect(onError).toHaveBeenCalledWith('wasm 404');
    expect(event.preventDefault).toHaveBeenCalled();
    t.terminate();
    t.send('isready');
    expect(worker.terminated).toBe(true);
    expect(worker.posted).toEqual([]);
    expect(lines).toEqual([]);
  });
});
