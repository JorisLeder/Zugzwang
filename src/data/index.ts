/**
 * `@/data` – data layer factory (D-03). PLACEHOLDER written by WP-00: returns the in-memory data services.
 * WP-08 replaces the implementation (Dexie, outbox, Supabase adapter, auth) WITHOUT changing the signature.
 */
import type { AppConfig } from '@/core/services';
import type { DataServices } from '@/core/storage';
import { createMemoryDataServices } from '@/core/testing';

/** Creates the data services for the app. */
export function createDataServices(config: AppConfig): DataServices {
  void config;
  return createMemoryDataServices({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
}
