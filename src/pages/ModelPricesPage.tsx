import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, Search, Tag } from '@/components/icons';
import { BackLink, CardTitle, LeaveNotice, LoadProblem, iqd, percent, signTone, signedIqd } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { CATEGORIES, countsAsSale } from '@/services/orders/options';
import { modelKey, modelWith, parseIqd, summarizeProfit } from '@/services/orders/profit';
import { catalogItems } from '@/services/orders/products';
import { setProfitNotice } from '@/services/orders/profitMemory';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import type { SalesOrder } from '@/services/orders/types';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

type Filter = 'all' | 'onSale' | 'noPrice' | 'noCost' | 'sold';
const PAGE = 30;

/** One model on the page: what is saved, and what the catalogue and the orders say about it. */
interface Row {
  key: string;
  label: string;
  name: string;
  image: string;
  /** Sales of it on record, and its usual price for one piece. */
  sold: number;
  avgPrice: number;
  /** The type its orders use most, else the catalogue's. */
  suggestType: string;
  price: number | null;
  cost: number | null;
  category: string;
  active: boolean;
}

interface Draft {
  price?: string;
  cost?: string;
  category?: string;
  active?: boolean;
}

const segment = (on: boolean) =>
  cn(
    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition',
    on ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
  );

/** Enter moves on to the next money box on the page. */
function nextBox(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const boxes = [...document.querySelectorAll<HTMLInputElement>('input[data-money-box]')];
  const next = boxes[boxes.indexOf(e.currentTarget) + 1];
  if (next) next.focus();
  else e.currentTarget.blur();
}

/** An IQD box. Typing only changes the page; nothing is saved until Save. */
function MoneyBox({
  label,
  value,
  saved,
  placeholder,
  tone = 'amber',
  onChange,
}: {
  label: string;
  value: string;
  saved: number | null;
  placeholder: string;
  tone?: 'amber' | 'plain';
  onChange: (value: string) => void;
}) {
  const changed = parseIqd(value) !== saved;
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <input
        data-money-box
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={(e) => e.target.select()}
        onKeyDown={nextBox}
        onChange={(e) => {
          const n = parseIqd(e.target.value);
          onChange(n === null ? '' : iqd(n));
        }}
        className={cn(
          'h-11 w-full rounded-xl border pl-3 pr-11 text-right font-semibold tabular-nums text-ink-900 transition',
          'placeholder:font-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          changed
            ? 'border-brand-300 bg-brand-50/60'
            : saved === null && tone === 'amber'
              ? 'border-amber-200 bg-amber-50/50 placeholder:text-amber-700/80'
              : 'border-slate-200 bg-card placeholder:text-ink-400',
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-semibold text-ink-400">IQD</span>
    </label>
  );
}

/** On / off: whether sellers can pick the model on their order form. */
function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40',
        on ? 'bg-[#059669]' : 'bg-slate-300',
      )}
    >
      <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', on ? 'left-6' : 'left-1')} />
    </button>
  );
}

/** A product photo on white (as the catalogue shoots them), or the model's first letters. */
function Photo({ src, label, className }: { src: string; label: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white', className)}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain p-1" />
      ) : (
        <span className="font-mono text-xs font-bold text-slate-400">{label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}</span>
      )}
    </span>
  );
}

/**
 * Every model's sale price and cost on one page. The sale price is what
 * sellers' orders take when they pick the model; the cost is what each piece
 * costs Vio. Both are typed once here, and every order works out its own
 * price and profit from them. Changes wait for Save.
 */
