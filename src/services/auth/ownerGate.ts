/**
 * A second lock on the shared-phone report, on top of the lecturer sign-in.
 *
 * The report names students suspected of checking in for each other, so it
 * lives at its own unlisted URL and asks for the owner's own credentials
 * before it renders.
 *
 * WHAT ACTUALLY PROTECTS THE DATA
 * The form runs in the browser, so by itself it could be bypassed with devtools.
 * It is not by itself: the password typed here is the same one Postgres checks.
 * `check_in_events` is readable by no one directly — the only way in is the
 * `list_check_in_events` function, which returns rows only when the password
 * hashes to the digest stored in the database (see
 * `supabase/lock-device-log.sql`). Flipping the unlock flag in devtools
 * therefore yields an empty report.
 *
 * That matters because every lecturer signs in with the same Supabase account,
 * so the account cannot tell the owner apart from them — this password is what
 * does.
 *
 * The password itself is never in the bundle: only its SHA-256 digest, which
 * cannot be turned back into the password.
 */

/**
 * Holds the owner password for this tab. It is sent to Postgres on every read
 * of the device log, so it has to survive navigation between the report and the
 * dashboard — but not the tab closing, since a lecturer's laptop is often left
 * open in the room.
 */
const SECRET_KEY = 'qra.ownerKey';

/** Override in `.env` to change who can open the report. */
const OWNER_EMAIL =
  (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.trim() ||
  'rozh@gmail.com';

/**
 * SHA-256 of the owner's password. Set `VITE_OWNER_PASSWORD` in `.env` to use a
 * different one — it is hashed here the same way before comparing.
 *
 * Changing the password means changing it in the database too, or the report
 * will open and then come up empty. See `supabase/lock-device-log.sql`.
 */
const OWNER_PASSWORD_SHA256 =
  '3a1bdf732b0f1fa4866609122fb117a528f860ca8e030575f626e4272d5b17a0';

/** Fallback for browsers where sessionStorage is unavailable (private mode). */
let memorySecret: string | null = null;

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
 * The owner password for this tab, or null. Postgres wants it verbatim so it
 * can hash it itself — sending the digest instead would be no protection at
 * all, since the digest is sitting in the JavaScript bundle for anyone to read.
 */
export function ownerSecret(): string | null {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? memorySecret;
  } catch {
    return memorySecret;
  }
}

export function isOwnerUnlocked(): boolean {
  return ownerSecret() !== null;
}

export function unlockOwner(password: string): void {
  memorySecret = password;
  try {
    sessionStorage.setItem(SECRET_KEY, password);
  } catch {
    // Storage blocked: the password lives in memory for this page load only.
  }
}

export function lockOwner(): void {
  memorySecret = null;
  try {
    sessionStorage.removeItem(SECRET_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
