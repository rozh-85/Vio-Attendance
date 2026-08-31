/**
 * A second lock on the shared-phone report, on top of the supervisor sign-in.
 *
 * The report names employees suspected of checking in for each other, so it
 * lives at its own unlisted URL and asks for the owner's own credentials
 * before it renders.
 *
 * WHAT THIS IS AND IS NOT
 * This check runs in the browser, so it cannot keep out anyone with devtools —
 * they can flip the unlock flag by hand. It keeps the page out of casual sight;
 * the *data* is protected by Postgres, where `check_in_events` is readable only
 * by an authenticated supervisor (see supabase/device-checkin-tracking.sql).
 * Bypassing this gate without a Supabase session shows an empty page.
 *
 * The password is stored as a SHA-256 digest, never in the clear, so the
 * bundle cannot be read for a password that may be used elsewhere too.
 */

const UNLOCK_KEY = 'vio.ownerUnlocked';

/** Override in `.env` to change who can open the report. */
const OWNER_EMAIL =
  (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.trim() ||
  'rozh@gmail.com';

/**
 * SHA-256 of the owner's password. Set `VITE_OWNER_PASSWORD` in `.env` to use a
 * different one — it is hashed here the same way before comparing.
 */
const OWNER_PASSWORD_SHA256 =
  '3a1bdf732b0f1fa4866609122fb117a528f860ca8e030575f626e4272d5b17a0';

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

export async function verifyOwner(
  email: string,
  password: string,
): Promise<boolean> {
  if (email.trim().toLowerCase() !== OWNER_EMAIL.toLowerCase()) return false;

  const override = import.meta.env.VITE_OWNER_PASSWORD as string | undefined;
  const expected = override
    ? await sha256Hex(override)
    : OWNER_PASSWORD_SHA256;
  return equals(await sha256Hex(password), expected);
}

/**
 * Unlocked state lives in sessionStorage, so closing the tab re-locks the page —
 * a supervisor's laptop is often left open in the room.
 */
export function isOwnerUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockOwner(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    // Storage blocked: the page stays open for this render only.
  }
}

export function lockOwner(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
