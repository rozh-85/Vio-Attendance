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
import { formatCode, normalizePhone, uid } from '@/utils/id';
import { DEVICE_SESSION_WINDOW_HOURS } from '@/utils/device';
import type { DataService } from './DataService';
import { DataError } from './errors';

const KEYS = {
  employees: 'vio.employees',
  sessions: 'vio.sessions',
  attendance: 'vio.attendance',
  checkInEvents: 'vio.checkInEvents',
  counter: 'vio.codeCounter',
  leaveAllowances: 'vio.leaveAllowances',
  leaveRecords: 'vio.leaveRecords',
} as const;

/**
 * DataService backed by the browser's localStorage. Fully functional with no
 * server — ideal for local development and demos. Mirrors the async contract of
 * the eventual Supabase implementation.
 */
export class LocalStorageDataService implements DataService {
  private queue = Promise.resolve();

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  private mutate<T>(operation: () => Promise<T> | T): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private nextCode(): string {
    const current = this.read<number>(KEYS.counter, 0);
    const next = current + 1;
    this.write(KEYS.counter, next);
    return formatCode(next);
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  async listEmployees(): Promise<Employee[]> {
    return this.read<Employee[]>(KEYS.employees, []);
  }

  async getEmployeeByPhone(phone: string): Promise<Employee | null> {
    const target = normalizePhone(phone);
    const employees = await this.listEmployees();
    return employees.find((s) => normalizePhone(s.phone) === target) ?? null;
  }

  async getEmployeeByCode(code: string): Promise<Employee | null> {
    const target = code.trim();
    const employees = await this.listEmployees();
    return employees.find((s) => s.code === target) ?? null;
  }

  async registerEmployee(input: NewEmployeeInput): Promise<Employee> {
    return this.mutate(async () => {
      const existing = await this.getEmployeeByPhone(input.phone);
      if (existing) {
        throw new DataError(
          'PHONE_TAKEN',
          'This phone number is already registered.',
        );
      }

      const employee: Employee = {
        id: uid(),
        code: this.nextCode(),
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        position: input.position.trim(),
        createdAt: new Date().toISOString(),
      };

      const employees = await this.listEmployees();
      this.write(KEYS.employees, [...employees, employee]);
      return employee;
    });
  }

  async updateEmployee(id: string, patch: EmployeeEdit): Promise<Employee> {
    return this.mutate(async () => {
      const employees = await this.listEmployees();
      const idx = employees.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new DataError('EMPLOYEE_NOT_FOUND', 'Employee not found.');
      }

      if (patch.phone !== undefined) {
        const target = normalizePhone(patch.phone);
        const clash = employees.find(
          (s) => s.id !== id && normalizePhone(s.phone) === target,
        );
        if (clash) {
          throw new DataError(
            'PHONE_TAKEN',
            'This phone number is already registered.',
          );
        }
      }

      const current = employees[idx];
      const updated: Employee = {
        ...current,
        ...(patch.fullName !== undefined && { fullName: patch.fullName.trim() }),
        ...(patch.phone !== undefined && { phone: patch.phone.trim() }),
        ...(patch.position !== undefined && { position: patch.position.trim() }),
        id,
      };
      employees[idx] = updated;
      this.write(KEYS.employees, employees);
      return updated;
    });
  }

  async deleteEmployee(employeeId: string): Promise<void> {
    return this.mutate(async () => {
      const employees = await this.listEmployees();
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        throw new DataError('EMPLOYEE_NOT_FOUND', 'Employee not found.');
      }

      // Delete the employee
      this.write(
        KEYS.employees,
        employees.filter((s) => s.id !== employeeId),
      );

      // Delete all attendance records for this employee
      const records = await this.listAttendance();
      this.write(
        KEYS.attendance,
        records.filter((r) => r.employeeId !== employeeId),
      );

      // …and their entries in the device log.
      const events = await this.listCheckInEvents();
      this.write(
        KEYS.checkInEvents,
        events.filter((e) => e.employeeId !== employeeId),
      );

      this.write(
        KEYS.leaveRecords,
        (await this.listLeaveRecords()).filter((r) => r.employeeId !== employeeId),
      );
      const allowances = await this.listLeaveAllowances();
      this.write(KEYS.leaveAllowances, allowances.filter((a) => a.employeeId !== employeeId));
    });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async listSessions(): Promise<Session[]> {
    return this.read<Session[]>(KEYS.sessions, []);
  }

  async getSession(id: string): Promise<Session | null> {
    const sessions = await this.listSessions();
    return sessions.find((s) => s.id === id) ?? null;
  }

  async createSession(input: NewSessionInput): Promise<Session> {
    return this.mutate(async () => {
      const session: Session = {
        id: uid(),
        supervisorName: input.supervisorName.trim(),
        title: input.title.trim(),
        location: input.location.trim(),
        status: 'active',
        checkInOpen: false,
        checkOutOpen: false,
        startedAt: new Date().toISOString(),
      };
      const sessions = await this.listSessions();
      this.write(KEYS.sessions, [session, ...sessions]);
      return session;
    });
  }

