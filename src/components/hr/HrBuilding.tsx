import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode, type SVGProps } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { HR_FLOOR_COLORS, HR_ROOM_ICONS } from '@/components/apps';
import { Building, CalendarDays, Check, ChevronRight, FileText, Home, Phone, Wallet } from '@/components/icons';
import { localDate, type AttendanceRow } from '@/services/hr/logic';
import { HR_NAV_GROUPS, type HrTab } from '@/services/hr/navigation';
import type { HrWorkspace } from '@/services/hr/types';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';

/** What a room shows in the directory: a live figure and, when it needs you, a count. */
export interface RoomSign {
  value: string;
  alert?: boolean;
  count?: number;
}

type Signs = Partial<Record<HrTab, RoomSign>>;
type Icon = (p: SVGProps<SVGSVGElement>) => ReactElement;

/**
 * HR as a building of four floors — People, Workforce, Talent and
 * Administration — each with its rooms. The lobby (the overview) is where
 * you come in; the floor colours are only for finding your way.
 */
const FLOORS = HR_NAV_GROUPS.map((g, i) => ({
  number: i + 1,
  label: g.label,
  color: HR_FLOOR_COLORS[g.label] ?? '#334155',
  rooms: g.items.filter((r) => r.id !== 'overview'),
}));
const ROOM_COUNT = FLOORS.reduce((n, f) => n + f.rooms.length, 0);

