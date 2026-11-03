import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, LayoutGrid, Logout } from './icons';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { appFor } from './apps';
import { APP_NAME } from '@/brand';
import { paths } from '@/routes';
import { useAuth } from '@/services/auth/context';
import { hrTabLabel, isHrTab } from '@/services/hr/navigation';
import { cn } from '@/utils/cn';

/**
 * Shared admin chrome: no sidebar, just a slim bar across the top — the logo
 * and the squares button go Home, where every part of the system is a square;
 * next to them, where you are. The page itself gets the full width, kept to a
 * comfortable reading width on large screens.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { authRequired, user, signOut } = useAuth();
  const isHome = location.pathname === paths.home;
  const app = isHome ? undefined : appFor(location.pathname);
  // Inside the HR building, the room you are in.
  const room = location.pathname === paths.hr ? new URLSearchParams(location.search).get('tab') : null;
  const roomLabel = isHrTab(room) && room !== 'overview' ? hrTabLabel(room) : null;

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <Link to={paths.home} className="flex shrink-0 items-center gap-2 rounded-xl pr-1" aria-label={`${APP_NAME} home`}>
            <Logo size={32} className="rounded-lg" />
            <span className="hidden text-sm font-bold text-ink-900 md:inline">{APP_NAME}</span>
          </Link>
          <Link
            to={paths.home}
            title="Home — every part of the system"
            aria-label="Home — every part of the system"
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl transition',
              isHome ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-slate-100 hover:text-ink-900',
            )}
          >
            <LayoutGrid width={19} height={19} />
          </Link>

          {/* Where you are: Home › Page › Room. */}
          <nav aria-label="Where you are" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            {isHome ? (
              <span className="truncate font-semibold text-ink-900">Home</span>
            ) : (
              <>
                <Link to={paths.home} className="hidden shrink-0 text-ink-500 hover:text-ink-900 sm:inline">
                  Home
                </Link>
                <ChevronRight width={15} height={15} className="hidden shrink-0 text-ink-300 sm:block" />
                {app ? (
                  roomLabel ? (
                    <>
                      <Link to={app.to} className="hidden shrink-0 text-ink-500 hover:text-ink-900 sm:inline">
                        {app.label}
                      </Link>
                      <ChevronRight width={15} height={15} className="hidden shrink-0 text-ink-300 sm:block" />
                      <span className="truncate font-semibold text-ink-900">{roomLabel}</span>
                    </>
                  ) : (
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: app.color }} />
                      <span className="truncate font-semibold text-ink-900">{app.label}</span>
                    </span>
                  )
                ) : (
                  <span className="truncate font-semibold text-ink-900">{APP_NAME}</span>
                )}
              </>
            )}
          </nav>

          <ThemeToggle variant="icon" />
          {authRequired && user && (
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                navigate(paths.admin, { replace: true });
              }}
              className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
            >
              <Logout width={18} height={18} />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-5 sm:px-6 sm:py-6">{children}</div>
    </div>
  );
}
