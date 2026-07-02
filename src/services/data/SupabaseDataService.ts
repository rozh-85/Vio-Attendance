import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AttendanceRecord,
  NewSessionInput,
  NewStudentInput,
  Session,
  Student,
} from '@/types';
import { formatCode, normalizePhone } from '@/utils/id';
import type { DataService } from './DataService';
import { DataError } from './errors';

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
    const { data, error } = await this.client
      .from('students')
      .select('*')
      .eq('phone', normalizePhone(phone))
      .maybeSingle();
    if (error) throw error;
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
    const phone = normalizePhone(input.phone);
    if (await this.getStudentByPhone(phone)) {
      throw new DataError(
        'PHONE_TAKEN',
        'This phone number is already registered.',
      );
    }

    // `next_student_code` is a Postgres function returning the next sequence
    // value; see supabase/schema.sql. Falls back to a count if unavailable.
    let code: string;
    const { data: seq, error: seqError } = await this.client.rpc(
      'next_student_code',
    );
    if (!seqError && typeof seq === 'number') {
      code = formatCode(seq);
    } else {
      const { count } = await this.client
        .from('students')
        .select('*', { count: 'exact', head: true });
      code = formatCode((count ?? 0) + 1);
    }

    const { data, error } = await this.client
      .from('students')
      .insert({
        code,
        full_name: input.fullName.trim(),
        phone,
        college: input.college.trim(),
        department: input.department.trim(),
      })
      .select('*')
      .single();
    if (error) throw error;
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

  private async requireStudentAndSession(sessionId: string, code: string) {
    const session = await this.getSession(sessionId);
    if (!session) throw new DataError('SESSION_NOT_FOUND', 'Session not found.');
    if (session.status === 'closed') {
      throw new DataError('SESSION_CLOSED', 'This session has ended.');
    }
    const student = await this.getStudentByCode(code);
    if (!student) {
      throw new DataError('STUDENT_NOT_FOUND', 'No student found for that code.');
    }
    return { session, student };
  }

  async checkIn(sessionId: string, code: string): Promise<AttendanceRecord> {
    const { session, student } = await this.requireStudentAndSession(
      sessionId,
      code,
    );
    if (!session.checkInOpen) {
      throw new DataError('CHECK_IN_CLOSED', 'Check-in is not open.');
    }

    const row = await this.getAttendanceRow(sessionId, student.id);
    const now = new Date().toISOString();

    if (row?.check_in_at && !row.check_out_at) {
      throw new DataError('ALREADY_CHECKED_IN', 'You are already checked in.');
    }

    if (row) {
      const { data, error } = await this.client
        .from('attendance')
        .update({ check_in_at: now, check_out_at: null })
        .eq('id', row.id)
        .select('*')
        .single();
      if (error) throw error;
      return this.toRecord(data as AttendanceRow);
    }

    const { data, error } = await this.client
      .from('attendance')
      .insert({ session_id: sessionId, student_id: student.id, check_in_at: now })
      .select('*')
      .single();
    if (error) {
      if (hasPostgresErrorCode(error, '23505')) {
        const concurrent = await this.getAttendanceRow(sessionId, student.id);
        if (concurrent) {
          throw new DataError(
            'ALREADY_CHECKED_IN',
            'You are already checked in.',
          );
        }
      }
      throw error;
    }
    return this.toRecord(data as AttendanceRow);
  }

  async checkOut(sessionId: string, code: string): Promise<AttendanceRecord> {
    const { session, student } = await this.requireStudentAndSession(
      sessionId,
      code,
    );
    if (!session.checkOutOpen) {
      throw new DataError('CHECK_OUT_CLOSED', 'Check-out is not open.');
    }

    const row = await this.getAttendanceRow(sessionId, student.id);

    if (!row?.check_in_at) {
      throw new DataError('NOT_CHECKED_IN', 'You have not checked in.');
    }
    if (row.check_out_at) {
      throw new DataError('ALREADY_CHECKED_OUT', 'You have already checked out.');
    }

    const { data, error } = await this.client
      .from('attendance')
      .update({ check_out_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('check_out_at', null)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new DataError('ALREADY_CHECKED_OUT', 'You have already checked out.');
    }
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

function hasPostgresErrorCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}
