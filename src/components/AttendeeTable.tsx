import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import type { SessionAttendee } from '@/types';
import { formatClock } from '@/utils/time';
import { Pencil, Trash } from './icons';

function StatusBadge({ status }: { status: SessionAttendee['status'] }) {
  if (status === 'checked-in')
    return <Badge tone="success">✓ In</Badge>;
  if (status === 'checked-out')
    return <Badge tone="info">✓ Out</Badge>;
  return <Badge tone="neutral">Absent</Badge>;
}

export function AttendeeTable({
  attendees,
  onDeleteStudent,
  onEditStudent,
}: {
  attendees: SessionAttendee[];
  onDeleteStudent?: (studentId: string, studentCode: string, studentName: string) => void;
  onEditStudent?: (attendee: SessionAttendee) => void;
}) {
  const showActions = !!onDeleteStudent || !!onEditStudent;

  if (attendees.length === 0) {
    return (
      <Card className="p-10 text-center text-ink-500">
        No students registered yet. Show the registration QR so students can
        sign up.
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
              <th className="px-5 py-3 font-semibold">Department</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Check-in</th>
              <th className="px-5 py-3 font-semibold">Check-out</th>
              {showActions && <th className="px-5 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {attendees.map((attendee) => {
              const { student, record, status } = attendee;
              return (
              <tr
                key={student.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-ink-900">
                    {student.fullName}
                  </div>
                  <div className="text-xs text-ink-400">{student.phone}</div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-ink-700">
                    {student.code}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-ink-500">
                  {student.department || '—'}
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={status} />
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-700">
                  {formatClock(record?.checkInAt)}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-700">
                  {formatClock(record?.checkOutAt)}
                </td>
                {showActions && (
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {onEditStudent && (
                        <button
                          type="button"
                          className="text-brand-600 hover:text-brand-700 transition"
                          onClick={() => onEditStudent(attendee)}
                          title="Edit student"
                        >
                          <Pencil width={18} height={18} />
                        </button>
                      )}
                      {onDeleteStudent && (
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-700 transition"
                          onClick={() =>
                            onDeleteStudent(
                              student.id,
                              student.code,
                              student.fullName,
                            )
                          }
                          title="Delete student"
                        >
                          <Trash width={18} height={18} />
                        </button>
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
