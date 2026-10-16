import { describe, expect, it } from 'vitest';
import { createFakeUciTransport } from '@/core/testing/fakeUciTransport';
import { createUciEngineService } from './service';

const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('createUciEngineService', () => {
  it('performs the handshake and reports status', async () => {
    const t = createFakeUciTransport();
    const engine = createUciEngineService(t, 'fake');
    const states: string[] = [];
    engine.onStatus((s) => states.push(s.state));
    expect(engine.status().state).toBe('idle');
    await engine.init();
    expect(engine.status().state).toBe('ready');
    expect(t.commands.slice(0, 2)).toEqual(['uci', 'isready']);
    expect(states).toEqual(['loading', 'ready']);
  });

  it('analyses with White-POV scores and sorted MultiPV lines, then restores MultiPV', async () => {
    const t = createFakeUciTransport({
      search: () => ({
        info: [
          'info depth 8 seldepth 9 multipv 1 score cp 30 pv e7e5 g1f3',
          'info depth 8 seldepth 9 multipv 2 score cp 10 pv c7c5',
          'info depth 9 multipv 2 score cp 15 pv c7c5 g1f3',
          'info depth 9 multipv 1 score mate 3 pv e7e5',
        ],
        bestmove: 'e7e5',
      }),
    });
    const engine = createUciEngineService(t, 'fake');
    const updates: number[] = [];
    const a = await engine.analyse(BLACK_FEN, { depth: 9, multiPv: 2, onUpdate: (l) => updates.push(l.length) });
    expect(a).toMatchObject({ fen: BLACK_FEN, bestMove: 'e7e5', depth: 9, source: 'local', engineId: 'fake' });
    expect(a.lines.map((l) => l.multipv)).toEqual([1, 2]);
    expect(a.lines[0]!.score).toEqual({ type: 'mate', value: -3 });
    expect(a.lines[1]!.score).toEqual({ type: 'cp', value: -15 });
    expect(updates.length).toBe(4);
    const goIndex = t.commands.findIndex((c) => c.startsWith('go'));
    expect(t.commands.slice(0, goIndex + 1)).toEqual([
      'uci',
      'isready',
      'setoption name MultiPV value 2',
      'isready',
      `position fen ${BLACK_FEN}`,
      'go depth 9',
    ]);
    expect(t.commands.slice(goIndex + 1)).toEqual(['setoption name MultiPV value 1', 'isready']);
    expect(t.options.MultiPV).toBe('1');
  });

  it('serialises calls in order', async () => {
    const order: string[] = [];
    const t = createFakeUciTransport({
      search: (fen) => ({ info: [`info depth 5 score cp 0 pv ${fen.includes(' b ') ? 'e7e5' : 'e2e4'}`], bestmove: fen.includes(' b ') ? 'e7e5' : 'e2e4', delayMs: 5 }),
    });
    const engine = createUciEngineService(t, 'fake');
    const p1 = engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 5 }).then((r) => order.push(r.bestMove!));
    const p2 = engine.bestMove(BLACK_FEN, { depth: 5 }).then((r) => order.push(r.move!));
    await Promise.all([p1, p2]);
    expect(order).toEqual(['e2e4', 'e7e5']);
    const gos = t.commands.filter((c) => c.startsWith('go') || c.startsWith('position'));
    expect(gos).toHaveLength(4);
  });

  it('sets and restores strength options for bestMove (clamped to engine limits)', async () => {
    const t = createFakeUciTransport();
    const engine = createUciEngineService(t, 'fake');
    await engine.bestMove(BLACK_FEN, { skillLevel: 3, limitStrengthElo: 800, movetimeMs: 50 });
    expect(t.commands).toContain('setoption name Skill Level value 3');
    expect(t.commands).toContain('setoption name UCI_Elo value 1320');
    expect(t.commands).toContain('go movetime 50');
    expect(t.options).toMatchObject({ 'Skill Level': '20', UCI_LimitStrength: 'false' });
  });

  it('aborts a running search via stop and rejects with AbortError; the engine stays usable', async () => {
    const t = createFakeUciTransport({
      search: (_fen, go) =>
        go.includes('infinite') || go.includes('depth 99')
          ? { info: ['info depth 3 score cp 5 pv e2e4'], bestmove: 'e2e4', delayMs: Infinity }
          : { info: ['info depth 2 score cp 1 pv d2d4'], bestmove: 'd2d4' },
    });
    const engine = createUciEngineService(t, 'fake');
    const ctrl = new AbortController();
    const running = engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 99, signal: ctrl.signal });
    const queued = engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 2 });
    await new Promise((r) => setTimeout(r, 20));
    ctrl.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(t.commands).toContain('stop');
    await expect(queued).resolves.toMatchObject({ bestMove: 'd2d4' });
  });

  it('a queued call aborted before it starts rejects immediately', async () => {
    const t = createFakeUciTransport({ search: () => ({ info: [], bestmove: 'e2e4', delayMs: 30 }) });
    const engine = createUciEngineService(t, 'fake');
    const first = engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const ctrl = new AbortController();
    const second = engine.analyse(BLACK_FEN, { signal: ctrl.signal });
    ctrl.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await expect(first).resolves.toMatchObject({ bestMove: 'e2e4' });
    expect(t.commands.filter((c) => c.startsWith('go'))).toHaveLength(1);
  });

  it('stop() ends the running search with the lines found so far', async () => {
    const t = createFakeUciTransport({ search: () => ({ info: ['info depth 7 score cp 12 pv g1f3'], bestmove: 'g1f3', delayMs: Infinity }) });
    const engine = createUciEngineService(t, 'fake');
    const p = engine.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 50 });
    await new Promise((r) => setTimeout(r, 20));
    await engine.stop();
    const a = await p;
    expect(a.bestMove).toBe('g1f3');
    expect(a.lines[0]?.depth).toBe(7);
  });

  it('dispose terminates the transport; later calls reject', async () => {
    const t = createFakeUciTransport();
    const engine = createUciEngineService(t, 'fake');
    await engine.init();
    engine.dispose();
    expect(t.terminated).toBe(true);
    await expect(engine.analyse(BLACK_FEN)).rejects.toThrow(/disposed/);
  });

  it('uses the default depth when no limit is given', async () => {
    const t = createFakeUciTransport();
    const engine = createUciEngineService(t, 'fake', { defaultDepth: 7 });
    await engine.analyse(BLACK_FEN);
    expect(t.commands).toContain('go depth 7');
  });
});
