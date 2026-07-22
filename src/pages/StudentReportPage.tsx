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
import {
  formatClock,
  formatDateTime,
  formatMinutes,
  presentMinutes,
} from '@/utils/time';
import { cn } from '@/utils/cn';
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
 * every session — check-in/out times, absences and total hours. The lecturer
 * picks which sessions actually belong to this student before exporting, so
 * company-wide sessions or lectures they sit elsewhere aren't counted as absent.
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
  // Session ids included in this student's report. Everything they could have
  // attended is ticked by default; the lecturer unticks the ones that don't
  // apply to them.
  const [included, setIncluded] = useState<Set<string>>(new Set());

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

  const rows = useMemo<SessionRow[]>(() => {
    if (!selected) return [];
    const bySession = new Map(
      records
        .filter((r) => r.studentId === selected.id)
        .map((r) => [r.sessionId, r]),
    );
    return sessions
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
  }, [selected, sessions, records]);

  // Reset the selection whenever the student (or their session list) changes:
  // include everything except sessions that predate their registration.
  useEffect(() => {
    setIncluded(
      new Set(
        rows.filter((r) => !r.beforeRegistration).map((r) => r.session.id),
      ),
    );
  }, [rows]);

  // Totals reflect only the ticked sessions, so the numbers (and the PDF) match
  // exactly what the lecturer chose to include.
  const stats = useMemo(() => {
    const chosen = rows.filter((r) => included.has(r.session.id));
    const attended = chosen.filter((r) => r.record?.checkInAt).length;
    const totalMinutes = chosen.reduce((sum, r) => sum + r.minutes, 0);
    return {
      totalSessions: chosen.length,
      attended,
      absent: chosen.length - attended,
      totalMinutes,
    };
  }, [rows, included]);

  function pick(student: Student) {
    setSelected(student);
    setQuery(student.fullName);
  }

  function toggle(sessionId: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function selectAll() {
    setIncluded(new Set(rows.map((r) => r.session.id)));
  }

  function clearAll() {
    setIncluded(new Set());
  }

  function onExportPdf() {
    if (!selected) return;
    const chosen = rows.filter((r) => included.has(r.session.id));
    exportStudentPdf(
      selected,
      {
        totalSessions: stats.totalSessions,
        attended: stats.attended,
        absent: stats.absent,
        totalHours: formatMinutes(stats.totalMinutes),
      },
      chosen.map(({ session, record, minutes, beforeRegistration }) => ({
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

  const allIncluded = rows.length > 0 && included.size === rows.length;

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

      {selected && (
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
            <StatCard value={stats.totalSessions} label="Total lectures" />
            <StatCard value={stats.attended} label="Attended" tone="success" />
            <StatCard value={stats.absent} label="Absent" tone="warning" />
            <StatCard
              value={formatMinutes(stats.totalMinutes)}
              label="Total hours"
              tone="info"
            />
          </div>

          <p className="mt-3 text-xs text-ink-400">
            Untick any lecture that isn't part of this student's programme —
            company-wide sessions or lectures they attend at another university.
            Only ticked lectures count toward the totals above and appear in the
            exported PDF.
          </p>

          {rows.length > 0 && (
            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-500">
                <span className="font-semibold text-ink-900">
                  {included.size}
                </span>{' '}
                of {rows.length} lectures included
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAll}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          <Card className={cn('overflow-hidden', rows.length === 0 && 'mt-6')}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3">
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer align-middle accent-brand-600"
                        aria-label="Include all lectures"
                        checked={allIncluded}
                        ref={(el) => {
                          if (el)
                            el.indeterminate =
                              included.size > 0 && !allIncluded;
                        }}
                        onChange={(e) =>
                          e.target.checked ? selectAll() : clearAll()
                        }
                      />
                    </th>
                    <th className="px-5 py-3 font-semibold">Lecture</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Check-in</th>
                    <th className="px-5 py-3 font-semibold">Check-out</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ session, record, minutes, beforeRegistration }) => {
                    const isIn = included.has(session.id);
                    return (
                      <tr
                        key={session.id}
                        className={cn(
                          'border-b border-slate-100 transition-colors last:border-0',
                          isIn ? 'hover:bg-slate-50/60' : 'bg-slate-50/40',
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            className="size-4 cursor-pointer align-middle accent-brand-600"
                            aria-label={`Include ${session.title || session.lecturerName}`}
                            checked={isIn}
                            onChange={() => toggle(session.id)}
                          />
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5 font-semibold',
                            isIn ? 'text-ink-900' : 'text-ink-400',
                          )}
                        >
                          {session.title || session.lecturerName}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5',
                            isIn ? 'text-ink-500' : 'text-ink-300',
                          )}
                        >
                          {formatDateTime(session.startedAt)}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5 tabular-nums',
                            isIn ? 'text-ink-700' : 'text-ink-300',
                          )}
                        >
                          {record?.checkInAt ? formatClock(record.checkInAt) : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5 tabular-nums',
                            isIn ? 'text-ink-700' : 'text-ink-300',
                          )}
                        >
                          {record?.checkOutAt
                            ? formatClock(record.checkOutAt)
                            : record?.checkInAt
                              ? 'In progress'
                              : '—'}
                        </td>
                        <td className={cn('px-5 py-3.5', !isIn && 'opacity-60')}>
                          {record?.checkInAt ? (
                            <Badge tone="success">Present</Badge>
                          ) : beforeRegistration ? (
                            <Badge tone="neutral">Not registered yet</Badge>
                          ) : (
                            <Badge tone="warning">Absent</Badge>
                          )}
                        </td>
                        <td
                          className={cn(
                            'px-5 py-3.5 tabular-nums',
                            isIn ? 'text-ink-700' : 'text-ink-300',
                          )}
                        >
                          {record?.checkInAt ? formatMinutes(minutes) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
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
