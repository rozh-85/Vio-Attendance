import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Building,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Home,
  MapPin,
  Menu,
  MessageSquare,
  Phone,
  Search,
  Settings,
  UserPlus,
  Users,
  Wallet,
  X,
} from './icons';
import { Logo } from './Logo';
import { APP_NAME } from '@/brand';
import { paths } from '@/routes';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { useAuth } from '@/services/auth/context';
import { HR_NAV_GROUPS, isHrTab, type HrTab } from '@/services/hr/navigation';
import { cn } from '@/utils/cn';

const feedbackLink = { to: paths.feedback, label: 'Feedback', icon: MessageSquare, end: false };
const hrLink = { to: paths.hr, label: 'HR management', icon: Briefcase, end: false };

const adminLinks = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.employees, label: 'Employee report', icon: Search, end: false },
  { to: paths.leave, label: 'Leave management', icon: CalendarDays, end: false },
  hrLink,
  feedbackLink,
];

const sharedPhonesLink = {
  to: paths.devices,
  label: 'Shared phones',
  icon: Phone,
  end: false,
};

const hrIcons: Record<HrTab, typeof Users> = {
  overview: Home,
  people: Users,
  'employee-details': Users,
  organization: Building,
  time: Clock,
  leave: CalendarDays,
  payroll: Wallet,
  hiring: FileText,
  interviews: UserPlus,
  locations: MapPin,
  rules: Settings,
  reports: Download,
};

function HrSubmenu({
  activeTab,
  onNavigate,
}: {
  activeTab: HrTab | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="ml-4 mt-2 space-y-4 border-l border-slate-200 pl-3">
      {HR_NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = hrIcons[item.id];
              const selected = activeTab === item.id;
              return (
                <Link
                  key={item.id}
                  to={paths.hrTab(item.id)}
                  onClick={onNavigate}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors',
                    selected
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
                  )}
                >
                  <Icon width={14} height={14} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Shared admin chrome. On desktop a full-height sidebar hugs the left edge; on
 * smaller screens it collapses into a sticky, horizontally-scrollable top nav so
 * every section stays reachable without overflowing the viewport.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHrPage = location.pathname === paths.hr;
  const requestedHrTab = new URLSearchParams(location.search).get('tab');
  const activeHrTab: HrTab = isHrTab(requestedHrTab) ? requestedHrTab : 'overview';
  const [hrOpen, setHrOpen] = useState(isHrPage);
  const { isFeedbackManager } = useAuth();
  useEffect(() => {
    if (isHrPage) setHrOpen(true);
  }, [isHrPage]);
  // The shared-phone report only joins the sidebar once its password has been
  // entered this session, so it stays invisible to anyone reading the
  // supervisor's screen — but is one click away for whoever unlocked it, instead
  // of forcing them to retype the address every time they leave the page.
  const links = isFeedbackManager
    ? [feedbackLink]
    : isOwnerUnlocked()
      ? [...adminLinks, sharedPhonesLink]
      : adminLinks;

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* Desktop sidebar — sticky, fills the viewport height. */}
      <aside className="sticky top-0 z-20 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo size={36} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-ink-900">
              {APP_NAME}
            </div>
            <div className="truncate text-xs text-ink-400">
              {isFeedbackManager ? 'Feedback management' : 'Employee check-in'}
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-1.5">
          {links.map((link) => {
            const Icon = link.icon;
            if (link.to === paths.hr) {
              return (
                <div key={link.to}>
                  <div
                    className={cn(
                      'flex items-center rounded-xl text-sm font-semibold transition-colors',
                      isHrPage
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
                    )}
                  >
                    <NavLink
                      to={paths.hrTab('overview')}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3.5"
                    >
                      <Icon width={18} height={18} className="shrink-0" />
                      <span className="truncate">{link.label}</span>
                    </NavLink>
                    <button
                      type="button"
                      className="mr-1 grid size-9 shrink-0 place-items-center rounded-lg hover:bg-black/5"
                      aria-label={hrOpen ? 'Collapse HR menu' : 'Expand HR menu'}
                      aria-expanded={hrOpen}
                      onClick={() => setHrOpen((open) => !open)}
                    >
                      <ChevronDown
                        width={16}
                        className={cn('transition-transform', hrOpen && 'rotate-180')}
                      />
                    </button>
                  </div>
                  {hrOpen && (
                    <HrSubmenu activeTab={isHrPage ? activeHrTab : null} />
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
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
                {link.label}
              </NavLink>
            );
          })}
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
                className="absolute inset-x-0 top-full z-10 max-h-[calc(100dvh-65px)] overflow-y-auto border-b border-slate-200 bg-card px-3 py-3 shadow-xl"
              >
                <div className="space-y-1">
                  {links.map((link) => {
                    const Icon = link.icon;
                    if (link.to === paths.hr) {
                      return (
                        <div key={link.to}>
                          <div
                            className={cn(
                              'flex items-center rounded-xl text-sm font-semibold',
                              isHrPage
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'text-ink-600 hover:bg-slate-100 hover:text-ink-900',
                            )}
                          >
                            <NavLink
                              to={paths.hrTab('overview')}
                              onClick={() => setMenuOpen(false)}
                              className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5"
                            >
                              <Icon width={18} height={18} />
                              <span className="truncate">{link.label}</span>
                            </NavLink>
                            <button
                              type="button"
                              className="mr-1 grid size-10 place-items-center rounded-lg hover:bg-black/5"
                              aria-label={hrOpen ? 'Collapse HR menu' : 'Expand HR menu'}
                              aria-expanded={hrOpen}
                              onClick={() => setHrOpen((open) => !open)}
                            >
                              <ChevronDown
                                width={17}
                                className={cn('transition-transform', hrOpen && 'rotate-180')}
                              />
                            </button>
                          </div>
                          {hrOpen && (
                            <HrSubmenu
                              activeTab={isHrPage ? activeHrTab : null}
                              onNavigate={() => setMenuOpen(false)}
                            />
                          )}
                        </div>
                      );
                    }
                    return (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        end={link.end}
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
                        {link.label}
                      </NavLink>
                    );
                  })}
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
