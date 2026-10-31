import { useState } from 'react';
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { baghdadDay, reminderDay, type Place } from '@/services/places/types';
import { paths } from '@/routes';

export function PlacesCalendar({ places, owner = false }: { places: Place[]; owner?: boolean }) {
  const [month, setMonth] = useState(() => new Date(baghdadDay() + 'T12:00:00'));
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return <section aria-label="Follow-up calendar" className="rounded-2xl border border-slate-200 bg-card p-4">
    <div className="mb-4 flex items-center justify-between gap-3"><Button variant="outline" onClick={() => setMonth(addMonths(month, -1))}>Previous</Button><h2 className="font-bold">{format(month, 'MMMM yyyy')}</h2><Button variant="outline" onClick={() => setMonth(addMonths(month, 1))}>Next</Button></div>
    <div className="overflow-x-auto"><div className="grid min-w-[620px] grid-cols-7 gap-1">
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => <div key={d} className="p-2 text-center text-xs font-bold text-ink-400">{d}</div>)}
      {days.map((date) => { const day = format(date, 'yyyy-MM-dd'); const due = places.filter((p) => reminderDay(p) === day); return <div key={day} className={'min-h-28 rounded-lg border p-2 ' + (day === baghdadDay() ? 'border-brand-500 bg-brand-50' : 'border-slate-100')}>
        <div className={'text-xs font-semibold ' + (date.getMonth() === month.getMonth() ? 'text-ink-700' : 'text-ink-300')}>{date.getDate()}</div>
        {due.map((p) => <Link key={p.id} to={owner ? paths.gashbenPlaceReport(p.id) : paths.sellerPlace(p.id)} className="mt-1 block break-words rounded bg-brand-50 p-1 text-xs font-semibold text-brand-700">{p.name}</Link>)}
      </div>; })}
    </div></div>
  </section>;
}
