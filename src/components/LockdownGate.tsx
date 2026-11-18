import { useEffect, useState, type ReactNode } from 'react';
import { fetchLockdown, isOwnerSignedIn } from '@/services/auth/adminLockdown';
import { ServerDown } from '@/components/ServerDown';

type State = 'checking' | 'locked' | 'open';

/**
 * Resolves whether the admin areas are in maintenance mode for *this* viewer.
 * The owner's own browser is always let through; everyone else follows the
 * shared switch. While the first check is in flight it returns 'checking', so
 * callers can render nothing rather than flash the real page.
 */
export function useLockdownState(): State {
  // The owner bypass is synchronous, so the owner never even sees a flicker.
  const [state, setState] = useState<State>(() =>
    isOwnerSignedIn() ? 'open' : 'checking',
  );

  useEffect(() => {
    if (isOwnerSignedIn()) {
      setState('open');
      return;
    }
    let active = true;
    fetchLockdown()
      .then((locked) => {
        if (!active) return;
        setState(locked && !isOwnerSignedIn() ? 'locked' : 'open');
      })
      .catch(() => active && setState('open'));
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/**
 * Wraps an admin surface. When the owner's switch is on — and the viewer is not
 * the owner — it shows the maintenance screen in place of the children. Used by
 * the supervisor sign-in, the owner reports gate, and the supervisor route
 * guard, so "the admins try again and it's down" holds across all of them.
 */
export function LockdownGate({ children }: { children: ReactNode }) {
  const state = useLockdownState();
  if (state === 'checking') return null;
  if (state === 'locked') return <ServerDown />;
  return <>{children}</>;
}
