import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Place } from '@/services/places/types';
import { reminderDay } from '@/services/places/types';
import { formatIqd } from '@/services/orders/options';
import { Check, Pencil, Phone, Plus, Trash } from '@/components/icons';
import { isDue, NextCall } from '@/components/places/PlaceParts';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

export interface PlaceTotals { count: number; total: number }

/**
 * Places as a table on wider screens and as cards on phones, most urgent call
 * first. A row opens the place's profile; the buttons on it do the common jobs
 * without opening it: call, mark as called, add an order (Gashben) or edit and
 * delete (owner).
 */
export function PlacesTable({
  places,
  owner = false,
  totals,
  onCalled,
  onAddOrder,
  onEdit,
  onDelete,
  empty = 'No places match. Add a place or change the search.',
}: {
  places: Place[];
  owner?: boolean;
  totals?: (id: string) => PlaceTotals;
  onCalled?: (place: Place) => void;
  onAddOrder?: (place: Place) => void;
  onEdit?: (place: Place) => void;
  onDelete?: (place: Place) => void;
  empty?: string;
}) {
  const navigate = useNavigate();
  const href = (p: Place) => (owner ? paths.gashbenPlaceReport(p.id) : paths.sellerPlace(p.id));
  const sorted = [...places].sort((a, b) => reminderDay(a).localeCompare(reminderDay(b)) || a.name.localeCompare(b.name));

  if (!places.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-card p-10 text-center text-ink-500">{empty}</div>;
  }

  // Laptop rows get compact icons; phone cards get labelled buttons a thumb can hit.
  const actions = (p: Place, labelled = false) => {
    const btn = labelled ? 'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold' : '';
    return (
      <>
        {!owner && (
          <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} title="Call" className={labelled ? cn(btn, 'bg-emerald-600 text-white') : iconBtn}>
            <Phone width={16} height={16} />{labelled && 'Call'}
          </a>
        )}
        {onCalled && isDue(p) && (
          <button type="button" onClick={() => onCalled(p)} className={labelled ? cn(btn, 'bg-emerald-50 text-emerald-700') : 'inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100'}>
            <Check width={14} height={14} /> Called
          </button>
        )}
        {onAddOrder && (labelled
          ? <button type="button" onClick={() => onAddOrder(p)} className={cn(btn, 'bg-brand-50 text-brand-700')}><Plus width={16} height={16} />Order</button>
          : <IconButton label={`Add order for ${p.name}`} onClick={() => onAddOrder(p)}><Plus width={16} height={16} /></IconButton>)}
        {onEdit && (labelled
          ? <button type="button" onClick={() => onEdit(p)} className={cn(btn, 'bg-slate-100 text-ink-700')}><Pencil width={15} height={15} />Edit</button>
          : <IconButton label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil width={16} height={16} /></IconButton>)}
        {onDelete && (labelled
          ? <button type="button" onClick={() => onDelete(p)} className={cn(btn, 'bg-rose-50 text-rose-700')}><Trash width={15} height={15} />Delete</button>
          : <IconButton label={`Delete ${p.name}`} danger onClick={() => onDelete(p)}><Trash width={16} height={16} /></IconButton>)}
      </>
    );
  };

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Place</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold">City</th>
                {totals && <th className="px-5 py-3 text-right font-semibold">Orders</th>}
                <th className="px-5 py-3 font-semibold">Next call</th>
                <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const t = totals?.(p.id);
                return (
                  <tr key={p.id} onClick={() => navigate(href(p))} className={cn('cursor-pointer border-t border-slate-100 transition hover:bg-brand-50/40', isDue(p) && 'bg-rose-50/30')}>
                    <td className="px-5 py-3.5">
                      <Link to={href(p)} onClick={(e) => e.stopPropagation()} className="font-bold text-ink-900 hover:text-brand-700" dir="auto">{p.name}</Link>
                      <div className="text-xs text-ink-400">{p.kind}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div dir="auto">{p.person_name}</div>
                      <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline">{p.phone}</a>
                    </td>
                    <td className="px-5 py-3.5" dir="auto">{p.city}</td>
                    {t && (
                      <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums">
                        <div className="font-semibold">{t.count}</div>
                        <div className="text-xs text-ink-400">{formatIqd(t.total)}</div>
                      </td>
                    )}
                    <td className="px-5 py-3.5"><NextCall place={p} /></td>
                    <td className="whitespace-nowrap px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{actions(p)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-3 md:hidden">
        {sorted.map((p) => {
          const t = totals?.(p.id);
          return (
            <li key={p.id} className={cn('overflow-hidden rounded-2xl border bg-card', isDue(p) ? 'border-rose-200' : 'border-slate-200')}>
              <Link to={href(p)} className="block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-ink-900" dir="auto">{p.name}</div>
                    <div className="truncate text-sm text-ink-500">{p.kind} · <span dir="auto">{p.city}</span></div>
                  </div>
                  <NextCall place={p} />
                </div>
                <div className="mt-2 truncate text-sm text-ink-700">
                  <span dir="auto">{p.person_name}</span> · <span className="font-semibold">{p.phone}</span>
                </div>
                {t && <div className="mt-0.5 text-xs text-ink-400">{t.count} orders · {formatIqd(t.total)}</div>}
              </Link>
              <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5">
                {actions(p, true)}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const iconBtn = 'grid size-9 place-items-center rounded-lg text-ink-500 transition hover:bg-slate-100 hover:text-ink-900';

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(iconBtn, danger && 'hover:bg-rose-50 hover:text-rose-600')}
    >
      {children}
    </button>
  );
}
