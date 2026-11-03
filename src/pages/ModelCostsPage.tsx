import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, Search, Tag } from '@/components/icons';
import { BackLink, CardTitle, LeaveNotice, LoadProblem, iqd, percent, signTone, signedIqd } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { countsAsSale } from '@/services/orders/options';
import { modelKey, parseIqd, summarizeProfit, type ModelRow } from '@/services/orders/profit';
import { setProfitNotice } from '@/services/orders/profitMemory';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import type { SalesOrder } from '@/services/orders/types';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

type Filter = 'all' | 'missing' | 'loss';

const chip = (on: boolean) =>
  cn(
    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition',
    on ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
  );

/** Model rows are `m:<key>`, orders with no model `o:<id>`. */
const modelId = (key: string) => `m:${key}`;
const orderId = (id: string) => `o:${id}`;

/**
 * A cost box. Typing only changes the page; nothing is saved until Save.
 * Enter moves to the next box, so a column of costs is quick to fill.
 */
function CostBox({
  label,
  value,
  saved,
  onChange,
}: {
  label: string;
  value: string;
  saved: number | null;
  onChange: (value: string) => void;
}) {
  const changed = parseIqd(value) !== saved;
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const boxes = [...document.querySelectorAll<HTMLInputElement>('input[data-cost-box]')];
    const next = boxes[boxes.indexOf(e.currentTarget) + 1];
    if (next) next.focus();
    else e.currentTarget.blur();
  }
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <input
        data-cost-box
        inputMode="numeric"
        autoComplete="off"
        placeholder="Set cost"
        value={value}
        onFocus={(e) => e.target.select()}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const n = parseIqd(e.target.value);
          onChange(n === null ? '' : iqd(n));
        }}
        className={cn(
          'h-11 w-full rounded-xl border pl-3 pr-12 text-right font-semibold tabular-nums text-ink-900 transition',
          'placeholder:font-normal placeholder:text-amber-700/80 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          changed ? 'border-brand-300 bg-brand-50/60' : saved === null ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-card',
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">IQD</span>
    </label>
  );
}

/**
 * Model costs on their own page: what one piece of each model costs, typed
 * once for every order of it, and a cost for each order where no model was
 * written. Changes wait for Save; the back arrow warns about unsaved ones.
 */
