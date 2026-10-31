import { Link } from 'react-router-dom';
import type { Place } from '@/services/places/types';
import { baghdadDay, reminderDay } from '@/services/places/types';
import { paths } from '@/routes';

export function PlacesTable({ places, owner = false }: { places: Place[]; owner?: boolean }) {
  const today = baghdadDay();
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-card">
    <table className="w-full min-w-[760px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase text-ink-500"><tr>
        {['Place', 'Type', 'Contact person', 'Phone number', 'City', 'Next call'].map((h) => <th key={h} className="px-5 py-3">{h}</th>)}
      </tr></thead>
      <tbody>{places.map((p) => <tr key={p.id} className="border-t border-slate-100 hover:bg-brand-50/30">
        <td className="px-5 py-4 font-bold"><Link className="text-brand-700 underline decoration-brand-200 underline-offset-4" to={owner ? paths.gashbenPlaceReport(p.id) : paths.sellerPlace(p.id)}>{p.name}</Link></td>
        <td className="px-5 py-4">{p.kind}</td><td className="px-5 py-4">{p.person_name}</td>
        <td className="px-5 py-4">{p.phone}</td><td className="px-5 py-4">{p.city}</td>
        <td className="px-5 py-4"><span className={reminderDay(p) <= today ? 'font-bold text-rose-600' : 'text-ink-700'}>{reminderDay(p)}{reminderDay(p) <= today ? ' · Call due' : ''}</span><span className="block text-xs text-ink-400">{p.reminder_date ? 'Manual date' : 'Automatic · 30 days'}</span></td>
      </tr>)}</tbody>
    </table>
    {!places.length && <p className="p-8 text-center text-ink-500">No places match these filters.</p>}
  </div>;
}
