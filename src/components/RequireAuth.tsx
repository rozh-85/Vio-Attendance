import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/services/auth/context';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { paths } from '@/routes';

/**
 * Route guard for supervisor-only screens. When signed out it shows the neutral
 * employee page instead of redirecting to the login — this way an employee who
 * lands on an admin URL never learns the admin area or sign-in page exists.
 * The supervisor signs in by going directly to the /admin path. When no auth
 * backend is configured the guard is a no-op (see AuthContext.authRequired).
 */
export function RequireAuth({ children, allowFeedbackManager = false }: { children: ReactNode; allowFeedbackManager?: boolean }) {
  const { authRequired, user, isFeedbackManager, loading } = useAuth();

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

  if (isFeedbackManager && !allowFeedbackManager) {
    return <Navigate to={paths.feedback} replace />;
  }

  return <>{children}</>;
}
