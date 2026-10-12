import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Download, FileText, Pencil, Search, Sliders, Trash, X } from '@/components/icons';
import {
  GENDER_LABEL,
  PURCHASE_LABEL,
  SHIFT_LABEL,
  STATUS_LABEL,
  countsAsSale,
  formatIqd,
  formatIqdShort,
  purchaseText,
} from '@/services/orders/options';
import {
  EMPTY_FILTERS,
  PERIODS,
  activeFilterCount,
  describePeriod,
  filterOrders,
  orderDay,
  periodRange,
  sellerOf,
  summarize,
  type Breakdown,
  type OrderFilters,
  type PeriodId,
} from '@/services/orders/report';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { OrderStatus, SalesOrder } from '@/services/orders/types';
import { exportOrdersExcel } from '@/services/report/ordersExcel';
import { exportOrdersPdf } from '@/services/report/ordersPdf';
import { cn } from '@/utils/cn';
import { OrderEditModal } from './OrderEditModal';

const PAGE_SIZE = 25;

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'priceHigh', label: 'Highest price' },
  { id: 'priceLow', label: 'Lowest price' },
] as const;
type SortId = (typeof SORTS)[number]['id'];

/** Saved by the seller more than half a day after the order's own date. */
function addedLater(order: SalesOrder): boolean {
  return (
    order.source === 'app' &&
    !!order.enteredAt &&
    new Date(order.enteredAt).getTime() - new Date(order.createdAt).getTime() > 12 * 60 * 60 * 1000
  );
}

const STATUS_TONE: Record<OrderStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  new: 'info',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'warning',
};

const chip = (selected: boolean) =>
  cn(
    'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
    selected
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
  );

const selectClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: 'brand';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 sm:p-5',
        tone === 'brand' ? 'border-brand-100 bg-brand-50/70' : 'border-slate-200 bg-white',
      )}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums sm:text-3xl',
          tone === 'brand' ? 'text-brand-700' : 'text-ink-900',
        )}
      >
        {value}
        {unit && <span className="ml-1 text-sm font-semibold opacity-60">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
    </div>
  );
}

