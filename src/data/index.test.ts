import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '@/core/services';
import { createDataServices } from '.';
import { stableDeviceId, type DexieDataServices } from './services';

const local: AppConfig = { mode: 'local', cloudEvalEnabled: false, e2e: false };
const g = globalThis as { indexedDB?: unknown; IDBKeyRange?: unknown };

afterEach(() => {
  delete g.indexedDB;
  delete g.IDBKeyRange;
  vi.restoreAllMocks();
});

describe('createDataServices', () => {
  it('falls back to the in-memory services with one warning when IndexedDB is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(g.indexedDB).toBeUndefined();
    const data = createDataServices(local);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(data.auth.mode).toBe('local');
    await data.progress.saveProfile({ displayName: 'Lea' });
    expect((await data.repos.profile.get())?.displayName).toBe('Lea');
  });

  it('uses Dexie synchronously (opens lazily) and creates the local profile on the first start', async () => {
    const fake = await import('fake-indexeddb');
    g.indexedDB = fake.indexedDB;
    g.IDBKeyRange = fake.IDBKeyRange;
    const warn = vi.spyOn(console, 'warn');
    const data = createDataServices(local) as DexieDataServices;
    expect(warn).not.toHaveBeenCalled();
    expect(data.sync.state()).toMatchObject({ mode: 'local', status: 'local-only' });
    await data.ready();
    const profile = await data.repos.profile.get();
    expect(profile).toMatchObject({ displayName: 'Du', onboardingCompleted: false });
    expect(data.auth.session()).toEqual({ userId: profile!.id, provider: 'local' });
    // "Reload": a second instance on the same database keeps the data and the local identity.
    await data.progress.saveProfile({ displayName: 'Lea' });
    data.close();
    const again = createDataServices(local) as DexieDataServices;
    await again.ready();
    expect(await again.repos.profile.get()).toMatchObject({ id: profile!.id, displayName: 'Lea' });
    expect(again.auth.session()?.userId).toBe(profile!.id);
    again.close();
  });

  it('cloud mode without a session stays logged out and does not sync', async () => {
    const fake = await import('fake-indexeddb');
    g.indexedDB = fake.indexedDB;
    g.IDBKeyRange = fake.IDBKeyRange;
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
      }),
    }));
    const data = createDataServices({ ...local, mode: 'cloud', supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }) as DexieDataServices;
    await data.ready();
    expect(data.auth.mode).toBe('cloud');
    expect(data.auth.session()).toBeNull();
    expect(data.sync.state()).toMatchObject({ mode: 'cloud', status: 'synced', pending: 0 });
    data.close();
    vi.doUnmock('@supabase/supabase-js');
  });
});

describe('stableDeviceId', () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, v),
    };
  }

  it('is stable within one tab (reload) and different in another tab', () => {
    const tab = memoryStorage();
    const id = stableDeviceId('zz-device-id', () => tab);
    expect(stableDeviceId('zz-device-id', () => tab)).toBe(id);
    expect(tab.getItem('zz-device-id')).toBe(id);
    expect(stableDeviceId('zz-device-id', () => memoryStorage())).not.toBe(id);
  });

  it('falls back to a fresh id when storage is unavailable', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    expect(stableDeviceId('zz-device-id', blocked)).not.toBe(stableDeviceId('zz-device-id', blocked));
  });
});
