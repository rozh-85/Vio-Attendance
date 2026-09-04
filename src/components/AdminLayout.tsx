import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { CalendarDays, Home, Menu, Phone, Search, X } from './icons';
import { Logo } from './Logo';
import { APP_NAME } from '@/brand';
import { paths } from '@/routes';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { cn } from '@/utils/cn';

const baseLinks = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.employees, label: 'Employee report', icon: Search, end: false },
  { to: paths.leave, label: 'Leave management', icon: CalendarDays, end: false },
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        {/* Mobile / tablet navigation. A menu keeps every admin section
            reachable without squeezing links into a horizontal strip. */}
        <div className="sticky top-0 z-30 lg:hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo size={30} className="rounded-lg" />
              <span className="truncate text-sm font-bold text-ink-900">{APP_NAME}</span>
            </div>
            <button
              type="button"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-admin-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X width={22} height={22} /> : <Menu width={22} height={22} />}
            </button>
          </div>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close navigation menu"
                className="fixed inset-0 top-[65px] z-0 bg-slate-900/20"
                onClick={() => setMenuOpen(false)}
              />
              <nav
                id="mobile-admin-navigation"
                className="absolute inset-x-0 top-full z-10 border-b border-slate-200 bg-card px-3 py-3 shadow-xl"
              >
                <div className="space-y-1">
                  {links.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors',
                          isActive
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'text-ink-600 hover:bg-slate-100 hover:text-ink-900',
                        )
                      }
                    >
                      <Icon width={18} height={18} />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </nav>
            </>
          )}
        </div>

        <div className="w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-10 xl:px-14">
          {children}
        </div>
      </div>
    </div>
  );
}
