import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/services/auth/context';
import { paths } from '@/routes';

/**
 * Route guard for lecturer-only screens. Redirects unauthenticated visitors to
 * the login page, remembering where they were headed. When no auth backend is
 * configured the guard is a no-op (see AuthContext.authRequired).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { authRequired, user, loading } = useAuth();
  const location = useLocation();

  if (!authRequired) return <>{children}</>;

  if (loading) {
    return (
      <Screen width="sm">
        <div className="py-20 text-center text-ink-400">Loading…</div>
      </Screen>
    );
  }

  if (!user) {
    return <Navigate to={paths.login} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
