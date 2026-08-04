import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import type { SharedDeviceGroup } from '@/services/attendance/sharedDevices';
import {
  DEVICE_SESSION_WINDOW_HOURS,
  MAX_STUDENTS_PER_DEVICE,
} from '@/utils/device';
import { formatClock, formatDate } from '@/utils/time';

/**
 * Lists the phones that checked in more than one student, with every name, so
 * the lecturer can see at a glance who was checked in by somebody else.
 */
export function SharedDevicesCard({ groups }: { groups: SharedDeviceGroup[] }) {
  if (groups.length === 0) return null;

  const flagged = new Set(
    groups.flatMap((g) => g.members.map((m) => m.student.id)),
  );

  return (
    <Card className="mt-8 border-amber-200 bg-amber-50/50 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-amber-900">Shared phones</h2>
        <Badge tone="warning">
          {groups.length} {groups.length === 1 ? 'phone' : 'phones'} ·{' '}
          {flagged.size} students
        </Badge>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        One phone was used to check in several students within{' '}
        {DEVICE_SESSION_WINDOW_HOURS} hours. The first name opened the phone's
        session — the rest were most likely checked in by them. A phone is
        blocked after {MAX_STUDENTS_PER_DEVICE} students.
      </p>

      <ul className="mt-4 space-y-3">
        {groups.map((group) => (
          <li
            key={group.deviceSessionId}
            className="rounded-xl border border-amber-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-ink-900">
                {group.deviceLabel || 'Unknown device'}
              </span>
              <span className="text-xs text-ink-400">
                {formatDate(group.startedAt)} · {formatClock(group.startedAt)} –{' '}
                {formatClock(group.lastAt)}
              </span>
            </div>

            <ol className="mt-3 space-y-2">
              {group.members.map((member, index) => (
                <li
                  key={member.student.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <Badge tone={member.isOwner ? 'info' : 'danger'}>
                    {member.isOwner ? 'First' : `#${index + 1}`}
                  </Badge>
                  <span className="font-semibold text-ink-900">
                    {member.student.fullName}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-ink-700">
                    {member.student.code}
                  </span>
                  {member.student.department && (
                    <span className="text-xs text-ink-400">
                      {member.student.department}
                    </span>
                  )}
                  <span className="ml-auto tabular-nums text-xs text-ink-500">
                    {formatClock(member.firstAt)}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </Card>
  );
}
