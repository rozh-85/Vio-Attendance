import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useDataService } from '@/services/data/context';
import { lockOwner } from '@/services/auth/ownerGate';
import {
  HOME_COUNTRY,
  activeZones,
  countryName,
  describeNetwork,
  describeZone,
  mapUrl,
  reviewCheckIns,
  type NetworkFlag,
  type ZoneCheck,
} from '@/services/attendance/geofence';
import { loadWorkLocations } from '@/services/hr/store';
import type { HrLocation } from '@/services/hr/types';
import { formatDate, formatDateTime } from '@/utils/time';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import type { CheckInEvent, Employee, Session } from '@/types';

const RANGES = [
  { label: 'Today', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: 'All time', hours: 0 },
] as const;

/**
 * "Today" is the live view: it refreshes on its own, so the page can stay open
 * during check-in and a name shows up within seconds. Longer periods load once
 * (and again on focus) — re-reading months of log every few seconds is waste.
 */
const LIVE_HOURS = 24;
const LIVE_REFRESH_MS = 5000;

const FILTERS = [
  { id: 'review', label: 'Outside or no location' },
  { id: 'vpn', label: 'VPN' },
  { id: 'all', label: 'All check-ins' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

const chipClass = (selected: boolean) =>
  cn(
    'rounded-full border px-4 py-2 text-sm font-semibold transition',
    selected
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-slate-200 bg-white text-ink-600 hover:border-slate-300 hover:bg-slate-50',
  );

/** Red for a GPS position outside every work location, amber for no GPS. */
function ZoneBadge({ zone }: { zone: ZoneCheck | null }) {
  if (!zone) return null;
  const tone =
    zone.kind === 'inside'
      ? 'success'
      : zone.kind === 'outside'
        ? 'danger'
        : 'warning';
  return (
    <Badge tone={tone} className="whitespace-nowrap">
      {zone.kind === 'outside' && 'Outside · '}
      {describeZone(zone)}
    </Badge>
  );
}

/** Country and address of the network a check-in came from, when recorded. */
function NetworkCell({
  event,
  flag,
}: {
  event: CheckInEvent;
  flag: NetworkFlag | null;
}) {
  if (!event.ipAddress && !event.ipCountry) {
    return <span className="text-ink-400">—</span>;
  }
  // The badge already names the country of a flagged network.
  const country = !flag && event.ipCountry ? countryName(event.ipCountry) : null;
  const ip = event.ipAddress;
  return (
    <div>
      {flag && (
        <Badge tone="warning" className="whitespace-nowrap">
          {describeNetwork(flag)}
        </Badge>
      )}
      <div className={cn('text-xs text-ink-500', flag && 'mt-1')}>
        {country}
        {country && ip && ' · '}
        {ip &&
          (/^[0-9a-fA-F:.]+$/.test(ip) ? (
            <a
              className="font-mono underline"
              href={`https://ipinfo.io/${ip}`}
              target="_blank"
              rel="noreferrer"
              title="Look up who owns this network"
            >
              {ip}
            </a>
          ) : (
            <span className="font-mono">{ip}</span>
          ))}
      </div>
    </div>
  );
}

/**
 * Owner page: every check-in held up against the work locations set in HR,
 * naming whoever checked in outside all of them or without sharing their
 * location. It sits behind the same owner password as the shared-phone report
 * and is the only place GPS and network details are shown — the session
 * screen and every supervisor page never receive them.
 */
export function CheckInLocationsPage() {
  const data = useDataService();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<CheckInEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<number>(LIVE_HOURS);
  const [query, setQuery] = useState('');
  /** '' = every session. */
  const [sessionId, setSessionId] = useState('');
  const [filter, setFilter] = useState<Filter>('review');
  const [workLocations, setWorkLocations] = useState<HrLocation[]>([]);
  const [workLocationsState, setWorkLocationsState] = useState<
    'loading' | 'ready' | 'error'
  >('loading');

  useEffect(() => {
    let active = true;
    const load = async () => {
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
        if (active) setError('Could not load the check-in log. Reload to try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    void load();
    const timer =
      hours === LIVE_HOURS ? setInterval(() => void load(), LIVE_REFRESH_MS) : undefined;
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [data, hours]);

  // Loaded apart from the log, and again on focus so an edit made in HR shows
  // up on return. An HR database that is not set up must not take the log down.
  useEffect(() => {
    let active = true;
    const load = () => {
      loadWorkLocations()
        .then((locations) => {
          if (!active) return;
          setWorkLocations(locations);
          setWorkLocationsState('ready');
        })
        .catch(() => {
          if (active) setWorkLocationsState('error');
        });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
    };
  }, []);

  const sessionsById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );

  /** Only sessions that have a check-in in this period. */
  const sessionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.sessionId, (counts.get(event.sessionId) ?? 0) + 1);
    }
    return [...counts]
      .map(([id, checkIns]) => ({
        id,
        checkIns,
        session: sessionsById.get(id),
        label: sessionsById.get(id)?.title || 'Another session',
      }))
      .sort((a, b) =>
        (b.session?.startedAt ?? '').localeCompare(a.session?.startedAt ?? ''),
      );
  }, [events, sessionsById]);

  // Changing the period can retire the session that was picked.
  useEffect(() => {
    if (sessionId && !sessionOptions.some((o) => o.id === sessionId)) {
      setSessionId('');
    }
  }, [sessionOptions, sessionId]);

  const reviews = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviewCheckIns(events, employees, workLocations)
      .filter((review) => !sessionId || review.event.sessionId === sessionId)
      .filter(
        (review) =>
          !q ||
          Boolean(
            review.employee &&
              [
                review.employee.fullName,
                review.employee.code,
                review.employee.position,
              ]
                .join(' ')
                .toLowerCase()
                .includes(q),
          ),
      );
  }, [employees, events, query, sessionId, workLocations]);

  const counts: Record<Filter, number> = useMemo(
    () => ({
      review: reviews.filter((r) => r.needsReview).length,
      vpn: reviews.filter((r) => r.network).length,
      all: reviews.length,
    }),
    [reviews],
  );

  const shown = useMemo(
    () =>
      reviews.filter((r) =>
        filter === 'review'
          ? r.needsReview
          : filter === 'vpn'
            ? r.network !== null
            : true,
      ),
    [reviews, filter],
  );

  const hasZones = activeZones(workLocations).length > 0;
  const hasNetworkData = events.some((e) => e.ipAddress || e.ipCountry);

  let emptyText = 'No check-ins match these filters.';
  if (counts.all > 0 && filter === 'review') {
    emptyText = hasZones
      ? 'Everyone here checked in inside a work location.'
      : 'Nothing to compare yet — set a work location first.';
  } else if (counts.all > 0 && filter === 'vpn') {
    emptyText = hasNetworkData
      ? `No check-in came through a network outside ${countryName(HOME_COUNTRY)}.`
      : 'No network details recorded yet. They start with the first check-in after supabase/check-in-network.sql has been run.';
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">Check-in locations</h1>
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
        Every QR check-in, compared with the work locations set in HR. Anyone
        who checked in outside all of them, or without sharing their location,
        is listed by name. Only this private report shows it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {RANGES.map((range) => (
          <button
            key={range.label}
            type="button"
            className={chipClass(hours === range.hours)}
            onClick={() => setHours(range.hours)}
          >
            {range.label}
          </button>
        ))}
        {hours === LIVE_HOURS && (
          <span className="ml-1 inline-flex items-center gap-2 text-sm text-ink-500">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            Live — updates every few seconds
          </span>
        )}
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
            <option value="">All sessions ({sessionOptions.length})</option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
                {option.session && ` — ${formatDate(option.session.startedAt)}`}
                {` · ${option.checkIns} ${option.checkIns === 1 ? 'check-in' : 'check-ins'}`}
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

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={chipClass(filter === option.id)}
              onClick={() => setFilter(option.id)}
            >
              {option.label}{' '}
              <span className="tabular-nums">({counts[option.id]})</span>
            </button>
          ))}
        </div>

        {workLocationsState === 'error' ? (
          <p className="border-b border-amber-100 bg-amber-50/60 px-5 py-3 text-sm text-amber-800">
            The work locations could not be loaded, so check-ins cannot be
            compared with them. Run supabase/hr.sql in the Supabase SQL editor
            if it has not been run yet.
          </p>
        ) : workLocationsState === 'ready' && !hasZones ? (
          <p className="border-b border-amber-100 bg-amber-50/60 px-5 py-3 text-sm text-amber-800">
            No active work location is set, so nobody can be outside one yet.{' '}
            <Link
              to={paths.hrTab('locations')}
              className="font-semibold underline"
            >
              Add one in HR → Locations &amp; devices
            </Link>
            .
          </p>
        ) : null}

        {loading ? (
          <p className="px-5 py-8 text-sm text-ink-500">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-500">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Session</th>
                  <th className="px-5 py-3">Checked in</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Network</th>
                  <th className="px-5 py-3 text-right">Map</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((review) => {
                  const { event, employee } = review;
                  const session = sessionsById.get(event.sessionId);
                  const map = mapUrl(event);
                  return (
                    <tr
                      key={event.id}
                      className="border-b border-slate-100 align-top last:border-0"
                    >
                      <td className="whitespace-nowrap px-5 py-3.5 font-semibold">
                        {employee?.fullName ?? 'Deleted employee'}
                        {employee && (
                          <span className="ml-2 font-mono text-xs text-ink-400">
                            {employee.code}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-ink-600">
                        {session?.title || session?.supervisorName || 'Another session'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-ink-600">
                        {formatDateTime(event.at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <ZoneBadge zone={review.zone} />
                        {typeof event.latitude === 'number' &&
                        typeof event.longitude === 'number' ? (
                          <div
                            className={cn(
                              'whitespace-nowrap font-mono text-xs text-ink-500',
                              review.zone && 'mt-1',
                            )}
                          >
                            {event.latitude.toFixed(6)}, {event.longitude.toFixed(6)}
                            {typeof event.accuracy === 'number' &&
                              ` · ±${Math.round(event.accuracy)} m`}
                          </div>
                        ) : (
                          !review.zone && (
                            <span className="text-ink-400">Not shared</span>
                          )
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <NetworkCell event={event} flag={review.network} />
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {map ? (
                          <a
                            className="font-semibold text-brand-700 underline"
                            href={map}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open map
                          </a>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-8 max-w-3xl text-sm text-ink-400">
        Nothing here is blocked — every check-in is saved and only reported. A
        VPN changes the phone's network, never its GPS, so it cannot move anyone
        inside a work location; it is shown next to the location instead. A
        fake-GPS app can still report a false position, so treat this as a
        prompt to look up rather than as proof.
      </p>
    </AdminLayout>
  );
}
