import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  CalendarDays,
  ChevronDown,
  Download,
  Home,
  Lock,
  MapIcon,
  MapPin,
  MapPinOff,
  MoreVertical,
  Navigation,
  Search,
  Users,
  Wifi,
  X,
} from '@/components/icons';
import { useDataService } from '@/services/data/context';
import { lockOwner } from '@/services/auth/ownerGate';
import {
  HOME_COUNTRY,
  activeZones,
  countryName,
  describeNetwork,
  describeZone,
  formatDistance,
  mapUrl,
  reviewCheckIns,
  type CheckInReview,
  type NetworkFlag,
} from '@/services/attendance/geofence';
import { lookupIpCountry } from '@/services/attendance/ipCountry';
import { loadWorkLocations } from '@/services/hr/store';
import type { HrLocation } from '@/services/hr/types';
import { exportCheckInLocationsExcel } from '@/services/report/checkInLocationsExcel';
import { format } from 'date-fns';
import { formatClock, formatDate, formatDateTime } from '@/utils/time';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import type { CheckInEvent, Employee, Session } from '@/types';

const RANGES = [
  { label: 'Today', long: 'Today', hours: 24 },
  { label: '7 days', long: 'Last 7 days', hours: 24 * 7 },
  { label: '30 days', long: 'Last 30 days', hours: 24 * 30 },
  { label: 'All time', long: 'All time', hours: 0 },
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
    'whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition',
    selected
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
  );

const AVATAR_TONES = [
  'bg-rose-50 text-rose-600',
  'bg-slate-100 text-ink-500',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-700',
  'bg-sky-50 text-sky-600',
  'bg-violet-50 text-violet-600',
];

function Avatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
        AVATAR_TONES[hash % AVATAR_TONES.length],
      )}
    >
      {letters}
    </span>
  );
}

