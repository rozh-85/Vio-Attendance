import type { ReactNode } from 'react';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/services/auth/context';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Route guard for lecturer-only screens. When signed out it shows the neutral
 * student page instead of redirecting to the login — this way a student who
 * lands on an admin URL never learns the admin area or sign-in page exists.
 * The lecturer signs in by going directly to the /admin path. When no auth
 * backend is configured the guard is a no-op (see AuthContext.authRequired).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { authRequired, user, loading } = useAuth();

  if (!authRequired) return <>{children}</>;

  if (loading) {
    return (
      <Screen width="sm">
        <div className="py-20 text-center text-ink-400">Loading…</div>
      </Screen>
    );
  }

  if (!user) {
    return <NotFoundPage />;
  }

  return <>{children}</>;
}
