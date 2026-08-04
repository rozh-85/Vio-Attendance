/**
 * Core domain models for the QR attendance app.
 *
 * A `Student` registers once (globally) and is identified by their unique phone
 * number. They receive a short numeric `code` used to check in / out of any
 * session. A `Session` is a single lecture. `AttendanceRecord` links a student
 * to a session with their check-in / check-out timestamps.
 */

export interface Student {
  id: string;
  /** Short, human-typeable numeric code, e.g. "001". Unique per student. */
  code: string;
  fullName: string;
  /** Unique identifier for a student. */
  phone: string;
  college: string;
  department: string;
  createdAt: string; // ISO timestamp
}

export type NewStudentInput = Omit<Student, 'id' | 'code' | 'createdAt'>;

/** Editable student fields for manual correction. */
export type StudentEdit = Partial<Pick<Student, 'fullName' | 'phone' | 'college' | 'department'>>;

export type SessionStatus = 'active' | 'closed';

export interface Session {
  id: string;
  lecturerName: string;
  /** Optional human label for the lecture, e.g. "CSC 302 — Design Patterns". */
  title: string;
  location: string;
  status: SessionStatus;
  /** Gates that control which QR screens accept submissions. */
  checkInOpen: boolean;
  checkOutOpen: boolean;
  startedAt: string; // ISO timestamp
  closedAt?: string; // ISO timestamp — set when the session ends
}

export type NewSessionInput = Pick<Session, 'lecturerName' | 'title' | 'location'>;

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
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
  /** Human-readable hint for the lecturer, e.g. "iPhone · Safari". */
  label: string;
}

/**
 * One check-in, recorded together with the device it came from.
 *
 * Append-only: unlike `AttendanceRecord` (one row per student per session,
 * overwritten on re-entry) nothing here is ever rewritten, so the lecturer can
 * still see that one phone checked in three students even after each of them
 * later checked in again from their own phone.
 */
export interface CheckInEvent {
  id: string;
  sessionId: string;
  studentId: string;
  deviceId: string;
  /**
   * Groups every check-in made from one device inside the rolling window (see
   * `DEVICE_SESSION_WINDOW_HOURS`). Opened by the device's first check-in.
   */
  deviceSessionId: string;
  deviceLabel: string;
  at: string; // ISO timestamp
}

/** A student joined with their attendance for a specific session (view model). */
export interface SessionAttendee {
  student: Student;
  record?: AttendanceRecord;
  status: AttendanceStatus;
}
