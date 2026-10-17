import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplanationFacts } from '@/core/explain';
import { createMemoryDataServices } from '@/core/testing';
import { createExplanationService, E2E_EXPLAIN_URL_KEY } from './index';
import { RuleAndLlmExplanationService, type ExplanationServiceOptions } from './service';

const FACTS: ExplanationFacts = {
  kind: 'mistake',
  mover: 'w',
  fenBefore: 'r4rk1/1ppq1pp1/pbnpb2p/4p3/PP2P3/N1PP1N1P/B4nP1/R1BQ1RK1 w - - 0 14',
  playedMove: { uci: 'd1c2', san: 'Qc2' },
  bestMove: { uci: 'f1f2', san: 'Rxf2' },
  bestLine: ['Rxf2', 'f5'],
  refutation: ['Bxa2', 'a5'],
  expectedPointsLoss: 0.424,
  motifs: [{ id: 'material_loss', squares: ['a2'], pieces: [{ square: 'a2', piece: 'b', color: 'w' }], gain: 3 }],
};

const GOOD_SEGMENTS = [
  { type: 'text', text: 'Nach ' },
  { type: 'move', san: 'Qc2' },
  { type: 'text', text: ' schlägt Schwarz mit ' },
  { type: 'move', san: 'Bxa2' },
  { type: 'text', text: ' deinen Läufer. Besser war [[Rxf2]].' },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function service(fetchFn: ExplanationServiceOptions['fetchFn'], extra: Partial<ExplanationServiceOptions> = {}) {
  return new RuleAndLlmExplanationService({
    explainUrl: () => 'https://x.supabase.co/functions/v1/explain',
    accessToken: async () => 'jwt-token',
    fetchFn,
    isOnline: () => true,
    ...extra,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LLM path (cloud mode)', () => {
  it('posts the facts with the token and accepts a validated answer', async () => {
    const fetchFn = vi.fn(async () => json({ ok: true, segments: GOOD_SEGMENTS, model: 'claude-opus-5-5' }));
    const e = await service(fetchFn).explain(FACTS);
    expect(e.source).toBe('llm');
    expect(e.plain).toBe('Nach Dc2 schlägt Schwarz mit Lxa2 deinen Läufer. Besser war Txf2.');
    expect(e.segments.filter((s) => s.type === 'move')).toEqual([
      { type: 'move', san: 'Qc2' },
      { type: 'move', san: 'Bxa2' },
      { type: 'move', san: 'Rxf2' },
    ]);
    expect(e.motifs).toEqual(['material_loss']);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/functions/v1/explain');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    expect(JSON.parse(init.body as string)).toEqual({ context: 'analysis', facts: FACTS, language: 'de' });
  });

  it.each([
    ['a move that is not in the facts', { ok: true, segments: [{ type: 'text', text: 'Besser war ' }, { type: 'move', san: 'Qd2' }, { type: 'text', text: '.' }], model: 'm' }],
    ['an illegal move', { ok: true, segments: [{ type: 'text', text: 'Besser war ' }, { type: 'move', san: 'Qxh7#' }, { type: 'text', text: '.' }], model: 'm' }],
    ['an unmarked move', { ok: true, segments: [{ type: 'text', text: 'Besser war Txf2.' }], model: 'm' }],
    ['a refusal', { ok: false, error: 'refused' }],
    ['a broken body', { hello: 'world' }],
  ])('falls back to the rule-based text for %s', async (_name, body) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = service(async () => json(body));
    const e = await s.explain(FACTS);
    expect(e.source).toBe('rule');
    expect(e).toEqual(s.explainRuleBased(FACTS));
  });

  it('falls back on HTTP errors and network errors and then pauses the LLM path', async () => {
    let now = 1_000;
    const fetchFn = vi.fn(async () => json({ message: 'boom' }, 500));
    const s = service(fetchFn, { now: () => now, backoffMs: 60_000 });
    expect((await s.explain(FACTS)).source).toBe('rule');
    expect((await s.explain(FACTS)).source).toBe('rule');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 60_001;
    await s.explain(FACTS);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const offlineNetwork = service(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await offlineNetwork.explain(FACTS)).source).toBe('rule');
  });

  it('times out after the configured time (8 s by default) and falls back', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const s = service(fetchFn);
      const pending = s.explain(FACTS);
      await vi.advanceTimersByTimeAsync(7_999);
      let settled = false;
      void pending.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      const e = await pending;
      expect(e.source).toBe('rule');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses after a rate limit but not after a refusal', async () => {
    const limited = vi.fn(async () => json({ ok: false, error: 'rate_limited' }, 429));
    const s1 = service(limited);
    await s1.explain(FACTS);
    await s1.explain(FACTS);
    expect(limited).toHaveBeenCalledTimes(1);
    const refused = vi.fn(async () => json({ ok: false, error: 'refused' }));
    const s2 = service(refused);
    await s2.explain(FACTS);
    await s2.explain(FACTS);
    expect(refused).toHaveBeenCalledTimes(2);
  });

  it('does not call the function offline, without token, without URL or when the caller forbids it', async () => {
    const fetchFn = vi.fn(async () => json({ ok: true, segments: GOOD_SEGMENTS, model: 'm' }));
    expect((await service(fetchFn, { isOnline: () => false }).explain(FACTS)).source).toBe('rule');
    expect((await service(fetchFn, { accessToken: async () => null }).explain(FACTS)).source).toBe('rule');
    expect((await service(fetchFn, { explainUrl: () => null }).explain(FACTS)).source).toBe('rule');
    expect((await service(fetchFn).explain(FACTS, { allowLlm: false })).source).toBe('rule');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('caches per key and shares concurrent requests', async () => {
    const fetchFn = vi.fn(async () => json({ ok: true, segments: GOOD_SEGMENTS, model: 'm' }));
    const s = service(fetchFn);
    const [a, b] = await Promise.all([s.explain(FACTS, { cacheKey: 'g1:27' }), s.explain(FACTS, { cacheKey: 'g1:27' })]);
    expect(a.source).toBe('llm');
    expect(b).toEqual(a);
    expect((await s.explain(FACTS, { cacheKey: 'g1:27' })).source).toBe('llm');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await s.explain(FACTS, { cacheKey: 'g1:29' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects with AbortError when the caller aborts', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(service(async () => json({})).explain(FACTS, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const late = new AbortController();
    const never = vi.fn(() => new Promise<Response>(() => undefined));
    const p = service(never).explain(FACTS, { signal: late.signal, cacheKey: 'k' });
    late.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createExplanationService', () => {
  it('local mode: rule-based only, no network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const s = createExplanationService({ mode: 'local', cloudEvalEnabled: false, e2e: false }, createMemoryDataServices());
    expect((await s.explain(FACTS)).source).toBe('rule');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cloud mode: uses the explain URL and the access token of the data layer', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true, segments: GOOD_SEGMENTS, model: 'm' }));
    vi.stubGlobal('fetch', fetchSpy);
    const data = createMemoryDataServices();
    vi.spyOn(data.auth, 'accessToken').mockResolvedValue('user-jwt');
    const s = createExplanationService(
      { mode: 'cloud', cloudEvalEnabled: false, e2e: false, explainUrl: 'https://x.supabase.co/functions/v1/explain' },
      data,
    );
    expect((await s.explain(FACTS)).source).toBe('llm');
    const init = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt');
  });

  it('e2e builds only: the test endpoint from localStorage switches the LLM path on (no token)', async () => {
    const fetchSpy = vi.fn(async () => json({ ok: true, segments: GOOD_SEGMENTS, model: 'm' }));
    vi.stubGlobal('fetch', fetchSpy);
    const store = new Map([[E2E_EXPLAIN_URL_KEY, 'http://localhost:5205/__e2e/explain']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null });
    const prod = createExplanationService({ mode: 'local', cloudEvalEnabled: false, e2e: false }, createMemoryDataServices());
    expect((await prod.explain(FACTS)).source).toBe('rule');
    expect(fetchSpy).not.toHaveBeenCalled();
    const e2e = createExplanationService({ mode: 'local', cloudEvalEnabled: false, e2e: true }, createMemoryDataServices());
    expect((await e2e.explain(FACTS)).source).toBe('llm');
    expect((fetchSpy.mock.calls[0] as unknown as [string])[0]).toBe('http://localhost:5205/__e2e/explain');
  });
});