/** The floor a room is on. */
export function hrFloor(tab: HrTab) {
  return FLOORS.find((f) => f.rooms.some((r) => r.id === tab)) ?? FLOORS[0];
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

function Panel({
  title,
  note,
  action,
  children,
  className,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-sm', className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[15px] font-semibold text-ink-900">{title}</span>
          {note && <span className="truncate text-sm text-ink-400">{note}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A quiet link to a room, for a panel's top-right corner. */
function RoomLink({ room, onOpen, children }: { room: HrTab; onOpen: (tab: HrTab) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(room)}
      className="-mr-2 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
    >
      {children}
      <ChevronRight width={15} height={15} />
    </button>
  );
}

/** "4 Nov", "4–6 Nov" or "30 Nov – 2 Dec". */
function span(from: string, to = from): string {
  const a = parseISO(from);
  const b = parseISO(to);
  if (from === to) return format(a, 'd MMM');
  if (format(a, 'MMM yyyy') === format(b, 'MMM yyyy')) return `${format(a, 'd')}–${format(b, 'd MMM')}`;
  return `${format(a, 'd MMM')} – ${format(b, 'd MMM')}`;
}

/* ── Today ────────────────────────────────────────────────────────────── */

/** Everyone on staff today, split by where they are. Colours are checked for colour-blind readers. */
const PARTS = [
  { key: 'onTime', label: 'On time', swatch: 'bg-[#059669]' },
  { key: 'late', label: 'Late', swatch: 'bg-[#f59e0b]' },
  { key: 'notYet', label: 'Not in yet', swatch: 'bg-slate-300' },
  { key: 'absent', label: 'Absent', swatch: 'bg-[#e11d48]' },
  { key: 'onLeave', label: 'On leave', swatch: 'bg-[#0284c7]' },
  { key: 'off', label: 'Day off', swatch: 'bg-slate-200' },
] as const;

function TodayPanel({ rows, onOpen }: { rows: AttendanceRow[]; onOpen: (tab: HrTab) => void }) {
  const counts = {
    onTime: rows.filter((r) => r.checkIn && r.late === 0).length,
    late: rows.filter((r) => r.checkIn && r.late > 0).length,
    notYet: rows.filter((r) => r.status === 'Scheduled').length,
    absent: rows.filter((r) => r.status === 'Absent').length,
    onLeave: rows.filter((r) => r.status === 'On leave').length,
    off: rows.filter((r) => r.status === 'Off day' || r.status === 'Holiday').length,
  };
  const came = counts.onTime + counts.late;
  const expected = rows.length - counts.off - counts.onLeave;
  const stillIn = rows.filter((r) => r.status === 'Incomplete').length;
  const hours = Math.round(rows.reduce((n, r) => n + r.hours, 0) * 10) / 10;
  const total = rows.length;
  const summary = PARTS.map((p) => `${p.label} ${counts[p.key]}`).join(', ');

  return (
    <Panel
      title="Today"
      note={format(new Date(), 'EEEE, d MMMM')}
      action={
        <RoomLink room="time" onOpen={onOpen}>
          <span className="hidden sm:inline">Time & attendance</span>
          <span className="sm:hidden">Attendance</span>
        </RoomLink>
      }
    >
      <div className="px-5 pb-5">
        {total === 0 ? (
          <p className="py-6 text-sm text-ink-500">No one is on staff yet. Add people on the Employee report and they show up here.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <p className="flex items-baseline gap-2.5">
                <span className="text-5xl font-semibold leading-none tracking-tight text-ink-900">{came}</span>
                <span className="text-sm text-ink-500">
                  {expected > 0 ? `of ${expected} expected came in` : 'everyone is off today'}
                </span>
              </p>
              <dl className="flex gap-8">
                <div>
                  <dt className="text-xs text-ink-500">Still at work</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink-900">{stillIn}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-500">Hours logged</dt>
                  <dd className="mt-0.5 text-xl font-semibold text-ink-900">{hours}</dd>
                </div>
              </dl>
            </div>

            {/* One whole, split into parts: a thin bar with a 2px gap between parts. */}
            <div role="img" aria-label={`Staff today: ${summary}`} className="mt-5 flex h-2 gap-0.5">
              {PARTS.filter((p) => counts[p.key] > 0).map((p) => (
                <span
                  key={p.key}
                  title={`${p.label} · ${counts[p.key]} (${Math.round((counts[p.key] / total) * 100)}%)`}
                  className={cn('min-w-1 rounded-full', p.swatch)}
                  style={{ flex: `${counts[p.key]} 1 0` }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {PARTS.map((p) => (
                <li key={p.key} className={cn('flex items-center gap-2', counts[p.key] === 0 && 'opacity-50')}>
                  <span className={cn('size-2.5 rounded-[3px]', p.swatch)} />
                  <span className="text-ink-600">{p.label}</span>
                  <span className="font-semibold tabular-nums text-ink-900">{counts[p.key]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}

/* ── Directory ────────────────────────────────────────────────────────── */

/** One room in the directory: its icon, its name, and what is in it. */
function RoomRow({ id, label, color, sign, onOpen }: { id: HrTab; label: string; color: string; sign?: RoomSign; onOpen: () => void }) {
  const Icon = HR_ROOM_ICONS[id];
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ '--floor': color } as CSSProperties}
      className="group flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-ink-500 transition group-hover:bg-(--floor) group-hover:text-white">
        <Icon width={18} height={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col @md:flex-row @md:items-center @md:justify-between @md:gap-4">
        <span className="truncate text-sm font-medium text-ink-900">{label}</span>
        {sign && (
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 truncate text-xs @md:text-sm',
              sign.alert ? 'font-medium text-rose-700' : 'text-ink-500',
            )}
          >
            {sign.alert && <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />}
            <span className="truncate">{sign.value}</span>
          </span>
        )}
      </span>
      <ChevronRight width={16} height={16} className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" />
    </button>
  );
}

/** The board by the lift: every floor and its rooms, with what is in each. */
function Directory({ signs, onOpen, className }: { signs: Signs; onOpen: (tab: HrTab) => void; className?: string }) {
  return (
    <Panel title="Directory" note={`${FLOORS.length} floors · ${ROOM_COUNT} rooms`} className={className}>
      <div className="grid grid-cols-1 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2">
        {FLOORS.map((floor) => (
          <div key={floor.label} className="@container min-w-0 bg-card px-3 pb-3 pt-4">
            <div className="mb-1.5 flex items-center gap-2.5 px-2">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                style={{ background: floor.color }}
                aria-hidden
              >
                {floor.number}
              </span>
              <h3 className="text-sm font-semibold text-ink-900">
                <span className="sr-only">Floor {floor.number}: </span>
                {floor.label}
              </h3>
              <span className="ml-auto text-xs text-ink-400">
                {floor.rooms.length} {floor.rooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>
            <ul>
              {floor.rooms.map((r) => (
                <li key={r.id}>
                  <RoomRow id={r.id} label={r.label} color={floor.color} sign={signs[r.id]} onOpen={() => onOpen(r.id)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Waiting on you, and coming up ────────────────────────────────────── */

interface Task {
  key: string;
  icon: Icon;
  title: string;
  meta: string;
  room: HrTab;
  urgent?: boolean;
}

interface Upcoming {
  key: string;
  date: string;
  title: string;
  meta: string;
  room: HrTab;
}

function tasksFor(w: HrWorkspace, employees: Employee[], today: string): Task[] {
  const name = (id: string) => employees.find((e) => e.id === id)?.fullName ?? 'Someone';
  const tasks: Task[] = [];

  const pending = w.leaveRequests.filter((r) => r.status === 'pending').sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const r of pending.slice(0, 3)) {
    const type = w.leaveTypes.find((t) => t.id === r.leaveTypeId);
    const amount = type?.unit === 'hours' ? `${r.amount} h` : `${r.amount} ${r.amount === 1 ? 'day' : 'days'}`;
    tasks.push({
      key: `leave-${r.id}`,
      icon: CalendarDays,
      title: `${name(r.employeeId)} asks for leave`,
      meta: [type?.name, span(r.startDate, r.endDate), amount].filter(Boolean).join(' · '),
      room: 'leave',
      urgent: true,
    });
  }
  if (pending.length > 3)
    tasks.push({ key: 'leave-more', icon: CalendarDays, title: `${pending.length - 3} more leave requests`, meta: 'Leave & holidays', room: 'leave', urgent: true });

  for (const c of w.interviewCandidates ?? []) {
    if (c.status !== 'Pending / Call Later' || !c.callAgainDate || c.callAgainDate > today) continue;
    tasks.push({
      key: `call-${c.id}`,
      icon: Phone,
      title: `Call back ${c.fullName}`,
      meta: c.callAgainDate === today ? 'Due today' : `Due since ${span(c.callAgainDate)}`,
      room: 'interviews',
    });
  }

  const soon = localDate(addDays(parseISO(today), 30));
  for (const e of employees) {
    const p = w.profiles[e.id];
    if (!p || p.status === 'inactive' || !p.contractEnd || p.contractEnd < today || p.contractEnd > soon) continue;
    const days = differenceInCalendarDays(parseISO(p.contractEnd), parseISO(today));
    tasks.push({
      key: `contract-${e.id}`,
      icon: FileText,
      title: `${e.fullName}'s contract ends`,
      meta: `${span(p.contractEnd)} · ${days === 0 ? 'today' : `in ${days} ${days === 1 ? 'day' : 'days'}`}`,
      room: 'people',
    });
  }

  const drafts = w.payrollEntries.filter((p) => p.period === w.payrollPeriod && p.status === 'draft');
  if (drafts.length > 0)
    tasks.push({
      key: 'payroll',
      icon: Wallet,
      title: `${format(parseISO(`${w.payrollPeriod}-01`), 'MMMM')} payroll is a draft`,
      meta: `${drafts.length} ${drafts.length === 1 ? 'payslip' : 'payslips'} to approve`,
      room: 'payroll',
    });

  if (w.departments.length > 0) {
    const loose = employees.filter((e) => {
      const p = w.profiles[e.id];
      return p?.status !== 'inactive' && !p?.departmentId;
    }).length;
    if (loose > 0)
      tasks.push({
        key: 'departments',
        icon: Building,
        title: `${loose} ${loose === 1 ? 'person has' : 'people have'} no department`,
        meta: 'Organization',
        room: 'organization',
      });
  }
  return tasks;
}

function upcomingFor(w: HrWorkspace, employees: Employee[], today: string): Upcoming[] {
  const name = (id: string) => employees.find((e) => e.id === id)?.fullName ?? 'Someone';
  const until = (days: number) => localDate(addDays(parseISO(today), days));
  const items: Upcoming[] = [];

  for (const h of w.holidays) {
    if (h.endDate < today || h.startDate > until(30)) continue;
    items.push({
      key: `holiday-${h.id}`,
      date: h.startDate < today ? today : h.startDate,
      title: h.name,
      meta: `${h.paid ? 'Paid' : 'Unpaid'} holiday · ${span(h.startDate, h.endDate)}`,
      room: 'leave',
    });
  }
  for (const r of w.leaveRequests) {
    if (r.status !== 'approved' || r.startDate <= today || r.startDate > until(7)) continue;
    const type = w.leaveTypes.find((t) => t.id === r.leaveTypeId);
    items.push({
      key: `away-${r.id}`,
      date: r.startDate,
      title: `${name(r.employeeId)} is away`,
      meta: [type?.name, span(r.startDate, r.endDate)].filter(Boolean).join(' · '),
      room: 'leave',
    });
  }
  for (const c of w.interviewCandidates ?? []) {
    if (!c.interviewDate || c.interviewDate < today || c.interviewDate > until(14)) continue;
    items.push({ key: `interview-${c.id}`, date: c.interviewDate, title: `Interview · ${c.fullName}`, meta: c.location || 'Interview tracking', room: 'interviews' });
  }
  for (const e of employees) {
    const p = w.profiles[e.id];
    if (!p?.birthDate || p.status === 'inactive') continue;
    const [, m, d] = p.birthDate.split('-');
    if (!m || !d) continue;
    let next = `${today.slice(0, 4)}-${m}-${d}`;
    if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${m}-${d}`;
    if (next > until(14)) continue;
    items.push({ key: `birthday-${e.id}`, date: next, title: `${e.fullName}'s birthday`, meta: next === today ? 'Today' : format(parseISO(next), 'EEEE'), room: 'people' });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
}

function Inbox({
  workspace,
  employees,
  onOpen,
  className,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  onOpen: (tab: HrTab) => void;
  className?: string;
}) {
  const today = localDate();
  const tasks = tasksFor(workspace, employees, today);
  const upcoming = upcomingFor(workspace, employees, today);

  return (
    <Panel
      title="Waiting on you"
      className={className}
      action={
        tasks.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-700">{tasks.length}</span>
        )
      }
    >
      {tasks.length === 0 ? (
        <p className="flex items-center gap-2.5 px-5 pb-5 text-sm text-ink-500">
          <span className="grid size-7 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <Check width={15} height={15} />
          </span>
          Nothing is waiting. You are up to date.
        </p>
      ) : (
        <ul className="px-3 pb-3">
          {tasks.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => onOpen(t.room)}
                className="group flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full',
                    t.urgent ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-ink-500',
                  )}
                >
                  <t.icon width={15} height={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{t.title}</span>
                  <span className="block truncate text-xs text-ink-500">{t.meta}</span>
                </span>
                <ChevronRight width={16} height={16} className="shrink-0 text-ink-300 transition group-hover:text-ink-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-slate-100">
        <h2 className="flex items-baseline gap-2 px-5 pb-1 pt-4">
          <span className="text-[15px] font-semibold text-ink-900">Coming up</span>
          <span className="text-sm text-ink-400">next weeks</span>
        </h2>
        {upcoming.length === 0 ? (
          <p className="px-5 pb-5 pt-1 text-sm text-ink-500">No holidays, interviews, leave or birthdays coming up.</p>
        ) : (
          <ul className="px-3 pb-3">
            {upcoming.map((u) => {
              const day = parseISO(u.date);
              return (
                <li key={u.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(u.room)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    {/* A calendar leaf: month above, day below. */}
                    <span className="flex w-10 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-slate-200 bg-card leading-none">
                      <span className="w-full bg-slate-100 py-0.5 text-center text-[10px] font-semibold uppercase text-ink-500">
                        {format(day, 'MMM')}
                      </span>
                      <span className="py-1 text-base font-semibold text-ink-900">{format(day, 'd')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{u.title}</span>
                      <span className="block truncate text-xs text-ink-500">{u.meta}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/* ── Team ─────────────────────────────────────────────────────────────── */

function Team({
  workspace,
  employees,
  onOpen,
  className,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  onOpen: (tab: HrTab) => void;
  className?: string;
}) {
  const active = employees.filter((e) => workspace.profiles[e.id]?.status !== 'inactive');
  const rows = workspace.departments
    .map((d) => ({ key: d.id, label: d.name, count: active.filter((e) => workspace.profiles[e.id]?.departmentId === d.id).length }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
  const shown = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((n, d) => n + d.count, 0);
  const loose = active.filter((e) => !workspace.profiles[e.id]?.departmentId).length;
  if (rest > 0) shown.push({ key: 'rest', label: `${rows.length - 6} more departments`, count: rest });
  if (loose > 0 && workspace.departments.length > 0) shown.push({ key: 'none', label: 'No department', count: loose });
  const top = Math.max(1, ...shown.map((d) => d.count));

  return (
    <Panel
      title="Team"
      note={`${active.length} active`}
      className={className}
      action={
        <RoomLink room="organization" onOpen={onOpen}>
          Organization
        </RoomLink>
      }
    >
      {workspace.departments.length === 0 || shown.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-500">
          {workspace.departments.length === 0
            ? 'No departments yet. Set them up in Organization to see who works where.'
            : 'No one is in a department yet.'}
        </p>
      ) : (
        <ul className="grid gap-x-10 gap-y-3 px-5 pb-5 sm:grid-cols-2">
          {shown.map((d) => (
            <li key={d.key} title={`${d.label} · ${d.count}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className={cn('truncate', d.key === 'none' || d.key === 'rest' ? 'text-ink-500' : 'font-medium text-ink-800')}>{d.label}</span>
                <span className="font-semibold tabular-nums text-ink-900">{d.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div
                  className={cn('h-1.5 rounded-full', d.key === 'none' || d.key === 'rest' ? 'bg-slate-300' : 'bg-indigo-600 dark:bg-indigo-400')}
                  style={{ width: `${(d.count / top) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── The lobby ────────────────────────────────────────────────────────── */

/**
 * The lobby: today's attendance across the top; under it the directory of
 * rooms and the team, with what is waiting on you and what is coming up
 * beside them. On a phone it is one column: today, directory, waiting, team.
 */
export function HrLobby({
  workspace,
  employees,
  today,
  signs,
  onOpen,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  today: AttendanceRow[];
  signs: Signs;
  onOpen: (tab: HrTab) => void;
}) {
  return (
    <div className="space-y-5">
      <TodayPanel rows={today} onOpen={onOpen} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Directory signs={signs} onOpen={onOpen} className="lg:col-start-1 lg:row-start-1" />
        <Inbox
          workspace={workspace}
          employees={employees}
          onOpen={onOpen}
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        />
        <Team workspace={workspace} employees={employees} onOpen={onOpen} className="lg:col-start-1 lg:row-start-2 lg:self-start" />
      </div>
    </div>
  );
}

/* ── Inside a room ────────────────────────────────────────────────────── */

/**
 * Inside a room: the lift (Lobby and the four floors) on the first line, the
 * rooms of this floor as tabs on the second.
 */
export function HrCorridor({ active, signs, onOpen }: { active: HrTab; signs: Signs; onOpen: (tab: HrTab) => void }) {
  const floor = hrFloor(active);
  const rowRef = useRef<HTMLDivElement>(null);

  // The open room stays in view on a narrow screen.
  useEffect(() => {
    rowRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <nav aria-label="HR rooms" className="mb-6 min-w-0">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit">
        <button
          type="button"
          onClick={() => onOpen('overview')}
          title="Lobby"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink-600 transition hover:bg-card/60 hover:text-ink-900"
        >
          <Home width={16} height={16} />
          <span className="hidden sm:inline">Lobby</span>
        </button>
        {FLOORS.map((f) => {
          const here = f.label === floor.label;
          const waiting = f.rooms.some((r) => signs[r.id]?.alert);
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => !here && onOpen(f.rooms[0].id)}
              aria-pressed={here}
              title={`Floor ${f.number} · ${f.label}`}
              className={cn(
                'relative inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-1.5 text-sm font-medium transition',
                here ? 'bg-card pr-3 text-ink-900 shadow-sm' : 'text-ink-600 hover:bg-card/60 hover:text-ink-900 sm:pr-3',
              )}
            >
              <span
                className={cn('grid size-5 place-items-center rounded-full text-[10px] font-bold', !here && 'bg-slate-200 text-ink-600')}
                style={here ? { background: f.color, color: '#fff' } : undefined}
              >
                {f.number}
              </span>
              <span className={cn(!here && 'hidden sm:inline')}>{f.label}</span>
              {waiting && !here && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-rose-500" />}
            </button>
          );
        })}
      </div>

      <div ref={rowRef} className="mt-3 flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-slate-200)]">
        {floor.rooms.map((r) => {
          const here = r.id === active;
          const sign = signs[r.id];
          return (
            <button
              key={r.id}
              type="button"
              aria-current={here ? 'page' : undefined}
              onClick={() => onOpen(r.id)}
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm font-medium transition',
                // In the dark the floor colour is lifted so the line still shows.
                here
                  ? 'border-(--floor) text-ink-900 dark:border-[color-mix(in_oklab,var(--floor)_55%,white)]'
                  : 'border-transparent text-ink-500 hover:text-ink-900',
              )}
              style={{ '--floor': floor.color } as CSSProperties}
            >
              {r.label}
              {sign?.alert && sign.count ? (
                <span className="rounded-full bg-rose-50 px-1.5 py-px text-xs font-semibold tabular-nums text-rose-700">{sign.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
