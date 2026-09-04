import type { SupabaseClient } from '@supabase/supabase-js';
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
  LeaveAllowance,
  LeaveEdit,
  LeaveRecord,
  NewLeaveInput,
} from '@/types';
import { normalizePhone } from '@/utils/id';
import type { DataService } from './DataService';
import { DataError, type DataErrorCode } from './errors';

/**
 * Supabase-backed implementation of {@link DataService}.
 *
 * Expects three tables (see `supabase/schema.sql`): `employees`, `sessions`,
 * `attendance`. Rows use snake_case; the mappers below translate to/from the
 * camelCase domain models so the rest of the app never sees database shapes.
 */
export class SupabaseDataService implements DataService {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  // ── Mappers ───────────────────────────────────────────────────────────────
  private toEmployee(row: EmployeeRow): Employee {
    return {
      id: row.id,
      code: row.code,
      fullName: row.full_name,
      phone: row.phone,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private toSession(row: SessionRow): Session {
    return {
      id: row.id,
      supervisorName: row.supervisor_name,
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
      employeeId: row.employee_id,
      checkInAt: row.check_in_at ?? undefined,
      checkOutAt: row.check_out_at ?? undefined,
    };
  }

  private toCheckInEvent(row: CheckInEventRow): CheckInEvent {
    return {
      id: row.id,
      sessionId: row.session_id,
      employeeId: row.employee_id,
      deviceId: row.device_id,
      deviceSessionId: row.device_session_id,
      deviceLabel: row.device_label ?? '',
      at: row.at,
    };
  }

  private async getAttendanceRow(
    sessionId: string,
    employeeId: string,
  ): Promise<AttendanceRow | null> {
    const { data, error } = await this.client
      .from('attendance')
      .select('*')
      .eq('session_id', sessionId)
      .eq('employee_id', employeeId)
      .maybeSingle();
    if (error) throw error;
    return (data as AttendanceRow | null) ?? null;
  }

  /**
   * The employee-facing RPCs (`register_employee`, `check_in`, …) signal expected
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

  /**
   * Fetches every row of a table in pages. Supabase caps a single select at
   * 1000 rows; without paging, large rosters silently lose rows and employees
   * show up as falsely absent in reports.
   */
  private async fetchAllRows<T>(
    table: string,
    orderColumn: string,
    ascending: boolean,
    filter?: { column: string; value: string; op?: 'eq' | 'gte' },
  ): Promise<T[]> {
    const pageSize = 1000;
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
      let query = this.client
        .from(table)
        .select('*')
        .order(orderColumn, { ascending })
        .range(from, from + pageSize - 1);
      if (filter) {
        query =
          filter.op === 'gte'
            ? query.gte(filter.column, filter.value)
            : query.eq(filter.column, filter.value);
      }
      const { data, error } = await query;
      if (error) throw error;
      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < pageSize) return rows;
    }
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  async listEmployees(): Promise<Employee[]> {
    const rows = await this.fetchAllRows<EmployeeRow>('employees', 'code', true);
    return rows.map((r) => this.toEmployee(r));
  }

  async getEmployeeByPhone(phone: string): Promise<Employee | null> {
    // Routed through a security-definer function so the public anon key can look
    // up a single employee by their own phone number without being able to read
    // (enumerate) the whole roster. See supabase/harden-employee-data.sql.
    const { data, error } = await this.client.rpc('recover_employee_code', {
      p_phone: normalizePhone(phone),
    });
    if (error) this.throwRpcError(error);
    return data ? this.toEmployee(data as EmployeeRow) : null;
  }

  async getEmployeeByCode(code: string): Promise<Employee | null> {
    const { data, error } = await this.client
      .from('employees')
      .select('*')
      .eq('code', code.trim())
      .maybeSingle();
    if (error) throw error;
    return data ? this.toEmployee(data as EmployeeRow) : null;
  }

  async registerEmployee(input: NewEmployeeInput): Promise<Employee> {
    // The whole registration (duplicate-phone guard, code allocation, insert)
    // runs inside a security-definer function, so the anon key never needs
    // read/write rights on the employees table. See harden-employee-data.sql.
    const { data, error } = await this.client.rpc('register_employee', {
      p_full_name: input.fullName.trim(),
      p_phone: normalizePhone(input.phone),
      p_position: input.position.trim(),
    });
    if (error) this.throwRpcError(error);
    return this.toEmployee(data as EmployeeRow);
  }

  async updateEmployee(id: string, patch: EmployeeEdit): Promise<Employee> {
    const row: Partial<EmployeeRow> = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) row.phone = normalizePhone(patch.phone);
    if (patch.position !== undefined) row.position = patch.position.trim();

    const { data, error } = await this.client
      .from('employees')
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
    return this.toEmployee(data as EmployeeRow);
  }