  async updateSession(id: string, patch: Partial<Session>): Promise<Session> {
    return this.mutate(async () => {
      const sessions = await this.listSessions();
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new DataError('SESSION_NOT_FOUND', 'Session not found.');
      }
      const updated: Session = { ...sessions[idx], ...patch, id };
      sessions[idx] = updated;
      this.write(KEYS.sessions, sessions);
      return updated;
    });
  }

  async closeSession(id: string): Promise<Session> {
    return this.mutate(async () => {
      const session = await this.getSession(id);
      if (!session) {
        throw new DataError('SESSION_NOT_FOUND', 'Session not found.');
      }
      const closedAt = new Date().toISOString();

      // Auto check-out everyone who is still present.
      const attendance = await this.listAttendance();
      const updatedAttendance = attendance.map((r) =>
        r.sessionId === id && r.checkInAt && !r.checkOutAt
          ? { ...r, checkOutAt: closedAt }
          : r,
      );
      this.write(KEYS.attendance, updatedAttendance);

      const sessions = await this.listSessions();
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new DataError('SESSION_NOT_FOUND', 'Session not found.');
      }
      const updated: Session = {
        ...sessions[idx],
        status: 'closed',
        checkInOpen: false,
        checkOutOpen: false,
        closedAt,
      };
      sessions[idx] = updated;
      this.write(KEYS.sessions, sessions);
      return updated;
    });
  }

  // ── Attendance ────────────────────────────────────────────────────────────
  async listAttendance(sessionId?: string): Promise<AttendanceRecord[]> {
    const all = this.read<AttendanceRecord[]>(KEYS.attendance, []);
    return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
  }

  private async requireOpenSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new DataError('SESSION_NOT_FOUND', 'Session not found.');
    }
    if (session.status === 'closed') {
      throw new DataError('SESSION_CLOSED', 'This session has ended.');
    }
    return session;
  }

  private async findRecord(
    sessionId: string,
    employeeId: string,
  ): Promise<AttendanceRecord | undefined> {
    const records = await this.listAttendance(sessionId);
    return records.find((r) => r.employeeId === employeeId);
  }

  async listCheckInEvents(sinceIso?: string): Promise<CheckInEvent[]> {
    const all = this.read<CheckInEvent[]>(KEYS.checkInEvents, []);
    const events = sinceIso ? all.filter((e) => e.at >= sinceIso) : all;
    return [...events].sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * Works out which device session a check-in belongs to: the one this phone
   * already opened if it is still inside the window, otherwise a fresh one.
   * Returns `null` when the browser could not supply a device id.
   */
  private async resolveDeviceSession(
    device: DeviceInfo | undefined,
  ): Promise<string | null> {
    if (!device?.id) return null;

    const windowStart = new Date(
      Date.now() - DEVICE_SESSION_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const events = await this.listCheckInEvents();
    // listCheckInEvents is newest-first, so the first hit is the latest one.
    const latest = events.find(
      (e) => e.deviceId === device.id && e.at >= windowStart,
    );
    return latest ? latest.deviceSessionId : uid();
  }

  async checkIn(
    sessionId: string,
    code: string,
    device?: DeviceInfo,
  ): Promise<AttendanceRecord> {
    return this.mutate(async () => {
      const session = await this.requireOpenSession(sessionId);
      if (!session.checkInOpen) {
        throw new DataError(
          'CHECK_IN_CLOSED',
          'Check-in is not open for this session.',
        );
      }
      const employee = await this.getEmployeeByCode(code);
      if (!employee) {
        throw new DataError('EMPLOYEE_NOT_FOUND', 'No employee found for that code.');
      }

      const deviceSessionId = await this.resolveDeviceSession(device);

      const records = await this.listAttendance();
      const existing = records.find(
        (r) => r.sessionId === sessionId && r.employeeId === employee.id,
      );

      if (existing?.checkInAt && !existing.checkOutAt) {
        throw new DataError(
          'ALREADY_CHECKED_IN',
          'You are already checked in for this session.',
        );
      }

      const now = new Date().toISOString();
      let record: AttendanceRecord;
      if (existing) {
        // Re-entering after a previous check-out: start a fresh check-in.
        record = { ...existing, checkInAt: now, checkOutAt: undefined };
        this.write(
          KEYS.attendance,
          records.map((r) => (r.id === existing.id ? record : r)),
        );
      } else {
        record = { id: uid(), sessionId, employeeId: employee.id, checkInAt: now };
        this.write(KEYS.attendance, [...records, record]);
      }

      if (device?.id && deviceSessionId) {
        const events = await this.listCheckInEvents();
        const event: CheckInEvent = {
          id: uid(),
          sessionId,
          employeeId: employee.id,
          deviceId: device.id,
          deviceSessionId,
          deviceLabel: device.label,
          at: now,
        };
        this.write(KEYS.checkInEvents, [...events, event]);
      }

      return record;
    });
  }

  async checkOut(sessionId: string, code: string): Promise<AttendanceRecord> {
    return this.mutate(async () => {
      const session = await this.requireOpenSession(sessionId);
      if (!session.checkOutOpen) {
        throw new DataError(
          'CHECK_OUT_CLOSED',
          'Check-out is not open for this session.',
        );
      }
      const employee = await this.getEmployeeByCode(code);
      if (!employee) {
        throw new DataError('EMPLOYEE_NOT_FOUND', 'No employee found for that code.');
      }

      const record = await this.findRecord(sessionId, employee.id);
      if (!record?.checkInAt) {
        throw new DataError(
          'NOT_CHECKED_IN',
          'You have not checked in for this session.',
        );
      }
      if (record.checkOutAt) {
        throw new DataError(
          'ALREADY_CHECKED_OUT',
          'You have already checked out.',
        );
      }

      const updated: AttendanceRecord = {
        ...record,
        checkOutAt: new Date().toISOString(),
      };
      const records = await this.listAttendance();
      this.write(
        KEYS.attendance,
        records.map((r) => (r.id === record.id ? updated : r)),
      );
      return updated;
    });
  }

  async setAttendance(
    sessionId: string,
    employeeId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord> {
    return this.mutate(async () => {
      const records = await this.listAttendance();
      const existing = records.find(
        (r) => r.sessionId === sessionId && r.employeeId === employeeId,
      );
      const checkInAt = edit.checkInAt ?? undefined;
      const checkOutAt = edit.checkOutAt ?? undefined;

      let record: AttendanceRecord;
      if (existing) {
        record = { ...existing, checkInAt, checkOutAt };
        this.write(
          KEYS.attendance,
          records.map((r) => (r.id === existing.id ? record : r)),
        );
      } else {
        record = { id: uid(), sessionId, employeeId, checkInAt, checkOutAt };
        this.write(KEYS.attendance, [...records, record]);
      }
      return record;
    });
  }

  // ── Leave management ──────────────────────────────────────────────────────
  async listLeaveAllowances(year?: number): Promise<LeaveAllowance[]> {
    const all = this.read<LeaveAllowance[]>(KEYS.leaveAllowances, []);
    return year === undefined ? all : all.filter((a) => a.year === year);
  }

  async getLeaveAllowance(employeeId: string, year: number): Promise<LeaveAllowance> {
    const found = (await this.listLeaveAllowances(year)).find((a) => a.employeeId === employeeId);
    return found ?? { employeeId, year, totalDays: 12 };
  }

  async setLeaveAllowance(employeeId: string, year: number, totalDays: number): Promise<LeaveAllowance> {
    return this.mutate(async () => {
      const value = Math.max(0, Number(totalDays) || 0);
      const allowance: LeaveAllowance = { employeeId, year, totalDays: value };
      const all = await this.listLeaveAllowances();
      const index = all.findIndex((a) => a.employeeId === employeeId && a.year === year);
      this.write(KEYS.leaveAllowances, index === -1 ? [...all, allowance] : all.map((a, i) => (i === index ? allowance : a)));
      return allowance;
    });
  }

  async listLeaveRecords(employeeId?: string, year?: number): Promise<LeaveRecord[]> {
    const all = this.read<LeaveRecord[]>(KEYS.leaveRecords, []);
    return all
      .filter((r) => employeeId === undefined || r.employeeId === employeeId)
      .filter((r) => year === undefined || r.year === year)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async addLeave(input: NewLeaveInput): Promise<LeaveRecord> {
    return this.mutate(async () => {
      const record: LeaveRecord = {
        id: uid(), employeeId: input.employeeId, year: input.year,
        date: input.date, days: Math.max(0, Number(input.days) || 0),
        note: input.note.trim(), createdAt: new Date().toISOString(),
      };
      const all = await this.listLeaveRecords();
      this.write(KEYS.leaveRecords, [...all, record]);
      return record;
    });
  }

  async updateLeave(id: string, patch: LeaveEdit): Promise<LeaveRecord> {
    return this.mutate(async () => {
      const all = await this.listLeaveRecords();
      const index = all.findIndex((r) => r.id === id);
      if (index === -1) throw new DataError('LEAVE_NOT_FOUND', 'Leave entry not found.');
      const current = all[index];
      const updated = {
        ...current,
        ...(patch.date !== undefined && { date: patch.date, year: Number(patch.date.slice(0, 4)) }),
        ...(patch.days !== undefined && { days: Math.max(0, Number(patch.days) || 0) }),
        ...(patch.note !== undefined && { note: patch.note.trim() }),
      };
      this.write(KEYS.leaveRecords, all.map((r, i) => (i === index ? updated : r)));
      return updated;
    });
  }

  async deleteLeave(id: string): Promise<void> {
    return this.mutate(async () => {
      const all = await this.listLeaveRecords();
      this.write(KEYS.leaveRecords, all.filter((r) => r.id !== id));
    });
  }

  async reset(): Promise<void> {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}
