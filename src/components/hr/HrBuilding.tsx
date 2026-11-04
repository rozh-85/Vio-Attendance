import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type SVGProps } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { HR_FLOOR_COLORS, HR_ROOM_ICONS } from '@/components/apps';
import { Building, CalendarDays, Check, ChevronRight, Clock, FileText, Home, Phone, Users, Wallet } from '@/components/icons';
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

/** The floor a room is on. */
export function hrFloor(tab: HrTab) {
  return FLOORS.find((f) => f.rooms.some((r) => r.id === tab)) ?? FLOORS[0];
}

/* ── Small pieces ─────────────────────────────────────────────────────── */

/** A card with a titled header and a line under it, like every card in the lobby. */
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
    <section className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-sm', className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold text-ink-900">{title}</span>
          {note && <span className="truncate text-sm text-ink-400">{note}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** A quiet link to a room, for a card's top-right corner. */
function RoomLink({ room, onOpen, children }: { room: HrTab; onOpen: (tab: HrTab) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(room)}
      className="-mr-2 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
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

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/* ── Today's numbers ──────────────────────────────────────────────────── */

/** Everyone on staff today, split by where they are. Colours are checked for colour-blind readers. */
const PARTS = [
  { key: 'onTime', label: 'On time', swatch: 'bg-[#059669]' },
  { key: 'late', label: 'Late', swatch: 'bg-[#f59e0b]' },
  { key: 'notYet', label: 'Not in yet', swatch: 'bg-slate-300' },
  { key: 'absent', label: 'Absent', swatch: 'bg-[#e11d48]' },
  { key: 'onLeave', label: 'On leave', swatch: 'bg-[#0284c7]' },
  { key: 'off', label: 'Day off', swatch: 'bg-slate-200' },
] as const;

function countToday(rows: AttendanceRow[]) {
  const counts = {
    onTime: rows.filter((r) => r.checkIn && r.late === 0).length,
    late: rows.filter((r) => r.checkIn && r.late > 0).length,
    notYet: rows.filter((r) => r.status === 'Scheduled').length,
    absent: rows.filter((r) => r.status === 'Absent').length,
    onLeave: rows.filter((r) => r.status === 'On leave').length,
    off: rows.filter((r) => r.status === 'Off day' || r.status === 'Holiday').length,
  };
  return {
    counts,
    came: counts.onTime + counts.late,
    expected: rows.length - counts.off - counts.onLeave,
    stillIn: rows.filter((r) => r.status === 'Incomplete').length,
    hours: Math.round(rows.reduce((n, r) => n + r.hours, 0) * 10) / 10,
  };
}

/* ── Key figures ──────────────────────────────────────────────────────── */

/** One key figure; the whole card opens the room it comes from. */
function Figure({
  label,
  icon: Icon,
  value,
  unit,
  note,
  alert,
  onClick,
}: {
  label: string;
  icon: Icon;
  value: string;
  unit?: string;
  note: string;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-card p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:p-5"
    >
      <span className="flex min-h-9 items-center justify-between gap-3">
        <span className="min-w-0 text-sm font-semibold text-ink-500">{label}</span>
        <span className="hidden size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink-500 transition group-hover:bg-brand-50 group-hover:text-brand-700 sm:grid">
          <Icon width={18} height={18} />
        </span>
      </span>
      <span className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-2xl font-bold tabular-nums text-ink-900 sm:text-3xl lg:text-2xl xl:text-3xl">
        <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
        {unit && <span className="text-sm font-semibold text-ink-400">{unit}</span>}
      </span>
      <span className={cn('mt-1 flex items-baseline gap-1.5 text-sm', alert ? 'font-medium text-rose-700' : 'text-ink-500')}>
        {alert && <span className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-rose-500" />}
        <span className="min-w-0">{note}</span>
      </span>
    </button>
  );
}

function KeyFigures({
  workspace,
  employees,
  rows,
  onOpen,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  rows: AttendanceRow[];
  onOpen: (tab: HrTab) => void;
}) {
  const active = employees.filter((e) => workspace.profiles[e.id]?.status !== 'inactive').length;
  const { came, expected, counts } = countToday(rows);
  const pending = workspace.leaveRequests.filter((r) => r.status === 'pending').length;
  const slips = workspace.payrollEntries.filter((p) => p.period === workspace.payrollPeriod);
  const payTotal = slips.reduce((n, p) => n + p.netSalary, 0);
  const drafts = slips.filter((p) => p.status === 'draft').length;
  const month = /^\d{4}-\d{2}$/.test(workspace.payrollPeriod) ? format(parseISO(`${workspace.payrollPeriod}-01`), 'MMMM') : '';
  const payNote =
    slips.length === 0
      ? 'Not prepared yet'
      : drafts > 0
        ? `Draft · ${plural(drafts, 'payslip')} to approve`
        : slips.every((p) => p.status === 'paid')
          ? `Paid · ${plural(slips.length, 'payslip')}`
          : `Approved · ${plural(slips.length, 'payslip')}`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Figure
        label="Employees"
        icon={Users}
        value={active.toLocaleString('en-US')}
        note={`${plural(workspace.departments.length, 'department')} · ${plural(workspace.locations.length, 'site')}`}
        onClick={() => onOpen('people')}
      />
      <Figure
        label="Present today"
        icon={Clock}
        value={came.toLocaleString('en-US')}
        unit={expected > 0 ? `of ${expected}` : undefined}
        note={
          expected > 0
            ? `${Math.round((came / expected) * 100)}% attendance${counts.late ? ` · ${counts.late} late` : ''}`
            : 'Everyone is off today'
        }
        onClick={() => onOpen('time')}
      />
      <Figure
        label="Leave requests"
        icon={CalendarDays}
        value={pending.toLocaleString('en-US')}
        note={pending > 0 ? `Waiting for you · ${counts.onLeave} on leave today` : `${counts.onLeave} on leave today`}
        alert={pending > 0}
        onClick={() => onOpen('leave')}
      />
      <Figure
        label={month ? `Payroll · ${month}` : 'Payroll'}
        icon={Wallet}
        value={slips.length ? Math.round(payTotal).toLocaleString('en-US') : '—'}
        unit={slips.length ? workspace.settings?.currency || 'IQD' : undefined}
        note={payNote}
        onClick={() => onOpen('payroll')}
      />
    </div>
  );
}

/* ── Today's attendance ───────────────────────────────────────────────── */

function Attendance({ rows, onOpen, className }: { rows: AttendanceRow[]; onOpen: (tab: HrTab) => void; className?: string }) {
  const { counts, stillIn, hours } = countToday(rows);
  const total = rows.length;
  const summary = PARTS.map((p) => `${p.label} ${counts[p.key]}`).join(', ');

  return (
    <Panel
      title="Today's attendance"
      className={className}
      action={
        <RoomLink room="time" onOpen={onOpen}>
          Open timesheet
        </RoomLink>
      }
    >
      {total === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-500">No one is on staff yet. Add people on the Employee report and they show up here.</p>
      ) : (
        <div className="@container flex flex-1 flex-col p-5">
          {/* One whole, split into parts: a thin bar with a 2px gap between them. */}
          <div role="img" aria-label={`Staff today: ${summary}`} className="flex h-2.5 gap-0.5">
            {PARTS.filter((p) => counts[p.key] > 0).map((p) => (
              <span
                key={p.key}
                title={`${p.label} · ${counts[p.key]} (${Math.round((counts[p.key] / total) * 100)}%)`}
                className={cn('min-w-1 rounded-full', p.swatch)}
                style={{ flex: `${counts[p.key]} 1 0` }}
              />
            ))}
          </div>

          <dl className="mb-5 mt-4 grid grid-cols-2 gap-2 @md:grid-cols-3 @3xl:grid-cols-6">
            {PARTS.map((p) => (
              <div key={p.key} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                <dt className="flex items-center gap-2 text-xs font-medium text-ink-500">
                  <span className={cn('size-2 shrink-0 rounded-full', p.swatch)} />
                  {p.label}
                </dt>
                <dd className={cn('mt-1 text-xl font-semibold tabular-nums', counts[p.key] ? 'text-ink-900' : 'text-ink-300')}>
                  {counts[p.key]}
                </dd>
              </div>
            ))}
          </dl>

          <p className="-mx-5 -mb-5 mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-sm text-ink-500">
            <span>
              Still at work <b className="font-semibold tabular-nums text-ink-900">{stillIn}</b>
            </span>
            <span>
              Hours logged today <b className="font-semibold tabular-nums text-ink-900">{hours}</b>
            </span>
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ── Modules ──────────────────────────────────────────────────────────── */

/** Every room of the building, floor by floor, each with what is in it now. */
function Modules({ signs, onOpen, className }: { signs: Signs; onOpen: (tab: HrTab) => void; className?: string }) {
  return (
    <Panel title="HR modules" note={`${FLOORS.reduce((n, f) => n + f.rooms.length, 0)} modules in ${FLOORS.length} groups`} className={className}>
      <div className="@container p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 @md:grid-cols-2 @3xl:grid-cols-4">
          {FLOORS.map((floor) => (
            <div key={floor.label} className="min-w-0">
              <h3 className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                <span className="h-3.5 w-1 rounded-full" style={{ background: floor.color }} aria-hidden />
                {floor.label}
              </h3>
              <ul>
                {floor.rooms.map((r) => {
                  const Icon = HR_ROOM_ICONS[r.id];
                  const sign = signs[r.id];
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(r.id)}
                        style={{ '--floor': floor.color } as CSSProperties}
                        className="group flex w-full min-w-0 items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--floor)_11%,transparent)] text-(--floor) transition group-hover:bg-(--floor) group-hover:text-white dark:bg-[color-mix(in_oklab,var(--floor)_30%,transparent)] dark:text-[color-mix(in_oklab,var(--floor)_45%,white)]">
                          <Icon width={19} height={19} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-900">{r.label}</span>
                          {sign && (
                            <span
                              className={cn(
                                'flex min-w-0 items-center gap-1.5 text-xs',
                                sign.alert ? 'font-medium text-rose-700' : 'text-ink-500',
                              )}
                            >
                              {sign.alert && <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />}
                              <span className="truncate">{sign.value}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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

/** The first few of a list; a button at the foot of the card shows the rest. */
const SHOWN = 3;

function ShowAll({ total, open, onToggle }: { total: number; open: boolean; onToggle: () => void }) {
  if (total <= SHOWN) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-auto w-full border-t border-slate-100 px-5 py-2.5 text-left text-sm font-semibold text-brand-700 transition hover:bg-slate-50"
    >
      {open ? 'Show less' : `Show all ${total}`}
    </button>
  );
}

/** One line in a side card: an icon or a date, two lines of text, and where it leads. */
function SideRow({ lead, title, meta, onClick }: { lead: ReactNode; title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full min-w-0 items-center gap-3 px-5 py-3 text-left outline-none transition hover:bg-slate-50 focus-visible:bg-slate-50"
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{title}</span>
        <span className="block truncate text-xs text-ink-500">{meta}</span>
      </span>
      <ChevronRight width={16} height={16} className="shrink-0 text-ink-300 transition group-hover:text-ink-500" />
    </button>
  );
}

function Waiting({
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
  const tasks = tasksFor(workspace, employees, localDate());
  const [all, setAll] = useState(false);
  return (
    <Panel
      title="Waiting on you"
      className={className}
      action={
        tasks.length > 0 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-rose-700">{tasks.length}</span>
        )
      }
    >
      {tasks.length === 0 ? (
        <p className="flex items-center gap-3 px-5 py-5 text-sm text-ink-500">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <Check width={16} height={16} />
          </span>
          You are all caught up.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(all ? tasks : tasks.slice(0, SHOWN)).map((t) => (
            <li key={t.key}>
              <SideRow
                onClick={() => onOpen(t.room)}
                title={t.title}
                meta={t.meta}
                lead={
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      t.urgent ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-ink-500',
                    )}
                  >
                    <t.icon width={16} height={16} />
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <ShowAll total={tasks.length} open={all} onToggle={() => setAll((v) => !v)} />
    </Panel>
  );
}

function ComingUp({
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
  const upcoming = upcomingFor(workspace, employees, localDate());
  const [all, setAll] = useState(false);
  return (
    <Panel title="Coming up" note="next weeks" className={className}>
      {upcoming.length === 0 ? (
        <p className="px-5 py-5 text-sm text-ink-500">No holidays, interviews, leave or birthdays coming up.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {(all ? upcoming : upcoming.slice(0, SHOWN)).map((u) => {
            const day = parseISO(u.date);
            return (
              <li key={u.key}>
                <SideRow
                  onClick={() => onOpen(u.room)}
                  title={u.title}
                  meta={u.meta}
                  lead={
                    // A calendar leaf: month above, day below.
                    <span className="flex w-9 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-slate-200 bg-card leading-none">
                      <span className="w-full bg-brand-600 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
                        {format(day, 'MMM')}
                      </span>
                      <span className="py-1 text-sm font-semibold text-ink-900">{format(day, 'd')}</span>
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <ShowAll total={upcoming.length} open={all} onToggle={() => setAll((v) => !v)} />
    </Panel>
  );
}

/* ── Departments ──────────────────────────────────────────────────────── */

function Departments({
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
      title="Departments"
      note={`${active.length} active`}
      className={className}
      action={
        <RoomLink room="organization" onOpen={onOpen}>
          Organization
        </RoomLink>
      }
    >
      {workspace.departments.length === 0 || shown.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm text-ink-500">
          <p>
            {workspace.departments.length === 0
              ? 'No departments yet. Set them up to see who works where.'
              : 'No one is in a department yet.'}
          </p>
          <button
            type="button"
            onClick={() => onOpen('organization')}
            className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-ink-700 transition hover:bg-slate-50"
          >
            {workspace.departments.length === 0 ? 'Set up departments' : 'Place people in departments'}
          </button>
        </div>
      ) : (
        <ul className="grid gap-x-10 gap-y-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
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
 * The lobby, laid out like a dashboard: four key figures across the top;
 * then two rows of two cards — today's attendance beside what is waiting on
 * you, the HR modules beside what is coming up — each pair the same height;
 * the departments across the foot. On a phone it is one column, in the
 * same order; so it is on a tablet, with each card the full width.
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
    <div className="space-y-4 sm:space-y-5">
      <KeyFigures workspace={workspace} employees={employees} rows={today} onOpen={onOpen} />
      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Attendance rows={today} onOpen={onOpen} />
        <Waiting workspace={workspace} employees={employees} onOpen={onOpen} />
        <Modules signs={signs} onOpen={onOpen} />
        <ComingUp workspace={workspace} employees={employees} onOpen={onOpen} />
        <Departments workspace={workspace} employees={employees} onOpen={onOpen} className="xl:col-span-2" />
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
