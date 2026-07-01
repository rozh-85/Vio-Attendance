import { useCallback, useEffect, useState } from 'react';
import { useDataService } from '@/services/data/context';
import type { NewSessionInput, Session } from '@/types';

export function useSessions() {
  const data = useDataService();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSessions(await data.listSessions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSession = useCallback(
    async (input: NewSessionInput) => {
      const session = await data.createSession(input);
      await refresh();
      return session;
    },
    [data, refresh],
  );

  return { sessions, loading, error, refresh, createSession };
}
