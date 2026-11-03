import { useEffect, useState, type CSSProperties, type ReactElement, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { APPS, APP_GROUPS, HR_FLOOR_COLORS, HR_ROOM_ICONS, HR_SHORTCUTS, type AppTile } from '@/components/apps';
import { ArrowRight, Lock } from '@/components/icons';
import { paths } from '@/routes';
import { useAuth } from '@/services/auth/context';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { HR_NAV_GROUPS, hrTabLabel } from '@/services/hr/navigation';
import { cn } from '@/utils/cn';

type Icon = (p: SVGProps<SVGSVGElement>) => ReactElement;

interface Square {
  key: string;
  to: string;
  label: string;
  about?: string;
  icon: Icon;
  color: string;
  size: AppTile['size'];
}

/** From a tablet up: small 1×1, wide 2×1, big 2×2. */
const SPAN: Record<AppTile['size'], string> = {
  small: 'sm:col-span-1',
  wide: 'sm:col-span-2',
  big: 'sm:col-span-2 sm:row-span-2',
};

/** A darker step of a colour, for the square's gradient. */
function deeper(hex: string, by = 0.28): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - by));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/**
 * One square: a colour, its icon, its name — the whole square opens the page.
 * On a phone every square is the same size, two across; `phoneWide` lets the
 * first one of an odd group lie across both, so the rows come out even.
 */
function Tile({ square, phoneWide }: { square: Square; phoneWide: boolean }) {
  const Icon = square.icon;
  const big = square.size === 'big';
  return (
    <Link
      to={square.to}
      className={cn(
        'group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-3 text-white shadow-sm outline-none transition duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-4 focus-visible:ring-brand-500/40 active:scale-[0.98] sm:p-4',
        phoneWide ? 'col-span-2' : 'col-span-1',
        SPAN[square.size],
      )}
      style={{ background: `linear-gradient(140deg, ${square.color}, ${deeper(square.color)})` }}
    >
      {/* The icon again, large and faint, in the corner. */}
      <Icon
        aria-hidden
        className="pointer-events-none absolute -bottom-[12%] -right-[10%] size-[62%] opacity-[0.13] transition duration-300 group-hover:scale-110 group-hover:opacity-20"
        strokeWidth={1.5}
      />
      <Icon className={cn('relative size-7 shrink-0', big ? 'sm:size-11' : 'sm:size-7')} strokeWidth={1.8} />
      <span className="relative min-w-0">
        <span className={cn('block text-base font-bold leading-tight', big ? 'sm:text-2xl' : 'sm:text-base')}>{square.label}</span>
        {square.about && (
          <span
            className={cn(
              'mt-1 line-clamp-2 text-xs leading-snug text-white/80 sm:text-sm',
              phoneWide ? 'block' : 'hidden',
              square.size === 'small' ? 'sm:hidden' : 'sm:block',
            )}
          >
            {square.about}
          </span>
        )}
      </span>
      {big && (
        <span className="absolute right-3 top-3 hidden size-9 place-items-center rounded-full bg-white/15 opacity-0 transition group-hover:opacity-100 sm:right-4 sm:top-4 sm:grid">
          <ArrowRight width={18} height={18} />
        </span>
      )}
    </Link>
  );
}

/**
 * A group of squares. The grid measures itself, so every square stays square
 * whatever the width: 2 across on a phone (all one size), 4 across from a
 * tablet up (small, wide and big).
 */
function Group({ label, about, squares }: { label: string; about: string; squares: Square[] }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="text-lg font-bold text-ink-900">{label}</h2>
        <span className="truncate text-sm text-ink-400">{about}</span>
      </div>
      <div className="@container">
        <div
          className="grid grid-flow-dense grid-cols-2 gap-3 [--cols:2] sm:grid-cols-4 sm:[--cols:4]"
          style={{ gridAutoRows: 'calc((100cqw - (var(--cols) - 1) * 0.75rem) / var(--cols))' } as CSSProperties}
        >
          {squares.map((s, i) => (
            <Tile key={s.key} square={s} phoneWide={i === 0 && squares.length % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home: every part of the system as a square, Windows style, in three
 * groups — Attendance, People (the HR building and its busiest rooms) and the
 * owner's private area, which shows its squares only once its password is in.
 */
export function HomePage() {
  const { user } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const owner = isOwnerUnlocked();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const name = user?.email?.split('@')[0] ?? '';
  const toSquare = (a: AppTile): Square => ({ key: a.id, to: a.to, label: a.label, about: a.about, icon: a.icon, color: a.color, size: a.size });

  const squares = (group: AppTile['group']): Square[] => {
    const apps = APPS.filter((a) => a.group === group).map(toSquare);
    if (group === 'people') {
      // The busiest HR rooms, straight from Home, each in its floor's colour.
      for (const tab of HR_SHORTCUTS) {
        const floor = HR_NAV_GROUPS.find((g) => g.items.some((i) => i.id === tab))?.label ?? 'People';
        apps.push({ key: `hr-${tab}`, to: paths.hrTab(tab), label: hrTabLabel(tab), icon: HR_ROOM_ICONS[tab], color: HR_FLOOR_COLORS[floor], size: 'small' });
      }
    }
    if (group === 'owner' && !owner) {
      return [
        {
          key: 'owner-lock',
          to: paths.devices,
          label: 'Owner area',
          about: 'Enter the owner password to open profit, orders and private reports',
          icon: Lock,
          color: '#1E293B',
          size: 'big',
        },
      ];
    }
    return apps;
  };

  return (
    <AdminLayout>
      <div className="grid grid-cols-1 gap-x-8 gap-y-9 lg:grid-cols-2">
        {/* Today: the greeting and the time, like a lock screen — the same
            height as the squares beside it. */}
        <section className="flex min-w-0 flex-col">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
            <h1 className="text-lg font-bold text-ink-900">Today</h1>
            <span className="truncate text-sm text-ink-400">{format(now, 'EEEE, d MMMM yyyy')}</span>
          </div>
          <div className="relative flex min-h-56 flex-1 flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-br from-[#1e1b4b] via-[#312e81] to-[#A5292B] p-6 text-white shadow-sm sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/4 size-72 rounded-full bg-[#A5292B]/40 blur-3xl" />
            <div className="relative">
              <div className="text-6xl font-bold tracking-tight sm:text-7xl">{format(now, 'HH:mm')}</div>
              <div className="mt-2 text-2xl font-bold sm:text-3xl">
                {greeting(now.getHours())}
                {name && <span className="text-white/75">, {name}</span>}
              </div>
              <p className="mt-2 max-w-md text-sm text-white/75 sm:text-base">
                Pick a square to go in. The Vio logo at the top brings you back here.
              </p>
            </div>
            <div className="relative mt-5 flex flex-wrap gap-2">
              <Link
                to={paths.dashboard}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#1e1b4b] shadow-sm transition hover:bg-white/90"
              >
                Start attendance <ArrowRight width={16} height={16} />
              </Link>
              <Link
                to={paths.hr}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold text-white transition hover:bg-white/25"
              >
                HR lobby
              </Link>
            </div>
          </div>
        </section>

        {APP_GROUPS.map((g) => (
          <Group key={g.id} label={g.label} about={g.about} squares={squares(g.id)} />
        ))}
      </div>
    </AdminLayout>
  );
}
