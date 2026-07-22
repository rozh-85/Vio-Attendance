import { format } from 'date-fns';
import type { AttendanceRecord, Session } from '@/types';

/** Difference between two ISO timestamps, in hours (floating point). */
export function hoursBetween(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, ms) / (1000 * 60 * 60);
}

/** Rounds hours to 2 decimals for display / export. */
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

export function formatClock(iso?: string): string {
  if (!iso) return '—';
  return format(new Date(iso), 'hh:mm a');
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return format(new Date(iso), 'EEEE, d MMMM yyyy');
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return format(new Date(iso), 'd MMM yyyy, hh:mm a');
}

/** Converts an ISO timestamp to a value for an `<input type="datetime-local">`. */
export function toDateTimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

/** Converts a `datetime-local` input value back to an ISO timestamp (or null). */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Minutes a student was actually present in a session, capped to the session
 * window: an open check-out counts up to the session's close (or now, if the
 * session is still running). Shared by the student and lecture reports so both
 * add up hours the same way.
 */
export function presentMinutes(
  session: Session,
  record?: AttendanceRecord,
): number {
  if (!record?.checkInAt) return 0;
  const sessionEnd = session.closedAt ?? new Date().toISOString();
  const start = Math.max(
    new Date(record.checkInAt).getTime(),
    new Date(session.startedAt).getTime(),
  );
  const end = Math.min(
    new Date(record.checkOutAt ?? sessionEnd).getTime(),
    new Date(sessionEnd).getTime(),
  );
  return Math.max(0, Math.round((end - start) / 60000));
}

/** Formats a total minute count as zero-padded `HH:MM`. */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
