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
