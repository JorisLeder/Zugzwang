/** No secrets in the client: the data layer reads no environment itself (only `AppConfig` from public `VITE_` vars). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const ROOTS = ['src/data', 'src/features/auth', 'src/features/sync'];

describe('client secrets', () => {
  it('reads no environment variables and contains no server keys', () => {
    for (const file of ROOTS.flatMap(files)) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/import\.meta\.env|process\.env/);
      expect(src, file).not.toMatch(/service_role|sk-ant/);
    }
  });
});
