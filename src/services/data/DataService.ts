import type {
  AttendanceRecord,
  NewSessionInput,
  NewStudentInput,
  Session,
  Student,
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

  // ── Sessions ──────────────────────────────────────────────────────────────
  listSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(input: NewSessionInput): Promise<Session>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;
  /** Ends the session and checks out every still-present student. */
  closeSession(id: string): Promise<Session>;

  // ── Attendance ────────────────────────────────────────────────────────────
  listAttendance(sessionId?: string): Promise<AttendanceRecord[]>;
  /** Marks a student (by code) as checked in to a session. */
  checkIn(sessionId: string, code: string): Promise<AttendanceRecord>;
  /** Marks a student (by code) as checked out of a session. */
  checkOut(sessionId: string, code: string): Promise<AttendanceRecord>;

  /** Wipes all data. Handy for demos / resetting the local backend. */
  reset(): Promise<void>;
}
