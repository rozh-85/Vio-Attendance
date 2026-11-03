import { forwardRef, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Search, Tag } from '@/components/icons';
import { countsAsSale } from '@/services/orders/options';
import { orderDay } from '@/services/orders/report';
import type { ModelRow, ProfitData, ProfitSummary } from '@/services/orders/profit';
import { modelKey } from '@/services/orders/profit';
import type { SalesOrder } from '@/services/orders/types';
import { cn } from '@/utils/cn';
import { CostInput, iqd, percent, signTone, signedIqd } from './parts';

export type ModelFilter = 'all' | 'missing' | 'loss';

const PAGE = 25;

const chip = (on: boolean) =>
  cn(
    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
    on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-card text-ink-700 hover:bg-slate-50',
  );

/** Profit on one piece at the model's usual price, and its margin. */
function unit(row: ModelRow) {
  if (row.cost === null || !row.avgPrice) return null;
  const profit = row.avgPrice - row.cost;
  return { profit, margin: profit / row.avgPrice };
}

function MarginBar({ margin }: { margin: number }) {
  const clamped = Math.max(-1, Math.min(1, margin));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', clamped >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
          style={{ width: `${Math.abs(clamped) * 100}%` }}
        />
      </div>
      <span className={cn('w-10 text-xs font-semibold tabular-nums', signTone(margin))}>{percent(margin)}</span>
    </div>
  );
}

/**
 * The cost of every model sellers have sold, typed once. Each order of that
 * model — every spelling of it — then has a profit. Models without a cost
 * come first when the "No cost yet" filter is on, and Enter moves to the next.
 */
export const ModelCosts = forwardRef<
  HTMLDivElement,
  {
    summary: ProfitSummary;
    filter: ModelFilter;
    onFilter: (f: ModelFilter) => void;
    onSetCost: (row: ModelRow, cost: number | null) => Promise<void>;
    periodText: string;
  }
