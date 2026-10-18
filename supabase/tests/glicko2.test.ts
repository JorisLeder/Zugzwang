/**
 * Glicko-2 parity: the PL/pgSQL `glicko2_update` (server, D-28) against `@/lib/rating` (client) – Glickman's worked
 * example and 50 generated sequences of rating periods, every step within |Δ| < 0.01.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Glicko2Rating, GlickoResult } from '@/core/rating';
import { updateGlicko2 } from '@/lib/rating';
import { createTestDb, type TestDb } from '../../scripts/supabase/testDb';
import { seededRng } from '../../scripts/supabase/testRows';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

/** One rating period on the server (as `service_role`, the only API role allowed to call it). */
async function sqlUpdate(r: Glicko2Rating, results: readonly GlickoResult[]): Promise<Glicko2Rating> {
  return db.as('service_role', null, async (tx) => {
    const res = await tx.query<Glicko2Rating>(
      `select rating, rd, volatility from public.glicko2_update($1, $2, $3, $4::float8[], $5::float8[], $6::float8[])`,
      [r.rating, r.rd, r.volatility, results.map((x) => x.opponentRating), results.map((x) => x.opponentRd), results.map((x) => x.score)],
    );
    return res.rows[0]!;
  });
}

const delta = (a: Glicko2Rating, b: Glicko2Rating) =>
  Math.max(Math.abs(a.rating - b.rating), Math.abs(a.rd - b.rd), Math.abs(a.volatility - b.volatility));

describe('glicko2_update (SQL) vs updateGlicko2 (TypeScript)', () => {
  it("reproduces Glickman's worked example", async () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const results: GlickoResult[] = [
      { opponentRating: 1400, opponentRd: 30, score: 1 },
      { opponentRating: 1550, opponentRd: 100, score: 0 },
      { opponentRating: 1700, opponentRd: 300, score: 0 },
    ];
    const sql = await sqlUpdate(player, results);
    const ts = updateGlicko2(player, results);
    expect(delta(sql, ts)).toBeLessThan(0.01);
    expect(Math.abs(sql.rating - 1464.06)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(sql.rd - 151.52)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(sql.volatility - 0.05999)).toBeLessThanOrEqual(0.00001);
  });

  it('only grows the RD in a period without results (clamped to 350)', async () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    expect(delta(await sqlUpdate(player, []), updateGlicko2(player, []))).toBeLessThan(1e-9);
    const max = await sqlUpdate({ ...player, rd: 349.9 }, []);
    expect(max.rd).toBe(350);
  });

  it('clamps the RD to at least 45', async () => {
    let sql: Glicko2Rating = { rating: 1500, rd: 50, volatility: 0.03 };
    let ts = sql;
    const results: GlickoResult[] = Array.from({ length: 40 }, (_, i) => ({ opponentRating: 1500, opponentRd: 30, score: i % 2 ? 1 : 0.5 }));
    sql = await sqlUpdate(sql, results);
    ts = updateGlicko2(ts, results);
    expect(sql.rd).toBe(45);
    expect(delta(sql, ts)).toBeLessThan(0.01);
  });

  it('rejects arrays of different lengths', async () => {
    await expect(
      db.as('service_role', null, (tx) =>
        tx.query(`select * from public.glicko2_update(1500, 350, 0.06, array[1500]::float8[], array[]::float8[], array[1]::float8[])`),
      ),
    ).rejects.toThrow(/same length/);
  });

  it('matches on 50 generated sequences of rating periods (every step |Δ| < 0.01)', async () => {
    let worst = 0;
    let steps = 0;
    for (let seq = 0; seq < 50; seq += 1) {
      const rng = seededRng(20261018 + seq);
      let sql: Glicko2Rating = { rating: rng.real(300, 2600), rd: rng.real(45, 350), volatility: rng.real(0.03, 0.09) };
      let ts = sql;
      const periods = rng.int(1, 25);
      for (let p = 0; p < periods; p += 1) {
        // Mostly single results (one period per puzzle attempt / bot game), sometimes several or none.
        const n = rng.bool(0.7) ? 1 : rng.int(0, 6);
        const results: GlickoResult[] = Array.from({ length: n }, () => ({
          opponentRating: rng.bool(0.1) ? ts.rating + rng.real(-1200, 1200) : rng.real(200, 2800),
          opponentRd: rng.pick([30, 50, 80, rng.real(30, 350)]),
          score: rng.pick([0, 0.5, 1] as const),
        }));
        sql = await sqlUpdate(sql, results);
        ts = updateGlicko2(ts, results);
        worst = Math.max(worst, delta(sql, ts));
        steps += 1;
        expect(delta(sql, ts), `sequence ${seq}, period ${p}`).toBeLessThan(0.01);
        // Continue both chains from the TypeScript value so a tiny drift never accumulates unnoticed.
        sql = ts;
      }
    }
    expect(steps).toBeGreaterThan(50);
    expect(worst).toBeLessThan(1e-6);
  });

  it('matches on 50 generated sequences when each side continues from its own values', async () => {
    for (let seq = 0; seq < 50; seq += 1) {
      const rng = seededRng(4242 + seq);
      let sql: Glicko2Rating = { rating: rng.real(400, 2400), rd: 350, volatility: 0.06 };
      let ts = sql;
      const n = rng.int(5, 30);
      for (let i = 0; i < n; i += 1) {
        const results: GlickoResult[] = [{ opponentRating: rng.real(300, 2700), opponentRd: rng.pick([50, 80]), score: rng.pick([0, 1] as const) }];
        sql = await sqlUpdate(sql, results);
        ts = updateGlicko2(ts, results);
      }
      expect(delta(sql, ts), `sequence ${seq}`).toBeLessThan(0.01);
    }
  });
});
