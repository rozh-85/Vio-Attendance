import { useEffect, useMemo, useState } from 'react';
import { Card } from './ui/Card';
import type { AttendanceMark, Session, SessionAttendee } from '@/types';
import { ATTENDANCE_MARKS, MARK_LABEL, isExcused } from '@/services/attendance/status';
import { formatClock, presentMinutes } from '@/utils/time';
import { cn } from '@/utils/cn';
import { ChevronDown, MoreHorizontal, Pencil, Trash, X } from './icons';

const STATUS_PILL: Record<SessionAttendee['status'], { label: string; className: string; dot: string }> = {
  'checked-in': { label: 'Checked in', className: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  'checked-out': { label: 'Checked out', className: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  // Checked in, session over, no check-out: amber, because it is neither an
  // attendance to tick off nor an absence.
  'not-checked-out': { label: 'No check-out', className: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  absent: { label: 'Absent', className: 'bg-slate-100 text-ink-500', dot: 'bg-ink-400' },
};

const AVATAR_TONES = [
  'bg-rose-50 text-rose-600',
  'bg-slate-100 text-ink-500',
  'bg-emerald-50 text-emerald-600',
  'bg-amber-50 text-amber-700',
  'bg-sky-50 text-sky-600',
  'bg-violet-50 text-violet-600',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

function avatarTone(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** The status, or the supervisor's mark in its place when it explains an absence. */
function StatusCell({ attendee }: { attendee: SessionAttendee }) {
  const { record, status } = attendee;
  const pill = STATUS_PILL[status];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!isExcused(record) && (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
            pill.className,
          )}
        >
          <span className={cn('size-1.5 rounded-full', pill.dot)} />
          {pill.label}
        </span>
      )}
      {record?.mark && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
          <span className="size-1.5 rounded-full bg-violet-500" />
          {MARK_LABEL[record.mark]}
        </span>
      )}
    </div>
  );
}

function Duration({ session, attendee }: { session: Session; attendee: SessionAttendee }) {
  const { record, status } = attendee;
  if (!record?.checkInAt) return <span className="text-ink-400">–</span>;
  const minutes = presentMinutes(session, record);
  if (status === 'checked-in') {
    return <span className="whitespace-nowrap text-ink-400">{durationText(minutes)} so far</span>;
  }
  return <span className="whitespace-nowrap tabular-nums text-ink-700">{durationText(minutes)}</span>;
}

