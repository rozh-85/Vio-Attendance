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

export type AttendanceStatus = 'absent' | 'checked-in' | 'checked-out';

/** A student joined with their attendance for a specific session (view model). */
export interface SessionAttendee {
  student: Student;
  record?: AttendanceRecord;
  status: AttendanceStatus;
}
