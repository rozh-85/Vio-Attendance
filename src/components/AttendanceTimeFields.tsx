import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import type { AttendanceStatus } from '@/types';

/** Derives the status implied by a pair of `datetime-local` values. */
export function attendanceStatusFrom(
  checkIn: string,
  checkOut: string,
): AttendanceStatus {
  if (!checkIn) return 'absent';
  return checkOut ? 'checked-out' : 'checked-in';
}

/** Validates a pair of `datetime-local` values, or null when they're fine. */
export function attendanceTimesError(
  checkIn: string,
  checkOut: string,
): string | null {
  if (checkOut && !checkIn) {
    return 'Set a check-in time before a check-out time.';
  }
  if (checkIn && checkOut && new Date(checkOut) < new Date(checkIn)) {
    return 'Check-out cannot be before check-in.';
  }
  return null;
}

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === 'checked-in') return <Badge tone="success">✓ In</Badge>;
  if (status === 'checked-out') return <Badge tone="info">✓ Out</Badge>;
  return <Badge tone="neutral">Absent</Badge>;
}

/**
 * The check-in / check-out half of an attendance edit: a live status badge, the
 * two time fields and a shortcut to clear them. Shared by the session-view and
 * employee-report edit modals so a correction works the same way from either.
 */
export function AttendanceTimeFields({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
}: {
  /** `datetime-local` value ('' means unset). */
  checkIn: string;
  checkOut: string;
  onCheckInChange: (value: string) => void;
  onCheckOutChange: (value: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-ink-700">Status</span>
        <AttendanceStatusBadge
          status={attendanceStatusFrom(checkIn, checkOut)}
        />
      </div>

      <Input
        label="Check-in"
        type="datetime-local"
        value={checkIn}
        onChange={(e) => onCheckInChange(e.target.value)}
      />
      <Input
        label="Check-out"
        type="datetime-local"
        value={checkOut}
        onChange={(e) => onCheckOutChange(e.target.value)}
      />

      <button
        type="button"
        className="text-sm font-semibold text-ink-500 hover:text-ink-700"
        onClick={() => {
          onCheckInChange('');
          onCheckOutChange('');
        }}
      >
        Mark absent (clear times)
      </button>
    </>
  );
}
