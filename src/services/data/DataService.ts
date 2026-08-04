import type {
  AttendanceEdit,
  AttendanceRecord,
  CheckInEvent,
  DeviceInfo,
  NewSessionInput,
  NewStudentInput,
  Session,
  Student,
  StudentEdit,
} from '@/types';

/**
 * Abstraction over the persistence backend. The UI depends only on this
 * interface, so swapping the local (in-browser) implementation for Supabase
 * requires no changes above this layer.
 *
 * All methods are async so the Supabase implementation is a drop-in.
 * Implementations throw `DataError` (see ./errors) for expected domain failures.
 */
export interface DataService {
  // ── Students ──────────────────────────────────────────────────────────────
  listStudents(): Promise<Student[]>;
  getStudentByPhone(phone: string): Promise<Student | null>;
  getStudentByCode(code: string): Promise<Student | null>;
  /** Registers a new student and assigns the next sequential code. */
  registerStudent(input: NewStudentInput): Promise<Student>;
  /** Updates editable student fields (name, phone, college, department). */
  updateStudent(id: string, patch: StudentEdit): Promise<Student>;
  /** Deletes a student and their associated attendance records. Codes are not renumbered. */
  deleteStudent(studentId: string): Promise<void>;

  // ── Sessions ──────────────────────────────────────────────────────────────
  listSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(input: NewSessionInput): Promise<Session>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;
  /** Ends the session and checks out every still-present student. */
  closeSession(id: string): Promise<Session>;

  // ── Attendance ────────────────────────────────────────────────────────────
  listAttendance(sessionId?: string): Promise<AttendanceRecord[]>;
  /**
   * Marks a student (by code) as checked in to a session. When `device` is
   * supplied the check-in is also written to the append-only device log, and
   * refused with `DEVICE_LIMIT_REACHED` once that phone has checked in more
   * than `MAX_STUDENTS_PER_DEVICE` students in the current window.
   */
  checkIn(
    sessionId: string,
    code: string,
    device?: DeviceInfo,
  ): Promise<AttendanceRecord>;
  /** Marks a student (by code) as checked out of a session. */
  checkOut(sessionId: string, code: string): Promise<AttendanceRecord>;
  /**
   * The device log, newest first. `sinceIso` bounds the window so the
   * lecturer's screen never pulls the whole history. Lecturer-only.
   */
  listCheckInEvents(sinceIso?: string): Promise<CheckInEvent[]>;
  /**
   * Manually sets a student's attendance times for a session (upsert). Used for
   * corrections — bypasses the check-in/check-out gates and session status.
   */
  setAttendance(
    sessionId: string,
    studentId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord>;

  /** Wipes all data. Handy for demos / resetting the local backend. */
  reset(): Promise<void>;
}
