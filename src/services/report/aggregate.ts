import type { AttendanceRecord, Session, Student } from '@/types';
import { hoursBetween, roundHours } from '@/utils/time';

export interface SessionSummary {
  session: Session;
  /** Scheduled length of the session in hours (start → close, or → now). */
  durationHours: number;
  attendeeCount: number;
}

export interface AttendanceLine {
  session: Session;
  student: Student;
  checkInAt?: string;
  checkOutAt?: string;
  /** Hours the student was actually present in this session. */
  attendedHours: number;
}

export interface StudentTotal {
  student: Student;
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
  studentTotals: StudentTotal[];
}

/** Effective end of a session: its close time, or "now" if still running. */
function sessionEnd(session: Session): string {
  return session.closedAt ?? new Date().toISOString();
}

/**
 * Turns the raw records into an additive report: per-session summaries,
 * per-(student, session) attendance lines, and per-student totals with the
 * grand total of lecture hours delivered.
 */
export function buildReport(
  sessions: Session[],
  students: Student[],
  attendance: AttendanceRecord[],
): AttendanceReport {
  const studentById = new Map(students.map((s) => [s.id, s]));

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
    const student = studentById.get(record.studentId);
    if (!session || !student || !record.checkInAt) continue;

    // Open records (still checked in) count up to the session end.
    const end = record.checkOutAt ?? sessionEnd(session);
    attendanceLines.push({
      session,
      student,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      attendedHours: roundHours(hoursBetween(record.checkInAt, end)),
    });
  }

  const totalsByStudent = new Map<string, StudentTotal>();
  for (const line of attendanceLines) {
    const current = totalsByStudent.get(line.student.id) ?? {
      student: line.student,
      sessionsAttended: 0,
      attendedHours: 0,
      attendanceRate: 0,
    };
    current.sessionsAttended += 1;
    current.attendedHours = roundHours(
      current.attendedHours + line.attendedHours,
    );
    totalsByStudent.set(line.student.id, current);
  }

  const studentTotals = [...totalsByStudent.values()]
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
    studentTotals,
  };
}
