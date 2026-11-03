import { useEffect, useRef, type CSSProperties } from 'react';
import { HR_FLOOR_COLORS, HR_ROOM_ICONS } from '@/components/apps';
import { ArrowRight, Home } from '@/components/icons';
import { HR_NAV_GROUPS, type HrTab } from '@/services/hr/navigation';
import { cn } from '@/utils/cn';

/** What a room shows on its door: a live number and, when it needs you, a flag. */
export interface RoomSign {
  value: string;
  alert?: boolean;
}

/**
 * HR as a building: four floors — People on the ground floor, then
 * Workforce, Talent and Administration — each with its rooms. The lobby (the
 * overview) is where you come in.
 */
const FLOORS = HR_NAV_GROUPS.map((g, i) => ({
  number: i + 1,
  label: g.label,
  color: HR_FLOOR_COLORS[g.label] ?? '#334155',
  rooms: g.items.filter((r) => r.id !== 'overview'),
}));

const floorOf = (tab: HrTab) => FLOORS.find((f) => f.rooms.some((r) => r.id === tab)) ?? FLOORS[0];

/** A room's door: its icon in the floor's colour, its name, and what is inside. */
function Door({ id, label, color, sign, onOpen }: { id: HrTab; label: string; color: string; sign?: RoomSign; onOpen: () => void }) {
  const Icon = HR_ROOM_ICONS[id];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-square min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-card p-3 text-left shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-4 focus-visible:ring-brand-500/30 sm:aspect-auto sm:h-32 sm:p-4 lg:h-36"
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <span className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm sm:size-11" style={{ background: color }}>
          <Icon width={20} height={20} />
        </span>
        {sign?.alert && (
          <span className="relative mt-1 flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-rose-500" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold leading-tight text-ink-900 sm:text-base">{label}</span>
        {sign && (
          <span className={cn('mt-1 block truncate text-xs font-semibold sm:text-sm', sign.alert ? 'text-rose-700' : 'text-ink-500')}>
            {sign.value}
          </span>
        )}
      </span>
      <ArrowRight
        width={16}
        height={16}
        className="absolute bottom-3 right-3 text-ink-300 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 sm:bottom-4 sm:right-4"
      />
    </button>
  );
}

/**
 * The lobby: the building drawn floor by floor, top floor first like a real
 * one, each floor's rooms as doors with what is inside. Tap a door to go in.
 */
export function HrLobby({ signs, onOpen }: { signs: Partial<Record<HrTab, RoomSign>>; onOpen: (tab: HrTab) => void }) {
  const rooms = FLOORS.reduce((n, f) => n + f.rooms.length, 0);
  return (
    <section aria-label="HR building" className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-card shadow-sm">
      {/* The roof. */}
      <div className="relative overflow-hidden bg-linear-to-r from-[#312e81] to-[#4338CA] px-5 py-5 text-white sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Vio HR building</div>
            <div className="mt-1 text-2xl font-bold">
              {FLOORS.length} floors · {rooms} rooms
            </div>
          </div>
          <div className="text-sm text-white/75">Pick a floor, then open a door.</div>
        </div>
      </div>

      {/* Top floor first, as a building stands. */}
      <div className="divide-y divide-slate-100">
        {[...FLOORS].reverse().map((floor) => (
          <div key={floor.label} className="flex flex-col sm:flex-row">
            {/* The lift: floor number and name. */}
            <div
              className="flex items-center gap-3 px-4 py-3 sm:w-40 sm:shrink-0 sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:border-r sm:border-slate-100 sm:px-5"
              style={{ background: `linear-gradient(90deg, ${floor.color}14, transparent)` }}
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-black text-white shadow-sm sm:size-12 sm:text-base"
                style={{ background: floor.color }}
              >
                {floor.number}F
              </span>
              <span>
                <span className="block text-sm font-bold text-ink-900">{floor.label}</span>
                <span className="block text-xs text-ink-400">
                  {floor.rooms.length} {floor.rooms.length === 1 ? 'room' : 'rooms'}
                </span>
              </span>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 p-3 sm:grid-cols-3 sm:p-4">
              {floor.rooms.map((r) => (
                <Door key={r.id} id={r.id} label={r.label} color={floor.color} sign={signs[r.id]} onOpen={() => onOpen(r.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The ground: you came in here. */}
      <div className="flex items-center justify-center gap-2 border-t-4 border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-ink-400">
        <Home width={14} height={14} /> Lobby · you are here
      </div>
    </section>
  );
}

/**
 * Inside a room: the corridor along the top. The lift on the first line goes
 * to another floor; the doors on the second line are this floor's rooms.
 */
export function HrCorridor({ active, signs, onOpen }: { active: HrTab; signs: Partial<Record<HrTab, RoomSign>>; onOpen: (tab: HrTab) => void }) {
  const floor = floorOf(active);
  const rowRef = useRef<HTMLDivElement>(null);

  // The open room stays in view on a narrow screen.
  useEffect(() => {
    rowRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <nav aria-label="HR rooms" className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm">
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-2 py-2">
        <button
          type="button"
          onClick={() => onOpen('overview')}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-600 transition hover:bg-slate-100 hover:text-ink-900"
        >
          <Home width={16} height={16} /> Lobby
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
        {FLOORS.map((f) => {
          const here = f.label === floor.label;
          const waiting = f.rooms.some((r) => signs[r.id]?.alert);
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => !here && onOpen(f.rooms[0].id)}
              aria-pressed={here}
              className={cn(
                'relative inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition',
                here ? 'text-white shadow-sm' : 'text-ink-600 hover:bg-slate-100',
              )}
              style={here ? { background: f.color } : undefined}
            >
              <span
                className={cn('grid size-5 place-items-center rounded-md text-[10px] font-black', here ? 'bg-white/20' : 'text-white')}
                style={here ? undefined : { background: f.color }}
              >
                {f.number}
              </span>
              {f.label}
              {waiting && !here && <span className="size-2 rounded-full bg-rose-500" />}
            </button>
          );
        })}
      </div>
      <div ref={rowRef} className="flex gap-2 overflow-x-auto px-2 py-2" style={{ background: `linear-gradient(90deg, ${floor.color}0d, transparent)` }}>
        {floor.rooms.map((r) => {
          const Icon = HR_ROOM_ICONS[r.id];
          const here = r.id === active;
          const sign = signs[r.id];
          return (
            <button
              key={r.id}
              type="button"
              aria-current={here ? 'page' : undefined}
              onClick={() => onOpen(r.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition',
                here ? 'border-transparent bg-card shadow-sm ring-2' : 'border-slate-200 bg-card/70 hover:bg-card',
              )}
              style={here ? ({ '--tw-ring-color': floor.color } as CSSProperties) : undefined}
            >
              <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: floor.color }}>
                <Icon width={16} height={16} />
              </span>
              <span className="leading-tight">
                <span className={cn('block text-sm', here ? 'font-bold text-ink-900' : 'font-semibold text-ink-700')}>{r.label}</span>
                {sign && <span className={cn('block text-xs', sign.alert ? 'font-semibold text-rose-700' : 'text-ink-400')}>{sign.value}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