/** Rows of bars; clicking one filters the report by it. */
function BreakdownCard({
  title,
  items,
  label = (key) => key,
  colorOf,
  onPick,
  picked,
  limit = 6,
}: {
  title: string;
  items: Breakdown[];
  label?: (key: string) => string;
  colorOf?: (key: string) => string;
  onPick?: (key: string) => void;
  picked?: string;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...items.map((i) => i.orders));
  const shown = all ? items : items.slice(0, limit);
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400">orders · sales</span>
      </div>
      {shown.length === 0 ? (
        <p className="py-4 text-sm text-ink-400">No orders.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((item) => {
            const active = picked === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  disabled={!onPick || item.key === '—'}
                  onClick={() => onPick?.(active ? '' : item.key)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition',
                    onPick && 'hover:bg-slate-50',
                    active && 'bg-brand-50 ring-1 ring-brand-200',
                  )}
                  title={onPick ? (active ? 'Remove this filter' : 'Show only these orders') : undefined}
                >
                  <span dir="auto" className="truncate text-left font-medium text-ink-700">
                    {item.key === '—' ? 'Not set' : label(item.key)}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(item.orders / max) * 100}%`,
                        background: colorOf?.(item.key) ?? 'var(--color-brand-600)',
                      }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-right tabular-nums">
                    <b className="text-ink-900">{item.orders}</b>
                    <span className="ml-2 text-ink-400">{formatIqdShort(item.sales)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > limit && (
        <button type="button" className="mt-2 text-sm font-semibold text-brand-700" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  );
}

function TrendChart({
  summary,
  sellers,
  colorOf,
}: {
  summary: ReturnType<typeof summarize>;
  sellers: string[];
  colorOf: (seller: string) => string;
}) {
  const [measure, setMeasure] = useState<'orders' | 'sales'>('orders');
  const points = summary.trend;
  const max = Math.max(1, ...points.map((p) => p[measure]));
  const W = 720;
  const H = 150;
  const gap = points.length > 40 ? 1 : 3;
  const barW = points.length ? (W - gap * (points.length - 1)) / points.length : 0;
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));
  const best = points.reduce<(typeof points)[number] | null>(
    (top, p) => (!top || p[measure] > top[measure] ? p : top),
    null,
  );
  // Stack in the same order as the seller chips; names only on old rows last.
  const inChart = new Set(points.flatMap((p) => Object.keys(p.bySeller)));
  const stackOrder = [...sellers.filter((s) => inChart.has(s)), ...[...inChart].filter((s) => !sellers.includes(s))];

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink-900">Orders over time</h3>
          {best && best[measure] > 0 && (
            <p className="text-sm text-ink-500">
              Best {summary.trendUnit}: <b>{best.label}</b> —{' '}
              {measure === 'orders' ? `${best.orders} orders` : formatIqd(best.sales)}
            </p>
          )}
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(['orders', 'sales'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeasure(m)}
              className={cn('rounded-lg px-3 py-1.5', measure === m ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}
            >
              {m === 'orders' ? 'Orders' : 'Sales'}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">No orders in this period.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img" aria-label="Orders over time">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} stroke="currentColor" className="text-slate-100" />
            ))}
            {points.map((p, i) => {
              const x = i * (barW + gap);
              let top = H;
              const tip = [
                `${p.label}: ${p.orders} orders · ${formatIqd(p.sales)}`,
                ...stackOrder
                  .filter((s) => p.bySeller[s])
                  .map((s) => `${s}: ${p.bySeller[s].orders} · ${formatIqd(p.bySeller[s].sales)}`),
              ].join('\n');
              return (
                <g key={p.key}>
                  <title>{tip}</title>
                  {stackOrder.map((seller) => {
                    const value = p.bySeller[seller]?.[measure] ?? 0;
                    if (!value) return null;
                    const h = Math.max(2, (value / max) * (H - 8));
                    top -= h;
                    return (
                      <rect key={seller} x={x} y={top} width={Math.max(1, barW)} height={h} fill={colorOf(seller)} />
                    );
                  })}
                  {/* Hover target over the whole column. */}
                  <rect x={x} y={0} width={Math.max(1, barW)} height={H} fill="transparent" />
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H + 16} textAnchor="middle" className="fill-ink-400 text-[11px]">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {stackOrder.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-500">
              {stackOrder.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: colorOf(s) }} />
                  <span dir="auto">{s}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function OrdersReport({
  orders,
  sellers,
  colorOf,
  onChanged,
}: {
  orders: SalesOrder[];
  /** Every seller name, accounts first, for the seller chips. */
  sellers: string[];
  colorOf: (seller: string) => string;
  onChanged: () => void;
}) {
  const [period, setPeriod] = useState<PeriodId | 'custom'>('month');
  const [filters, setFilters] = useState<OrderFilters>(() => ({ ...EMPTY_FILTERS, ...periodRange('month') }));
  const [moreOpen, setMoreOpen] = useState(false);
  const [sort, setSort] = useState<SortId>('newest');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<SalesOrder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const update = (patch: Partial<OrderFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const pickPeriod = (id: PeriodId) => {
    setPeriod(id);
    update(periodRange(id));
  };

  const filtered = useMemo(() => filterOrders(orders, filters), [orders, filters]);
  const summary = useMemo(() => summarize(filtered, filters), [filtered, filters]);

  // Seller chips count orders in the period with every filter except seller.
  const sellerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of filterOrders(orders, { ...filters, sellers: [] })) {
      counts.set(sellerOf(o), (counts.get(sellerOf(o)) ?? 0) + 1);
    }
    return counts;
  }, [orders, filters]);

  const options = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      platforms: uniq(orders.map((o) => o.platform)),
      cities: uniq(orders.map((o) => o.city)),
      categories: uniq(orders.map((o) => o.itemCategory)),
    };
  }, [orders]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === 'oldest') list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else if (sort === 'priceHigh') list.sort((a, b) => b.totalPrice - a.totalPrice);
    else if (sort === 'priceLow') list.sort((a, b) => a.totalPrice - b.totalPrice);
    else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [filtered, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const days =
    filters.from && filters.to
      ? differenceInCalendarDays(
          parseISO(filters.to > format(new Date(), 'yyyy-MM-dd') ? format(new Date(), 'yyyy-MM-dd') : filters.to),
          parseISO(filters.from),
        ) + 1
      : summary.trendUnit === 'day'
        ? summary.trend.length
        : 0;

  const extraCount = activeFilterCount({ ...filters, sellers: [], query: '' });
  const pct = (n: number) => (summary.orders ? `${Math.round((n / summary.orders) * 100)}% of orders` : '—');

  const filterText = [
    filters.sellers.length ? `Sellers: ${filters.sellers.join(', ')}` : 'All sellers',
    filters.platform && `Platform: ${filters.platform}`,
    filters.city && `City: ${filters.city}`,
    filters.category && `Category: ${filters.category}`,
    filters.status && `Status: ${STATUS_LABEL[filters.status]}`,
    filters.shift && `Shift: ${SHIFT_LABEL[filters.shift].en}`,
    filters.purchase && `Customer: ${PURCHASE_LABEL[filters.purchase].en}`,
    filters.gender && `Gender: ${GENDER_LABEL[filters.gender].en}`,
    filters.query.trim() && `Search: “${filters.query.trim()}”`,
  ]
    .filter(Boolean)
    .join(' · ');

  const exportInput = () => ({
    orders: sorted,
    summary,
    period: describePeriod(filters),
    filterText,
  });

  async function changeStatus(order: SalesOrder, status: OrderStatus) {
    setBusyId(order.id);
    setActionError(null);
    try {
      await getOrdersStore().updateOrder(order.id, { status });
      onChanged();
    } catch (err) {
      setActionError(ordersErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(order: SalesOrder) {
    if (!window.confirm(`Delete order #${order.orderNo} (${order.customerName})? This cannot be undone.`)) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      await getOrdersStore().deleteOrder(order.id);
      onChanged();
    } catch (err) {
      setActionError(ordersErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const topSeller = summary.bySeller.length > 1 ? [...summary.bySeller].sort((a, b) => b.sales - a.sales)[0] : null;

  return (
    <div className="space-y-6">
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={chip(period === p.id)} onClick={() => pickPeriod(p.id)}>
              {p.label}
            </button>
          ))}
          <button type="button" className={chip(period === 'custom')} onClick={() => setPeriod('custom')}>
            Custom dates
          </button>
        </div>
        {period === 'custom' && (
          <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
            <label className="text-sm font-semibold text-ink-700">
              From
              <input
                type="date"
                className={cn(selectClass, 'mt-1')}
                value={filters.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label className="text-sm font-semibold text-ink-700">
              To
              <input
                type="date"
                className={cn(selectClass, 'mt-1')}
                value={filters.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Sellers</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(filters.sellers.length === 0)} onClick={() => update({ sellers: [] })}>
              All sellers
            </button>
            {sellers.map((name) => {
              const on = filters.sellers.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={chip(on)}
                  onClick={() =>
                    update({
                      sellers: on ? filters.sellers.filter((s) => s !== name) : [...filters.sellers, name],
                    })
                  }
                >
                  <span className="size-2.5 rounded-full" style={{ background: colorOf(name) }} />
                  <span dir="auto">{name}</span>
                  <span className="tabular-nums text-ink-400">{sellerCounts.get(name) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-64">
            <Search width={16} height={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className={cn(selectClass, 'pl-10')}
              placeholder="Search customer, phone, item, address or #order…"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </label>
          <Button
            variant={moreOpen || extraCount ? 'secondary' : 'outline'}
            leftIcon={<Sliders width={16} height={16} />}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More filters{extraCount ? ` (${extraCount})` : ''}
          </Button>
          {(activeFilterCount(filters) > 0) && (
            <Button
              variant="ghost"
              leftIcon={<X width={16} height={16} />}
              onClick={() => update({ ...EMPTY_FILTERS, from: filters.from, to: filters.to })}
            >
              Clear
            </Button>
          )}
        </div>

        {moreOpen && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select className={selectClass} value={filters.platform} onChange={(e) => update({ platform: e.target.value })}>
              <option value="">Every platform</option>
              {options.platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select className={selectClass} value={filters.city} onChange={(e) => update({ city: e.target.value })}>
              <option value="">Every city</option>
              {options.cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className={selectClass} value={filters.category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">Every category</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.status}
              onChange={(e) => update({ status: e.target.value as OrderFilters['status'] })}
            >
              <option value="">Every status</option>
              {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.shift}
              onChange={(e) => update({ shift: e.target.value as OrderFilters['shift'] })}
            >
              <option value="">Every shift</option>
              {(Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((s) => (
                <option key={s} value={s}>{SHIFT_LABEL[s].en} ({SHIFT_LABEL[s].hours})</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.purchase}
              onChange={(e) => update({ purchase: e.target.value as OrderFilters['purchase'] })}
            >
              <option value="">New and returning customers</option>
              {(Object.keys(PURCHASE_LABEL) as (keyof typeof PURCHASE_LABEL)[]).map((p) => (
                <option key={p} value={p}>{PURCHASE_LABEL[p].en}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.gender}
              onChange={(e) => update({ gender: e.target.value as OrderFilters['gender'] })}
            >
              <option value="">Every gender</option>
              {(Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map((g) => (
                <option key={g} value={g}>{GENDER_LABEL[g].en}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* ── Totals ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{describePeriod(filters)}</h2>
          <p className="text-sm text-ink-500">{filterText}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            leftIcon={<FileText width={16} height={16} />}
            onClick={() =>
              exportOrdersPdf({ ...exportInput(), sellerColors: new Map(sellers.map((s) => [s, colorOf(s)])) })
            }
          >
            PDF
          </Button>
          <Button variant="outline" leftIcon={<Download width={16} height={16} />} onClick={() => exportOrdersExcel(exportInput())}>
            Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label="Orders"
          value={summary.orders.toLocaleString('en-US')}
          sub={days > 1 ? `${(summary.orders / days).toFixed(1)} a day` : undefined}
        />
        <Kpi
          label="Sales"
          tone="brand"
          value={Math.round(summary.sales).toLocaleString('en-US')}
          unit="IQD"
          sub={`from ${summary.saleOrders} sales`}
        />
        <Kpi label="Average order" value={Math.round(summary.average).toLocaleString('en-US')} unit="IQD" />
        <Kpi label="Delivered" value={String(summary.byStatus.delivered)} sub={pct(summary.byStatus.delivered)} />
        <Kpi
          label="Cancelled · returned"
          value={String(summary.byStatus.cancelled + summary.byStatus.returned)}
          sub={pct(summary.byStatus.cancelled + summary.byStatus.returned)}
        />
        <Kpi
          label="Ordered again"
          value={String(summary.returningCustomers)}
          sub={`of ${summary.customers} customers`}
        />
      </div>

      {/* ── Seller comparison ───────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-ink-900">Sellers</h3>
          <span className="text-xs text-ink-400">Share of sales · cancelled and returned not counted</span>
        </div>
        {summary.bySeller.length === 0 ? (
          <p className="py-4 text-sm text-ink-400">No orders in this period.</p>
        ) : (
          <>
            <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
              {summary.bySeller.map((s) => (
                <div
                  key={s.key}
                  title={`${s.key}: ${formatIqd(s.sales)}`}
                  style={{
                    width: `${summary.sales ? (s.sales / summary.sales) * 100 : 100 / summary.bySeller.length}%`,
                    background: colorOf(s.key),
                  }}
                />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summary.bySeller.map((s) => {
                const share = summary.sales ? Math.round((s.sales / summary.sales) * 100) : 0;
                const on = filters.sellers.length === 1 && filters.sellers[0] === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => update({ sellers: on ? [] : [s.key] })}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition hover:border-slate-300',
                      on ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="grid size-9 place-items-center rounded-full text-sm font-bold text-white"
                        style={{ background: colorOf(s.key) }}
                      >
                        {s.key.trim().charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div dir="auto" className="truncate font-bold text-ink-900">{s.key}</div>
                        <div className="text-xs text-ink-400">{share}% of sales</div>
                      </div>
                      {topSeller?.key === s.key && <Badge tone="success">Top seller</Badge>}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-ink-400">Orders</div>
                        <div className="font-bold tabular-nums">{s.orders}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-400">Sales</div>
                        <div className="font-bold tabular-nums">{formatIqdShort(s.sales)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-400">Per order</div>
                        <div className="font-bold tabular-nums">{formatIqdShort(s.orders ? s.sales / s.orders : 0)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <TrendChart summary={summary} sellers={sellers} colorOf={colorOf} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="Platform"
          items={summary.byPlatform}
          picked={filters.platform}
          onPick={(platform) => update({ platform })}
        />
        <BreakdownCard title="City" items={summary.byCity} picked={filters.city} onPick={(city) => update({ city })} />
        <BreakdownCard
          title="Category"
          items={summary.byCategory}
          picked={filters.category}
          onPick={(category) => update({ category })}
        />
        <BreakdownCard
          title="Shift"
          items={summary.byShift}
          label={(key) => (key in SHIFT_LABEL ? `${SHIFT_LABEL[key as keyof typeof SHIFT_LABEL].en} ${SHIFT_LABEL[key as keyof typeof SHIFT_LABEL].hours}` : key)}
          picked={filters.shift}
          onPick={(shift) => update({ shift: shift as OrderFilters['shift'] })}
        />
      </div>

      {/* ── Orders ──────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="font-bold text-ink-900">
            Orders <span className="font-normal text-ink-400">({sorted.length})</span>
          </h3>
          <select className={cn(selectClass, 'w-auto')} value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        {actionError && <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{actionError}</p>}
        {pageRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-500">No orders match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Seller</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">City</th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((o) => (
                  <tr
                    key={o.id}
                    className={cn('border-b border-slate-100 align-top last:border-0', !countsAsSale(o.status) && 'bg-slate-50/60 text-ink-400')}
                  >
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-mono text-xs text-ink-400">#{o.orderNo}</div>
                      <div className="font-medium">{format(new Date(o.createdAt), 'd MMM yyyy')}</div>
                      <div className="text-xs text-ink-400">{format(new Date(o.createdAt), 'hh:mm a')}</div>
                      {(o.editedAt || addedLater(o)) && (
                        <div className="mt-1 flex flex-col items-start gap-1">
                          {o.editedAt && (
                            <span title={`The seller changed this order on ${format(new Date(o.editedAt), 'd MMM yyyy, hh:mm a')}`}>
                              <Badge tone="warning">Edited</Badge>
                            </span>
                          )}
                          {addedLater(o) && (
                            <span title={`Saved on ${format(new Date(o.enteredAt as string), 'd MMM yyyy, hh:mm a')}`}>
                              <Badge tone="note">Added later</Badge>
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: colorOf(sellerOf(o)) }} />
                      <span dir="auto">{sellerOf(o)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div dir="auto" className="font-semibold text-ink-900">{o.customerName}</div>
                      <div className="font-mono text-xs text-ink-500">
                        {o.customerPhone}
                        {o.secondPhone && ` · ${o.secondPhone}`}
                      </div>
                      {((o.purchaseCount ?? 0) > 1 || (!o.purchaseCount && o.purchase && o.purchase !== 'first')) && (
                        <Badge tone="note" className="mt-1 whitespace-nowrap">
                          {purchaseText(o.purchaseCount, o.purchase)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div dir="auto">{o.city}</div>
                      <div dir="auto" className="max-w-[14rem] truncate text-xs text-ink-400" title={o.address}>
                        {o.address}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-xs font-semibold">{o.itemModel}</div>
                      <div dir="auto" className="text-ink-700">{o.itemCategory}</div>
                      {o.note && (
                        <div dir="auto" className="mt-0.5 max-w-[14rem] truncate text-xs text-ink-400" title={o.note}>
                          {o.note}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className={cn('font-bold tabular-nums', !countsAsSale(o.status) && 'line-through')}>
                        {formatIqd(o.totalPrice)}
                      </div>
                      <div className="text-xs text-ink-400">{o.platform || '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label={`Status of order ${o.orderNo}`}
                        disabled={busyId === o.id}
                        value={o.status}
                        onChange={(e) => void changeStatus(o, e.target.value as OrderStatus)}
                        className={cn(
                          'rounded-full border-0 py-1 pl-3 pr-7 text-xs font-semibold focus:ring-2 focus:ring-brand-500/40',
                          {
                            info: 'bg-brand-50 text-brand-700',
                            success: 'bg-emerald-50 text-emerald-700',
                            danger: 'bg-rose-50 text-rose-700',
                            warning: 'bg-amber-50 text-amber-700',
                          }[STATUS_TONE[o.status]],
                        )}
                      >
                        {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
                        style={{ display: 'inline-grid' }}
                        title="Edit order"
                        onClick={() => setEditing(o)}
                      >
                        <Pencil width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        className="ml-1 grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                        style={{ display: 'inline-grid' }}
                        title="Delete order"
                        disabled={busyId === o.id}
                        onClick={() => void remove(o)}
                      >
                        <Trash width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-brand-50/60 font-bold">
                  <td className="px-3 py-3" colSpan={5}>
                    Total · {summary.saleOrders} sales of {summary.orders} orders
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-brand-700">{formatIqd(summary.sales)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm">
            <span className="text-ink-500">
              {page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of {sorted.length}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-sm text-ink-400">
        Days are counted in this computer’s time zone. First day of the week is Saturday.
        {orders.length > 0 && ` Orders on record: ${orders.length}, the first on ${format(new Date(orders.map(orderDay).sort()[0]), 'd MMM yyyy')}.`}
      </p>

      <OrderEditModal
        order={editing}
        sellers={sellers}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}
