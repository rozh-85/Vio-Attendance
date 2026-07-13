import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search } from './icons';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const links = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.students, label: 'Student report', icon: Search, end: false },
];

/**
 * Shared admin chrome: a slim sidebar on desktop (top nav row on mobile) so the
 * lecturer can move between the dashboard and the student report page.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const nav = (horizontal: boolean) => (
    <nav
      className={cn(
        horizontal ? 'flex gap-2' : 'sticky top-8 flex flex-col gap-1.5',
      )}
    >
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
            )
          }
        >
          <Icon width={17} height={17} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-full w-full px-4 py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-8">
        <aside className="hidden w-48 shrink-0 lg:block">{nav(false)}</aside>
        <div className="min-w-0 flex-1">
          <div className="mb-6 lg:hidden">{nav(true)}</div>
          {children}
        </div>
      </div>
    </div>
  );
}
