import { describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@/core/chess';
import { createLichessCloudEval } from './cloudEval';

const OK_BODY = {
  fen: START_FEN,
  knodes: 1000,
  depth: 40,
  pvs: [
    { moves: 'e2e4 e7e5 g1f3', cp: 30 },
    { moves: 'd2d4 d7d5', cp: 25 },
  ],
};

function respond(status: number, body: unknown = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

describe('Lichess cloud-eval provider', () => {
  it('maps a hit to an EngineAnalysis (White POV, source cloud)', async () => {
    const fetchMock = respond(200, OK_BODY);
    const cloud = createLichessCloudEval({ fetch: fetchMock });
    const a = await cloud.lookup(START_FEN, { multiPv: 2, minDepth: 16 });
    expect(a).toMatchObject({ source: 'cloud', depth: 40, bestMove: 'e2e4', engineId: 'lichess-cloud-eval' });
    expect(a!.lines.map((l) => [l.multipv, l.score, l.pv[0]])).toEqual([
      [1, { type: 'cp', value: 30 }, 'e2e4'],
      [2, { type: 'cp', value: 25 }, 'd2d4'],
    ]);
    expect(String((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0])).toContain('multiPv=2');
  });

  it('404 (not in the cloud) → null', async () => {
    expect(await createLichessCloudEval({ fetch: respond(404) }).lookup(START_FEN)).toBeNull();
  });

  it('429 → null and a 60 s pause without requests', async () => {
    let now = 0;
    const fetchMock = respond(429);
    const cloud = createLichessCloudEval({ fetch: fetchMock, now: () => now });
    expect(await cloud.lookup(START_FEN)).toBeNull();
    now = 59_999;
    expect(await cloud.lookup(START_FEN)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now = 60_000;
    await cloud.lookup(START_FEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('timeout after 1.5 s → null', async () => {
    vi.useFakeTimers();
    try {
      const hanging = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ) as unknown as typeof fetch;
      const result = createLichessCloudEval({ fetch: hanging }).lookup(START_FEN);
      await vi.advanceTimersByTimeAsync(1499);
      let settled = false;
      void result.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('network error, invalid JSON, too shallow, too few lines or illegal PV → null', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await createLichessCloudEval({ fetch: failing }).lookup(START_FEN)).toBeNull();
    const invalid = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect(await createLichessCloudEval({ fetch: invalid }).lookup(START_FEN)).toBeNull();
    expect(await createLichessCloudEval({ fetch: respond(200, OK_BODY) }).lookup(START_FEN, { minDepth: 41 })).toBeNull();
    expect(await createLichessCloudEval({ fetch: respond(200, OK_BODY) }).lookup(START_FEN, { multiPv: 3 })).toBeNull();
    const illegal = { ...OK_BODY, pvs: [{ moves: 'e2e5', cp: 10 }] };
    expect(await createLichessCloudEval({ fetch: respond(200, illegal) }).lookup(START_FEN)).toBeNull();
  });

  it('mate scores keep the White-POV sign', async () => {
    const body = { depth: 30, pvs: [{ moves: 'd8h4', mate: -1 }] };
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    const a = await createLichessCloudEval({ fetch: respond(200, body) }).lookup(fen);
    expect(a?.lines[0]?.score).toEqual({ type: 'mate', value: -1 });
  });
});
