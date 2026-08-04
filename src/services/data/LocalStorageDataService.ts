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
import { formatCode, normalizePhone, uid } from '@/utils/id';
import {
  DEVICE_SESSION_WINDOW_HOURS,
  MAX_STUDENTS_PER_DEVICE,
} from '@/utils/device';
import type { DataService } from './DataService';
import { DataError, DEVICE_LIMIT_MESSAGE } from './errors';

const KEYS = {
  students: 'qra.students',
  sessions: 'qra.sessions',
  attendance: 'qra.attendance',
  checkInEvents: 'qra.checkInEvents',
  counter: 'qra.codeCounter',
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

  // ── Students ──────────────────────────────────────────────────────────────
  async listStudents(): Promise<Student[]> {
    return this.read<Student[]>(KEYS.students, []);
  }

  async getStudentByPhone(phone: string): Promise<Student | null> {
    const target = normalizePhone(phone);
    const students = await this.listStudents();
    return students.find((s) => normalizePhone(s.phone) === target) ?? null;
  }

  async getStudentByCode(code: string): Promise<Student | null> {
    const target = code.trim();
    const students = await this.listStudents();
    return students.find((s) => s.code === target) ?? null;
  }

  async registerStudent(input: NewStudentInput): Promise<Student> {
    return this.mutate(async () => {
      const existing = await this.getStudentByPhone(input.phone);
      if (existing) {
        throw new DataError(
          'PHONE_TAKEN',
          'This phone number is already registered.',
        );
      }

      const student: Student = {
        id: uid(),
        code: this.nextCode(),
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        college: input.college.trim(),
        department: input.department.trim(),
        createdAt: new Date().toISOString(),
      };

      const students = await this.listStudents();
      this.write(KEYS.students, [...students, student]);
      return student;
    });
  }

  async updateStudent(id: string, patch: StudentEdit): Promise<Student> {
    return this.mutate(async () => {
      const students = await this.listStudents();
      const idx = students.findIndex((s) => s.id === id);
      if (idx === -1) {
        throw new DataError('STUDENT_NOT_FOUND', 'Student not found.');
      }

      if (patch.phone !== undefined) {
        const target = normalizePhone(patch.phone);
        const clash = students.find(
          (s) => s.id !== id && normalizePhone(s.phone) === target,
        );
        if (clash) {
          throw new DataError(
            'PHONE_TAKEN',
            'This phone number is already registered.',
          );
        }
      }

      const current = students[idx];
      const updated: Student = {
        ...current,
        ...(patch.fullName !== undefined && { fullName: patch.fullName.trim() }),
        ...(patch.phone !== undefined && { phone: patch.phone.trim() }),
        ...(patch.college !== undefined && { college: patch.college.trim() }),
        ...(patch.department !== undefined && {
          department: patch.department.trim(),
        }),
        id,
      };
      students[idx] = updated;
      this.write(KEYS.students, students);
      return updated;
    });
  }

  async deleteStudent(studentId: string): Promise<void> {
    return this.mutate(async () => {
      const student = await this.getStudentByCode(studentId);
      if (!student) {
        throw new DataError('STUDENT_NOT_FOUND', 'Student not found.');
      }

      // Delete the student
      const students = await this.listStudents();
      this.write(
        KEYS.students,
        students.filter((s) => s.id !== studentId),
      );

      // Delete all attendance records for this student
      const records = await this.listAttendance();
      this.write(
        KEYS.attendance,
        records.filter((r) => r.studentId !== studentId),
      );

      // …and their entries in the device log.
      const events = await this.listCheckInEvents();
      this.write(
        KEYS.checkInEvents,
        events.filter((e) => e.studentId !== studentId),
      );
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
        lecturerName: input.lecturerName.trim(),
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
    studentId: string,
  ): Promise<AttendanceRecord | undefined> {
    const records = await this.listAttendance(sessionId);
    return records.find((r) => r.studentId === studentId);
  }

  async listCheckInEvents(sinceIso?: string): Promise<CheckInEvent[]> {
    const all = this.read<CheckInEvent[]>(KEYS.checkInEvents, []);
    const events = sinceIso ? all.filter((e) => e.at >= sinceIso) : all;
    return [...events].sort((a, b) => b.at.localeCompare(a.at));
  }

  /**
   * Works out which device session a check-in belongs to: the one this phone
   * already opened if it is still inside the window, otherwise a fresh one.
   * Throws once too many different students have used the same phone.
   * Returns `null` when the browser could not supply a device id.
   */
  private async resolveDeviceSession(
    device: DeviceInfo | undefined,
    studentId: string,
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
    if (!latest) return uid();

    const others = new Set(
      events
        .filter(
          (e) =>
            e.deviceSessionId === latest.deviceSessionId &&
            e.studentId !== studentId,
        )
        .map((e) => e.studentId),
    );
    if (others.size >= MAX_STUDENTS_PER_DEVICE) {
      throw new DataError('DEVICE_LIMIT_REACHED', DEVICE_LIMIT_MESSAGE);
    }
    return latest.deviceSessionId;
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
      const student = await this.getStudentByCode(code);
      if (!student) {
        throw new DataError('STUDENT_NOT_FOUND', 'No student found for that code.');
      }

      // Resolved before anything is written, so a rejected check-in leaves no
      // trace on the attendance record.
      const deviceSessionId = await this.resolveDeviceSession(
        device,
        student.id,
      );

      const records = await this.listAttendance();
      const existing = records.find(
        (r) => r.sessionId === sessionId && r.studentId === student.id,
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
        record = { id: uid(), sessionId, studentId: student.id, checkInAt: now };
        this.write(KEYS.attendance, [...records, record]);
      }

      if (device?.id && deviceSessionId) {
        const events = await this.listCheckInEvents();
        const event: CheckInEvent = {
          id: uid(),
          sessionId,
          studentId: student.id,
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
      const student = await this.getStudentByCode(code);
      if (!student) {
        throw new DataError('STUDENT_NOT_FOUND', 'No student found for that code.');
      }

      const record = await this.findRecord(sessionId, student.id);
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
    studentId: string,
    edit: AttendanceEdit,
  ): Promise<AttendanceRecord> {
    return this.mutate(async () => {
      const records = await this.listAttendance();
      const existing = records.find(
        (r) => r.sessionId === sessionId && r.studentId === studentId,
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
        record = { id: uid(), sessionId, studentId, checkInAt, checkOutAt };
        this.write(KEYS.attendance, [...records, record]);
      }
      return record;
    });
  }

  async reset(): Promise<void> {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}
