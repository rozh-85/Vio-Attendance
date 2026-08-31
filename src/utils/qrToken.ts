/**
 * Rotating, time-based tokens for check-in / check-out QR codes.
 *
 * The supervisor's screen redraws the QR every {@link QR_ROTATION_MS} with a fresh
 * token derived from the current time window. When an employee scans, the token
 * travels in the URL (`?t=…`) and the check-in page verifies it is still fresh
 * (within {@link QR_ACCEPT_MS}). This blocks the "screenshot the QR and send it
 * to a friend to check in later" trick.
 *
 * NOTE: validation happens in the browser, so the shared secret lives in the JS
 * bundle. This is a deterrent against casual sharing / late check-ins, not a
 * cryptographic guarantee. For that, move validation to a Supabase function.
 */

/** How often the displayed QR changes. */
export const QR_ROTATION_MS = 5000;

/**
 * How long after it was shown a scanned token stays valid. Kept generous so
 * small clock differences between the supervisor's screen and the employee's phone
 * don't reject legitimate scans. Lower it for tighter security.
 */
export const QR_ACCEPT_MS = 60_000;

const ACCEPT_WINDOWS = Math.round(QR_ACCEPT_MS / QR_ROTATION_MS);

// Not a real secret (it ships in the bundle) — it just stops someone from
// forging a token by editing the URL number by hand. Override via env if set.
const SECRET =
  (import.meta.env.VITE_QR_SECRET as string | undefined) ?? 'qra-rotating-qr';

export type QrMode = 'in' | 'out';

/** Fast, non-cryptographic string hash (cyrb53) — enough to sign a token. */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function windowIndexAt(ms: number): number {
  return Math.floor(ms / QR_ROTATION_MS);
}

function tokenForWindow(sessionId: string, mode: QrMode, win: number): string {
  const sig = cyrb53(`${SECRET}|${sessionId}|${mode}|${win}`).toString(36);
  return `${win.toString(36)}.${sig}`;
}

/** The token to embed in the QR right now. */
export function currentQrToken(sessionId: string, mode: QrMode): string {
  return tokenForWindow(sessionId, mode, windowIndexAt(Date.now()));
}

const STATIC_WINDOW = 'static';

/**
 * A constant token for this session/mode that never expires. Used when the
 * supervisor switches the QR to "constant" mode (e.g. so employees can check out
 * from a printed or shared code). Still signed per session, so a token from
 * one session cannot be reused on another.
 */
export function staticQrToken(sessionId: string, mode: QrMode): string {
  const sig = cyrb53(`${SECRET}|${sessionId}|${mode}|${STATIC_WINDOW}`).toString(
    36,
  );
  return `${STATIC_WINDOW}.${sig}`;
}

/** True if `token` was issued for this session/mode and is still fresh. */
export function isQrTokenValid(
  sessionId: string,
  mode: QrMode,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;

  // Constant-mode token: valid for the whole session, no time window.
  if (token.slice(0, dot) === STATIC_WINDOW) {
    return token === staticQrToken(sessionId, mode);
  }

  const win = parseInt(token.slice(0, dot), 36);
  if (Number.isNaN(win)) return false;

  // Signature must match (blocks hand-edited tokens)…
  if (tokenForWindow(sessionId, mode, win) !== token) return false;

  // …and the window must be recent (blocks stale screenshots).
  return Math.abs(windowIndexAt(Date.now()) - win) <= ACCEPT_WINDOWS;
}
