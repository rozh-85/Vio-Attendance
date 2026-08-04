/**
 * Turns the raw check-in device log into "one phone, several students" groups —
 * the report the lecturer actually looks at.
 *
 * Grouping key is `deviceSessionId`, which the backend assigns when a phone
 * makes its first check-in and re-uses for every check-in from that phone in
 * the next `DEVICE_SESSION_WINDOW_HOURS`. A group with two or more students in
 * it means one phone checked in more than one person.
 */

import type { CheckInEvent, Student } from '@/types';

export interface SharedDeviceMember {
  student: Student;
  /** First and last time this student checked in from the shared phone. */
  firstAt: string;
  lastAt: string;
  checkIns: number;
  /** True for the student who opened the device session — likely its owner. */
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
}

/**
 * Groups the log into shared-phone reports, newest first.
 *
 * Pass `sessionId` to keep only the phones involved in that lecture. Members
 * checked in during *other* lectures in the same window are still listed —
 * that's the point: one phone doing the rounds across the day is exactly what
 * the lecturer wants to see.
 */
export function findSharedDeviceGroups(
  events: CheckInEvent[],
  students: Student[],
  options: { sessionId?: string } = {},
): SharedDeviceGroup[] {
  const studentsById = new Map(students.map((s) => [s.id, s]));
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
      const student = studentsById.get(event.studentId);
      if (!student) continue; // Student was deleted from the roster.

      const existing = members.get(student.id);
      if (existing) {
        existing.checkIns += 1;
        if (event.at < existing.firstAt) existing.firstAt = event.at;
        if (event.at > existing.lastAt) existing.lastAt = event.at;
      } else {
        members.set(student.id, {
          student,
          firstAt: event.at,
          lastAt: event.at,
          checkIns: 1,
          isOwner: false,
        });
      }
    }

    // One student on their own phone is the normal case — nothing to report.
    if (members.size < 2) continue;

    const ordered = [...members.values()].sort((a, b) =>
      a.firstAt.localeCompare(b.firstAt),
    );
    ordered[0].isOwner = true;

    // The label is stored per event; the newest one wins if it ever changes.
    const newest = deviceEvents.reduce((a, b) => (a.at > b.at ? a : b));

    groups.push({
      deviceSessionId,
      deviceId: newest.deviceId,
      deviceLabel: newest.deviceLabel,
      startedAt: ordered[0].firstAt,
      lastAt: ordered[ordered.length - 1].lastAt,
      members: ordered,
    });
  }

  return groups.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/**
 * Maps each flagged student to the other people who used the same phone, for
 * the inline warning in the attendee table.
 */
export function sharedDeviceNamesByStudent(
  groups: SharedDeviceGroup[],
): Map<string, string[]> {
  const byStudent = new Map<string, string[]>();

  for (const group of groups) {
    for (const member of group.members) {
      const others = group.members
        .filter((m) => m.student.id !== member.student.id)
        .map((m) => m.student.fullName);
      const existing = byStudent.get(member.student.id) ?? [];
      // A student can appear in more than one group across the day.
      byStudent.set(member.student.id, [
        ...existing,
        ...others.filter((name) => !existing.includes(name)),
      ]);
    }
  }

  return byStudent;
}
