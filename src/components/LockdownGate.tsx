import { useEffect, useState, type ReactNode } from 'react';
import { fetchLockdown, isOwnerSignedIn } from '@/services/auth/adminLockdown';
import { ServerDown } from '@/components/ServerDown';

type State = 'checking' | 'locked' | 'open';

/** How often a signed-in admin re-checks the switch, in milliseconds. */
const POLL_MS = 10000;

/**
 * Resolves whether the admin areas are in maintenance mode for *this* viewer.
 * The owner's own browser is always let through; everyone else follows the
 * shared switch. While the first check is in flight it returns 'checking', so
 * callers can render nothing rather than flash the real page.
 *
 * It keeps watching after the first check: it re-reads the switch every few
 * seconds and whenever the tab comes back to the foreground. So an admin who is
 * already signed in drops to the maintenance screen on their own when the owner
 * turns it on — no sign-out or refresh — and returns to the app on their own
 * when it is turned off.
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

    const check = async () => {
      try {
        const locked = await fetchLockdown();
        if (!active) return;
        setState(locked && !isOwnerSignedIn() ? 'locked' : 'open');
      } catch {
        // Keep the last known state; never strand the first check on 'checking'.
        if (active) setState((s) => (s === 'checking' ? 'open' : s));
      }
    };

    void check();
    const id = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
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
