import { format } from 'date-fns';

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