  async deleteEmployee(employeeId: string): Promise<void> {
    const { data: employeeData, error: fetchError } = await this.client
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!employeeData) {
      throw new DataError('EMPLOYEE_NOT_FOUND', 'Employee not found.');
    }

    // Delete all attendance records for this employee
    const { error: attendanceError } = await this.client
      .from('attendance')
      .delete()
      .eq('employee_id', employeeId);

    if (attendanceError) throw attendanceError;

    const { error: leaveError } = await this.client
      .from('leave_records')
      .delete()
      .eq('employee_id', employeeId);
    if (leaveError) throw leaveError;

    const { error: allowanceError } = await this.client
      .from('leave_allowances')
      .delete()
      .eq('employee_id', employeeId);
    if (allowanceError) throw allowanceError;

    // Delete the employee
    const { error: employeeError } = await this.client
      .from('employees')
      .delete()
      .eq('id', employeeId);

    if (employeeError) throw employeeError;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async listSessions(): Promise<Session[]> {
    const rows = await this.fetchAllRows<SessionRow>(
      'sessions',
      'started_at',
      false,
    );
    return rows.map((r) => this.toSession(r));
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
        supervisor_name: input.supervisorName.trim(),
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
    if (patch.supervisorName !== undefined) row.supervisor_name = patch.supervisorName;
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
    const rows = await this.fetchAllRows<AttendanceRow>(
      'attendance',
      'id',
      true,
      sessionId ? { column: 'session_id', value: sessionId } : undefined,
    );
    return rows.map((r) => this.toRecord(r));
  }

  async checkIn(
    sessionId: string,
    code: string,
    device?: DeviceInfo,
  ): Promise<AttendanceRecord> {
    // All validation + write happens in the `check_in` security-definer
    // function so the anon key needs no direct rights on the attendance or
    // employees tables. See supabase/harden-employee-data.sql. The function also
    // records the device and enforces the per-device employee limit — see
    // supabase/device-checkin-tracking.sql.
    const { data, error } = await this.client.rpc('check_in', {
      p_session_id: sessionId,
      p_code: code.trim(),
      p_device_id: device?.id ?? null,
      p_device_label: device?.label ?? '',
    });

    if (error) {
      // A database that has not run the device-tracking migration yet only has
      // the two-argument check_in. Fall back so check-in keeps working until
      // the SQL is applied.
      if (isMissingFunction(error)) {
        return this.checkInWithoutDevice(sessionId, code);
      }
      this.throwRpcError(error);
    }
    return this.toRecord(data as AttendanceRow);
  }

  private async checkInWithoutDevice(
    sessionId: string,
    code: string,
  ): Promise<AttendanceRecord> {
    const { data, error } = await this.client.rpc('check_in', {
      p_session_id: sessionId,
      p_code: code.trim(),
    });
    if (error) this.throwRpcError(error);
    return this.toRecord(data as AttendanceRow);
  }

