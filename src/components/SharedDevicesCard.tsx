import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import type {
  SharedDeviceGroup,
  SharedDeviceMember,
} from '@/services/attendance/sharedDevices';
import { DEVICE_SESSION_WINDOW_HOURS } from '@/utils/device';
import { formatClock, formatDate } from '@/utils/time';
import { cn } from '@/utils/cn';
import type { Session } from '@/types';

interface GroupListProps {
  groups: SharedDeviceGroup[];
  /** Used to name the session each check-in landed in. */
  sessionsById: Map<string, Session>;
  /** When set, check-ins in this session are picked out from the others. */
  highlightSessionId?: string;
  /** Suffix on a highlighted check-in, e.g. "this session". Colour-only when omitted. */
  highlightLabel?: string;
}

function sessionName(
  sessionsById: Map<string, Session>,
  sessionId: string,
): string {
  const session = sessionsById.get(sessionId);
  if (!session) return 'Another session';
  return session.title || session.supervisorName || 'Untitled session';
}

function MemberRow({
  member,
  position,
  sessionsById,
  highlightSessionId,
  highlightLabel,
}: {
  member: SharedDeviceMember;
  position: number;
  sessionsById: Map<string, Session>;
  highlightSessionId?: string;
  highlightLabel?: string;
}) {
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={member.isOwner ? 'info' : 'danger'}>
          {member.isOwner ? 'First' : `#${position}`}
        </Badge>
        <span className="font-semibold text-ink-900">
          {member.employee.fullName}
        </span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-ink-700">
          {member.employee.code}
        </span>
        {member.employee.position && (
          <span className="text-xs text-ink-400">
            {member.employee.position}
          </span>
        )}
      </div>

      {/* Which session each check-in landed in — the phone may have been
          working two sessions that were open at the same time. */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {member.checkIns.map((checkIn) => {
          const highlighted = checkIn.sessionId === highlightSessionId;
          return (
            <span
              key={`${checkIn.sessionId}-${checkIn.at}`}
              className={cn(
                'rounded-lg px-2 py-1 text-xs font-medium',
                highlighted
                  ? 'bg-brand-50 text-brand-700'
                  : 'bg-slate-100 text-ink-600',
              )}
            >
              {sessionName(sessionsById, checkIn.sessionId)}
              {highlighted && highlightLabel && ` · ${highlightLabel}`} ·{' '}
              <span className="tabular-nums">{formatClock(checkIn.at)}</span>
            </span>
          );
        })}
      </div>
    </li>
  );
}

/** The list of shared-phone groups, shared by the session view and its page. */
export function SharedDeviceGroupList({
  groups,
  sessionsById,
  highlightSessionId,
  highlightLabel,
}: GroupListProps) {
  return (
    <ul className="space-y-3">
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

          {group.sessionIds.length > 1 && (
            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              This phone checked in across {group.sessionIds.length} different
              sessions: {group.sessionIds
                .map((id) => sessionName(sessionsById, id))
                .join(' · ')}
            </div>
          )}

          <ol className="mt-3 space-y-3">
            {group.members.map((member, index) => (
              <MemberRow
                key={member.employee.id}
                member={member}
                position={index + 1}
                sessionsById={sessionsById}
                highlightSessionId={highlightSessionId}
                highlightLabel={highlightLabel}
              />
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}

/**
 * Session-view panel: the phones that checked in more than one employee, with
 * every name, so the supervisor can see at a glance who was checked in by
 * somebody else — and which session each of those check-ins landed in.
 */
export function SharedDevicesCard({
  groups,
  sessionsById,
  highlightSessionId,
  highlightLabel,
}: GroupListProps) {
  if (groups.length === 0) return null;

  const flagged = new Set(
    groups.flatMap((g) => g.members.map((m) => m.employee.id)),
  );

  return (
    <Card className="mt-8 border-amber-200 bg-amber-50/50 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-amber-900">Shared phones</h2>
        <Badge tone="warning">
          {groups.length} {groups.length === 1 ? 'phone' : 'phones'} ·{' '}
          {flagged.size} employees
        </Badge>
      </div>
      <p className="mt-1 text-sm text-ink-600">
        These phones checked in more than one employee within{' '}
        {DEVICE_SESSION_WINDOW_HOURS} hours. The first name opened the phone's
        session — the rest were most likely checked in by them. Each name shows
        the session its check-in landed in.
      </p>

      <div className="mt-4">
        <SharedDeviceGroupList
          groups={groups}
          sessionsById={sessionsById}
          highlightSessionId={highlightSessionId}
          highlightLabel={highlightLabel}
        />
      </div>
    </Card>
  );
}
