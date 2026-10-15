import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';

interface AuthContextValue {
  /**
   * Whether an auth backend is configured. When false (e.g. the local-storage
   * dev backend with no Supabase credentials), routes are left ungated so the
   * app is still usable locally.
   */
  authRequired: boolean;
  /** The signed-in supervisor, or null when signed out. */
  user: User | null;
  /** True until the initial session lookup resolves. */
  loading: boolean;
  /** `remember` false: the sign-in ends when the browser closes. */
  signIn(email: string, password: string, remember?: boolean): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * "Remember me" off: the choice is kept, and a cookie with no expiry date
 * marks the browser as still open. When the browser has been closed the cookie
 * is gone, so the saved sign-in is dropped on the next visit.
 */
const REMEMBER_KEY = 'vio.rememberMe';
const ALIVE_COOKIE = 'vio_alive=1';

function forgetOnReopen(): boolean {
  try {
    return (
      localStorage.getItem(REMEMBER_KEY) === '0' &&
      !document.cookie.split('; ').includes(ALIVE_COOKIE)
    );
  } catch {
    return false;
  }
}

/**
 * Tracks the Supabase auth session for the supervisor. Employee-facing screens
 * never touch this; only the protected supervisor routes rely on it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      if (forgetOnReopen()) await supabase.auth.signOut({ scope: 'local' });
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signIn(email: string, password: string, remember = true) {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
      document.cookie = `${ALIVE_COOKIE}; path=/; SameSite=Lax`;
    } catch {
      // Storage blocked: the sign-in simply lasts as Supabase keeps it.
    }
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ authRequired: !!supabase, user, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
