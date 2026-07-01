import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataService } from '@/services/data/context';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Session,
  SessionAttendee,
  Student,
} from '@/types';

function statusOf(record?: AttendanceRecord): AttendanceStatus {
  if (!record?.checkInAt) return 'absent';
  return record.checkOutAt ? 'checked-out' : 'checked-in';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, st, rec] = await Promise.all([
        data.getSession(sessionId),
        data.listStudents(),
        data.listAttendance(sessionId),
      ]);
      setSession(s);
      setStudents(st);
      setRecords(rec);
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
    loading,
    error,
    refresh,
    update,
    close,
  };
}
