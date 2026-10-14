import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, subDays } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { CalendarDays, ChevronDown, Clock, Eye, MoreVertical, QrIcon, Search, X } from '@/components/icons';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { formatClock } from '@/utils/time';
import { formatDuration, type SessionRow } from './sessionRows';

type StatusFilter = 'all' | 'active' | 'closed';
type RowAction = 'view' | 'qr-in' | 'qr-out' | 'export';

const PAGE_SIZE = 10;
const headCell = 'px-3 py-3 2xl:px-4';
const bodyCell = 'px-3 py-3.5 align-middle 2xl:px-4';

/**
 * Every session as a table: newest first, narrowed by status, a range of days
 * or a search. Phones get one card per session instead of the table.
 */
export function SessionsCard({
  rows,
  loading,
  onExport,
}: {
  rows: SessionRow[];
  loading: boolean;
  onExport: (row: SessionRow) => void;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.session.status !== status) return false;
      if (range.from && r.dayKey < range.from) return false;
      if (range.to && r.dayKey > range.to) return false;
      if (!q) return true;
      return [r.session.supervisorName, r.session.title, r.session.location, format(r.day, 'd MMM yyyy EEEE')]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, status, range, query]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);
  const pageRows = shown.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const filtered = status !== 'all' || !!range.from || !!range.to || !!query.trim();

  const act = (row: SessionRow, action: RowAction) => {
    if (action === 'export') onExport(row);
    else if (action === 'view') navigate(paths.session(row.session.id));
    else navigate(`${paths.session(row.session.id)}?qr=${action === 'qr-in' ? 'in' : 'out'}`);
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="xl:shrink-0">
          <h2 className="text-lg font-bold text-ink-900">Attendance Sessions</h2>
          <p className="text-sm text-ink-500">View and manage all attendance sessions</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)] xl:w-auto">
          <label className="relative">
            <select
              aria-label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(0);
              }}
              className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-card pl-4 pr-10 text-sm font-semibold text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 sm:w-36"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
            <ChevronDown
              width={16}
              height={16}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
          </label>
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(0);
            }}
          />
          <label className="relative min-w-0 xl:w-56 2xl:w-64">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              type="search"
              placeholder="Search sessions…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-card pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </label>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="py-12 text-center text-ink-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-6 py-12 text-center text-ink-500">
            No sessions yet. Start one above to begin taking attendance.
          </p>
        ) : shown.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-6 py-10 text-center text-ink-500">
            No sessions match these filters.
            <button
              type="button"
              className="ml-2 font-semibold text-brand-600 hover:text-brand-700"
              onClick={() => {
                setStatus('all');
                setRange({ from: '', to: '' });
                setQuery('');
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Phones: one card per session. */}
            <ul className="space-y-3 md:hidden">
              {pageRows.map((row) => (
                <li key={row.session.id}>
                  <SessionCardItem row={row} onAction={(a) => act(row, a)} />
                </li>
              ))}
            </ul>

            {/* Tablets and up: the table; less vital columns join as it widens. */}
            <div className="hidden overflow-x-auto rounded-xl border border-slate-100 md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-ink-500">
                  <tr>
                    <th className={cn(headCell, 'hidden w-12 font-semibold 2xl:table-cell')}>#</th>
                    <th className={cn(headCell, 'font-semibold')}>Date</th>
                    <th className={cn(headCell, 'font-semibold')}>Supervisor</th>
                    <th className={cn(headCell, 'hidden font-semibold xl:table-cell')}>Status</th>
                    <th className={cn(headCell, 'hidden font-semibold xl:table-cell')}>Start Time</th>
                    <th className={cn(headCell, 'hidden font-semibold 2xl:table-cell')}>End Time</th>
                    <th className={cn(headCell, 'hidden font-semibold 2xl:table-cell')}>Duration</th>
                    <th className={cn(headCell, 'font-semibold')}>Check-ins</th>
                    <th className={cn(headCell, 'text-center font-semibold')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => {
                    const s = row.session;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => act(row, 'view')}
                        className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/70"
                      >
                        <td className={cn(bodyCell, 'hidden tabular-nums text-ink-500 2xl:table-cell')}>
                          {page * PAGE_SIZE + i + 1}
                        </td>
                        <td className={bodyCell}>
                          <DayCell row={row} />
                          {/* Narrower screens show the status here, not in its own column. */}
                          <div className="mt-1.5 xl:hidden">
                            <StatusPill active={s.status === 'active'} />
                          </div>
                        </td>
                        <td className={cn(bodyCell, 'max-w-48')}>
                          <Supervisor name={s.supervisorName} />
                        </td>
                        <td className={cn(bodyCell, 'hidden xl:table-cell')}>
                          <StatusPill active={s.status === 'active'} />
                        </td>
                        <td className={cn(bodyCell, 'hidden xl:table-cell')}>
                          <TimeCell iso={s.startedAt} />
                        </td>
                        <td className={cn(bodyCell, 'hidden 2xl:table-cell')}>
                          {s.closedAt ? <TimeCell iso={s.closedAt} /> : <span className="text-ink-400">–</span>}
                        </td>
                        <td className={cn(bodyCell, 'hidden whitespace-nowrap tabular-nums text-ink-700 2xl:table-cell')}>
                          {s.closedAt ? (
                            formatDuration(row.minutes)
                          ) : (
                            <span className="text-ink-400">{formatDuration(row.minutes)} so far</span>
                          )}
                        </td>
                        <td className={bodyCell}>
                          <CheckIns row={row} />
                        </td>
                        <td className={bodyCell}>
                          <RowActions row={row} onAction={(a) => act(row, a)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-ink-500">
                Showing{' '}
                <b className="font-semibold text-ink-700">
                  {page * PAGE_SIZE + 1}–{Math.min(shown.length, (page + 1) * PAGE_SIZE)}
                </b>{' '}
                of <b className="font-semibold text-ink-700">{shown.length}</b>{' '}
                {filtered ? 'matching ' : ''}
                {shown.length === 1 ? 'session' : 'sessions'}
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <PageButton disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </PageButton>
                  <span className="px-2 tabular-nums text-ink-500">
                    {page + 1} / {pages}
                  </span>
                  <PageButton disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </PageButton>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function PageButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-9 rounded-lg border border-slate-200 bg-card px-3 font-semibold text-ink-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function DayCell({ row }: { row: SessionRow }) {
  return (
    <div className="whitespace-nowrap">
      <div className="font-semibold text-ink-900">{format(row.day, 'dd MMM yyyy')}</div>
      <div className="text-xs text-ink-400">
        {format(row.day, 'EEE')}
        {row.titleNote && <span className="text-ink-500"> · {row.titleNote}</span>}
      </div>
    </div>
  );
}

function TimeCell({ iso }: { iso: string }) {
  return (
    <div className="whitespace-nowrap">
      <div className="font-medium tabular-nums text-ink-900">{formatClock(iso)}</div>
      <div className="text-xs text-ink-400">{format(new Date(iso), 'dd MMM yyyy')}</div>
    </div>
  );
}

function Supervisor({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-ink-500">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="truncate font-medium text-ink-900">{name}</span>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-500',
      )}
    >
      <span className={cn('size-1.5 rounded-full', active ? 'animate-pulse bg-emerald-500' : 'bg-ink-400')} />
      {active ? 'Active' : 'Closed'}
    </span>
  );
}

function CheckIns({ row }: { row: SessionRow }) {
  const pct = row.roster > 0 ? Math.round((row.checkedIn / row.roster) * 100) : 0;
  return (
    <div className="min-w-32">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold tabular-nums text-ink-900">
          {row.checkedIn} / {row.roster}
        </span>
        <span className="tabular-nums text-ink-500">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', pct >= 50 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-transparent')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** View, check-in QR, and the rest under ⋮ (a native list, so it never gets cut off). */
function RowActions({ row, onAction }: { row: SessionRow; onAction: (action: RowAction) => void }) {
  const active = row.session.status === 'active';
  const icon =
    'grid size-9 place-items-center rounded-lg border border-slate-200 bg-card text-ink-500 transition hover:border-slate-300 hover:text-ink-900';
  return (
    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button type="button" title="View session" aria-label="View session" className={icon} onClick={() => onAction('view')}>
        <Eye width={16} height={16} />
      </button>
      <button
        type="button"
        title={active ? 'Show the check-in QR' : 'Session closed — no QR'}
        aria-label="Show the check-in QR"
        disabled={!active}
        className={cn(icon, 'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-slate-200 disabled:hover:text-ink-500')}
        onClick={() => onAction('qr-in')}
      >
        <QrIcon width={16} height={16} />
      </button>
      <label className={cn(icon, 'relative cursor-pointer focus-within:ring-2 focus-within:ring-brand-500')} title="More">
        <MoreVertical width={16} height={16} />
        <select
          aria-label={`More for the session of ${format(row.day, 'd MMM yyyy')}`}
          className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
          value=""
          onChange={(e) => {
            const action = e.target.value as RowAction;
            e.target.value = '';
            if (action) onAction(action);
          }}
        >
          <option value="" disabled>
            Session
          </option>
          <option value="view">View session</option>
          {active && <option value="qr-in">Check-in QR</option>}
          {active && <option value="qr-out">Check-out QR</option>}
          <option value="export">Export Excel</option>
        </select>
      </label>
    </div>
  );
}

function SessionCardItem({ row, onAction }: { row: SessionRow; onAction: (action: RowAction) => void }) {
  const s = row.session;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAction('view')}
      onKeyDown={(e) => e.key === 'Enter' && onAction('view')}
      className="rounded-xl border border-slate-200 bg-card p-4 transition hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <DayCell row={row} />
        <StatusPill active={s.status === 'active'} />
      </div>
      <div className="mt-3">
        <Supervisor name={s.supervisorName} />
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs tabular-nums text-ink-500">
        <Clock width={13} height={13} className="shrink-0 text-ink-400" />
        {formatClock(s.startedAt)}
        {s.closedAt ? ` – ${formatClock(s.closedAt)}` : ' – now'} · {formatDuration(row.minutes)}
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <CheckIns row={row} />
        </div>
        <RowActions row={row} onAction={onAction} />
      </div>
    </div>
  );
}