/** The ⋯ list: a native select under the dots, so it opens where it fits and as the phone's own picker. */
function MarkMenu({
  value,
  label,
  onChange,
  className,
}: {
  value: AttendanceMark | '';
  label: string;
  onChange: (mark: AttendanceMark | null) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-lg text-ink-500 transition focus-within:ring-2 focus-within:ring-brand-500 hover:bg-slate-100 hover:text-ink-900',
        className,
      )}
      title="Mark as off, weekend, holiday, leave, late or overtime"
    >
      <MoreHorizontal width={17} height={17} />
      <select
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
        value={value}
        onChange={(e) => onChange((e.target.value || null) as AttendanceMark | null)}
      >
        <option value="">No mark</option>
        <optgroup label="Mark as">
          {ATTENDANCE_MARKS.map((mark) => (
            <option key={mark} value={mark}>
              {MARK_LABEL[mark]}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export function AttendeeTable({
  session,
  attendees,
  sharedDeviceNames,
  onDeleteEmployee,
  onEditEmployee,
  onMarkChange,
  onBulkMark,
  emptyText,
}: {
  session: Session;
  attendees: SessionAttendee[];
  /** employeeId → the other employees who checked in from the same phone. */
  sharedDeviceNames?: Map<string, string[]>;
  onDeleteEmployee?: (employeeId: string, employeeCode: string, employeeName: string) => void;
  onEditEmployee?: (attendee: SessionAttendee) => void;
  /** The ⋯ menu: off, not their shift, overtime, … — `null` clears it. */
  onMarkChange?: (attendee: SessionAttendee, mark: AttendanceMark | null) => void;
  /** The same mark on every ticked employee. */
  onBulkMark?: (employeeIds: string[], mark: AttendanceMark | null) => Promise<void>;
  emptyText: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const showActions = !!onDeleteEmployee || !!onEditEmployee || !!onMarkChange;
  const selectable = !!onBulkMark;

  // Ticks only count for rows still listed.
  const visibleIds = useMemo(() => new Set(attendees.map((a) => a.employee.id)), [attendees]);
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const allTicked = attendees.length > 0 && attendees.every((a) => selected.has(a.employee.id));
  const someTicked = selected.size > 0 && !allTicked;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(attendees.map((a) => a.employee.id)));

  async function applyBulk(mark: AttendanceMark | null) {
    if (!onBulkMark || selected.size === 0) return;
    setApplying(true);
    try {
      await onBulkMark([...selected], mark);
      setSelected(new Set());
    } finally {
      setApplying(false);
    }
  }

  if (attendees.length === 0) {
    return <Card className="p-10 text-center text-ink-500">{emptyText}</Card>;
  }

  const checkbox = 'size-4 cursor-pointer rounded border-slate-300 accent-brand-600';

  return (
    <div className="space-y-3">
      {selectable && selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-brand-700">
            {selected.size} selected
          </span>
          <label className="relative">
            <select
              aria-label="Mark the selected employees"
              disabled={applying}
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (value) void applyBulk(value === 'none' ? null : (value as AttendanceMark));
              }}
              className="h-9 cursor-pointer appearance-none rounded-lg border border-brand-200 bg-card pl-3 pr-8 text-sm font-semibold text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-60"
            >
              <option value="" disabled>
                {applying ? 'Saving…' : 'Mark as…'}
              </option>
              {ATTENDANCE_MARKS.map((mark) => (
                <option key={mark} value={mark}>
                  {MARK_LABEL[mark]}
                </option>
              ))}
              <option value="none">Remove mark</option>
            </select>
            <ChevronDown
              width={14}
              height={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
          </label>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-ink-500 hover:text-ink-900"
          >
            <X width={14} height={14} /> Clear
          </button>
        </div>
      )}

      {/* Phones: one card per employee. */}
      <ul className="space-y-2.5 md:hidden">
        {attendees.map((attendee, i) => {
          const { employee, record } = attendee;
          const sharedWith = sharedDeviceNames?.get(employee.id) ?? [];
          const ticked = selected.has(employee.id);
          return (
            <li
              key={employee.id}
              className={cn(
                'rounded-2xl border bg-card p-4 transition',
                ticked ? 'border-brand-200 bg-brand-50/40' : 'border-slate-200',
              )}
            >
              <div className="flex items-start gap-3">
                {selectable && (
                  <input
                    type="checkbox"
                    className={cn(checkbox, 'mt-3')}
                    checked={ticked}
                    onChange={() => toggle(employee.id)}
                    aria-label={`Select ${employee.fullName}`}
                  />
                )}
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold',
                    avatarTone(employee.fullName),
                  )}
                >
                  {initials(employee.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug text-ink-900">{employee.fullName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-400">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-ink-700">
                          {employee.code}
                        </span>
                        <span className="truncate">{employee.position || employee.phone}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-ink-400">#{i + 1}</span>
                  </div>
                  <div className="mt-2.5">
                    <StatusCell attendee={attendee} />
                  </div>
                  {sharedWith.length > 0 && (
                    <div className="mt-1.5 text-xs font-semibold text-amber-700">
                      Same phone as {sharedWith.join(', ')}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <div>
                      <div className="text-ink-400">In</div>
                      <div className="font-semibold tabular-nums text-ink-900">{record?.checkInAt ? formatClock(record.checkInAt) : '–'}</div>
                    </div>
                    <div>
                      <div className="text-ink-400">Out</div>
                      <div className="font-semibold tabular-nums text-ink-900">{record?.checkOutAt ? formatClock(record.checkOutAt) : '–'}</div>
                    </div>
                    <div>
                      <div className="text-ink-400">Time</div>
                      <div className="font-semibold">
                        <Duration session={session} attendee={attendee} />
                      </div>
                    </div>
                  </div>
                  {showActions && (
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <RowButtons
                        attendee={attendee}
                        onDeleteEmployee={onDeleteEmployee}
                        onEditEmployee={onEditEmployee}
                        onMarkChange={onMarkChange}
                      />
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablets and up: the table; less vital columns join as it widens. */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-ink-500">
              <tr>
                {selectable && (
                  <th className="w-10 py-3 pl-4 pr-1">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={allTicked}
                      ref={(el) => {
                        if (el) el.indeterminate = someTicked;
                      }}
                      onChange={toggleAll}
                      aria-label="Select every employee listed"
                    />
                  </th>
                )}
                <th className="hidden w-10 px-3 py-3 font-semibold lg:table-cell">#</th>
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="hidden px-3 py-3 font-semibold lg:table-cell">Code</th>
                <th className="hidden px-3 py-3 font-semibold xl:table-cell">Position</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Check-In</th>
                <th className="px-3 py-3 font-semibold">Check-Out</th>
                <th className="hidden px-3 py-3 font-semibold lg:table-cell">Duration</th>
                {showActions && <th className="px-3 py-3 text-center font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {attendees.map((attendee, i) => {
                const { employee, record } = attendee;
                const sharedWith = sharedDeviceNames?.get(employee.id) ?? [];
                const ticked = selected.has(employee.id);
                return (
                  <tr
                    key={employee.id}
                    className={cn(
                      'border-t border-slate-100 transition-colors',
                      ticked ? 'bg-brand-50/50' : 'hover:bg-slate-50/60',
                    )}
                  >
                    {selectable && (
                      <td className="py-3 pl-4 pr-1">
                        <input
                          type="checkbox"
                          className={checkbox}
                          checked={ticked}
                          onChange={() => toggle(employee.id)}
                          aria-label={`Select ${employee.fullName}`}
                        />
                      </td>
                    )}
                    <td className="hidden px-3 py-3 tabular-nums text-ink-400 lg:table-cell">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                            avatarTone(employee.fullName),
                          )}
                        >
                          {initials(employee.fullName)}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink-900">{employee.fullName}</div>
                          <div className="text-xs tabular-nums text-ink-400">
                            {/* Tablets: the code sits here instead of in its own column. */}
                            <span className="font-mono font-semibold text-ink-500 lg:hidden">{employee.code} · </span>
                            {employee.phone}
                          </div>
                          {sharedWith.length > 0 && (
                            <div className="mt-0.5 text-xs font-semibold text-amber-700">
                              Same phone as {sharedWith.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                        {employee.code}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-ink-500 xl:table-cell">{employee.position || '–'}</td>
                    <td className="px-3 py-3">
                      <StatusCell attendee={attendee} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-900">
                      {record?.checkInAt ? formatClock(record.checkInAt) : <span className="text-ink-400">–</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink-900">
                      {record?.checkOutAt ? formatClock(record.checkOutAt) : <span className="text-ink-400">–</span>}
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <Duration session={session} attendee={attendee} />
                    </td>
                    {showActions && (
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <RowButtons
                            attendee={attendee}
                            onDeleteEmployee={onDeleteEmployee}
                            onEditEmployee={onEditEmployee}
                            onMarkChange={onMarkChange}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RowButtons({
  attendee,
  onDeleteEmployee,
  onEditEmployee,
  onMarkChange,
}: {
  attendee: SessionAttendee;
  onDeleteEmployee?: (employeeId: string, employeeCode: string, employeeName: string) => void;
  onEditEmployee?: (attendee: SessionAttendee) => void;
  onMarkChange?: (attendee: SessionAttendee, mark: AttendanceMark | null) => void;
}) {
  const { employee, record } = attendee;
  const icon = 'inline-flex size-9 items-center justify-center rounded-lg text-ink-500 transition';
  return (
    <>
      {onEditEmployee && (
        <button
          type="button"
          className={cn(icon, 'hover:bg-slate-100 hover:text-ink-900')}
          onClick={() => onEditEmployee(attendee)}
          title="Edit employee"
          aria-label={`Edit ${employee.fullName}`}
        >
          <Pencil width={16} height={16} />
        </button>
      )}
      {onDeleteEmployee && (
        <button
          type="button"
          className={cn(icon, 'hover:bg-rose-50 hover:text-rose-600')}
          onClick={() => onDeleteEmployee(employee.id, employee.code, employee.fullName)}
          title="Delete employee"
          aria-label={`Delete ${employee.fullName}`}
        >
          <Trash width={16} height={16} />
        </button>
      )}
      {onMarkChange && (
        <MarkMenu
          value={record?.mark ?? ''}
          label={`Mark ${employee.fullName}`}
          onChange={(mark) => onMarkChange(attendee, mark)}
        />
      )}
    </>
  );
}
