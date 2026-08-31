import type {
  AttendanceEdit,
  AttendanceRecord,
  CheckInEvent,
  DeviceInfo,
  NewSessionInput,
  NewEmployeeInput,
  Session,
  Employee,
  EmployeeEdit,
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
  // ── Employees ──────────────────────────────────────────────────────────────
  listEmployees(): Promise<Employee[]>;
  getEmployeeByPhone(phone: string): Promise<Employee | null>;
  getEmployeeByCode(code: string): Promise<Employee | null>;
  /** Registers a new employee and assigns the next sequential code. */
  registerEmployee(input: NewEmployeeInput): Promise<Employee>;
  /** Updates editable employee fields (name, phone, position). */
  updateEmployee(id: string, patch: EmployeeEdit): Promise<Employee>;
  /** Deletes an employee and their associated attendance records. Codes are not renumbered. */
  deleteEmployee(employeeId: string): Promise<void>;

  // ── Sessions ──────────────────────────────────────────────────────────────
  listSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(input: NewSessionInput): Promise<Session>;
  updateSession(id: string, patch: Partial<Session>): Promise<Session>;
  /** Ends the session and checks out every still-present employee. */
  closeSession(id: string): Promise<Session>;

  // ── Attendance ────────────────────────────────────────────────────────────
  listAttendance(sessionId?: string): Promise<AttendanceRecord[]>;
  /**
   * Marks an employee (by code) as checked in to a session. When `device` is
   * supplied the check-in is also written to the append-only device log, which
   * is what tells the supervisor that one phone checked in several employees. The
   * log never refuses a check-in — it only records it.
   */
  checkIn(
    sessionId: string,
    code: string,
    device?: DeviceInfo,
  ): Promise<AttendanceRecord>;
  /** Marks an employee (by code) as checked out of a session. */
  checkOut(sessionId: string, code: string): Promise<AttendanceRecord>;
  /**
   * The device log, newest first. `sinceIso` bounds the window so the
   * supervisor's screen never pulls the whole history. Supervisor-only.
   */
  listCheckInEvents(sinceIso?: string): Promise<CheckInEvent[]>;
  /**
   * Manually sets an employee's attendance times for a session (upsert). Used for
   * corrections — bypasses the check-in/check-out gates and session status.
   */
  setAttendance(
    sessionId: string,
    employeeId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord>;

  /** Wipes all data. Handy for demos / resetting the local backend. */
  reset(): Promise<void>;
}