/** "Select date range": quick picks, or any two days. */
function DateRangePicker({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (next: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const day = (d: Date) => format(d, 'yyyy-MM-dd');
  const today = new Date();
  const quick = [
    { label: 'Today', from: day(today), to: day(today) },
    { label: 'Last 7 days', from: day(subDays(today, 6)), to: day(today) },
    { label: 'This month', from: day(startOfMonth(today)), to: day(today) },
  ];
  const nice = (v: string) => format(new Date(`${v}T00:00`), 'd MMM');
  const set = !!value.from || !!value.to;
  const label = !set
    ? 'Select date range'
    : value.from && value.to
      ? value.from === value.to
        ? nice(value.from)
        : `${nice(value.from)} – ${nice(value.to)}`
      : value.from
        ? `From ${nice(value.from)}`
        : `Until ${nice(value.to)}`;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 w-full items-center gap-2 rounded-xl border bg-card pl-3.5 pr-3 text-sm transition sm:w-52',
          set ? 'border-brand-200 text-ink-900' : 'border-slate-200 text-ink-400',
          open && 'border-brand-500 ring-2 ring-brand-500/40',
        )}
      >
        <CalendarDays width={16} height={16} className={set ? 'text-brand-600' : 'text-ink-400'} />
        <span className="flex-1 truncate text-left font-medium">{label}</span>
        {set && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear dates"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: '', to: '' });
            }}
            className="grid size-6 place-items-center rounded-md text-ink-400 hover:bg-slate-100 hover:text-ink-700"
          >
            <X width={14} height={14} />
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-slate-200 bg-raised p-4 shadow-xl sm:left-auto sm:right-0">
          <div className="flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  onChange({ from: q.from, to: q.to });
                  setOpen(false);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  value.from === q.from && value.to === q.to
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 text-ink-700 hover:bg-slate-50',
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-ink-500">
              From
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <label className="text-xs font-semibold text-ink-500">
              To
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => onChange({ from: '', to: '' })}
              className="text-sm font-semibold text-ink-500 hover:text-ink-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
