import { useState } from 'react';
import { addDays, addMonths, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { callStatus } from '@/components/places/PlaceParts';
import { baghdadDay, reminderDay, type Place } from '@/services/places/types';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const chip = { danger: 'bg-rose-50 text-rose-700', warning: 'bg-amber-50 text-amber-800', neutral: 'bg-brand-50 text-brand-700' };

/** Follow-up calls by day: a month grid on wide screens, a day-by-day list on phones. */
export function PlacesCalendar({ places, owner = false }: { places: Place[]; owner?: boolean }) {
  const today = baghdadDay();
  const [month, setMonth] = useState(() => new Date(today + 'T12:00:00'));
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  const href = (p: Place) => (owner ? paths.gashbenPlaceReport(p.id) : paths.sellerPlace(p.id));
  const monthKey = format(month, 'yyyy-MM');
  // Overdue calls sit on today, so nothing late is hidden in a past month.
  const dayOf = (p: Place) => (reminderDay(p) < today ? today : reminderDay(p));
  const byDay = new Map<string, Place[]>();
  for (const p of places) byDay.set(dayOf(p), [...(byDay.get(dayOf(p)) ?? []), p]);
  const agenda = [...byDay.entries()].filter(([d]) => d.startsWith(monthKey)).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section aria-label="Follow-up calendar" className="rounded-2xl border border-slate-200 bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-ink-900">{format(month, 'MMMM yyyy')}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ArrowLeft width={16} height={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date(today + 'T12:00:00'))}>Today</Button>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ArrowRight width={16} height={16} /></Button>
        </div>
      </div>

      <div className="hidden grid-cols-7 gap-1 md:grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="pb-1 text-center text-xs font-bold uppercase text-ink-400">{d}</div>)}
        {days.map((date) => {
          const day = format(date, 'yyyy-MM-dd');
          const due = byDay.get(day) ?? [];
          return (
            <div key={day} className={cn('min-h-24 rounded-xl border p-1.5', day === today ? 'border-brand-500 bg-brand-50/40' : 'border-slate-100', date.getMonth() !== month.getMonth() && 'opacity-50')}>
              <div className={cn('px-1 text-xs font-semibold', day === today ? 'text-brand-700' : 'text-ink-500')}>{date.getDate()}</div>
              {due.map((p) => (
                <Link key={p.id} to={href(p)} title={`${p.name} · ${p.person_name}`} className={cn('mt-1 block truncate rounded-md px-1.5 py-1 text-xs font-semibold', chip[callStatus(p).tone])}>{p.name}</Link>
              ))}
            </div>
          );
        })}
      </div>

      <div className="md:hidden">
        {agenda.length ? (
          <ol className="space-y-4">
            {agenda.map(([day, list]) => (
              <li key={day}>
                <div className={cn('mb-1.5 text-xs font-bold uppercase tracking-wide', day === today ? 'text-brand-700' : 'text-ink-400')}>
                  {day === today ? 'Today' : format(parseISO(day), 'EEE d MMM')}
                </div>
                <div className="space-y-1.5">
                  {list.map((p) => (
                    <Link key={p.id} to={href(p)} className={cn('flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold', chip[callStatus(p).tone])}>
                      <span className="truncate" dir="auto">{p.name}</span>
                      <span className="shrink-0 text-xs font-medium opacity-80">{callStatus(p).label}</span>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-6 text-center text-sm text-ink-500">No calls planned this month.</p>
        )}
      </div>
    </section>
  );
}