/** Pin, badge and coordinates: red outside, green inside, amber with no GPS. */
function LocationCell({ review }: { review: CheckInReview }) {
  const { zone, event } = review;
  const hasGps = typeof event.latitude === 'number' && typeof event.longitude === 'number';
  const tone = !zone
    ? { icon: 'text-ink-400', badge: 'bg-slate-100 text-ink-500' }
    : zone.kind === 'inside'
      ? { icon: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' }
      : zone.kind === 'outside'
        ? { icon: 'text-rose-600', badge: 'bg-rose-50 text-rose-700' }
        : { icon: 'text-amber-600', badge: 'bg-amber-50 text-amber-700' };
  const Icon = zone?.kind === 'no-location' || (!zone && !hasGps) ? MapPinOff : MapPin;
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon width={18} height={18} className={cn('mt-0.5 shrink-0', tone.icon)} />
      <div className="min-w-0">
        <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', tone.badge)}>
          {!zone
            ? hasGps
              ? 'Location shared'
              : 'No location shared'
            : `${zone.kind === 'outside' ? 'Outside · ' : ''}${describeZone(zone)}`}
        </span>
        {hasGps && (
          <div className="mt-1 font-mono text-xs text-ink-500">
            <span className="whitespace-nowrap">
              {event.latitude!.toFixed(6)}, {event.longitude!.toFixed(6)}
            </span>
            {typeof event.accuracy === 'number' && (
              <span className="whitespace-nowrap"> · ±{Math.round(event.accuracy)} m</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DistanceCell({ review }: { review: CheckInReview }) {
  const zone = review.zone;
  if (!zone || zone.kind === 'no-location') return <span className="text-ink-400">–</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap font-semibold tabular-nums',
        zone.kind === 'outside' ? 'text-rose-700' : 'text-emerald-700',
      )}
    >
      <Navigation width={14} height={14} />
      {formatDistance(zone.distance)}
    </span>
  );
}

/** Country and address of the network a check-in came from, when recorded. */
function NetworkCell({ event, flag }: { event: CheckInEvent; flag: NetworkFlag | null }) {
  if (!event.ipAddress && !event.ipCountry) {
    return <span className="text-ink-400">–</span>;
  }
  // The badge already names the country of a flagged network.
  const country = !flag && event.ipCountry ? countryName(event.ipCountry) : null;
  const ip = event.ipAddress;
  return (
    <div>
      {flag && (
        <span className="inline-block whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          {describeNetwork(flag)}
        </span>
      )}
      <div className={cn('whitespace-nowrap text-xs text-ink-500', flag && 'mt-1')}>
        {country}
        {country && ip && ' · '}
        {ip &&
          (/^[0-9a-fA-F:.]+$/.test(ip) ? (
            <a
              className="font-mono text-ink-700 underline decoration-slate-300 underline-offset-2 hover:text-brand-700"
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

function MapLink({ event }: { event: CheckInEvent }) {
  const map = mapUrl(event);
  if (!map) return <span className="text-ink-400">–</span>;
  return (
    <a
      className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold text-brand-700 hover:text-brand-600"
      href={map}
      target="_blank"
      rel="noreferrer"
    >
      <MapIcon width={16} height={16} /> Open map
    </a>
  );
}

type RowAction = 'map' | 'copy' | 'network' | 'employee';

/** ⋮ — a native list, so it opens where it fits and as the phone's own picker. */
function RowMenu({ review, onAction }: { review: CheckInReview; onAction: (action: RowAction) => void }) {
  const { event, employee } = review;
  const hasGps = typeof event.latitude === 'number' && typeof event.longitude === 'number';
  return (
    <label
      className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-ink-500 transition focus-within:ring-2 focus-within:ring-brand-500 hover:bg-slate-100 hover:text-ink-900"
      title="More"
    >
      <MoreVertical width={17} height={17} />
      <select
        aria-label={`More for ${employee?.fullName ?? 'this check-in'}`}
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
        value=""
        onChange={(e) => {
          const action = e.target.value as RowAction;
          e.target.value = '';
          if (action) onAction(action);
        }}
      >
        <option value="" disabled>
          Check-in
        </option>
        {hasGps && <option value="map">Open map</option>}
        {hasGps && <option value="copy">Copy coordinates</option>}
        {event.ipAddress && <option value="network">Look up network</option>}
        {employee && <option value="employee">Employee report</option>}
      </select>
    </label>
  );
}

const STAT_TONES = {
  slate: { icon: 'bg-slate-100 text-ink-500', bar: 'bg-ink-400' },
  green: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  rose: { icon: 'bg-rose-50 text-rose-600', bar: 'bg-brand-600' },
  amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
} as const;

function StatTile({
  icon,
  tone,
  label,
  value,
  sub,
  bar,
  wide = false,
  className,
}: {
  icon: ReactNode;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: number | string;
  sub: string;
  bar?: number;
  /** Takes a whole row on phones, so it keeps the icon beside the figures. */
  wide?: boolean;
  className?: string;
}) {
  return (
    // The icon sits above the figures until a tile is wide enough for both.
    <Card
      className={cn(
        'flex min-w-0 gap-3 p-4 sm:p-5 md:flex-row md:items-start md:gap-4 xl:flex-col xl:gap-3 2xl:flex-row 2xl:gap-4',
        wide ? 'flex-row items-center' : 'flex-col items-start',
        className,
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl md:size-12 md:rounded-2xl xl:size-10 xl:rounded-xl 2xl:size-12 2xl:rounded-2xl', STAT_TONES[tone].icon)}>
        {icon}
      </span>
      <div className="w-full min-w-0 flex-1">
        <div className="text-xs font-medium text-ink-500 sm:text-sm">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-ink-900 sm:text-3xl">{value}</div>
        <div className="text-xs text-ink-500">{sub}</div>
        {bar !== undefined && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn('h-full rounded-full', STAT_TONES[tone].bar)} style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * A quiet map behind the latest check-in made outside every work location,
 * so the newest one to look at is the first thing seen.
 */
function LatestOutside({ review }: { review: CheckInReview | undefined }) {
  return (
    <div className="pointer-events-none relative hidden h-36 w-[26rem] shrink-0 overflow-hidden rounded-3xl xl:block">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(115deg, transparent 47%, #e2e8f0 47%, #e2e8f0 53%, transparent 53%), linear-gradient(25deg, transparent 46%, #e2e8f0 46%, #e2e8f0 50%, transparent 50%), linear-gradient(#eef2f6 1px, transparent 1px), linear-gradient(90deg, #eef2f6 1px, transparent 1px)',
          backgroundSize: '180px 180px, 140px 140px, 28px 28px, 28px 28px',
          maskImage: 'linear-gradient(to right, transparent, black 30%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 30%)',
        }}
      />
      <div className="absolute right-8 top-1/2 grid -translate-y-1/2 place-items-center">
        <span className="absolute size-28 rounded-full bg-rose-100/60" />
        <span className="absolute size-16 rounded-full bg-rose-200/60" />
        <MapPin width={40} height={40} className="relative -translate-y-2 fill-brand-600 text-white" strokeWidth={1.5} />
      </div>
      {review && review.zone?.kind === 'outside' && (
        <div className="absolute left-6 top-6 max-w-[15rem] rounded-2xl border border-rose-100 bg-white/95 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
            <Navigation width={14} height={14} /> Outside location
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-500">
            {review.employee?.fullName ?? 'Deleted employee'} · {describeZone(review.zone)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Main click: what is shown. The arrow: everything in the period instead. */
function ExportButton({
  shownCount,
  allCount,
  onExport,
}: {
  shownCount: number;
  allCount: number;
  onExport: (what: 'shown' | 'all') => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const item = 'flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink-700 hover:bg-slate-50';
  return (
    <div ref={boxRef} className="relative flex shrink-0">
      <button
        type="button"
        disabled={shownCount === 0}
        onClick={() => onExport('shown')}
        className="inline-flex h-11 items-center gap-2 rounded-l-xl border border-slate-200 bg-white pl-4 pr-3 text-sm font-semibold text-ink-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Download width={17} height={17} className="text-brand-600" /> Export Excel
      </button>
      <button
        type="button"
        aria-label="More export choices"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 items-center rounded-r-xl border border-l-0 border-slate-200 bg-white px-2.5 text-ink-500 transition hover:bg-slate-50"
      >
        <ChevronDown width={16} height={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            className={item}
            disabled={shownCount === 0}
            onClick={() => {
              setOpen(false);
              onExport('shown');
            }}
          >
            What is shown <span className="tabular-nums text-ink-400">{shownCount}</span>
          </button>
          <button
            type="button"
            className={item}
            disabled={allCount === 0}
            onClick={() => {
              setOpen(false);
              onExport('all');
            }}
          >
            Every check-in in the period <span className="tabular-nums text-ink-400">{allCount}</span>
          </button>
        </div>
      )}
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
  const navigate = useNavigate();
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
  const [workLocationsState, setWorkLocationsState] = useState<'loading' | 'ready' | 'error'>('loading');
  /** ip → country, for check-ins the database recorded without a country. */
  const [ipCountries, setIpCountries] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const since = hours ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() : undefined;
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
    const timer = hours === LIVE_HOURS ? setInterval(() => void load(), LIVE_REFRESH_MS) : undefined;
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

  // Addresses without a country get one looked up, so a VPN still shows when
  // Supabase does not pass Cloudflare's country header through.
  useEffect(() => {
    let active = true;
    const missing = new Set(events.filter((e) => e.ipAddress && !e.ipCountry).map((e) => e.ipAddress as string));
    for (const ip of missing) {
      void lookupIpCountry(ip).then((country) => {
        if (!active || !country) return;
        setIpCountries((known) => (known[ip] === country ? known : { ...known, [ip]: country }));
      });
    }
    return () => {
      active = false;
    };
  }, [events]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const locatedEvents = useMemo(
    () =>
      events.map((e) =>
        !e.ipCountry && e.ipAddress && ipCountries[e.ipAddress] ? { ...e, ipCountry: ipCountries[e.ipAddress] } : e,
      ),
    [events, ipCountries],
  );

  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  /** Only sessions that have a check-in in this period. */
  const sessionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) counts.set(event.sessionId, (counts.get(event.sessionId) ?? 0) + 1);
    return [...counts]
      .map(([id, checkIns]) => ({
        id,
        checkIns,
        session: sessionsById.get(id),
        label: sessionsById.get(id)?.title || 'Another session',
      }))
      .sort((a, b) => (b.session?.startedAt ?? '').localeCompare(a.session?.startedAt ?? ''));
  }, [events, sessionsById]);

  // Changing the period can retire the session that was picked.
  useEffect(() => {
    if (sessionId && !sessionOptions.some((o) => o.id === sessionId)) setSessionId('');
  }, [sessionOptions, sessionId]);

  const reviews = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviewCheckIns(locatedEvents, employees, workLocations)
      .filter((review) => !sessionId || review.event.sessionId === sessionId)
      .filter(
        (review) =>
          !q ||
          Boolean(
            review.employee &&
              [review.employee.fullName, review.employee.code, review.employee.position, review.employee.phone]
                .join(' ')
                .toLowerCase()
                .includes(q),
          ),
      );
  }, [employees, locatedEvents, query, sessionId, workLocations]);

  const counts: Record<Filter, number> = useMemo(
    () => ({
      review: reviews.filter((r) => r.needsReview).length,
      vpn: reviews.filter((r) => r.network).length,
      all: reviews.length,
    }),
    [reviews],
  );

  const tally = useMemo(
    () => ({
      inside: reviews.filter((r) => r.zone?.kind === 'inside').length,
      outside: reviews.filter((r) => r.zone?.kind === 'outside').length,
      noLocation: reviews.filter((r) => r.zone?.kind === 'no-location').length,
    }),
    [reviews],
  );

  const shown = useMemo(
    () =>
      reviews.filter((r) => (filter === 'review' ? r.needsReview : filter === 'vpn' ? r.network !== null : true)),
    [reviews, filter],
  );

  const latestOutside = useMemo(() => reviews.find((r) => r.zone?.kind === 'outside'), [reviews]);

  const hasZones = activeZones(workLocations).length > 0;
  let emptyText = 'No check-ins match these filters.';
  if (counts.all > 0 && filter === 'review') {
    emptyText = hasZones
      ? 'Everyone here checked in inside a work location.'
      : 'Nothing to compare yet — set a work location first.';
  } else if (counts.all > 0 && filter === 'vpn') {
    emptyText = `No check-in came through a network outside ${countryName(HOME_COUNTRY)}.`;
  }

  const range = RANGES.find((r) => r.hours === hours) ?? RANGES[0];
  const pct = (n: number) => (counts.all > 0 ? Math.round((n / counts.all) * 100) : 0);

  async function act(review: CheckInReview, action: RowAction) {
    const { event, employee } = review;
    if (action === 'map') {
      const map = mapUrl(event);
      if (map) window.open(map, '_blank', 'noopener,noreferrer');
    } else if (action === 'network' && event.ipAddress) {
      window.open(`https://ipinfo.io/${encodeURIComponent(event.ipAddress)}`, '_blank', 'noopener,noreferrer');
    } else if (action === 'employee' && employee) {
      navigate(`${paths.employees}?employee=${encodeURIComponent(employee.id)}`);
    } else if (action === 'copy' && typeof event.latitude === 'number' && typeof event.longitude === 'number') {
      try {
        await navigator.clipboard.writeText(`${event.latitude.toFixed(6)}, ${event.longitude.toFixed(6)}`);
        setNotice('Coordinates copied');
      } catch {
        setNotice('Could not copy — select the numbers instead');
      }
    }
  }

  function onExport(what: 'shown' | 'all') {
    exportCheckInLocationsExcel(
      what === 'shown' ? shown : reviews,
      sessionsById,
      range.label.toLowerCase().replace(/\s+/g, '_'),
    );
  }

  return (
    <AdminLayout>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 sm:grid">
            <MapPin width={24} height={24} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Check-in locations</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-500 sm:text-base">
              Track where employees check in, compared with their work locations set in HR. Only this private
              report shows check-ins made outside the allowed locations or without a location.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-4">
          <LatestOutside review={latestOutside} />
          <Button
            variant="outline"
            size="sm"
            aria-label="Lock report"
            title="Lock report"
            className="px-2.5 sm:px-3"
            leftIcon={<Lock width={15} height={15} />}
            onClick={() => {
              lockOwner();
              window.location.reload();
            }}
          >
            <span className="hidden sm:inline">Lock report</span>
          </Button>
        </div>
      </div>

      {/* ── Numbers for the period, session and search ───────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-6 xl:grid-cols-5">
        <StatTile
          wide
          className="col-span-2 xl:col-span-1"
          icon={<Users width={22} height={22} />}
          tone="slate"
          label="Total check-ins"
          value={loading && events.length === 0 ? '…' : counts.all}
          sub={range.long}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-1"
          icon={<Home width={22} height={22} />}
          tone="green"
          label="At work location"
          value={tally.inside}
          sub={`${pct(tally.inside)}% of check-ins`}
          bar={pct(tally.inside)}
        />
        <StatTile
          className="md:col-span-2 xl:col-span-1"
          icon={<MapPin width={22} height={22} />}
          tone="rose"
          label="Outside location"
          value={tally.outside}
          sub={`${pct(tally.outside)}% of check-ins`}
          bar={pct(tally.outside)}
        />
        <StatTile
          className="md:col-span-3 xl:col-span-1"
          icon={<MapPinOff width={22} height={22} />}
          tone="amber"
          label="No location"
          value={tally.noLocation}
          sub={`${pct(tally.noLocation)}% of check-ins`}
          bar={pct(tally.noLocation)}
        />
        <StatTile
          className="md:col-span-3 xl:col-span-1"
          icon={<Wifi width={22} height={22} />}
          tone="violet"
          label="VPN check-ins"
          value={counts.vpn}
          sub={`${pct(counts.vpn)}% of check-ins`}
          bar={pct(counts.vpn)}
        />
      </div>

      {/* ── Period, session, search, export ──────────────────────────────── */}
      <div className="mt-6 flex flex-col gap-3 2xl:flex-row 2xl:items-end">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button key={r.label} type="button" className={chipClass(hours === r.hours)} onClick={() => setHours(r.hours)}>
              {r.label}
            </button>
          ))}
          {hours === LIVE_HOURS && (
            <span className="ml-1 inline-flex items-center gap-2 text-sm text-ink-500">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end 2xl:justify-end">
          <label className="block min-w-0 sm:w-72">
            <span className="mb-1 block text-xs font-semibold text-ink-500">Session</span>
            <span className="relative block">
              <CalendarDays
                width={16}
                height={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <select
                className="h-11 w-full cursor-pointer appearance-none truncate rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-semibold text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
              <ChevronDown
                width={16}
                height={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
            </span>
          </label>
          <div className="flex min-w-0 flex-1 gap-2 2xl:max-w-md">
            <label className="relative min-w-0 flex-1">
              <Search
                width={16}
                height={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                type="search"
                placeholder="Search by employee name, code or position…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
                >
                  <X width={14} height={14} />
                </button>
              )}
            </label>
            <ExportButton shownCount={shown.length} allCount={reviews.length} onExport={onExport} />
          </div>
        </div>
      </div>

      {/* ── Which check-ins ──────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button key={option.id} type="button" className={chipClass(filter === option.id)} onClick={() => setFilter(option.id)}>
            {option.label} <span className="tabular-nums opacity-70">({counts[option.id]})</span>
          </button>
        ))}
        {notice && (
          <span className="ml-auto rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            {notice}
          </span>
        )}
      </div>

      {error && (
        <Card className="mt-4 border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-800">{error}</Card>
      )}

      {workLocationsState === 'error' ? (
        <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-5 py-3 text-sm text-amber-800">
          The work locations could not be loaded, so check-ins cannot be compared with them. Run supabase/hr.sql in
          the Supabase SQL editor if it has not been run yet.
        </p>
      ) : workLocationsState === 'ready' && !hasZones ? (
        <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-5 py-3 text-sm text-amber-800">
          No active work location is set, so nobody can be outside one yet.{' '}
          <Link to={paths.hrTab('locations')} className="font-semibold underline">
            Add one in HR → Locations &amp; devices
          </Link>
          .
        </p>
      ) : null}

      {/* ── The check-ins ────────────────────────────────────────────────── */}
      <div className="mt-4">
        {loading && events.length === 0 ? (
          <Card className="p-10 text-center text-sm text-ink-500">Loading…</Card>
        ) : shown.length === 0 ? (
          <Card className="p-10 text-center text-sm text-ink-500">{emptyText}</Card>
        ) : (
          <>
            {/* Phones and tablets: one card per check-in. */}
            <ul className="space-y-2.5 lg:hidden">
              {shown.map((review, i) => {
                const { event, employee } = review;
                const session = sessionsById.get(event.sessionId);
                return (
                  <li key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={employee?.fullName ?? '?'} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug text-ink-900">
                              {employee?.fullName ?? 'Deleted employee'}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
                              {employee && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-ink-700">
                                  {employee.code}
                                </span>
                              )}
                              <span>{formatDateTime(event.at)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-xs tabular-nums text-ink-400">#{i + 1}</span>
                            <RowMenu review={review} onAction={(a) => void act(review, a)} />
                          </div>
                        </div>
                        <div className="mt-3">
                          <LocationCell review={review} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs sm:grid-cols-4">
                          <div>
                            <div className="text-ink-400">Distance</div>
                            <DistanceCell review={review} />
                          </div>
                          <div>
                            <div className="text-ink-400">Session</div>
                            <div className="truncate font-semibold text-ink-900">
                              {session?.title || session?.supervisorName || 'Another session'}
                            </div>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <div className="text-ink-400">Network</div>
                            <NetworkCell event={event} flag={review.network} />
                          </div>
                        </div>
                        {mapUrl(event) && (
                          <div className="mt-2.5">
                            <MapLink event={event} />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Laptops: the table; less vital columns join as it widens. */}
            <Card className="hidden overflow-hidden lg:block">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-xs font-semibold text-ink-500">
                    <tr>
                      <th className="hidden w-10 px-3 py-3 font-semibold 2xl:table-cell">#</th>
                      <th className="px-3 py-3 font-semibold">Employee</th>
                      <th className="hidden px-3 py-3 font-semibold 2xl:table-cell">Code</th>
                      <th className="hidden px-3 py-3 font-semibold 2xl:table-cell">Session</th>
                      <th className="px-3 py-3 font-semibold">Checked in</th>
                      <th className="px-3 py-3 font-semibold">Location</th>
                      <th className="hidden px-3 py-3 font-semibold 2xl:table-cell">Distance</th>
                      <th className="hidden px-3 py-3 font-semibold xl:table-cell">Network</th>
                      <th className="hidden px-3 py-3 font-semibold xl:table-cell">Map</th>
                      <th className="px-3 py-3 text-center font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((review, i) => {
                      const { event, employee } = review;
                      const session = sessionsById.get(event.sessionId);
                      return (
                        <tr key={event.id} className="border-t border-slate-100 align-top transition-colors hover:bg-slate-50/60">
                          <td className="hidden px-3 py-3.5 tabular-nums text-ink-400 2xl:table-cell">{i + 1}</td>
                          <td className="px-3 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={employee?.fullName ?? '?'} />
                              <div className="min-w-0">
                                <div className="font-semibold text-ink-900">{employee?.fullName ?? 'Deleted employee'}</div>
                                <div className="text-xs tabular-nums text-ink-400">
                                  {employee && (
                                    <span className="font-mono font-semibold text-ink-500 2xl:hidden">{employee.code} · </span>
                                  )}
                                  {employee?.phone}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-3 py-3.5 2xl:table-cell">
                            {employee && (
                              <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                                {employee.code}
                              </span>
                            )}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-3.5 text-ink-700 2xl:table-cell">
                            {session?.title || session?.supervisorName || 'Another session'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="font-medium text-ink-900">{format(new Date(event.at), 'd MMM yyyy')}</div>
                            <div className="text-xs tabular-nums text-ink-500">{formatClock(event.at)}</div>
                          </td>
                          <td className="px-3 py-3">
                            <LocationCell review={review} />
                          </td>
                          <td className="hidden px-3 py-3.5 2xl:table-cell">
                            <DistanceCell review={review} />
                          </td>
                          <td className="hidden px-3 py-3 xl:table-cell">
                            <NetworkCell event={event} flag={review.network} />
                          </td>
                          <td className="hidden px-3 py-3.5 xl:table-cell">
                            <MapLink event={event} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <RowMenu review={review} onAction={(a) => void act(review, a)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      <p className="mt-6 max-w-3xl text-sm text-ink-400">
        Nothing here is blocked — every check-in is saved and only reported. A VPN changes the phone's network, never
        its GPS, so it cannot move anyone inside a work location; it is shown next to the location instead. A fake-GPS
        app can still report a false position, so treat this as a prompt to look up rather than as proof.
      </p>
    </AdminLayout>
  );
}
