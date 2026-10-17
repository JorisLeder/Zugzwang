/**
 * `@/data` – data layer factory (D-03): Dexie (IndexedDB) with an outbox, the Supabase sync adapter in cloud mode
 * (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`), local auth otherwise. Synchronous; the database opens lazily.
 * Without IndexedDB (old WebViews, some private modes) it falls back to the in-memory data services.
 */
import type { AppConfig } from '@/core/services';
import type { DataServices } from '@/core/storage';
import { createMemoryDataServices } from '@/core/testing/memoryData';
import { userTimeZone } from '@/lib/time';
import { globalIndexedDb } from './db';
import { createDexieDataServices, stableDeviceId } from './services';
import { createSupabaseProvider } from './supabase/client';

export { computeStreak, type StreakInfo } from './progress';
export { createDexieDataServices, type DexieDataOptions, type DexieDataServices } from './services';

/** Creates the data services for the app. */
export function createDataServices(config: AppConfig): DataServices {
  const timeZone = userTimeZone();
  const indexedDb = globalIndexedDb();
  if (!indexedDb) {
    console.warn('Zugzwang: IndexedDB ist nicht verfügbar – der Fortschritt wird nur bis zum Schließen der Seite gehalten.');
    return createMemoryDataServices({ timeZone });
  }
  const cloud = config.mode === 'cloud' && !!config.supabaseUrl && !!config.supabaseAnonKey;
  return createDexieDataServices({
    mode: cloud ? 'cloud' : 'local',
    indexedDb,
    client: cloud ? createSupabaseProvider(config.supabaseUrl!, config.supabaseAnonKey!) : undefined,
    timeZone,
    deviceId: stableDeviceId(),
  });
}
