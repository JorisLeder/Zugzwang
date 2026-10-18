import { describe, expect, it } from 'vitest';
import { migrationFiles, testUuid, upsertSql } from './testDb';

describe('test database helpers', () => {
  it('builds the statements PostgREST sends for insert / upsert / ignoreDuplicates', () => {
    expect(upsertSql('games', ['id', 'pgn'])).toBe(
      'insert into public."games" ("id", "pgn") select "id", "pgn" from json_populate_recordset(null::public."games", $1::json)',
    );
    expect(upsertSql('games', ['id', 'pgn'], { onConflict: 'id', returning: '*' })).toMatch(
      / on conflict \("id"\) do update set "id" = excluded\."id", "pgn" = excluded\."pgn" returning \*$/,
    );
    expect(upsertSql('ratings', ['user_id', 'kind'], { onConflict: 'user_id, kind', ignoreDuplicates: true, returning: 'user_id,kind' })).toMatch(
      / on conflict \("user_id", "kind"\) do nothing returning "user_id", "kind"$/,
    );
  });

  it('rejects identifiers that are not plain names', () => {
    expect(() => upsertSql('games; drop table x', ['id'])).toThrow(/Invalid identifier/);
    expect(() => upsertSql('games', ['id"'])).toThrow(/Invalid identifier/);
  });

  it('lists the migrations in name order and makes valid UUIDs', () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toBe(true);
    expect(testUuid(255)).toMatch(/^[0-9a-f]{8}-0000-4000-8000-0000000000ff$/);
  });
});
