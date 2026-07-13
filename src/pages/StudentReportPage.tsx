import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Download, Search } from '@/components/icons';
import { useDataService } from '@/services/data/context';
import { exportStudentPdf } from '@/services/report/studentPdf';
import { formatClock, formatDateTime } from '@/utils/time';
import type { AttendanceRecord, Session, Student } from '@/types';

interface SessionRow {
  session: Session;
  record?: AttendanceRecord;
  minutes: number;
  /**
   * Sessions that ended before the student registered are shown but excluded
   * from the Absent count — the student could not have attended them.
   */
  beforeRegistration: boolean;
}

/**
 * Admin page: type a student's name (or code) and see their attendance across
 * every session — check-in/out times, absences and total hours.
 */
export function StudentReportPage() {
  const data = useDataService();
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [st, se, at] = await Promise.all([
          data.listStudents(),
          data.listSessions(),
          data.listAttendance(),
        ]);
        if (!active) return;
        setStudents(st);
        setSessions(se);
        setRecords(at);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : 'Failed to load data.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          s.code.toLowerCase() === q ||
          s.phone.includes(q),
      )
      .slice(0, 8);
  }, [students, query]);

  const report = useMemo(() => {
    if (!selected) return null;
    const bySession = new Map(
      records
        .filter((r) => r.studentId === selected.id)
        .map((r) => [r.sessionId, r]),
    );
    const rows: SessionRow[] = sessions
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((session) => {
        const record = bySession.get(session.id);
        // A session counts toward this student only from the moment they
        // registered (unless they somehow have a check-in for it anyway).
        const beforeRegistration =
          !record?.checkInAt &&
          !!selected.createdAt &&
          (session.closedAt ?? session.startedAt) < selected.createdAt;
        return {
          session,
          record,
          minutes: presentMinutes(session, record),
          beforeRegistration,
        };
      });
    const eligible = rows.filter((r) => !r.beforeRegistration);
    const attended = eligible.filter((r) => r.record?.checkInAt).length;
    const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
    return {
      rows,
      attended,
      totalMinutes,
      eligibleCount: eligible.length,
      absent: eligible.length - attended,
    };
  }, [selected, sessions, records]);

  function pick(student: Student) {
    setSelected(student);
    setQuery(student.fullName);
  }

  function onExportPdf() {
    if (!selected || !report) return;
    exportStudentPdf(
      selected,
      {
        totalSessions: report.eligibleCount,
        attended: report.attended,
        absent: report.absent,
        totalHours: formatMinutes(report.totalMinutes),
      },
      report.rows.map(({ session, record, minutes, beforeRegistration }) => ({
        lecture: session.title || session.lecturerName,
        date: formatDateTime(session.startedAt),
        checkIn: record?.checkInAt ? formatClock(record.checkInAt) : '—',
        checkOut: record?.checkOutAt
          ? formatClock(record.checkOutAt)
          : record?.checkInAt
            ? 'In progress'
            : '—',
        status: record?.checkInAt
          ? 'Present'
          : beforeRegistration
            ? 'Not registered yet'
            : 'Absent',
        hours: record?.checkInAt ? formatMinutes(minutes) : '—',
      })),
    );
  }

  return (
    <AdminLayout>
      <header className="mb-6">
        <div className="text-sm font-bold uppercase tracking-wide text-brand-600">
          QR Attendance
        </div>
        <h1 className="text-3xl font-bold">Student report</h1>
        <p className="mt-1 text-ink-500">
          Type a student's name or code to see all their sessions and
          attendance.
        </p>
      </header>

      <Card className="p-5">
        <Input
          type="text"
          autoFocus
          placeholder="Search by name, code or phone…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        {loading && (
          <div className="py-6 text-center text-ink-400">Loading students…</div>
        )}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {!loading && !selected && query.trim() && (
          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {matches.length === 0 ? (
              <div className="px-4 py-4 text-sm text-ink-500">
                No student matches “{query.trim()}”.
              </div>
            ) : (
              matches.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-50/60"
                  onClick={() => pick(student)}
                >
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                    {student.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">
                      {student.fullName}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {[student.college, student.department]
                        .filter(Boolean)
                        .join(' · ') || student.phone}
                    </span>
                  </span>
                  <Search width={16} height={16} className="text-ink-300" />
                </button>
              ))
            )}
          </div>
        )}
      </Card>

      {selected && report && (
        <>
          <Card className="mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">{selected.fullName}</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                    {selected.code}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {[selected.college, selected.department, selected.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button
                variant="secondary"
                leftIcon={<Download width={18} height={18} />}
                onClick={onExportPdf}
              >
                Export PDF
              </Button>
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard value={report.eligibleCount} label="Total sessions" />
            <StatCard value={report.attended} label="Attended" tone="success" />
            <StatCard value={report.absent} label="Absent" tone="warning" />
            <StatCard
              value={formatMinutes(report.totalMinutes)}
              label="Total hours"
              tone="info"
            />
          </div>

          {report.rows.some((r) => r.beforeRegistration) && (
            <p className="mt-3 text-xs text-ink-400">
              Sessions marked “Not registered yet” happened before this student
              signed up — they are not counted as absent.
            </p>
          )}

          <Card className="mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3 font-semibold">Lecture</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Check-in</th>
                    <th className="px-5 py-3 font-semibold">Check-out</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map(({ session, record, minutes, beforeRegistration }) => (
                    <tr
                      key={session.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-5 py-3.5 font-semibold text-ink-900">
                        {session.title || session.lecturerName}
                      </td>
                      <td className="px-5 py-3.5 text-ink-500">
                        {formatDateTime(session.startedAt)}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-ink-700">
                        {record?.checkInAt ? formatClock(record.checkInAt) : '—'}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-ink-700">
                        {record?.checkOutAt
                          ? formatClock(record.checkOutAt)
                          : record?.checkInAt
                            ? 'In progress'
                            : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        {record?.checkInAt ? (
                          <Badge tone="success">Present</Badge>
                        ) : beforeRegistration ? (
                          <Badge tone="neutral">Not registered yet</Badge>
                        ) : (
                          <Badge tone="warning">Absent</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-ink-700">
                        {record?.checkInAt ? formatMinutes(minutes) : '—'}
                      </td>
                    </tr>
                  ))}
                  {report.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-ink-500"
                      >
                        No sessions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}

// Minutes present in a session, capped to the session window (same rules as
// the Excel reports): an open check-out counts up to the session end or now.
function presentMinutes(session: Session, record?: AttendanceRecord): number {
  if (!record?.checkInAt) return 0;
  const sessionEnd = session.closedAt ?? new Date().toISOString();
  const start = Math.max(
    new Date(record.checkInAt).getTime(),
    new Date(session.startedAt).getTime(),
  );
  const end = Math.min(
    new Date(record.checkOutAt ?? sessionEnd).getTime(),
    new Date(sessionEnd).getTime(),
  );
  return Math.max(0, Math.round((end - start) / 60000));
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
