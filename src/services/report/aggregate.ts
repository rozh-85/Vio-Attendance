import type { AttendanceRecord, Session, Employee } from '@/types';
import { hoursBetween, roundHours } from '@/utils/time';

export interface SessionSummary {
  session: Session;
  /** Scheduled length of the session in hours (start → close, or → now). */
  durationHours: number;
  attendeeCount: number;
}

export interface AttendanceLine {
  session: Session;
  employee: Employee;
  checkInAt?: string;
  checkOutAt?: string;
  /** Hours the employee was actually present in this session. */
  attendedHours: number;
}

export interface EmployeeTotal {
  employee: Employee;
  sessionsAttended: number;
  attendedHours: number;
  /** attendedHours / total session hours, clamped to [0, 1]. */
  attendanceRate: number;
}

export interface AttendanceReport {
  generatedAt: string;
  totalSessionHours: number;
  sessionSummaries: SessionSummary[];
  attendanceLines: AttendanceLine[];
  employeeTotals: EmployeeTotal[];
}

/** Effective end of a session: its close time, or "now" if still running. */
function sessionEnd(session: Session): string {
  return session.closedAt ?? new Date().toISOString();
}

/**
 * Turns the raw records into an additive report: per-session summaries,
 * per-(employee, session) attendance lines, and per-employee totals with the
 * grand total of session hours delivered.
 */
export function buildReport(
  sessions: Session[],
  employees: Employee[],
  attendance: AttendanceRecord[],
): AttendanceReport {
  const employeeById = new Map(employees.map((s) => [s.id, s]));

  const sessionSummaries: SessionSummary[] = sessions.map((session) => {
    const records = attendance.filter((r) => r.sessionId === session.id);
    return {
      session,
      durationHours: roundHours(
        hoursBetween(session.startedAt, sessionEnd(session)),
      ),
      attendeeCount: records.filter((r) => r.checkInAt).length,
    };
  });

  const totalSessionHours = roundHours(
    sessionSummaries.reduce((sum, s) => sum + s.durationHours, 0),
  );

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const attendanceLines: AttendanceLine[] = [];
  for (const record of attendance) {
    const session = sessionById.get(record.sessionId);
    const employee = employeeById.get(record.employeeId);
    if (!session || !employee || !record.checkInAt) continue;

    // Open records (still checked in) count up to the session end.
    const end = record.checkOutAt ?? sessionEnd(session);
    attendanceLines.push({
      session,
      employee,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      attendedHours: roundHours(hoursBetween(record.checkInAt, end)),
    });
  }

  const totalsByEmployee = new Map<string, EmployeeTotal>();
  for (const line of attendanceLines) {
    const current = totalsByEmployee.get(line.employee.id) ?? {
      employee: line.employee,
      sessionsAttended: 0,
      attendedHours: 0,
      attendanceRate: 0,
    };
    current.sessionsAttended += 1;
    current.attendedHours = roundHours(
      current.attendedHours + line.attendedHours,
    );
    totalsByEmployee.set(line.employee.id, current);
  }

  const employeeTotals = [...totalsByEmployee.values()]
    .map((t) => ({
      ...t,
      attendanceRate:
        totalSessionHours > 0
          ? Math.min(1, t.attendedHours / totalSessionHours)
          : 0,
    }))
    .sort((a, b) => b.attendedHours - a.attendedHours);

  return {
    generatedAt: new Date().toISOString(),
    totalSessionHours,
    sessionSummaries,
    attendanceLines,
    employeeTotals,
  };
}
