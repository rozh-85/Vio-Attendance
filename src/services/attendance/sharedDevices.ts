/**
 * Turns the raw check-in device log into "one phone, several employees" groups —
 * the report the supervisor actually looks at.
 *
 * Grouping key is `deviceSessionId`, which the backend assigns when a phone
 * makes its first check-in and re-uses for every check-in from that phone in
 * the next `DEVICE_SESSION_WINDOW_HOURS`. A group with two or more employees in
 * it means one phone checked in more than one person.
 */

import type { CheckInEvent, Employee } from '@/types';

/** One check-in from the shared phone, and the session it landed in. */
export interface SharedDeviceCheckIn {
  sessionId: string;
  at: string;
}

export interface SharedDeviceMember {
  employee: Employee;
  /** First and last time this employee checked in from the shared phone. */
  firstAt: string;
  lastAt: string;
  /**
   * Every check-in this employee made from the phone, oldest first. Carries the
   * session id because one phone can serve two sessions running side by side —
   * without it the supervisor cannot tell which session a name belongs to.
   */
  checkIns: SharedDeviceCheckIn[];
  /** True for the employee who opened the device session — likely its owner. */
  isOwner: boolean;
}

export interface SharedDeviceGroup {
  deviceSessionId: string;
  deviceId: string;
  /** Human-readable hint, e.g. "iPhone · Safari". */
  deviceLabel: string;
  /** When the phone's first check-in of this window happened. */
  startedAt: string;
  lastAt: string;
  /** Ordered by first check-in, so `members[0]` opened the session. */
  members: SharedDeviceMember[];
  /** Every session this phone touched during the window, oldest first. */
  sessionIds: string[];
}

/**
 * Groups the log into shared-phone reports, newest first.
 *
 * Pass `sessionId` to keep only the phones involved in that session. Members
 * checked in during *other* sessions in the same window are still listed —
 * that's the point: one phone doing the rounds across the day is exactly what
 * the supervisor wants to see.
 */
export function findSharedDeviceGroups(
  events: CheckInEvent[],
  employees: Employee[],
  options: { sessionId?: string } = {},
): SharedDeviceGroup[] {
  const employeesById = new Map(employees.map((s) => [s.id, s]));
  const bySession = new Map<string, CheckInEvent[]>();

  for (const event of events) {
    const bucket = bySession.get(event.deviceSessionId);
    if (bucket) bucket.push(event);
    else bySession.set(event.deviceSessionId, [event]);
  }

  const groups: SharedDeviceGroup[] = [];

  for (const [deviceSessionId, deviceEvents] of bySession) {
    if (
      options.sessionId &&
      !deviceEvents.some((e) => e.sessionId === options.sessionId)
    ) {
      continue;
    }

    const members = new Map<string, SharedDeviceMember>();
    for (const event of deviceEvents) {
      const employee = employeesById.get(event.employeeId);
      if (!employee) continue; // Employee was deleted from the roster.

      const existing = members.get(employee.id);
      if (existing) {
        existing.checkIns.push({ sessionId: event.sessionId, at: event.at });
        if (event.at < existing.firstAt) existing.firstAt = event.at;
        if (event.at > existing.lastAt) existing.lastAt = event.at;
      } else {
        members.set(employee.id, {
          employee,
          firstAt: event.at,
          lastAt: event.at,
          checkIns: [{ sessionId: event.sessionId, at: event.at }],
          isOwner: false,
        });
      }
    }

    // One employee on their own phone is the normal case — nothing to report.
    if (members.size < 2) continue;

    const ordered = [...members.values()].sort((a, b) =>
      a.firstAt.localeCompare(b.firstAt),
    );
    ordered[0].isOwner = true;
    for (const member of ordered) {
      member.checkIns.sort((a, b) => a.at.localeCompare(b.at));
    }

    // The label is stored per event; the newest one wins if it ever changes.
    const newest = deviceEvents.reduce((a, b) => (a.at > b.at ? a : b));

    const sessionIds: string[] = [];
    for (const event of [...deviceEvents].sort((a, b) =>
      a.at.localeCompare(b.at),
    )) {
      if (!sessionIds.includes(event.sessionId)) sessionIds.push(event.sessionId);
    }

    groups.push({
      deviceSessionId,
      deviceId: newest.deviceId,
      deviceLabel: newest.deviceLabel,
      startedAt: ordered[0].firstAt,
      lastAt: ordered.reduce((a, b) => (a.lastAt > b.lastAt ? a : b)).lastAt,
      members: ordered,
      sessionIds,
    });
  }

  return groups.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/**
 * Maps each flagged employee to the other people who used the same phone, for
 * the inline warning in the attendee table.
 */
export function sharedDeviceNamesByEmployee(
  groups: SharedDeviceGroup[],
): Map<string, string[]> {
  const byEmployee = new Map<string, string[]>();

  for (const group of groups) {
    for (const member of group.members) {
      const others = group.members
        .filter((m) => m.employee.id !== member.employee.id)
        .map((m) => m.employee.fullName);
      const existing = byEmployee.get(member.employee.id) ?? [];
      // An employee can appear in more than one group across the day.
      byEmployee.set(member.employee.id, [
        ...existing,
        ...others.filter((name) => !existing.includes(name)),
      ]);
    }
  }

  return byEmployee;
}
