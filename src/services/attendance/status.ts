import type {
  AttendanceMark,
  AttendanceRecord,
  AttendanceStatus,
  Session,
} from '@/types';

/**
 * One reading of an attendance record, used by the session screen, the employee
 * report, the Excel sheet and the printed PDF so all four say the same thing.
 *
 * Closing a session no longer stamps a check-out time on whoever was still
 * present, so "checked in, never checked out" survives as its own state. While
 * the session is running that simply means the employee is still here; once it
 * has ended it means the check-out never happened, which is worth seeing.
 */
export function attendanceStatus(
  session: Pick<Session, 'status' | 'closedAt'>,
  record?: Pick<AttendanceRecord, 'checkInAt' | 'checkOutAt'>,
): AttendanceStatus {
  if (!record?.checkInAt) return 'absent';
  if (record.checkOutAt) return 'checked-out';
  return sessionIsOver(session) ? 'not-checked-out' : 'checked-in';
}

/** A session nobody can scan into any more. */
export function sessionIsOver(
  session: Pick<Session, 'status' | 'closedAt'>,
): boolean {
  return session.status === 'closed' || !!session.closedAt;
}

/** What each status is called, wherever it is shown. */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  absent: 'Absent',
  'checked-in': 'Checked in',
  'checked-out': 'Checked out',
  'not-checked-out': 'Not checked out',
};

/** The session screen's ⋯ menu, in the order it offers them. */
export const ATTENDANCE_MARKS: AttendanceMark[] = [
  'off',
  'not-their-shift',
  'overtime',
  'hourly-leave',
  'official-leave',
];

/** What each mark is called, wherever it is shown. */
export const MARK_LABEL: Record<AttendanceMark, string> = {
  off: 'Off',
  'not-their-shift': 'Not their shift',
  overtime: 'Overtime',
  'hourly-leave': 'Hourly leave',
  'official-leave': 'Official leave',
};

/**
 * No check-in, but a mark that explains why. Such a record is shown as its mark
 * instead of "Absent", and counted as excused rather than absent. A mark on a
 * record with a check-in (overtime, say) is shown next to its status instead.
 */
export function isExcused(
  record?: Pick<AttendanceRecord, 'checkInAt' | 'mark'>,
): boolean {
  return !record?.checkInAt && !!record?.mark;
}
