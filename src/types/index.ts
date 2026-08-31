/**
 * Core domain models for the Vio attendance app.
 *
 * An `Employee` is registered once (globally) and is identified by their unique
 * phone number. They receive a short numeric `code` used to check in / out of
 * any session. A `Session` is a single work session. `AttendanceRecord` links an
 * employee to a session with their check-in / check-out timestamps.
 */

export interface Employee {
  id: string;
  /** Short, human-typeable numeric code, e.g. "001". Unique per employee. */
  code: string;
  fullName: string;
  /** Unique identifier for an employee. */
  phone: string;
  /** Job title, e.g. "Field Technician". */
  position: string;
  createdAt: string; // ISO timestamp
}

export type NewEmployeeInput = Omit<Employee, 'id' | 'code' | 'createdAt'>;

/** Editable employee fields for manual correction. */
export type EmployeeEdit = Partial<
  Pick<Employee, 'fullName' | 'phone' | 'position'>
>;

export type SessionStatus = 'active' | 'closed';

export interface Session {
  id: string;
  supervisorName: string;
  /** Optional human label for the session, e.g. "Morning shift — Warehouse". */
  title: string;
  location: string;
  status: SessionStatus;
  /** Gates that control which QR screens accept submissions. */
  checkInOpen: boolean;
  checkOutOpen: boolean;
  startedAt: string; // ISO timestamp
  closedAt?: string; // ISO timestamp — set when the session ends
}

export type NewSessionInput = Pick<
  Session,
  'supervisorName' | 'title' | 'location'
>;

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  employeeId: string;
  checkInAt?: string; // ISO timestamp
  checkOutAt?: string; // ISO timestamp
}

/** Manually set check-in / check-out timestamps. `null` clears the value. */
export interface AttendanceEdit {
  checkInAt: string | null; // ISO timestamp or null
  checkOutAt: string | null; // ISO timestamp or null
}

export type AttendanceStatus = 'absent' | 'checked-in' | 'checked-out';

/** Identifies the phone / browser a check-in was made from. */
export interface DeviceInfo {
  /** Random id kept in that device's localStorage. See utils/device.ts. */
  id: string;
  /** Human-readable hint for the supervisor, e.g. "iPhone · Safari". */
  label: string;
}

/**
 * One check-in, recorded together with the device it came from.
 *
 * Append-only: unlike `AttendanceRecord` (one row per employee per session,
 * overwritten on re-entry) nothing here is ever rewritten, so the supervisor can
 * still see that one phone checked in three employees even after each of them
 * later checked in again from their own phone.
 */
export interface CheckInEvent {
  id: string;
  sessionId: string;
  employeeId: string;
  deviceId: string;
  /**
   * Groups every check-in made from one device inside the rolling window (see
   * `DEVICE_SESSION_WINDOW_HOURS`). Opened by the device's first check-in.
   */
  deviceSessionId: string;
  deviceLabel: string;
  at: string; // ISO timestamp
}

/** An employee joined with their attendance for a specific session (view model). */
export interface SessionAttendee {
  employee: Employee;
  record?: AttendanceRecord;
  status: AttendanceStatus;
}
