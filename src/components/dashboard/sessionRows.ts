import { format, isValid, parse } from 'date-fns';
import type { AttendanceRecord, Employee, Session } from '@/types';

/** One line of the dashboard's sessions table. */
export interface SessionRow {
  session: Session;
  /** The day the session covers: its date title, else the day it started. */
  day: Date;
  /** `yyyy-MM-dd` of `day`, for the date range filter. */
  dayKey: string;
  /** The title, when it is a name rather than the date, e.g. "Morning shift". */
  titleNote: string | null;
  /** Employees who checked in. */
  checkedIn: number;
  /** Employees registered by the time the session ended (or now, while it runs). */
  roster: number;
  /** Start to close, or start to now while it is still running. */
  minutes: number;
}

/** Sessions are titled with the day they cover, e.g. "13 Oct 2026". */
function sessionDay(session: Session): { day: Date; titleNote: string | null } {
  const fromTitle = parse(session.title.trim(), 'd MMM yyyy', new Date());
  if (isValid(fromTitle)) return { day: fromTitle, titleNote: null };
  return { day: new Date(session.startedAt), titleNote: session.title.trim() || null };
}

export function buildSessionRows(
  sessions: Session[],
  employees: Employee[],
  attendance: AttendanceRecord[],
  now = Date.now(),
): SessionRow[] {
  const checkedIn = new Map<string, number>();
  for (const record of attendance) {
    if (record.checkInAt) checkedIn.set(record.sessionId, (checkedIn.get(record.sessionId) ?? 0) + 1);
  }
  const joined = employees.map((e) => new Date(e.createdAt).getTime()).sort((a, b) => a - b);

  return sessions.map((session) => {
    const { day, titleNote } = sessionDay(session);
    const end = session.closedAt ? new Date(session.closedAt).getTime() : now;
    const count = checkedIn.get(session.id) ?? 0;
    // Employees registered after a session ended could not have attended it.
    let roster = 0;
    while (roster < joined.length && joined[roster] <= end) roster++;
    return {
      session,
      day,
      dayKey: format(day, 'yyyy-MM-dd'),
      titleNote,
      checkedIn: count,
      roster: Math.max(roster, count),
      minutes: Math.max(0, Math.round((end - new Date(session.startedAt).getTime()) / 60000)),
    };
  });
}

/** "11h 57m", "45m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface DashboardStats {
  employees: number;
  newEmployeesThisMonth: number;
  presentToday: number;
  /** Checked in and not yet out, in a session that is still running. */
  inSessionNow: number;
  activeSessions: number;
  sessions: number;
  sessionsThisMonth: number;
}

export function dashboardStats(
  sessions: Session[],
  employees: Employee[],
  attendance: AttendanceRecord[],
  now = new Date(),
): DashboardStats {
  const month = format(now, 'yyyy-MM');
  const today = format(now, 'yyyy-MM-dd');
  const active = new Set(sessions.filter((s) => s.status === 'active').map((s) => s.id));
  const presentToday = new Set<string>();
  let inSessionNow = 0;
  for (const record of attendance) {
    if (!record.checkInAt) continue;
    if (format(new Date(record.checkInAt), 'yyyy-MM-dd') === today) presentToday.add(record.employeeId);
    if (active.has(record.sessionId) && !record.checkOutAt) inSessionNow++;
  }
  return {
    employees: employees.length,
    newEmployeesThisMonth: employees.filter((e) => format(new Date(e.createdAt), 'yyyy-MM') === month).length,
    presentToday: presentToday.size,
    inSessionNow,
    activeSessions: active.size,
    sessions: sessions.length,
    sessionsThisMonth: sessions.filter((s) => format(new Date(s.startedAt), 'yyyy-MM') === month).length,
  };
}

/** Past supervisors, most recent first, for the new-session field. */
export function supervisorNames(sessions: Session[]): string[] {
  const seen = new Map<string, string>();
  for (const s of sessions) {
    const name = s.supervisorName.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}