export function ModelCostsPage() {
  const navigate = useNavigate();
  const { orders, profit, error, loading, reload, update } = useProfitData();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const s = useMemo(() => (orders && profit ? summarizeProfit(orders, profit, '', '') : null), [orders, profit]);
  const models = useMemo(() => s?.byModel.filter((r) => r.key) ?? [], [s]);
  const noModel = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => countsAsSale(o.status) && !modelKey(o.itemModel))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders],
  );

  const savedOf = (id: string): number | null => {
    if (!profit) return null;
    if (id.startsWith('m:')) return profit.models[id.slice(2)]?.cost ?? null;
    return profit.orderCosts[id.slice(2)] ?? null;
  };
  const valueOf = (id: string) => {
    if (id in drafts) return drafts[id];
    const saved = savedOf(id);
    return saved === null ? '' : iqd(saved);
  };
  const changes = Object.keys(drafts).filter((id) => parseIqd(drafts[id]) !== savedOf(id));
  const dirty = changes.length > 0;

  // Closing the tab with changes not saved asks first (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const setDraft = (id: string, value: string) => {
    setDrafts((d) => ({ ...d, [id]: value }));
    setLeaving(false);
  };

  /** The profit on one piece at the model's usual price, with what is typed now. */
  const unitOf = (row: ModelRow) => {
    const cost = parseIqd(valueOf(modelId(row.key)));
    if (cost === null || !row.avgPrice) return null;
    return { profit: row.avgPrice - cost, margin: (row.avgPrice - cost) / row.avgPrice };
  };

  const missing = models.filter((r) => r.cost === null);
  const losing = models.filter((r) => {
    const u = unitOf(r);
    return u !== null && u.profit < 0;
  });
  const q = modelKey(query);
  const text = query.trim().toLowerCase();
  const rows = (filter === 'missing' ? missing : filter === 'loss' ? losing : models).filter(
    (r) =>
      !text ||
      (q && r.key.includes(q)) ||
      r.category.toLowerCase().includes(text) ||
      r.spellings.some((sp) => sp.toLowerCase().includes(text)),
  );

  const allSales = models.reduce((sum, r) => sum + r.avgPrice * r.allOrders, 0);
  const coverage = allSales
    ? models.reduce((sum, r) => sum + (parseIqd(valueOf(modelId(r.key))) !== null ? r.avgPrice * r.allOrders : 0), 0) / allSales
    : 0;
  const withCost = models.filter((r) => parseIqd(valueOf(modelId(r.key))) !== null).length;

  async function save(thenBack = true) {
    if (!profit) return;
    setSaving(true);
    setSaveError(null);
    const store = getProfitStore();
    let done = 0;
    try {
      for (const id of changes) {
        const cost = parseIqd(drafts[id]);
        if (id.startsWith('m:')) {
          const key = id.slice(2);
          const label = models.find((r) => r.key === key)?.label ?? key;
          await store.setModelCost(key, label, cost);
          update((d) => {
            const next = { ...d.models };
            if (cost === null) delete next[key];
            else next[key] = { key, label, cost, updatedAt: new Date().toISOString() };
            return { ...d, models: next };
          });
        } else {
          const order = id.slice(2);
          await store.setOrderCost(order, cost);
          update((d) => {
            const next = { ...d.orderCosts };
            if (cost === null) delete next[order];
            else next[order] = cost;
            return { ...d, orderCosts: next };
          });
        }
        done += 1;
      }
      setDrafts({});
      if (thenBack) {
        setProfitNotice(`${done} ${done === 1 ? 'cost' : 'costs'} saved`);
        navigate(paths.profit);
      }
    } catch (err) {
      setSaveError(`${done ? `${done} saved, then: ` : ''}${profitErrorMessage(err)}`);
      setLeaving(false);
    } finally {
      setSaving(false);
    }
  }

  const goBack = () => {
    if (dirty) {
      setLeaving(true);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(paths.profit);
  };

  return (
    <AdminLayout>
      <div ref={topRef} className="scroll-mt-20 pb-28">
        <BackLink label="Back to profit" onClick={goBack} />

        {leaving && dirty && (
          <div className="mt-4">
            <LeaveNotice
              text={`${changes.length} ${changes.length === 1 ? 'change is' : 'changes are'} not saved`}
              saving={saving}
              onSave={() => void save(true)}
              onLeave={() => navigate(paths.profit)}
              onStay={() => setLeaving(false)}
            />
          </div>
        )}

        <div className="mt-5 grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <h1 className="text-3xl font-bold text-ink-900">Model costs</h1>
            <p className="mt-1 max-w-2xl text-ink-500">
              What one piece of each model costs you. Every order of that model uses it, however the seller spelled
              it — <span className="font-mono text-ink-700">V.502</span>, <span className="font-mono text-ink-700">v502</span> and{' '}
              <span className="font-mono text-ink-700">V-502</span> are one model. Press Enter to go to the next box.
            </p>
          </div>
          {s && (
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-ink-700">
                {withCost} of {models.length} models
              </span>
              <span className="text-2xl font-bold text-ink-900">{percent(coverage)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${coverage * 100}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-ink-400">of all sales on record have a cost</div>
          </Card>
          )}
        </div>

        {error ? (
          <div className="mt-6">
            <LoadProblem error={error} onRetry={() => void reload()} />
          </div>
        ) : loading || !s ? (
          <p className="py-16 text-center text-ink-400">Loading…</p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
                <button type="button" className={chip(filter === 'all')} onClick={() => setFilter('all')}>
                  All models <span className="text-ink-400">{models.length}</span>
                </button>
                <button type="button" className={chip(filter === 'missing')} onClick={() => setFilter('missing')}>
                  <span className="size-2 rounded-full bg-amber-400" /> No cost yet <span className="text-ink-400">{missing.length}</span>
                </button>
                <button type="button" className={chip(filter === 'loss')} onClick={() => setFilter('loss')}>
                  <span className="size-2 rounded-full bg-rose-500" /> Under cost <span className="text-ink-400">{losing.length}</span>
                </button>
              </div>
              <label className="relative w-full sm:w-72">
                <Search width={16} height={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-card pl-10 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  placeholder="Find a model or type…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>

            <Card className="mt-4 overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_5rem_7.5rem_11rem_8rem_7.5rem] items-center gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 md:grid">
                <span>Model</span>
                <span className="text-right">Sold</span>
                <span className="text-right">Usual price</span>
                <span>Cost of one</span>
                <span className="text-right">Profit a piece</span>
                <span>Margin</span>
              </div>
              {rows.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-ink-500">
                  {filter === 'missing' && !text
                    ? 'Every model has a cost.'
                    : filter === 'loss' && !text
                      ? 'No model is sold for less than it costs.'
                      : 'No model matches.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const id = modelId(r.key);
                    const u = unitOf(r);
                    const changed = id in drafts && parseIqd(drafts[id]) !== r.cost;
                    return (
                      <li
                        key={r.key}
                        className={cn(
                          'grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1.6fr)_5rem_7.5rem_11rem_8rem_7.5rem]',
                          changed && 'bg-brand-50/40',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono font-bold text-ink-900">{r.label}</span>
                            {changed && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Changed</span>}
                          </div>
                          <div className="flex min-w-0 items-center gap-1 text-xs text-ink-500">
                            <bdi className="truncate">{r.category || '—'}</bdi>
                            {r.spellings.length > 0 && (
                              <span className="truncate text-ink-400" title={`Also written ${r.spellings.join(', ')}`}>
                                · also {r.spellings.slice(0, 2).join(', ')}
                                {r.spellings.length > 2 && ` +${r.spellings.length - 2}`}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-400 md:hidden">
                            Sold {r.allOrders} · usually {iqd(r.avgPrice)} IQD
                          </div>
                        </div>
                        <div className="hidden text-right font-semibold tabular-nums text-ink-700 md:block">{r.allOrders}</div>
                        <div className="hidden text-right tabular-nums text-ink-700 md:block">{r.avgPrice ? iqd(r.avgPrice) : '—'}</div>
                        <CostBox label={`Cost of one ${r.label}`} value={valueOf(id)} saved={r.cost} onChange={(v) => setDraft(id, v)} />
                        <div className="col-span-2 flex items-center justify-between gap-3 text-sm md:col-span-1 md:block md:text-right">
                          <span className="text-xs text-ink-400 md:hidden">Profit a piece</span>
                          {u ? (
                            <b className={cn('tabular-nums', signTone(u.profit))}>{signedIqd(u.profit)}</b>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </div>
                        <div className="hidden items-center gap-2 md:flex">
                          {u ? (
                            <>
                              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                                <span
                                  className={cn('block h-full rounded-full', u.margin >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                                  style={{ width: `${Math.min(1, Math.abs(u.margin)) * 100}%` }}
                                />
                              </span>
                              <span className={cn('text-xs font-semibold tabular-nums', signTone(u.margin))}>{percent(u.margin)}</span>
                            </>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {noModel.length > 0 && <NoModelOrders orders={noModel} valueOf={(o) => valueOf(orderId(o.id))} savedOf={(o) => savedOf(orderId(o.id))} onChange={(o, v) => setDraft(orderId(o.id), v)} />}
          </>
        )}
      </div>

      {/* Save bar: always in reach at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-card/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {saveError ? (
              <span className="text-rose-700">{saveError}</span>
            ) : dirty ? (
              <span className="font-semibold text-ink-900">
                {changes.length} {changes.length === 1 ? 'change' : 'changes'} not saved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-500">
                <Check width={16} height={16} className="text-emerald-600" /> Everything is saved
              </span>
            )}
          </div>
          {dirty && (
            <Button variant="outline" onClick={() => setDrafts({})} disabled={saving}>
              Undo
            </Button>
          )}
          <Button loading={saving} disabled={!dirty} leftIcon={<Check />} onClick={() => void save(true)} className={cn(!dirty && 'opacity-60')}>
            {dirty ? `Save ${changes.length} ${changes.length === 1 ? 'cost' : 'costs'}` : 'Save'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}

/** Sales where the seller wrote no model: each needs a cost of its own. */
function NoModelOrders({
  orders,
  valueOf,
  savedOf,
  onChange,
}: {
  orders: SalesOrder[];
  valueOf: (o: SalesOrder) => string;
  savedOf: (o: SalesOrder) => number | null;
  onChange: (o: SalesOrder, value: string) => void;
}) {
  const [all, setAll] = useState(false);
  const waiting = orders.filter((o) => savedOf(o) === null).length;
  const shown = all ? orders : orders.slice(0, 10);
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <CardTitle
          icon={<Tag width={20} height={20} />}
          tone="bg-amber-50 text-amber-700"
          title="Orders with no model written"
          sub={waiting ? `${waiting} of ${orders.length} still need a cost of their own.` : `All ${orders.length} have a cost.`}
        />
      </div>
      <ul className="divide-y divide-slate-100">
        {shown.map((o) => {
          const cost = parseIqd(valueOf(o));
          return (
            <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_11rem_7rem] sm:px-5">
              <div className="min-w-0">
                <div className="text-xs text-ink-400">
                  <span className="font-mono">#{o.orderNo}</span> · {format(new Date(o.createdAt), 'd MMM yyyy')}
                </div>
                <div dir="auto" className="truncate text-left text-sm font-semibold text-ink-900">
                  {o.customerName}
                  {o.itemCategory && <span className="font-normal text-ink-500"> · {o.itemCategory}</span>}
                </div>
              </div>
              <div className="hidden text-right text-sm tabular-nums text-ink-700 sm:block">{iqd(o.totalPrice)}</div>
              <CostBox label={`Cost of order ${o.orderNo}`} value={valueOf(o)} saved={savedOf(o)} onChange={(v) => onChange(o, v)} />
              <div className="col-span-2 text-right text-sm sm:col-span-1">
                {cost !== null ? (
                  <b className={cn('tabular-nums', signTone(o.totalPrice - cost))}>{signedIqd(o.totalPrice - cost)}</b>
                ) : (
                  <span className="text-ink-400">—</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {orders.length > 10 && (
        <div className="border-t border-slate-100 px-5 py-3 text-center">
          <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${orders.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}
