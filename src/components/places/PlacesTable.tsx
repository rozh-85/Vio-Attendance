import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Place } from '@/services/places/types';
import { reminderDay } from '@/services/places/types';
import { formatIqd } from '@/services/orders/options';
import { Pencil, Trash } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { NextCall } from '@/components/places/PlaceParts';
import { paths } from '@/routes';

export interface PlaceTotals { count: number; total: number }

/**
 * Places as a table on wider screens and as cards on phones. A row opens the
 * place's profile; most urgent calls come first.
 */
export function PlacesTable({
  places,
  owner = false,
  totals,
  onEdit,
  onDelete,
}: {
  places: Place[];
  owner?: boolean;
  totals?: (id: string) => PlaceTotals;
  onEdit?: (place: Place) => void;
  onDelete?: (place: Place) => void;
}) {
  const navigate = useNavigate();
  const href = (p: Place) => (owner ? paths.gashbenPlaceReport(p.id) : paths.sellerPlace(p.id));
  const sorted = [...places].sort((a, b) => reminderDay(a).localeCompare(reminderDay(b)) || a.name.localeCompare(b.name));
  const actions = !!(onEdit || onDelete);

  if (!places.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-card p-10 text-center text-ink-500">No places match. Add a place or change the search.</div>;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Place</th>
                <th className="px-5 py-3 font-semibold">Contact person</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold">City</th>
                {totals && <th className="px-5 py-3 text-right font-semibold">Orders</th>}
                <th className="px-5 py-3 font-semibold">Next call</th>
                {actions && <th className="px-5 py-3"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const t = totals?.(p.id);
                return (
                  <tr key={p.id} onClick={() => navigate(href(p))} className="cursor-pointer border-t border-slate-100 transition hover:bg-brand-50/40">
                    <td className="px-5 py-3.5">
                      <Link to={href(p)} onClick={(e) => e.stopPropagation()} className="font-bold text-ink-900 hover:text-brand-700" dir="auto">{p.name}</Link>
                      <div className="mt-1"><Badge>{p.kind}</Badge></div>
                    </td>
                    <td className="px-5 py-3.5" dir="auto">{p.person_name}</td>
                    <td className="whitespace-nowrap px-5 py-3.5"><a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="text-brand-700 hover:underline">{p.phone}</a></td>
                    <td className="px-5 py-3.5" dir="auto">{p.city}</td>
                    {t && (
                      <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums">
                        <div className="font-semibold">{t.count}</div>
                        <div className="text-xs text-ink-400">{formatIqd(t.total)}</div>
                      </td>
                    )}
                    <td className="px-5 py-3.5"><NextCall place={p} /></td>
                    {actions && (
                      <td className="whitespace-nowrap px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          {onEdit && <IconButton label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil width={16} height={16} /></IconButton>}
                          {onDelete && <IconButton label={`Delete ${p.name}`} danger onClick={() => onDelete(p)}><Trash width={16} height={16} /></IconButton>}
                        </div>
                      </td>
                    )}
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
            <li key={p.id} className="rounded-2xl border border-slate-200 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={href(p)} className="min-w-0">
                  <div className="truncate font-bold text-ink-900" dir="auto">{p.name}</div>
                  <div className="text-sm text-ink-500">{p.kind} · <span dir="auto">{p.city}</span></div>
                </Link>
                <NextCall place={p} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate" dir="auto">{p.person_name}</div>
                  <a href={`tel:${p.phone}`} className="font-semibold text-brand-700">{p.phone}</a>
                  {t && <div className="text-xs text-ink-400">{t.count} orders · {formatIqd(t.total)}</div>}
                </div>
                <div className="flex shrink-0 items-center">
                  {onEdit && <IconButton label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil width={16} height={16} /></IconButton>}
                  {onDelete && <IconButton label={`Delete ${p.name}`} danger onClick={() => onDelete(p)}><Trash width={16} height={16} /></IconButton>}
                  <Link to={href(p)} className="ml-1 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">Open</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={danger ? 'grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600' : 'grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-900'}
    >
      {children}
    </button>
  );
}