>(function ModelCosts({ summary, filter, onFilter, onSetCost, periodText }, ref) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const models = summary.byModel.filter((r) => r.key);
  const missing = models.filter((r) => r.cost === null);
  const losing = models.filter((r) => {
    const u = unit(r);
    return u !== null && u.profit < 0;
  });
  // Share of all-time sales whose model has a cost: how complete the list is.
  const allSales = models.reduce((sum, r) => sum + r.avgPrice * r.allOrders, 0);
  const costedSales = models.reduce((sum, r) => sum + (r.cost !== null ? r.avgPrice * r.allOrders : 0), 0);
  const coverage = allSales ? costedSales / allSales : 0;

  const q = modelKey(query);
  const text = query.trim().toLowerCase();
  const rows = (filter === 'missing' ? missing : filter === 'loss' ? losing : models).filter(
    (r) =>
      !text ||
      (q && r.key.includes(q)) ||
      r.category.toLowerCase().includes(text) ||
      r.spellings.some((s) => s.toLowerCase().includes(text)),
  );

  const shown = rows.slice(0, limit);

  return (
    <div ref={ref} className="scroll-mt-6">
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink-700">
              <Tag width={20} height={20} />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-ink-900">Cost of each model</h3>
              <p className="max-w-xl text-sm text-ink-500">
                Write what one piece costs you. Every order of that model uses it — however the seller spelled it
                (V.502, v502, V-502 are one model). Press Enter to save and go to the next.
              </p>
            </div>
          </div>
          <div className="w-full max-w-[16rem]">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-ink-700">
                {models.length - missing.length} of {models.length} models
              </span>
              <span className="font-bold tabular-nums text-ink-900">{percent(coverage)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${coverage * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-ink-400">of all sales on record have a cost</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className={chip(filter === 'all')} onClick={() => onFilter('all')}>
            All models <span className="tabular-nums text-ink-400">{models.length}</span>
          </button>
          <button type="button" className={chip(filter === 'missing')} onClick={() => onFilter('missing')}>
            <span className="size-2 rounded-full bg-amber-400" />
            No cost yet <span className="tabular-nums text-ink-400">{missing.length}</span>
          </button>
          <button type="button" className={chip(filter === 'loss')} onClick={() => onFilter('loss')}>
            <span className="size-2 rounded-full bg-rose-500" />
            Sold under cost <span className="tabular-nums text-ink-400">{losing.length}</span>
          </button>
          <label className="relative ml-auto w-full sm:w-64">
            <Search width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-card pl-9 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              placeholder="Find a model or type…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
            />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-ink-500">
          {filter === 'missing' && !query
            ? 'Every model has a cost. Profit is complete.'
            : filter === 'loss' && !query
              ? 'No model is sold for less than it costs.'
              : 'No model matches.'}
        </p>
      ) : (
        <div data-cost-list>
          {/* Phones: one card per model. */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {shown.map((r) => {
              const u = unit(r);
              return (
                <li key={r.key} className={cn('px-4 py-3', r.cost === null && 'bg-amber-50/40')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono font-bold text-ink-900">{r.label}</div>
                      <div dir="auto" className="truncate text-left text-xs text-ink-500">
                        {r.category || '—'}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-400">
                        Sold {r.orders} · usually {iqd(r.avgPrice)} IQD
                      </div>
                    </div>
                    <CostInput
                      className="w-36 shrink-0"
                      label={`Cost of one ${r.label}`}
                      value={r.cost}
                      onSave={(v) => onSetCost(r, v)}
                    />
                  </div>
                  {u && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-ink-500">
                        Per piece <b className={cn('tabular-nums', signTone(u.profit))}>{signedIqd(u.profit)}</b>
                      </span>
                      <MarginBar margin={u.margin} />
                      <span className="text-ink-500">
                        Period <b className={cn('tabular-nums', signTone(r.profit))}>{signedIqd(r.profit)}</b>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Tablets and up: a table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-5 py-3">Model</th>
                  <th className="px-3 py-3 text-right">Sold</th>
                  <th className="px-3 py-3 text-right">Usual price</th>
                  <th className="w-44 px-3 py-3">Cost of one</th>
                  <th className="px-3 py-3 text-right">Profit per piece</th>
                  <th className="px-3 py-3">Margin</th>
                  <th className="px-5 py-3 text-right">Profit · {periodText}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const u = unit(r);
                  return (
                    <tr
                      key={r.key}
                      className={cn(
                        'border-b border-slate-100 last:border-0',
                        r.cost === null && 'bg-amber-50/40',
                        r.orders === 0 && 'text-ink-400',
                      )}
                    >
                      <td className="px-5 py-2.5">
                        <div className="font-mono font-bold text-ink-900">{r.label}</div>
                        <div className="flex max-w-[16rem] items-center gap-1 text-xs text-ink-500">
                          <bdi className="truncate">{r.category || '—'}</bdi>
                          {r.spellings.length > 0 && (
                            <span className="truncate text-ink-400" title={`Also written ${r.spellings.join(', ')}`}>
                              · also {r.spellings.slice(0, 2).join(', ')}
                              {r.spellings.length > 2 && ` +${r.spellings.length - 2}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        <b className={r.orders ? 'text-ink-900' : 'text-ink-400'}>{r.orders}</b>
                        <div className="text-xs text-ink-400">{r.allOrders} in all</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-700">
                        {r.avgPrice ? iqd(r.avgPrice) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <CostInput label={`Cost of one ${r.label}`} value={r.cost} onSave={(v) => onSetCost(r, v)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {u ? (
                          <b className={cn('tabular-nums', signTone(u.profit))}>{signedIqd(u.profit)}</b>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{u ? <MarginBar margin={u.margin} /> : <span className="text-ink-400">—</span>}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right">
                        {r.costedOrders > 0 ? (
                          <b className={cn('tabular-nums', signTone(r.profit))}>{signedIqd(r.profit)}</b>
                        ) : r.orders > 0 ? (
                          <span className="text-xs font-semibold text-amber-700">Needs a cost</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > limit && (
        <div className="border-t border-slate-100 px-5 py-3 text-center">
          <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setLimit(rows.length)}>
            Show all {rows.length} models
          </button>
        </div>
      )}
    </Card>
    </div>
  );
});

/**
 * Sales where the seller wrote no model: no model cost can reach them, so
 * each gets its cost here, one by one.
 */
export function NoModelOrders({
  orders,
  data,
  from,
  to,
  onSetCost,
}: {
  orders: SalesOrder[];
  data: ProfitData;
  from: string;
  to: string;
  onSetCost: (order: SalesOrder, cost: number | null) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const list = useMemo(
    () =>
      orders
        .filter((o) => {
          const d = orderDay(o);
          return countsAsSale(o.status) && !modelKey(o.itemModel) && (!from || d >= from) && (!to || d <= to);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, from, to],
  );
  if (list.length === 0) return null;
  const waiting = list.filter((o) => data.orderCosts[o.id] === undefined).length;
  const shown = all ? list : list.slice(0, 8);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <h3 className="font-bold text-ink-900">Orders with no model written</h3>
        <p className="text-sm text-ink-500">
          {waiting > 0
            ? `${waiting} of ${list.length} still need a cost. Give each its own cost here.`
            : `All ${list.length} have their own cost.`}
        </p>
      </div>
      <ul className="divide-y divide-slate-100" data-cost-list>
        {shown.map((o) => {
          const own = data.orderCosts[o.id];
          return (
            <li key={o.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-2.5', own === undefined && 'bg-amber-50/40')}>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <span className="font-mono">#{o.orderNo}</span>
                  <span>{format(new Date(o.createdAt), 'd MMM yyyy')}</span>
                </div>
                <div dir="auto" className="truncate text-left text-sm font-semibold text-ink-900">
                  {o.customerName}
                  {o.itemCategory && <span className="font-normal text-ink-500"> · {o.itemCategory}</span>}
                </div>
              </div>
              <div className="w-28 text-right text-sm tabular-nums text-ink-700">{iqd(o.totalPrice)}</div>
              <CostInput
                className="w-36"
                label={`Cost of order ${o.orderNo}`}
                value={own ?? null}
                onSave={(v) => onSetCost(o, v)}
              />
              <div className="w-24 text-right text-sm">
                {own !== undefined ? (
                  <b className={cn('tabular-nums', signTone(o.totalPrice - own))}>{signedIqd(o.totalPrice - own)}</b>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > 8 && (
        <div className="border-t border-slate-100 px-5 py-3 text-center">
          <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${list.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}
