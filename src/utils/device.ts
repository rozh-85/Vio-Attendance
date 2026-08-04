/**
 * Identifies the phone / browser a check-in was made from.
 *
 * The first time a phone checks a student in it stores one random id in its
 * localStorage. That id rides along with every later check-in, so the lecturer
 * can see when a single phone was used to check in several different students —
 * the classic "check me in, I'm not there" case.
 *
 * NOTE: this is a visibility tool, not a security boundary. A student who
 * clears their site data or opens a private tab gets a fresh id. It makes
 * casual proxy check-ins obvious, it does not make them impossible.
 */

import { uid } from './id';
import type { DeviceInfo } from '@/types';

const DEVICE_ID_KEY = 'qra.deviceId';

/**
 * How long one device "session" lasts. Every check-in made from the same phone
 * inside this window is grouped together and reported to the lecturer as one
 * shared device. Mirrored by `v_window` in the SQL `check_in` function —
 * change both together (see supabase/device-checkin-tracking.sql).
 */
export const DEVICE_SESSION_WINDOW_HOURS = 8;

/**
 * How many different students may check in from one phone inside that window.
 * The next student is turned away and told to use their own phone. Mirrored by
 * `v_max_students` in the SQL `check_in` function — raise both to a large
 * number to keep the reporting but drop the limit.
 */
export const MAX_STUDENTS_PER_DEVICE = 3;

/** Fallback for browsers where storage is unavailable (private mode). */
let memoryDeviceId = '';

/** The stable id for this browser, created on first use. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const fresh = memoryDeviceId || uid();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    memoryDeviceId = fresh;
    return fresh;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = uid();
    return memoryDeviceId;
  }
}

// Browser checks run before OS-ish ones and specific engines before generic
// ones: every Chrome UA also says "Safari", every Edge UA also says "Chrome".
const BROWSERS: [RegExp, string][] = [
  [/\bEdgi?A?\//, 'Edge'],
  [/\bOPR\/|\bOpera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/\bFirefox\/|FxiOS/, 'Firefox'],
  [/\bChrome\/|CriOS/, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const PLATFORMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'Mac'],
  [/Linux/, 'Linux'],
];

function firstMatch(pairs: [RegExp, string][], value: string): string {
  return pairs.find(([pattern]) => pattern.test(value))?.[1] ?? '';
}

/**
 * A short, human-readable hint like "iPhone · Safari", shown to the lecturer
 * next to the flagged names. Just enough to recognise the phone in the room.
 */
export function describeDevice(userAgent?: string): string {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '') ??
    '';
  const parts = [firstMatch(PLATFORMS, ua), firstMatch(BROWSERS, ua)].filter(
    Boolean,
  );
  return parts.join(' · ') || 'Unknown device';
}

/** Device identity to send with a check-in. */
export function currentDevice(): DeviceInfo {
  return { id: getDeviceId(), label: describeDevice() };
}
