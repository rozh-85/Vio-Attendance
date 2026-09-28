import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { SharedDeviceGroupList } from '@/components/SharedDevicesCard';
import { useDataService } from '@/services/data/context';
import { lockOwner } from '@/services/auth/ownerGate';
import { findSharedDeviceGroups } from '@/services/attendance/sharedDevices';
import { DEVICE_SESSION_WINDOW_HOURS } from '@/utils/device';
import { formatDate } from '@/utils/time';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import type { CheckInEvent, Session, Employee } from '@/types';

const RANGES = [
  { label: 'Today', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'All time', hours: 0 },
] as const;

/**
 * Admin page: every phone that checked in more than one employee, across all
 * sessions. The session screen shows the same report scoped to one session —
 * this is the place to look when you want the whole picture, or when the
 * session it happened in is already closed.
 */
export function SharedDevicesPage() {
  const data = useDataService();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<CheckInEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(24 * 7);
  const [query, setQuery] = useState('');
  /** '' = every session; otherwise only phones that touched this one. */
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const since = hours
          ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
          : undefined;
        const [st, se, ev] = await Promise.all([
          data.listEmployees(),
          data.listSessions(),
          data.listCheckInEvents(since),
        ]);
        if (!active) return;
        setEmployees(st);
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
    () => findSharedDeviceGroups(events, employees),
    [events, employees],
  );

  /**
   * Only the sessions a shared phone actually touched — there is no point
   * offering a session where every check-in came from its own phone.
   */
  const sessionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) {
      for (const id of group.sessionIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([id, phones]) => ({
        id,
        phones,
        session: sessionsById.get(id),
        label: sessionsById.get(id)?.title || 'Another session',
      }))
      .sort((a, b) =>
        (b.session?.startedAt ?? '').localeCompare(a.session?.startedAt ?? ''),
      );
  }, [groups, sessionsById]);

  // Changing the period can retire the session that was picked.
  useEffect(() => {
    if (sessionId && !sessionOptions.some((o) => o.id === sessionId)) {
      setSessionId('');
    }
  }, [sessionOptions, sessionId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((group) => {
      if (sessionId && !group.sessionIds.includes(sessionId)) return false;
      if (!q) return true;
      return group.members.some(
        (m) =>
          m.employee.fullName.toLowerCase().includes(q) ||
          m.employee.code.toLowerCase() === q ||
          m.employee.position.toLowerCase().includes(q),
      );
    });
  }, [groups, query, sessionId]);

  /**
   * Describes what is on screen, so the numbers follow the filters. With a
   * session picked, the employee count is the employees checked in *to that
   * session* — the groups still list everyone the phone touched, but counting
   * those would overstate the session's own problem.
   */
  const stats = useMemo(() => {
    const employeeIds = new Set(
      filtered.flatMap((g) =>
        g.members
          .filter(
            (m) =>
              !sessionId || m.checkIns.some((c) => c.sessionId === sessionId),
          )
          .map((m) => m.employee.id),
      ),
    );
    const sessionIds = new Set(filtered.flatMap((g) => g.sessionIds));
    return {
      phones: filtered.length,
      employees: employeeIds.size,
      sessions: sessionIds.size,
    };
  }, [filtered, sessionId]);

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">Shared phones</h1>
        <Button
          variant="outline"
          onClick={() => {
            lockOwner();
            window.location.reload();
          }}
        >
          Lock report
        </Button>
      </div>
      <p className="mt-1 max-w-3xl text-ink-500">
        Every phone that checked in more than one employee. A phone's first
        check-in opens an {DEVICE_SESSION_WINDOW_HOURS}-hour window; anyone else
        checked in from that phone during the window is listed under it, with
        the session their check-in landed in.
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
        <StatCard
          value={stats.employees}
          label={sessionId ? 'Employees in this session' : 'Employees involved'}
        />
        <StatCard value={stats.sessions} label="Sessions touched" tone="info" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">
            Session
          </span>
          <select
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">
              All sessions ({sessionOptions.length} with shared phones)
            </option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.session && ` — ${formatDate(option.session.startedAt)}`}
                {` · ${option.phones} ${option.phones === 1 ? 'phone' : 'phones'}`}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Search"
          type="text"
          placeholder="Employee name, code or position…"
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
              : 'No shared phone matches these filters.'}
          </Card>
        ) : (
          <SharedDeviceGroupList
            groups={filtered}
            sessionsById={sessionsById}
            highlightSessionId={sessionId || undefined}
          />
        )}
      </div>

      <p className="mt-8 max-w-3xl text-sm text-ink-400">
        Nothing here is blocked — a phone may check in as many employees as it
        likes and all of them are recorded. Clearing site data or using a
        private tab gives a phone a fresh identity, so treat this as a prompt to
        look up rather than as proof. To correct someone's attendance, open the
        session from the{' '}
        <Link to={paths.dashboard} className="font-semibold underline">
          dashboard
        </Link>
        .
      </p>
    </AdminLayout>
  );
}
