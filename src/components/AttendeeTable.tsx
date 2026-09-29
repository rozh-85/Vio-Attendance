import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import type { AttendanceMark, SessionAttendee } from '@/types';
import {
  ATTENDANCE_MARKS,
  MARK_LABEL,
  isExcused,
} from '@/services/attendance/status';
import { formatClock } from '@/utils/time';
import { MoreHorizontal, Pencil, Trash } from './icons';

function StatusBadge({ status }: { status: SessionAttendee['status'] }) {
  if (status === 'checked-in')
    return <Badge tone="success">✓ In</Badge>;
  if (status === 'checked-out')
    return <Badge tone="info">✓ Out</Badge>;
  // Checked in, session over, no check-out: amber, because it is neither an
  // attendance to tick off nor an absence.
  if (status === 'not-checked-out')
    return <Badge tone="warning">! No check-out</Badge>;
  return <Badge tone="neutral">Absent</Badge>;
}

export function AttendeeTable({
  attendees,
  sharedDeviceNames,
  onDeleteEmployee,
  onEditEmployee,
  onMarkChange,
}: {
  attendees: SessionAttendee[];
  /** employeeId → the other employees who checked in from the same phone. */
  sharedDeviceNames?: Map<string, string[]>;
  onDeleteEmployee?: (employeeId: string, employeeCode: string, employeeName: string) => void;
  onEditEmployee?: (attendee: SessionAttendee) => void;
  /** The ⋯ menu: off, not their shift, overtime, … — `null` clears it. */
  onMarkChange?: (attendee: SessionAttendee, mark: AttendanceMark | null) => void;
}) {
  const showActions = !!onDeleteEmployee || !!onEditEmployee || !!onMarkChange;

  if (attendees.length === 0) {
    return (
      <Card className="p-10 text-center text-ink-500">
        No employees registered yet. Use “Add employee” to register the first
        one — they get a code to check in and out with.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Code</th>
              <th className="px-5 py-3 font-semibold">Position</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Check-in</th>
              <th className="px-5 py-3 font-semibold">Check-out</th>
              {showActions && <th className="px-5 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {attendees.map((attendee) => {
              const { employee, record, status } = attendee;
              const sharedWith = sharedDeviceNames?.get(employee.id) ?? [];
              return (
              <tr
                key={employee.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-ink-900">
                    {employee.fullName}
                  </div>
                  <div className="text-xs text-ink-400">{employee.phone}</div>
                  {sharedWith.length > 0 && (
                    <div className="mt-1 text-xs font-semibold text-amber-700">
                      Same phone as {sharedWith.join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                    {employee.code}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-ink-500">
                  {employee.position || '—'}
                </td>
                <td className="px-5 py-3.5">
                  {/* A mark on an absent employee explains the absence, so it
                      stands in for "Absent"; otherwise it sits beside the status. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!isExcused(record) && <StatusBadge status={status} />}
                    {record?.mark && (
                      <Badge tone="note">{MARK_LABEL[record.mark]}</Badge>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-700">
                  {formatClock(record?.checkInAt)}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-700">
                  {formatClock(record?.checkOutAt)}
                </td>
                {showActions && (
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {onEditEmployee && (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
                          onClick={() => onEditEmployee(attendee)}
                          title="Edit employee"
                        >
                          <Pencil width={17} height={17} />
                        </button>
                      )}
                      {onDeleteEmployee && (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition hover:bg-rose-50 hover:text-rose-600"
                          onClick={() =>
                            onDeleteEmployee(
                              employee.id,
                              employee.code,
                              employee.fullName,
                            )
                          }
                          title="Delete employee"
                        >
                          <Trash width={17} height={17} />
                        </button>
                      )}
                      {onMarkChange && (
                        // A native list under the dots: it opens where it
                        // fits, and as the phone's own picker on a phone.
                        <label
                          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition focus-within:ring-2 focus-within:ring-brand-500 hover:bg-slate-100 hover:text-ink-900"
                          title="Mark as off, not their shift, overtime, hourly leave or official leave"
                        >
                          <MoreHorizontal width={17} height={17} />
                          <select
                            aria-label={`Mark ${employee.fullName}`}
                            className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0"
                            value={record?.mark ?? ''}
                            onChange={(e) =>
                              onMarkChange(
                                attendee,
                                (e.target.value || null) as AttendanceMark | null,
                              )
                            }
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
                      )}
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
  );
}
