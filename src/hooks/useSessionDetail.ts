import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataService } from '@/services/data/context';
import {
  findSharedDeviceGroups,
  sharedDeviceNamesByStudent,
} from '@/services/attendance/sharedDevices';
import { DEVICE_SESSION_WINDOW_HOURS } from '@/utils/device';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import type {
  AttendanceRecord,
  AttendanceStatus,
  CheckInEvent,
  Session,
  SessionAttendee,
  Student,
} from '@/types';

function statusOf(record?: AttendanceRecord): AttendanceStatus {
  if (!record?.checkInAt) return 'absent';
  return record.checkOutAt ? 'checked-out' : 'checked-in';
}

/**
 * Loads the device log around this lecture — from one device-session window
 * before it started, so a phone that started its rounds in an earlier lecture
 * still shows up here.
 *
 * Only for whoever unlocked the owner report: the log accuses named students of
 * checking in for each other, so an ordinary lecturer's screen never receives
 * it, not even to hide it in the markup.
 *
 * It is a nice-to-have besides: a database that has not run
 * `supabase/device-checkin-tracking.sql` yet has no `check_in_events` table, and
 * that must not take the whole session screen down.
 */
async function loadCheckInEvents(
  data: ReturnType<typeof useDataService>,
  session: Session,
): Promise<CheckInEvent[]> {
  if (!isOwnerUnlocked()) return [];

  const since = new Date(
    new Date(session.startedAt).getTime() -
      DEVICE_SESSION_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  try {
    return await data.listCheckInEvents(since);
  } catch {
    return [];
  }
}

/**
 * Loads a single session together with every registered student joined to their
 * attendance for that session. Polls periodically so the lecturer's screen
 * reflects check-ins as they happen.
 */
export function useSessionDetail(sessionId: string, pollMs = 3000) {
  const data = useDataService();
  const [session, setSession] = useState<Session | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [events, setEvents] = useState<CheckInEvent[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      // The full session list names the *other* lectures a shared phone
      // touched — two sessions are often open at once.
      const [s, st, rec, all] = await Promise.all([
        data.getSession(sessionId),
        data.listStudents(),
        data.listAttendance(sessionId),
        data.listSessions(),
      ]);
      setSession(s);
      setStudents(st);
      setRecords(rec);
      setAllSessions(all);
      setEvents(s ? await loadCheckInEvents(data, s) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session.');
    } finally {
      setLoading(false);
    }
  }, [data, sessionId]);

  useEffect(() => {
    void refresh();
    if (pollMs <= 0) return;
    const timer = setInterval(() => void refresh(), pollMs);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, pollMs]);

  const attendees: SessionAttendee[] = useMemo(() => {
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    return students
      .map((student) => {
        const record = byStudent.get(student.id);
        return { student, record, status: statusOf(record) };
      })
      .sort((a, b) => a.student.code.localeCompare(b.student.code));
  }, [students, records]);

  /** Phones that checked in more than one student around this lecture. */
  const sharedDevices = useMemo(
    () => findSharedDeviceGroups(events, students, { sessionId }),
    [events, students, sessionId],
  );

  /** studentId → names of the others who used the same phone. */
  const sharedDeviceNames = useMemo(
    () => sharedDeviceNamesByStudent(sharedDevices),
    [sharedDevices],
  );

  /** Lets the shared-phone panel name the lecture behind every check-in. */
  const sessionsById = useMemo(
    () => new Map(allSessions.map((s) => [s.id, s])),
    [allSessions],
  );

  const stats = useMemo(() => {
    const checkedIn = attendees.filter((a) => a.status === 'checked-in').length;
    const checkedOut = attendees.filter(
      (a) => a.status === 'checked-out',
    ).length;
    return {
      registered: students.length,
      present: checkedIn + checkedOut,
      checkedIn,
      checkedOut,
    };
  }, [attendees, students.length]);

  const update = useCallback(
    async (patch: Partial<Session>) => {
      const updated = await data.updateSession(sessionId, patch);
      setSession(updated);
      return updated;
    },
    [data, sessionId],
  );

  const close = useCallback(async () => {
    const updated = await data.closeSession(sessionId);
    await refresh();
    return updated;
  }, [data, sessionId, refresh]);

  return {
    session,
    attendees,
    records,
    stats,
    sharedDevices,
    sharedDeviceNames,
    sessionsById,
    loading,
    error,
    refresh,
    update,
    close,
  };
}
