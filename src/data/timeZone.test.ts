/** DS-4 client side: the profile carries the user's time zone to the server (`profiles.time_zone`). */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_TIME_ZONE, type Profile } from '@/core/profile';
import { fromRow, toRow, type ProfileRow } from '@/core/tables';
import { newId } from '@/lib/ids';
import { createDexieDataServices, type DexieDataServices } from './services';
import { createFakeDevice, FakeSupabaseServer, waitFor, type FakeDevice } from './testing';

const AT = '2026-10-19T10:00:00.000Z';
const profile: Profile = {
  id: 'u1',
  displayName: 'Lea',
  settings: { ...DEFAULT_SETTINGS, updatedAt: AT },
  dailyGoalMinutes: 20,
  selfAssessment: 'beginner',
  onboardingCompleted: true,
  stageZeroSkipped: false,
  timeZone: 'America/New_York',
  createdAt: AT,
  updatedAt: AT,
};

const devices: FakeDevice[] = [];
const locals: DexieDataServices[] = [];
afterEach(async () => {
  for (const d of devices.splice(0)) {
    await d.data.settled();
    d.close();
  }
  for (const l of locals.splice(0)) l.close();
});

describe('profile time zone', () => {
  it('maps to time_zone and back; a missing value means Europe/Berlin', () => {
    const row = toRow.profile(profile);
    expect(row.time_zone).toBe('America/New_York');
    expect(fromRow.profile(row)).toEqual(profile);
    expect(fromRow.profile({ ...row, time_zone: undefined } as unknown as ProfileRow).timeZone).toBe(DEFAULT_TIME_ZONE);
    expect(toRow.profile({ ...profile, timeZone: '' }).time_zone).toBe(DEFAULT_TIME_ZONE);
  });

  it('local profiles start with the device time zone and every profile write stamps it', async () => {
    const data = createDexieDataServices({ mode: 'local', dbName: `tz-${newId()}`, timeZone: 'Asia/Tokyo', deviceId: 'd' });
    locals.push(data);
    await data.ready();
    expect((await data.repos.profile.get())?.timeZone).toBe('Asia/Tokyo');
    // A profile written by an older version (no time zone) reads as the default and is stamped by the next write.
    const old = { ...(await data.repos.profile.get())! } as Partial<Profile>;
    delete old.timeZone;
    await data.db.profile.put(old as Profile);
    expect((await data.repos.profile.get())?.timeZone).toBe(DEFAULT_TIME_ZONE);
    await data.progress.saveProfile({ displayName: 'Lea' });
    expect(await data.repos.profile.get()).toMatchObject({ displayName: 'Lea', timeZone: 'Asia/Tokyo' });
  });

  it('cloud: the server stores the device time zone (new profile, and an existing one after login)', async () => {
    const server = new FakeSupabaseServer();
    const a = createFakeDevice(server, { email: 'lea@example.com', timeZone: 'Europe/Berlin' });
    devices.push(a);
    await a.data.ready();
    await a.data.progress.saveProfile({ displayName: 'Lea' });
    await a.data.settled();
    const uid = server.userByEmail('lea@example.com')!.id;
    await waitFor(() => server.rows<ProfileRow>('profiles', uid)[0]?.display_name === 'Lea');
    expect(server.rows<ProfileRow>('profiles', uid)[0]!.time_zone).toBe('Europe/Berlin');

    // The same user logs in on a device in New York: the profile (pulled from the server) is updated with its zone.
    const b = createFakeDevice(server, { email: 'lea@example.com', timeZone: 'America/New_York' });
    devices.push(b);
    await b.data.ready();
    await b.data.settled();
    await waitFor(() => server.rows<ProfileRow>('profiles', uid)[0]?.time_zone === 'America/New_York');
    expect((await b.data.repos.profile.get())?.timeZone).toBe('America/New_York');
    expect(server.rows<ProfileRow>('profiles', uid)[0]!.display_name).toBe('Lea');
  });
});
