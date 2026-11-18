/**
 * The master "owner" account, and the admin maintenance switch it controls.
 *
 * The owner signs in at /owner with a username and password that only this
 * account has. From there, a single switch puts the two admin areas behind a
 * maintenance ("service is down") screen:
 *   • /VioAdmin   — the supervisor sign-in ("vio admin")
 *   • /rozhadmin  — the owner reports ("rozh admin")
 * While the switch is on, anyone who is not the owner sees the maintenance
 * screen in place of those pages; the owner's own browser is let straight
 * through, so the owner keeps full access the whole time. Employee check-in
 * pages are never touched, so attendance keeps working.
 *
 * WHAT THIS IS AND IS NOT  (the same footing as services/auth/ownerGate.ts)
 * The checks here run in the browser, so they gate what people *see*, not what
 * Postgres will *hand out*: every real table stays protected by its own RLS.
 * The switch is written through a SECURITY DEFINER function that re-checks the
 * owner key in the database, so a casual caller cannot flip it; the value is
 * public to read, which is all the maintenance screen needs. Anyone with the
 * bundle and devtools can still read the key or set the flag by hand — exactly
 * as with the other owner gates in this app. This hides the admin areas; it is
 * not, and is not meant to be, a security boundary.
 */

import { getSupabaseClient } from '@/lib/supabase';

/** The owner's username. Override with VITE_OWNER_ACCOUNT. */
const OWNER_USERNAME =
  (import.meta.env.VITE_OWNER_ACCOUNT as string | undefined)?.trim() || 'owner';

/**
 * SHA-256 of the owner password. Override with VITE_OWNER_ACCOUNT_PASSWORD
 * (hashed here the same way before comparing). Keep this in step with the key
 * in supabase/admin-lockdown.sql — the database re-checks the very same digest.
 */
const OWNER_KEY_SHA256 =
  '81a84dfdc5346cddeab9a1316ceb1a32f7d50178ce44a9838c2a6152a14f76e3';

/** This tab is signed in as the owner (so it bypasses the maintenance screen). */
const SIGNED_IN_KEY = 'vio.ownerAccount';
/** Last switch value seen, so the app still works with no network / no Supabase. */
const MIRROR_KEY = 'vio.adminLockdown';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time-ish comparison, so a wrong guess leaks no timing signal. */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The owner key (SHA-256 of the password), used to sign writes to the switch. */
async function ownerKey(): Promise<string> {
  const override = import.meta.env.VITE_OWNER_ACCOUNT_PASSWORD as
    | string
    | undefined;
  return override ? await sha256Hex(override) : OWNER_KEY_SHA256;
}

/** True when the username and password are the owner's. */
export async function verifyOwnerAccount(
  username: string,
  password: string,
): Promise<boolean> {
  if (username.trim().toLowerCase() !== OWNER_USERNAME.toLowerCase()) return false;
  return equals(await sha256Hex(password), await ownerKey());
}

/** Whether this tab is signed in as the owner. Synchronous — no flicker. */
export function isOwnerSignedIn(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function signInOwnerAccount(): void {
  try {
    sessionStorage.setItem(SIGNED_IN_KEY, '1');
  } catch {
    // Storage blocked: the owner stays signed in for this render only.
  }
}

export function signOutOwnerAccount(): void {
  try {
    sessionStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}

function readMirror(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMirror(on: boolean): void {
  try {
    localStorage.setItem(MIRROR_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the mirror is simply unavailable.
  }
}

/**
 * Whether the admin areas are in maintenance mode right now. Reads the shared
 * switch from Supabase (so one device can lock the others), and falls back to
 * the last value seen on this device when Supabase is absent or unreachable, or
 * when the table has not been created yet. Never throws.
 */
export async function fetchLockdown(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('vio_admin_lockdown')
        .select('locked')
        .eq('id', 1)
        .maybeSingle();
      if (!error && data && typeof data.locked === 'boolean') {
        writeMirror(data.locked);
        return data.locked;
      }
    } catch {
      // Network or schema error: fall back to the mirror below.
    }
  }
  return readMirror();
}

/** Where a change to the switch took effect. */
export type LockdownScope = 'all-devices' | 'this-device';

/**
 * Turn the maintenance switch on or off. Writes the shared switch in Supabase
 * (so every device follows), and always updates this device's mirror. Returns
 * whether the shared write succeeded ('all-devices') or only the local mirror
 * was set ('this-device', e.g. the SQL has not been run or there is no network).
 */
export async function setLockdown(on: boolean): Promise<LockdownScope> {
  writeMirror(on);
  const supabase = getSupabaseClient();
  if (!supabase) return 'this-device';
  try {
    const { error } = await supabase.rpc('vio_set_admin_lockdown', {
      p_locked: on,
      p_key: await ownerKey(),
    });
    return error ? 'this-device' : 'all-devices';
  } catch {
    return 'this-device';
  }
}
