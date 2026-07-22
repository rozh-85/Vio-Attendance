import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Download } from '@/components/icons';
import { useDataService } from '@/services/data/context';
import { exportLecturePdf } from '@/services/report/lecturePdf';
import {
  formatClock,
  formatDateTime,
  formatMinutes,
  presentMinutes,
} from '@/utils/time';
import type { AttendanceRecord, Session, Student } from '@/types';

interface AttendeeRow {
  student: Student;
  record?: AttendanceRecord;
  minutes: number;
}

/**
 * Admin page: type a lecture's title (or lecturer / location) and see every
 * student's attendance for it — the lecture-centric mirror of the student
 * report, with a matching Asiacell PDF export.
 */
export function LectureReportPage() {
  const data = useDataService();
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Session | null>(null);

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
    return sessions
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .filter(
        (s) =>
          (s.title || '').toLowerCase().includes(q) ||
          s.lecturerName.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [sessions, query]);

  const report = useMemo(() => {
    if (!selected) return null;
    const end = selected.closedAt ?? new Date().toISOString();
    const byStudent = new Map(
      records
        .filter((r) => r.sessionId === selected.id)
        .map((r) => [r.studentId, r]),
    );
    const rows: AttendeeRow[] = students
      .filter((student) => {
        const record = byStudent.get(student.id);
        // Only students who existed while the lecture was open could attend it —
        // anyone who registered afterwards is left out of the roster entirely.
        return record?.checkInAt || !student.createdAt || student.createdAt <= end;
      })
      .map((student) => {
        const record = byStudent.get(student.id);
        return { student, record, minutes: presentMinutes(selected, record) };
      })
      .sort((a, b) => a.student.code.localeCompare(b.student.code));
    const present = rows.filter((r) => r.record?.checkInAt).length;
    const totalMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
    return {
      rows,
      present,
      absent: rows.length - present,
      totalStudents: rows.length,
      totalMinutes,
    };
  }, [selected, students, records]);

  function pick(session: Session) {
    setSelected(session);
    setQuery(session.title || session.lecturerName);
  }

  function onExportPdf() {
    if (!selected || !report) return;
    exportLecturePdf(
      selected,
      {
        totalStudents: report.totalStudents,
        present: report.present,
        absent: report.absent,
        totalHours: formatMinutes(report.totalMinutes),
      },
      report.rows.map(({ student, record, minutes }) => ({
        code: student.code,
        student: student.fullName,
        checkIn: record?.checkInAt ? formatClock(record.checkInAt) : '—',
        checkOut: record?.checkOutAt
          ? formatClock(record.checkOutAt)
          : record?.checkInAt
            ? 'In progress'
            : '—',
        status: record?.checkInAt ? 'Present' : 'Absent',
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
        <h1 className="text-3xl font-bold">Lecture report</h1>
        <p className="mt-1 text-ink-500">
          Type a lecture's title, lecturer or location to see every student's
          attendance for it.
        </p>
      </header>

      <Card className="p-5">
        <Input
          type="text"
          autoFocus
          placeholder="Search by lecture title, lecturer or location…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        {loading && (
          <div className="py-6 text-center text-ink-400">Loading lectures…</div>
        )}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        {!loading && !selected && query.trim() && (
          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {matches.length === 0 ? (
              <div className="px-4 py-4 text-sm text-ink-500">
                No lecture matches “{query.trim()}”.
              </div>
            ) : (
              matches.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-brand-50/60"
                  onClick={() => pick(session)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-900">
                      {session.title || session.lecturerName}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {[
                        session.lecturerName,
                        session.location,
                        formatDateTime(session.startedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <Badge tone={session.status === 'active' ? 'success' : 'neutral'}>
                    {session.status === 'active' ? 'Active' : 'Closed'}
                  </Badge>
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
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="truncate text-xl font-bold">
                    {selected.title || selected.lecturerName}
                  </h2>
                  <Badge tone={selected.status === 'active' ? 'success' : 'neutral'}>
                    {selected.status === 'active' ? 'Active' : 'Closed'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {[
                    selected.lecturerName,
                    selected.location,
                    formatDateTime(selected.startedAt),
                  ]
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
            <StatCard value={report.totalStudents} label="Total students" />
            <StatCard value={report.present} label="Present" tone="success" />
            <StatCard value={report.absent} label="Absent" tone="warning" />
            <StatCard
              value={formatMinutes(report.totalMinutes)}
              label="Total hours"
              tone="info"
            />
          </div>

          <Card className="mt-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3 font-semibold">Code</th>
                    <th className="px-5 py-3 font-semibold">Student</th>
                    <th className="px-5 py-3 font-semibold">Check-in</th>
                    <th className="px-5 py-3 font-semibold">Check-out</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map(({ student, record, minutes }) => (
                    <tr
                      key={student.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-5 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                          {student.code}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-ink-900">
                        {student.fullName}
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
                        No students yet.
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
