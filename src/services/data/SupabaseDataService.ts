import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AttendanceEdit,
  AttendanceRecord,
  NewSessionInput,
  NewStudentInput,
  Session,
  Student,
  StudentEdit,
} from '@/types';
import { normalizePhone } from '@/utils/id';
import type { DataService } from './DataService';
import { DataError, type DataErrorCode } from './errors';

/**
 * Supabase-backed implementation of {@link DataService}.
 *
 * Expects three tables (see `supabase/schema.sql`): `students`, `sessions`,
 * `attendance`. Rows use snake_case; the mappers below translate to/from the
 * camelCase domain models so the rest of the app never sees database shapes.
 */
export class SupabaseDataService implements DataService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  // ── Mappers ───────────────────────────────────────────────────────────────
  private toStudent(row: StudentRow): Student {
    return {
      id: row.id,
      code: row.code,
      fullName: row.full_name,
      phone: row.phone,
      college: row.college,
      department: row.department,
      createdAt: row.created_at,
    };
  }

  private toSession(row: SessionRow): Session {
    return {
      id: row.id,
      lecturerName: row.lecturer_name,
      title: row.title,
      location: row.location,
      status: row.status,
      checkInOpen: row.check_in_open,
      checkOutOpen: row.check_out_open,
      startedAt: row.started_at,
      closedAt: row.closed_at ?? undefined,
    };
  }

  private toRecord(row: AttendanceRow): AttendanceRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      studentId: row.student_id,
      checkInAt: row.check_in_at ?? undefined,
      checkOutAt: row.check_out_at ?? undefined,
    };
  }

  private async getAttendanceRow(
    sessionId: string,
    studentId: string,
  ): Promise<AttendanceRow | null> {
    const { data, error } = await this.client
      .from('attendance')
      .select('*')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw error;
    return (data as AttendanceRow | null) ?? null;
  }

  /**
   * The student-facing RPCs (`register_student`, `check_in`, …) signal expected
   * business errors by raising an exception whose message is a {@link
   * DataErrorCode}. Translate those back into a typed {@link DataError} so the
   * UI shows the same friendly message as the local backend; re-throw anything
   * unexpected untouched.
   */
  private throwRpcError(error: { message?: string }): never {
    const code = error.message as DataErrorCode;
    const message = RPC_ERROR_MESSAGES[code];
    if (message) throw new DataError(code, message);
    throw error as unknown as Error;
  }

  // ── Students ──────────────────────────────────────────────────────────────
  async listStudents(): Promise<Student[]> {
    const { data, error } = await this.client
      .from('students')
      .select('*')
      .order('code', { ascending: true });
    if (error) throw error;
    return (data as StudentRow[]).map((r) => this.toStudent(r));
  }

  async getStudentByPhone(phone: string): Promise<Student | null> {
    // Routed through a security-definer function so the public anon key can look
    // up a single student by their own phone number without being able to read
    // (enumerate) the whole roster. See supabase/harden-student-data.sql.
    const { data, error } = await this.client.rpc('recover_student_code', {
      p_phone: normalizePhone(phone),
    });
    if (error) this.throwRpcError(error);
    return data ? this.toStudent(data as StudentRow) : null;
  }

  async getStudentByCode(code: string): Promise<Student | null> {
    const { data, error } = await this.client
      .from('students')
      .select('*')
      .eq('code', code.trim())
      .maybeSingle();
    if (error) throw error;
    return data ? this.toStudent(data as StudentRow) : null;
  }

  async registerStudent(input: NewStudentInput): Promise<Student> {
    // The whole registration (duplicate-phone guard, code allocation, insert)
    // runs inside a security-definer function, so the anon key never needs
    // read/write rights on the students table. See harden-student-data.sql.
    const { data, error } = await this.client.rpc('register_student', {
      p_full_name: input.fullName.trim(),
      p_phone: normalizePhone(input.phone),
      p_college: input.college.trim(),
      p_department: input.department.trim(),
    });
    if (error) this.throwRpcError(error);
    return this.toStudent(data as StudentRow);
  }

  async updateStudent(id: string, patch: StudentEdit): Promise<Student> {
    const row: Partial<StudentRow> = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) row.phone = normalizePhone(patch.phone);
    if (patch.college !== undefined) row.college = patch.college.trim();
    if (patch.department !== undefined) row.department = patch.department.trim();

    const { data, error } = await this.client
      .from('students')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      if (hasPostgresErrorCode(error, '23505')) {
        throw new DataError(
          'PHONE_TAKEN',
          'This phone number is already registered.',
        );
      }
      throw error;
    }
    return this.toStudent(data as StudentRow);
  }

  async deleteStudent(studentId: string): Promise<void> {
    const { data: studentData, error: fetchError } = await this.client
      .from('students')
      .select('id')
      .eq('id', studentId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!studentData) {
      throw new DataError('STUDENT_NOT_FOUND', 'Student not found.');
    }

    // Delete all attendance records for this student
    const { error: attendanceError } = await this.client
      .from('attendance')
      .delete()
      .eq('student_id', studentId);

    if (attendanceError) throw attendanceError;

    // Delete the student
    const { error: studentError } = await this.client
      .from('students')
      .delete()
      .eq('id', studentId);

    if (studentError) throw studentError;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async listSessions(): Promise<Session[]> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .order('started_at', { ascending: false });
    if (error) throw error;
    return (data as SessionRow[]).map((r) => this.toSession(r));
  }

  async getSession(id: string): Promise<Session | null> {
    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.toSession(data as SessionRow) : null;
  }

  async createSession(input: NewSessionInput): Promise<Session> {
    const { data, error } = await this.client
      .from('sessions')
      .insert({
        lecturer_name: input.lecturerName.trim(),
        title: input.title.trim(),
        location: input.location.trim(),
        status: 'active',
        check_in_open: false,
        check_out_open: false,
      })
      .select('*')
      .single();
    if (error) throw error;
    return this.toSession(data as SessionRow);
  }

  async updateSession(id: string, patch: Partial<Session>): Promise<Session> {
    const row: Partial<SessionRow> = {};
    if (patch.lecturerName !== undefined) row.lecturer_name = patch.lecturerName;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.checkInOpen !== undefined) row.check_in_open = patch.checkInOpen;
    if (patch.checkOutOpen !== undefined) row.check_out_open = patch.checkOutOpen;
    if (patch.closedAt !== undefined) row.closed_at = patch.closedAt;

    const { data, error } = await this.client
      .from('sessions')
      .update(row)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return this.toSession(data as SessionRow);
  }

  async closeSession(id: string): Promise<Session> {
    const closedAt = new Date().toISOString();

    // Auto check-out anyone still present.
    const { error: checkoutError } = await this.client
      .from('attendance')
      .update({ check_out_at: closedAt })
      .eq('session_id', id)
      .not('check_in_at', 'is', null)
      .is('check_out_at', null);
    if (checkoutError) throw checkoutError;

    return this.updateSession(id, {
      status: 'closed',
      checkInOpen: false,
      checkOutOpen: false,
      closedAt,
    });
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  async listAttendance(sessionId?: string): Promise<AttendanceRecord[]> {
    let query = this.client.from('attendance').select('*');
    if (sessionId) query = query.eq('session_id', sessionId);
    const { data, error } = await query;
    if (error) throw error;
    return (data as AttendanceRow[]).map((r) => this.toRecord(r));
  }

  async checkIn(sessionId: string, code: string): Promise<AttendanceRecord> {
    // All validation + write happens in the `check_in` security-definer
    // function so the anon key needs no direct rights on the attendance or
    // students tables. See supabase/harden-student-data.sql.
    const { data, error } = await this.client.rpc('check_in', {
      p_session_id: sessionId,
      p_code: code.trim(),
    });
    if (error) this.throwRpcError(error);
    return this.toRecord(data as AttendanceRow);
  }

  async checkOut(sessionId: string, code: string): Promise<AttendanceRecord> {
    const { data, error } = await this.client.rpc('check_out', {
      p_session_id: sessionId,
      p_code: code.trim(),
    });
    if (error) this.throwRpcError(error);
    return this.toRecord(data as AttendanceRow);
  }

  async setAttendance(
    sessionId: string,
    studentId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord> {
    const existing = await this.getAttendanceRow(sessionId, studentId);

    if (existing) {
      const { data, error } = await this.client
        .from('attendance')
        .update({
          check_in_at: edit.checkInAt,
          check_out_at: edit.checkOutAt,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return this.toRecord(data as AttendanceRow);
    }

    const { data, error } = await this.client
      .from('attendance')
      .insert({
        session_id: sessionId,
        student_id: studentId,
        check_in_at: edit.checkInAt,
        check_out_at: edit.checkOutAt,
      })
      .select('*')
      .single();
    if (error) throw error;
    return this.toRecord(data as AttendanceRow);
  }

  async reset(): Promise<void> {
    throw new DataError(
      'NOT_IMPLEMENTED',
      'Reset is disabled for the Supabase backend.',
    );
  }
}

// ── Row shapes (database, snake_case) ─────────────────────────────────────────
interface StudentRow {
  id: string;
  code: string;
  full_name: string;
  phone: string;
  college: string;
  department: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  lecturer_name: string;
  title: string;
  location: string;
  status: 'active' | 'closed';
  check_in_open: boolean;
  check_out_open: boolean;
  started_at: string;
  closed_at: string | null;
}

interface AttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
}

// Friendly messages for the business errors raised by the student-facing RPCs,
// mirroring the messages the local backend throws. Keyed by the code the
// Postgres function raises (see supabase/harden-student-data.sql).
const RPC_ERROR_MESSAGES: Partial<Record<DataErrorCode, string>> = {
  PHONE_TAKEN: 'This phone number is already registered.',
  STUDENT_NOT_FOUND: 'No student found for that code.',
  SESSION_NOT_FOUND: 'Session not found.',
  SESSION_CLOSED: 'This session has ended.',
  CHECK_IN_CLOSED: 'Check-in is not open.',
  CHECK_OUT_CLOSED: 'Check-out is not open.',
  NOT_CHECKED_IN: 'You have not checked in.',
  ALREADY_CHECKED_IN: 'You are already checked in.',
  ALREADY_CHECKED_OUT: 'You have already checked out.',
};

function hasPostgresErrorCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}
