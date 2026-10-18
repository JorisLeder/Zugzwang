import { describe, expect, it } from 'vitest';
import type { AppServices } from '@/core/services';
import { createFakeAppServices, createMemoryDataServices, FIXTURE_GAME, type MemoryDataServices } from '@/core/testing';
import { parsePgnWithDiagnostics, pgnExternalId, pgnWithOwnTags, type PgnGame } from '@/pgn';
import { gameSummary, gamesImportUrl, importPgnGame } from './importGame';

function parse(text: string): PgnGame[] {
  const r = parsePgnWithDiagnostics(text);
  if (!r.ok) throw new Error(r.error.messageDe);
  return r.games;
}

function cloud(data: MemoryDataServices, token: string | null = 'jwt'): AppServices {
  const services = createFakeAppServices({ data, config: { mode: 'cloud', supabaseUrl: 'https://x.supabase.co/', supabaseAnonKey: 'anon' } });
  data.auth.accessToken = async () => token;
  return services;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('importPgnGame', () => {
  it('local mode: stores source pgn with the external id; a duplicate is not stored twice', async () => {
    const data = createMemoryDataServices();
    const services = createFakeAppServices({ data });
    const [game] = parse(FIXTURE_GAME.pgn);
    const first = await importPgnGame(services, game!, { now: () => new Date('2026-10-17T10:00:00Z') });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    if (!first.ok) return;
    const stored = await data.repos.games.get(first.gameId);
    expect(stored).toMatchObject({ source: 'pgn', externalId: pgnExternalId(game!), status: 'finished', userColor: null, botId: null });
    expect(stored?.externalId).toMatch(/^[0-9a-f]{64}$/);
    // Same game with comments, NAGs and other line breaks → same id, not stored again.
    const [again] = parse(FIXTURE_GAME.pgn.replace('14. Qc2', '14. Qc2?? {Patzer} (14. Rxf2)').replace(/ 20\. /, '\n20. '));
    const second = await importPgnGame(services, again!);
    expect(second).toEqual({ ok: true, gameId: first.gameId, duplicate: true });
    expect(await data.repos.games.list({ source: 'pgn' })).toHaveLength(1);
  });

  it('cloud mode: posts the PGN to games-import with the access token and opens the returned game', async () => {
    const data = createMemoryDataServices();
    const services = cloud(data);
    const [game] = parse('[White "Anna"]\n[Black "Ben"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ ok: true, gameId: 'server-1', duplicate: false });
    }) as unknown as typeof fetch;
    const r = await importPgnGame(services, game!, { fetchFn, isOnline: () => true });
    expect(r).toEqual({ ok: true, gameId: 'server-1', duplicate: false });
    expect(calls[0]!.url).toBe('https://x.supabase.co/functions/v1/games-import');
    expect(gamesImportUrl('https://x.supabase.co')).toBe(calls[0]!.url);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt');
    expect(headers.apikey).toBe('anon');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ pgn: pgnWithOwnTags(game!) });
    expect(await data.repos.games.list()).toHaveLength(0);
  });

  it('cloud mode: a server error with line is shown in German; an unreachable function falls back to local storage', async () => {
    const data = createMemoryDataServices();
    const services = cloud(data);
    const [game] = parse('1. d4 d5 *');
    const failing = (async () => jsonResponse({ ok: false, error: 'Ungültiger Zug', line: 3 }, 400)) as unknown as typeof fetch;
    expect(await importPgnGame(services, game!, { fetchFn: failing, isOnline: () => true })).toEqual({ ok: false, errorDe: 'Zeile 3: Ungültiger Zug' });
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const r = await importPgnGame(services, game!, { fetchFn: offline, isOnline: () => true });
    expect(r).toMatchObject({ ok: true, duplicate: false });
    expect(await data.repos.games.list({ source: 'pgn' })).toHaveLength(1);
    // Known locally → duplicate without a request.
    const never = (async () => {
      throw new Error('no request expected');
    }) as unknown as typeof fetch;
    expect(await importPgnGame(services, game!, { fetchFn: never, isOnline: () => true })).toMatchObject({ ok: true, duplicate: true });
  });

  it('summarises a parsed game for the selection list', () => {
    const [game] = parse('[Event "Vereinsabend"]\n[Date "2025.03.12"]\n[White "Anna"]\n[Black "?"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0');
    expect(gameSummary(game!)).toEqual({ title: 'Anna – Schwarz', meta: '1:0 · 3 Züge · 12.03.2025 · Vereinsabend' });
  });
});
