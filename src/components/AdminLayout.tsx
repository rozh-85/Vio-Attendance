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
  Phone,
  Search,
  Settings,
  UserPlus,
  Users,
  Wallet,
  X,
} from './icons';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { APP_NAME } from '@/brand';
import { paths } from '@/routes';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { HR_NAV_GROUPS, isHrTab, type HrTab } from '@/services/hr/navigation';
import { cn } from '@/utils/cn';

const hrLink = { to: paths.hr, label: 'HR management', icon: Briefcase, end: false };

const adminLinks = [
  { to: paths.dashboard, label: 'Dashboard', icon: Home, end: true },
  { to: paths.employees, label: 'Employee report', icon: Search, end: false },
  { to: paths.leave, label: 'Leave management', icon: CalendarDays, end: false },
  hrLink,
];

// `end` keeps "Shared phones" from lighting up on its /rozhadmin/… sibling.
const ownerLinks = [
  { to: paths.devices, label: 'Shared phones', icon: Phone, end: true },
  {
    to: paths.checkInLocations,
    label: 'Check-in locations',
    icon: MapPin,
    end: false,
  },
  { to: paths.socialOrders, label: 'Social media orders', icon: Wallet, end: false },
];

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

type NavItem = (typeof adminLinks)[number] | (typeof ownerLinks)[number];

/**
 * The menu itself, shared by the laptop sidebar and the phone's slide-out
 * one, so both always list the same pages. `onNavigate` closes the phone menu.
 */
function SidebarNav({
  links,
  isHrPage,
  activeHrTab,
  hrOpen,
  onToggleHr,
  onNavigate,
  roomy = false,
}: {
  links: NavItem[];
  isHrPage: boolean;
  activeHrTab: HrTab;
  hrOpen: boolean;
  onToggleHr: () => void;
  onNavigate?: () => void;
  /** Taller rows for fingers. */
  roomy?: boolean;
}) {
  const row = roomy ? 'py-3' : 'py-2.5';
  return (
    <nav className="flex flex-col gap-1.5">
      {links.map((link) => {
        const Icon = link.icon;
        if (link.to === paths.hr) {
          return (
            <div key={link.to}>
              <div
                className={cn(
                  'flex items-center rounded-xl text-sm font-semibold transition-colors',
                  isHrPage ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
                )}
              >
                <NavLink
                  to={paths.hrTab('overview')}
                  onClick={onNavigate}
                  className={cn('flex min-w-0 flex-1 items-center gap-3 pl-3.5', row)}
                >
                  <Icon width={18} height={18} className="shrink-0" />
                  <span className="truncate">{link.label}</span>
                </NavLink>
                <button
                  type="button"
                  className="mr-1 grid size-9 shrink-0 place-items-center rounded-lg hover:bg-black/5"
                  aria-label={hrOpen ? 'Collapse HR menu' : 'Expand HR menu'}
                  aria-expanded={hrOpen}
                  onClick={onToggleHr}
                >
                  <ChevronDown width={16} className={cn('transition-transform', hrOpen && 'rotate-180')} />
                </button>
              </div>
              {hrOpen && <HrSubmenu activeTab={isHrPage ? activeHrTab : null} onNavigate={onNavigate} />}
            </div>
          );
        }
        return (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors',
                row,
                isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-500 hover:bg-slate-100 hover:text-ink-900',
              )
            }
          >
            <Icon width={18} height={18} className="shrink-0" />
            {link.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Logo size={36} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-sm font-bold text-ink-900">{APP_NAME}</div>
        <div className="truncate text-xs text-ink-400">Employee check-in</div>
      </div>
    </div>
  );
}

function Appearance() {
  return (
    <div className="mt-auto pt-6">
      <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">Appearance</div>
      <ThemeToggle />
    </div>
  );
}

/**
 * Shared admin chrome. On laptops a full-height sidebar hugs the left edge; on
 * phones and tablets the same sidebar slides in from the left behind the menu
 * button, with the page's name in the top bar.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHrPage = location.pathname === paths.hr;
  const requestedHrTab = new URLSearchParams(location.search).get('tab');
  const activeHrTab: HrTab = isHrTab(requestedHrTab) ? requestedHrTab : 'overview';
  const [hrOpen, setHrOpen] = useState(isHrPage);
  useEffect(() => {
    if (isHrPage) setHrOpen(true);
  }, [isHrPage]);
  // The owner reports only join the sidebar once their password has been
  // entered this session, so they stay invisible to anyone reading the
  // supervisor's screen — but are one click away for whoever unlocked them,
  // instead of forcing them to retype the address every time they leave.
  const links: NavItem[] = isOwnerUnlocked() ? [...adminLinks, ...ownerLinks] : adminLinks;

  // A new page closes the phone menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  // While it is open the page behind holds still, and Escape closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  // The page's name for the phone top bar: the longest link that matches.
  const current = isHrPage
    ? links.find((l) => l.to === paths.hr)
    : [...links]
        .filter((l) => (l.end ? location.pathname === l.to : location.pathname.startsWith(l.to)))
        .sort((a, b) => b.to.length - a.to.length)[0];

  const nav = (roomy: boolean, onNavigate?: () => void) => (
    <SidebarNav
      links={links}
      isHrPage={isHrPage}
      activeHrTab={activeHrTab}
      hrOpen={hrOpen}
      onToggleHr={() => setHrOpen((open) => !open)}
      onNavigate={onNavigate}
      roomy={roomy}
    />
  );

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* Laptop sidebar — sticky, fills the viewport height. */}
      <aside className="sticky top-0 z-20 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-card px-4 py-6 lg:flex">
        <div className="mb-8 px-2">
          <Brand />
        </div>
        {nav(false)}
        <Appearance />
      </aside>

      {/* Phone and tablet: the same sidebar, sliding in from the left. */}
      <div className={cn('fixed inset-0 z-50 lg:hidden', !menuOpen && 'pointer-events-none')}>
        <button
          type="button"
          tabIndex={menuOpen ? 0 : -1}
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className={cn(
            'absolute inset-0 bg-[#0f172a]/45 backdrop-blur-[2px] transition-opacity duration-300',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          id="mobile-admin-navigation"
          aria-label="Menu"
          inert={!menuOpen}
          className={cn(
            'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-200 bg-card px-4 pb-6 pt-4 shadow-2xl transition-[translate,visibility] duration-300 ease-out',
            // Hidden once slid away, so its shadow does not show at the edge.
            menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
          )}
        >
          <div className="mb-6 flex items-center justify-between gap-2 pl-2">
            <Brand />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
            >
              <X width={20} height={20} />
            </button>
          </div>
          {nav(true, () => setMenuOpen(false))}
          <Appearance />
        </aside>
      </div>

      {/* Main column. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-card/95 px-3 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-admin-navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu width={22} height={22} />
          </button>
          <Logo size={30} className="shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-bold text-ink-900">{current?.label ?? APP_NAME}</div>
            <div className="truncate text-[11px] text-ink-400">{APP_NAME}</div>
          </div>
          <ThemeToggle variant="icon" />
        </header>

        <div className="w-full min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}
