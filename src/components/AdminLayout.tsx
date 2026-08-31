import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Phone, Search } from './icons';
import { Logo } from './Logo';
import { APP_NAME } from '@/brand';
import { paths } from '@/routes';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { cn } from '@/utils/cn';

const baseLinks = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.employees, label: 'Employee report', icon: Search, end: false },
];

const sharedPhonesLink = {
  to: paths.devices,
  label: 'Shared phones',
  icon: Phone,
  end: false,
};

/**
 * Shared admin chrome. On desktop a full-height sidebar hugs the left edge; on
 * smaller screens it collapses into a sticky, horizontally-scrollable top nav so
 * every section stays reachable without overflowing the viewport.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  // The shared-phone report only joins the sidebar once its password has been
  // entered this session, so it stays invisible to anyone reading the
  // supervisor's screen — but is one click away for whoever unlocked it, instead
  // of forcing them to retype the address every time they leave the page.
  const links = isOwnerUnlocked()
    ? [...baseLinks, sharedPhonesLink]
    : baseLinks;

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* Desktop sidebar — sticky, fills the viewport height. */}
      <aside className="sticky top-0 z-20 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo size={36} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-ink-900">
              {APP_NAME}
            </div>
            <div className="truncate text-xs text-ink-400">
              Employee check-in
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1.5">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
                )
              }
            >
              <Icon width={18} height={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main column. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile / tablet top nav — scrolls sideways if it runs out of room. */}
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
          <Logo size={30} className="rounded-lg" />
          <nav className="flex gap-2 overflow-x-auto">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
                  )
                }
              >
                <Icon width={16} height={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-10 xl:px-14">
          {children}
        </div>
      </div>
    </div>
  );
}
