import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { SharedDeviceGroupList } from '@/components/SharedDevicesCard';
import { useDataService } from '@/services/data/context';
import { findSharedDeviceGroups } from '@/services/attendance/sharedDevices';
import { DEVICE_SESSION_WINDOW_HOURS } from '@/utils/device';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import type { CheckInEvent, Session, Student } from '@/types';

const RANGES = [
  { label: 'Today', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'All time', hours: 0 },
] as const;

/**
 * Admin page: every phone that checked in more than one student, across all
 * lectures. The session screen shows the same report scoped to one lecture —
 * this is the place to look when you want the whole picture, or when the
 * lecture it happened in is already closed.
 */
export function SharedDevicesPage() {
  const data = useDataService();
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<CheckInEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24 * 7);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const since = hours
          ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
          : undefined;
        const [st, se, ev] = await Promise.all([
          data.listStudents(),
          data.listSessions(),
          data.listCheckInEvents(since),
        ]);
        if (!active) return;
        setStudents(st);
        setSessions(se);
        setEvents(ev);
        setError(null);
      } catch {
        if (active) {
          // Almost always a database that has not run
          // supabase/device-checkin-tracking.sql yet.
          setError(
            'Could not load the device log. Run supabase/device-checkin-tracking.sql ' +
              'in the Supabase SQL editor to switch device tracking on.',
          );
          setEvents([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [data, hours]);

  const sessionsById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );

  const groups = useMemo(
    () => findSharedDeviceGroups(events, students),
    [events, students],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((group) =>
      group.members.some(
        (m) =>
          m.student.fullName.toLowerCase().includes(q) ||
          m.student.code.toLowerCase() === q ||
          m.student.department.toLowerCase().includes(q),
      ),
    );
  }, [groups, query]);

  const stats = useMemo(() => {
    const studentIds = new Set(
      groups.flatMap((g) => g.members.map((m) => m.student.id)),
    );
    const sessionIds = new Set(groups.flatMap((g) => g.sessionIds));
    return {
      phones: groups.length,
      students: studentIds.size,
      lectures: sessionIds.size,
    };
  }, [groups]);

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold">Shared phones</h1>
      <p className="mt-1 max-w-3xl text-ink-500">
        Every phone that checked in more than one student. A phone's first
        check-in opens an {DEVICE_SESSION_WINDOW_HOURS}-hour window; anyone else
        checked in from that phone during the window is listed under it, with
        the lecture their check-in landed in.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {RANGES.map((range) => (
          <button
            key={range.label}
            type="button"
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-semibold transition',
              hours === range.hours
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-ink-600 hover:border-slate-300 hover:bg-slate-50',
            )}
            onClick={() => setHours(range.hours)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard value={stats.phones} label="Shared phones" tone="warning" />
        <StatCard value={stats.students} label="Students involved" />
        <StatCard value={stats.lectures} label="Lectures touched" tone="info" />
      </div>

      <div className="mt-6">
        <Input
          type="text"
          placeholder="Search by student name, code or department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && (
        <Card className="mt-6 border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-800">
          {error}
        </Card>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center text-ink-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center text-ink-500">
            {groups.length === 0
              ? 'No shared phones in this period — every check-in came from its own phone.'
              : 'No shared phone matches that search.'}
          </Card>
        ) : (
          <SharedDeviceGroupList
            groups={filtered}
            sessionsById={sessionsById}
          />
        )}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-ink-400">
        Nothing here is blocked — a phone may check in as many students as it
        likes and all of them are recorded. Clearing site data or using a
        private tab gives a phone a fresh identity, so treat this as a prompt to
        look up rather than as proof. To correct someone's attendance, open the
        lecture from the{' '}
        <Link to={paths.dashboard} className="font-semibold underline">
          dashboard
        </Link>
        .
      </p>
    </AdminLayout>
  );
}