export function ModelPricesPage() {
  const navigate = useNavigate();
  const { orders, profit, error, loading, reload, update } = useProfitData();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Every model there is: the catalogue's, any sellers wrote, any already priced.
  const rows = useMemo<Row[]>(() => {
    if (!orders || !profit) return [];
    const s = summarizeProfit(orders, profit, '', '');
    const map = new Map<string, Row>();
    const categoryUse = new Map<string, Map<string, number>>();
    for (const o of orders) {
      const key = modelKey(o.itemModel);
      if (!key || !o.itemCategory.trim()) continue;
      const use = categoryUse.get(key) ?? new Map<string, number>();
      use.set(o.itemCategory.trim(), (use.get(o.itemCategory.trim()) ?? 0) + 1);
      categoryUse.set(key, use);
    }
    const topType = (key: string) => [...(categoryUse.get(key)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const base = (key: string, label: string): Row => {
      const saved = profit.models[key];
      return {
        key,
        label: saved?.label || label,
        name: '',
        image: '',
        sold: 0,
        avgPrice: 0,
        suggestType: topType(key),
        price: saved?.price ?? null,
        cost: saved?.cost ?? null,
        category: saved?.category ?? '',
        active: saved?.active ?? true,
      };
    };
    for (const item of catalogItems()) {
      const row = base(item.key, item.model);
      row.name = item.name;
      row.image = item.image;
      row.suggestType = row.suggestType || item.typeKu || item.group;
      map.set(item.key, row);
    }
    for (const m of s.byModel) {
      if (!m.key) continue;
      const row = map.get(m.key) ?? base(m.key, m.label);
      row.sold = m.allOrders;
      row.avgPrice = m.avgPrice;
      if (!profit.models[m.key]) row.label = map.has(m.key) ? row.label : m.label;
      map.set(m.key, row);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.sold - a.sold ||
        Number(b.price !== null) - Number(a.price !== null) ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  }, [orders, profit]);

  const noModel = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => countsAsSale(o.status) && !modelKey(o.itemModel))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders],
  );

  // What each box shows: the draft while typing, else what is saved.
  const priceText = (r: Row) => drafts[r.key]?.price ?? (r.price === null ? '' : iqd(r.price));
  const costText = (r: Row) => drafts[r.key]?.cost ?? (r.cost === null ? '' : iqd(r.cost));
  const typeOf = (r: Row) => drafts[r.key]?.category ?? r.category;
  const activeOf = (r: Row) => drafts[r.key]?.active ?? r.active;
  const rowChanged = (r: Row) =>
    !!drafts[r.key] &&
    (parseIqd(priceText(r)) !== r.price ||
      parseIqd(costText(r)) !== r.cost ||
      typeOf(r).trim() !== r.category.trim() ||
      activeOf(r) !== r.active);
  const orderSaved = (o: SalesOrder) => profit?.orderCosts[o.id] ?? null;
  const orderText = (o: SalesOrder) => orderDrafts[o.id] ?? (orderSaved(o) === null ? '' : iqd(orderSaved(o) as number));

  const changedRows = rows.filter(rowChanged);
  const changedOrders = noModel.filter((o) => o.id in orderDrafts && parseIqd(orderDrafts[o.id]) !== orderSaved(o));
  const changes = changedRows.length + changedOrders.length;
  const dirty = changes > 0;

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

  const edit = (key: string, patch: Draft) => {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    setLeaving(false);
    setSaveError(null);
  };

  const counts = {
    all: rows.length,
    onSale: rows.filter((r) => r.price !== null && r.price > 0 && r.active).length,
    noPrice: rows.filter((r) => r.price === null).length,
    noCost: rows.filter((r) => r.cost === null).length,
    sold: rows.filter((r) => r.sold > 0).length,
  };
  const q = modelKey(query);
  const text = query.trim().toLowerCase();
  const shownAll = rows
    .filter((r) =>
      filter === 'onSale'
        ? r.price !== null && r.price > 0 && r.active
        : filter === 'noPrice'
          ? r.price === null
          : filter === 'noCost'
            ? r.cost === null
            : filter === 'sold'
              ? r.sold > 0
              : true,
    )
    .filter(
      (r) =>
        !text ||
        (q && r.key.includes(q)) ||
        r.name.toLowerCase().includes(text) ||
        typeOf(r).toLowerCase().includes(text) ||
        r.suggestType.toLowerCase().includes(text),
    );
  const shown = shownAll.slice(0, limit);
  const types = useMemo(
    () => [...new Set([...CATEGORIES, ...rows.map((r) => r.category).filter(Boolean)])],
    [rows],
  );

  async function save() {
    if (!profit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const list = changedRows.map((r) => {
        const price = parseIqd(priceText(r));
        return modelWith(profit, r.key, r.label, {
          price,
          cost: parseIqd(costText(r)),
          // A model given a price gets a type too, so its orders group in the report.
          category: typeOf(r).trim() || (price !== null ? r.suggestType : ''),
          active: activeOf(r),
        });
      });
      const store = getProfitStore();
      if (list.length) await store.saveModels(list);
      for (const o of changedOrders) await store.setOrderCost(o.id, parseIqd(orderDrafts[o.id]));
      update((d) => {
        const models = { ...d.models };
        const now = new Date().toISOString();
        for (const m of list) models[m.key] = { ...m, updatedAt: now };
        const orderCosts = { ...d.orderCosts };
        for (const o of changedOrders) {
          const cost = parseIqd(orderDrafts[o.id]);
          if (cost === null) delete orderCosts[o.id];
          else orderCosts[o.id] = cost;
        }
        return { ...d, models, orderCosts };
      });
      setDrafts({});
      setOrderDrafts({});
      setProfitNotice(`${changes} ${changes === 1 ? 'change' : 'changes'} saved to models and prices`);
      navigate(paths.profit);
    } catch (err) {
      setSaveError(profitErrorMessage(err));
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

  const FILTERS: { id: Filter; label: string; dot?: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'sold', label: 'Sold before' },
    { id: 'onSale', label: 'On sellers’ list', dot: 'bg-emerald-500' },
    { id: 'noPrice', label: 'No price', dot: 'bg-amber-400' },
    { id: 'noCost', label: 'No cost', dot: 'bg-slate-400' },
  ];

  return (
    <AdminLayout>
      <div ref={topRef} className="scroll-mt-20 pb-28">
        <BackLink label="Back to profit" onClick={goBack} />

        {leaving && dirty && (
          <div className="mt-4">
            <LeaveNotice
              text={`${changes} ${changes === 1 ? 'change is' : 'changes are'} not saved`}
              saving={saving}
              onSave={() => void save()}
              onLeave={() => navigate(paths.profit)}
              onStay={() => setLeaving(false)}
            />
          </div>
        )}

        <div className="mt-5">
          <h1 className="text-3xl font-bold text-ink-900">Models &amp; prices</h1>
          <p className="mt-1 max-w-3xl text-ink-500">
            Write each model’s <b className="text-ink-700">sale price</b> and <b className="text-ink-700">cost</b> once.
            Sellers search the model on their order form and the price fills in by itself; every order then works out
            its own profit.
          </p>
        </div>

        {error ? (
          <div className="mt-6">
            <LoadProblem error={error} onRetry={() => void reload()} />
          </div>
        ) : loading || !profit ? (
          <p className="py-16 text-center text-ink-400">Loading…</p>
        ) : (
          <>
            {/* Three numbers: how far along the list is. */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { label: 'On sellers’ list', value: counts.onSale, total: rows.length, bar: 'bg-emerald-500' },
                { label: 'Have a price', value: rows.length - counts.noPrice, total: rows.length, bar: 'bg-brand-600' },
                { label: 'Have a cost', value: rows.length - counts.noCost, total: rows.length, bar: 'bg-slate-400' },
              ].map((stat) => (
                <Card key={stat.label} className="p-3.5 sm:p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400 sm:text-xs">{stat.label}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-ink-900">{stat.value}</span>
                    <span className="text-sm text-ink-400">/ {stat.total}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', stat.bar)} style={{ width: `${stat.total ? (stat.value / stat.total) * 100 : 0}%` }} />
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={segment(filter === f.id)}
                    onClick={() => {
                      setFilter(f.id);
                      setLimit(PAGE);
                    }}
                  >
                    {f.dot && <span className={cn('size-2 rounded-full', f.dot)} />}
                    {f.label} <span className="text-ink-400">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <label className="relative w-full sm:w-72">
                <Search width={16} height={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-card pl-10 pr-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  placeholder="Model number, name or type…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(PAGE);
                  }}
                />
              </label>
            </div>

            <datalist id="model-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            <Card className="mt-4 overflow-hidden">
              <div className="hidden grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_8.5rem_8.5rem_7rem_4.5rem] items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink-400 lg:grid">
                <span />
                <span>Model</span>
                <span>Type</span>
                <span>Sale price</span>
                <span>Cost</span>
                <span className="text-right">Profit a piece</span>
                <span className="text-center">On list</span>
              </div>
              {shown.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-ink-500">No model matches.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {shown.map((r) => {
                    const price = parseIqd(priceText(r));
                    const cost = parseIqd(costText(r));
                    const unit = price !== null && cost !== null ? price - cost : null;
                    const changed = rowChanged(r);
                    const on = activeOf(r);
                    return (
                      <li
                        key={r.key}
                        className={cn(
                          'grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 px-4 py-3.5 sm:px-5 lg:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_8.5rem_8.5rem_7rem_4.5rem]',
                          changed && 'bg-brand-50/40',
                        )}
                      >
                        <Photo src={r.image} label={r.label} className="size-14" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-mono font-bold text-ink-900">{r.label}</span>
                            {changed && (
                              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Changed</span>
                            )}
                          </div>
                          <div className="truncate text-xs text-ink-500">{r.name || 'Not in the catalogue'}</div>
                          <div className="text-xs text-ink-400">
                            {r.sold ? `Sold ${r.sold} · usually ${iqd(r.avgPrice)}` : 'Not sold yet'}
                          </div>
                        </div>
                        {/* Phones: the switch beside the name; wide screens: its own column. */}
                        <div className="flex items-center justify-end lg:order-last lg:justify-center">
                          <span title={price === null ? 'Give it a sale price first' : undefined}>
                            <Switch
                              on={on && price !== null}
                              disabled={price === null}
                              label={`${r.label} on the sellers’ list`}
                              onChange={(next) => edit(r.key, { active: next })}
                            />
                          </span>
                        </div>
                        <label className="col-span-3 block min-w-0 lg:col-span-1">
                          <span className="sr-only">Type of {r.label}</span>
                          <input
                            list="model-types"
                            dir="auto"
                            placeholder={r.suggestType || 'Type'}
                            value={typeOf(r)}
                            onChange={(e) => edit(r.key, { category: e.target.value })}
                            className={cn(
                              'h-11 w-full rounded-xl border bg-card px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
                              typeOf(r).trim() !== r.category.trim() ? 'border-brand-300' : 'border-slate-200',
                            )}
                          />
                        </label>
                        <div className="col-span-3 grid grid-cols-2 gap-2.5 lg:contents">
                          <div>
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-400 lg:hidden">Sale price</span>
                            <MoneyBox
                              label={`Sale price of ${r.label}`}
                              placeholder="Price"
                              value={priceText(r)}
                              saved={r.price}
                              onChange={(v) => edit(r.key, { price: v })}
                            />
                          </div>
                          <div>
                            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-400 lg:hidden">Cost</span>
                            <MoneyBox
                              label={`Cost of ${r.label}`}
                              placeholder="Cost"
                              tone="plain"
                              value={costText(r)}
                              saved={r.cost}
                              onChange={(v) => edit(r.key, { cost: v })}
                            />
                          </div>
                        </div>
                        <div className="col-span-3 flex items-center justify-between text-sm lg:col-span-1 lg:block lg:text-right">
                          <span className="text-xs text-ink-400 lg:hidden">Profit a piece</span>
                          {unit !== null ? (
                            <span>
                              <b className={cn('tabular-nums', signTone(unit))}>{signedIqd(unit)}</b>
                              <span className="ml-1.5 text-xs text-ink-400 lg:ml-0 lg:block">{percent(price ? unit / price : null)}</span>
                            </span>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {shownAll.length > limit && (
                <div className="border-t border-slate-100 px-5 py-3 text-center">
                  <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more · {shownAll.length - limit} left
                  </button>
                </div>
              )}
            </Card>

            {noModel.length > 0 && (
              <NoModelOrders
                orders={noModel}
                valueOf={orderText}
                savedOf={orderSaved}
                onChange={(o, v) => {
                  setOrderDrafts((d) => ({ ...d, [o.id]: v }));
                  setLeaving(false);
                }}
              />
            )}
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
                {changes} {changes === 1 ? 'change' : 'changes'} not saved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-ink-500">
                <Check width={16} height={16} className="text-emerald-600" /> Everything is saved
              </span>
            )}
          </div>
          {dirty && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDrafts({});
                setOrderDrafts({});
              }}
            >
              Undo
            </Button>
          )}
          <Button loading={saving} disabled={!dirty} leftIcon={<Check />} onClick={() => void save()} className={cn(!dirty && 'opacity-60')}>
            {dirty ? `Save ${changes} ${changes === 1 ? 'change' : 'changes'}` : 'Save'}
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
  const shown = all ? orders : orders.slice(0, 8);
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
            <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_10rem_7rem] sm:px-5">
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
              <MoneyBox label={`Cost of order ${o.orderNo}`} placeholder="Set cost" value={valueOf(o)} saved={savedOf(o)} onChange={(v) => onChange(o, v)} />
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
      {orders.length > 8 && (
        <div className="border-t border-slate-100 px-5 py-3 text-center">
          <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${orders.length}`}
          </button>
        </div>
      )}
    </Card>
  );
}
