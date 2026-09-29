import type { AttendanceRecord, AttendanceStatus, Session } from '@/types';

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
