import { getSupabaseClient } from '@/lib/supabase';
import type { DataService } from './DataService';
import { LocalStorageDataService } from './LocalStorageDataService';
import { SupabaseDataService } from './SupabaseDataService';

export type { DataService } from './DataService';
export { DataError, isDataError, type DataErrorCode } from './errors';

/**
 * Builds the DataService for the configured backend.
 *
 * - `VITE_DATA_BACKEND=supabase` + valid credentials → Supabase.
 * - anything else (default) → in-browser localStorage.
 *
 * Falls back to local if Supabase is requested but not configured, so the app
 * always boots.
 */
export function createDataService(): DataService {
  if (import.meta.env.VITE_DATA_BACKEND === 'supabase') {
    const client = getSupabaseClient();
    if (client) return new SupabaseDataService(client);
    // eslint-disable-next-line no-console
    console.warn(
      '[data] VITE_DATA_BACKEND=supabase but credentials are missing; ' +
        'falling back to local storage.',
    );
  }
  return new LocalStorageDataService();
}

/** Singleton used throughout the app. */
export const dataService: DataService = createDataService();