  async listCheckInEvents(sinceIso?: string): Promise<CheckInEvent[]> {
    const rows = await this.fetchAllRows<CheckInEventRow>(
      'check_in_events',
      'at',
      false,
      sinceIso ? { column: 'at', value: sinceIso, op: 'gte' } : undefined,
    );
    return rows.map((r) => this.toCheckInEvent(r));
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
    employeeId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord> {
    const existing = await this.getAttendanceRow(sessionId, employeeId);

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
        employee_id: employeeId,
        check_in_at: edit.checkInAt,
        check_out_at: edit.checkOutAt,
      })
      .select('*')
      .single();
    if (error) throw error;
    return this.toRecord(data as AttendanceRow);
  }

  // ── Leave management ──────────────────────────────────────────────────────
  async listLeaveAllowances(year?: number): Promise<LeaveAllowance[]> {
    let query = this.client.from('leave_allowances').select('*').order('year', { ascending: false });
    if (year !== undefined) query = query.eq('year', year);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as LeaveAllowanceRow[]).map((row) => ({
      employeeId: row.employee_id,
      year: row.year,
      totalDays: Number(row.total_days),
    }));
  }

  async getLeaveAllowance(employeeId: string, year: number): Promise<LeaveAllowance> {
    const { data, error } = await this.client
      .from('leave_allowances').select('*').eq('employee_id', employeeId).eq('year', year).maybeSingle();
    if (error) throw error;
    if (!data) return { employeeId, year, totalDays: 12 };
    const row = data as LeaveAllowanceRow;
    return { employeeId: row.employee_id, year: row.year, totalDays: Number(row.total_days) };
  }

  async setLeaveAllowance(employeeId: string, year: number, totalDays: number): Promise<LeaveAllowance> {
    const { data, error } = await this.client
      .from('leave_allowances')
      .upsert({ employee_id: employeeId, year, total_days: Math.max(0, Number(totalDays) || 0) }, { onConflict: 'employee_id,year' })
      .select('*').single();
    if (error) throw error;
    const row = data as LeaveAllowanceRow;
    return { employeeId: row.employee_id, year: row.year, totalDays: Number(row.total_days) };
  }

  async listLeaveRecords(employeeId?: string, year?: number): Promise<LeaveRecord[]> {
    let query = this.client.from('leave_records').select('*').order('date', { ascending: false });
    if (employeeId !== undefined) query = query.eq('employee_id', employeeId);
    if (year !== undefined) query = query.eq('year', year);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as LeaveRecordRow[]).map((row) => ({
      id: row.id, employeeId: row.employee_id, year: row.year, date: row.date,
      days: Number(row.days), note: row.note ?? '', createdAt: row.created_at,
    }));
  }

  async addLeave(input: NewLeaveInput): Promise<LeaveRecord> {
    const { data, error } = await this.client.from('leave_records').insert({
      employee_id: input.employeeId, year: input.year, date: input.date,
      days: Math.max(0, Number(input.days) || 0), note: input.note.trim(),
    }).select('*').single();
    if (error) throw error;
    const row = data as LeaveRecordRow;
    return { id: row.id, employeeId: row.employee_id, year: row.year, date: row.date, days: Number(row.days), note: row.note ?? '', createdAt: row.created_at };
  }

  async updateLeave(id: string, patch: LeaveEdit): Promise<LeaveRecord> {
    const row: Partial<LeaveRecordRow> = {};
    if (patch.date !== undefined) { row.date = patch.date; row.year = Number(patch.date.slice(0, 4)); }
    if (patch.days !== undefined) row.days = Math.max(0, Number(patch.days) || 0);
    if (patch.note !== undefined) row.note = patch.note.trim();
    const { data, error } = await this.client.from('leave_records').update(row).eq('id', id).select('*').single();
    if (error) throw error;
    const result = data as LeaveRecordRow;
    return { id: result.id, employeeId: result.employee_id, year: result.year, date: result.date, days: Number(result.days), note: result.note ?? '', createdAt: result.created_at };
  }

  async deleteLeave(id: string): Promise<void> {
    const { error } = await this.client.from('leave_records').delete().eq('id', id);
    if (error) throw error;
  }

  async reset(): Promise<void> {
    throw new DataError(
      'NOT_IMPLEMENTED',
      'Reset is disabled for the Supabase backend.',
    );
  }
}

// ── Row shapes (database, snake_case) ─────────────────────────────────────────
interface EmployeeRow {
  id: string;
  code: string;
  full_name: string;
  phone: string;
  position: string;
  created_at: string;
}

interface SessionRow {
  id: string;
  supervisor_name: string;
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
  employee_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
}

interface CheckInEventRow {
  id: string;
  session_id: string;
  employee_id: string;
  device_id: string;
  device_session_id: string;
  device_label: string | null;
  at: string;
}

interface LeaveAllowanceRow {
  employee_id: string;
  year: number;
  total_days: number;
}

interface LeaveRecordRow {
  id: string;
  employee_id: string;
  year: number;
  date: string;
  days: number;
  note: string | null;
  created_at: string;
}

// Friendly messages for the business errors raised by the employee-facing RPCs,
// mirroring the messages the local backend throws. Keyed by the code the
// Postgres function raises (see supabase/harden-employee-data.sql).
const RPC_ERROR_MESSAGES: Partial<Record<DataErrorCode, string>> = {
  PHONE_TAKEN: 'This phone number is already registered.',
  EMPLOYEE_NOT_FOUND: 'No employee found for that code.',
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

/**
 * True when PostgREST could not find an RPC with the arguments we sent — i.e.
 * the database is still on an older schema version.
 */
function isMissingFunction(err: { code?: string; message?: string }): boolean {
  return (
    err.code === 'PGRST202' ||
    (err.message ?? '').includes('Could not find the function')
  );
}
