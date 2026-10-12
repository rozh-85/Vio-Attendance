import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle, ChevronDown, ChevronUp, Download, FileText, Pencil, Search, Trash, X } from '@/components/icons';
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
  FACETS,
  PERIODS,
  activeFilterCount,
  describePeriod,
  filterOrders,
  orderDay,
  periodRange,
  sellerOf,
  summarize,
  type Breakdown,
  type Facet,
  type OrderFilters,
  type PeriodId,
} from '@/services/orders/report';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { OrderStatus, SalesOrder } from '@/services/orders/types';
import { exportOrdersExcel } from '@/services/report/ordersExcel';
import { exportOrdersPdf } from '@/services/report/ordersPdf';
import { cn } from '@/utils/cn';
import { clearReportReturn, readReportMemory, writeReportMemory } from '@/services/orders/reportMemory';
import { paths } from '@/routes';
import { MultiSelect, type MultiSelectOption } from './MultiSelect';

const PAGE_SIZES = [25, 50, 100] as const;

/** Orders table or charts, as last picked in this browser; the table the first time. */
const VIEW_KEY = 'vio.ordersReport.view';
type ReportView = 'table' | 'charts';

function loadView(): ReportView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'charts' ? 'charts' : 'table';
  } catch {
    return 'table';
  }
}

type SortKey = 'date' | 'seller' | 'customer' | 'city' | 'price' | 'status';
const STATUS_ORDER: Record<OrderStatus, number> = { new: 0, delivered: 1, returned: 2, cancelled: 3 };

/** A column heading that sorts the table; a second click turns the order round. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = active && sort.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={cn('px-3 py-3', className)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-ink-700',
          active && 'text-ink-900',
        )}
      >
        {label}
        <Arrow width={13} height={13} className={active ? '' : 'opacity-30'} />
      </button>
    </th>
  );
}

/**
 * The report always opens on all time, so every order is in view. (It used
 * to reopen on the last period picked, and a remembered "Today" with no
 * orders yet looked like the data was gone.) The one-off key that stored it
 * is removed.
 */
try {
  localStorage.removeItem('vio.ordersReport.period');
} catch {
  // Nothing to remove.
}

/** Saved more than half a day after the order's own date (by a seller, or a dated note on the old sheet). */
function addedLater(order: SalesOrder): boolean {
  return (
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
    'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition',
    selected
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
  );

const selectClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/** One labelled row of the filter panel; the label sits on the left on wide screens. */
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-4 md:flex-row md:gap-5">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-400 md:w-16 md:shrink-0 md:pt-2.5">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: 'brand';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border p-4 sm:p-5',
        tone === 'brand' ? 'border-brand-100 bg-brand-50/70' : 'border-slate-200 bg-white',
        className,
      )}
    >
      <div className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</div>
      {/* Long amounts drop the unit to the next line rather than spill out. */}
      <div
        className={cn(
          'mt-1 flex flex-wrap items-baseline gap-x-1 text-2xl font-bold tabular-nums [overflow-wrap:anywhere] sm:text-3xl lg:text-2xl xl:text-3xl',
          tone === 'brand' ? 'text-brand-700' : 'text-ink-900',
        )}
      >
        <span className="min-w-0">{value}</span>
        {unit && <span className="text-sm font-semibold opacity-60">{unit}</span>}
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
  picked?: string[];
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
            const active = !!picked?.includes(item.key);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  disabled={!onPick || item.key === '—'}
                  onClick={() => onPick?.(item.key)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition',
                    onPick && 'hover:bg-slate-50',
                    active && 'bg-brand-50 ring-1 ring-brand-200',
                  )}
                  title={onPick ? (active ? 'Remove from the filter' : 'Add to the filter') : undefined}
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
  // Coming back from an order's page restores where the owner was; a fresh
  // load (or refresh) starts on all time.
  const [memory] = useState(readReportMemory);
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodId | 'custom'>(memory?.period ?? 'all');
  const [filters, setFilters] = useState<OrderFilters>(
    () => memory?.filters ?? { ...EMPTY_FILTERS, ...periodRange('all') },
  );
  const [view, setView] = useState<ReportView>(() => memory?.view ?? loadView());
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(memory?.sort ?? { key: 'date', dir: 'desc' });
  const [pageSize, setPageSize] = useState<number>(memory?.pageSize ?? PAGE_SIZES[0]);
  const [page, setPage] = useState(memory?.page ?? 0);
  const [highlight, setHighlight] = useState<string | null>(memory?.highlightId ?? null);
  const [notice, setNotice] = useState<string | null>(memory?.notice ?? null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const update = (patch: Partial<OrderFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  // Back from an order's page: same scroll position; the highlight and the
  // "saved" note show once, then fade.
  useEffect(() => {
    if (memory?.scrollY) requestAnimationFrame(() => window.scrollTo(0, memory.scrollY));
    clearReportReturn();
  }, [memory]);
  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 4000);
    return () => window.clearTimeout(timer);
  }, [highlight]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    writeReportMemory({
      period,
      filters,
      view,
      sort,
      pageSize,
      page,
      scrollY: 0,
      highlightId: null,
      notice: null,
    });
  }, [period, filters, view, sort, pageSize, page]);

  /** Opens an order on its own page, remembering where the report was. */
  const openOrder = (o: SalesOrder) => {
    writeReportMemory({
      period,
      filters,
      view,
      sort,
      pageSize,
      page,
      scrollY: window.scrollY,
      highlightId: null,
      notice: null,
    });
    navigate(paths.socialOrder(o.id));
  };

  const pickPeriod = (id: PeriodId) => {
    setPeriod(id);
    update(periodRange(id));
  };

  const filtered = useMemo(() => filterOrders(orders, filters), [orders, filters]);
  const latestOrderAt = useMemo(
    () => orders.reduce((latest, o) => (o.createdAt > latest ? o.createdAt : latest), orders[0]?.createdAt ?? ''),
    [orders],
  );
  const summary = useMemo(() => summarize(filtered, filters), [filtered, filters]);

  // Seller chips count orders in the period with every filter except seller.
  const sellerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of filterOrders(orders, { ...filters, sellers: [] })) {
      counts.set(sellerOf(o), (counts.get(sellerOf(o)) ?? 0) + 1);
    }
    return counts;
  }, [orders, filters]);

  // Platforms, cities and categories that appear in any order, most used first.
  const options = useMemo(() => {
    const byUse = (values: string[]): MultiSelectOption[] => {
      const counts = new Map<string, number>();
      for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value]) => ({ value, label: value }));
    };
    const fixed = <K extends string>(labels: Record<K, string>): MultiSelectOption[] =>
      (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
    return {
      platforms: byUse(orders.map((o) => o.platform)),
      cities: byUse(orders.map((o) => o.city)),
      categories: byUse(orders.map((o) => o.itemCategory)),
      statuses: fixed(STATUS_LABEL),
      shifts: (Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((value) => ({
        value,
        label: `${SHIFT_LABEL[value].en} (${SHIFT_LABEL[value].hours})`,
      })),
      purchases: (Object.keys(PURCHASE_LABEL) as (keyof typeof PURCHASE_LABEL)[]).map((value) => ({
        value,
        label: PURCHASE_LABEL[value].en,
      })),
      genders: (Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map((value) => ({
        value,
        label: GENDER_LABEL[value].en,
      })),
    } satisfies Record<Facet, MultiSelectOption[]>;
  }, [orders]);

  // How many orders each value would show, with every other filter applied.
  const facetCounts = useMemo(() => {
    const result = {} as Record<Facet, Map<string, number>>;
    for (const facet of Object.keys(FACETS) as Facet[]) {
      const counts = new Map<string, number>();
      for (const o of filterOrders(orders, { ...filters, [facet]: [] })) {
        const key = FACETS[facet](o);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      result[facet] = counts;
    }
    return result;
  }, [orders, filters]);

  const setFacet = (facet: Facet, values: string[]) => update({ [facet]: values } as Partial<OrderFilters>);
  const toggleFacet = (facet: Facet, value: string) => {
    const list = filters[facet] as string[];
    setFacet(facet, list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Not remembered this time.
    }
  }, [view]);

  const sorted = useMemo(() => {
    const value = (o: SalesOrder): string | number => {
      switch (sort.key) {
        case 'date':
          return o.createdAt;
        case 'seller':
          return sellerOf(o).toLowerCase();
        case 'customer':
          return o.customerName.trim().toLowerCase();
        case 'city':
          return o.city;
        case 'price':
          return o.totalPrice;
        case 'status':
          return STATUS_ORDER[o.status];
      }
    };
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      // Ties fall back to newest first.
      return c !== 0 ? c * dir : b.createdAt.localeCompare(a.createdAt);
    });
  }, [filtered, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const sortBy = (key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'date' || key === 'price' ? 'desc' : 'asc' },
    );
    setPage(0);
  };

  /** Just this seller's orders, in the table. */
  const showSeller = (name: string) => {
    update({ sellers: [name] });
    setView('table');
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const statusSelect = (o: SalesOrder) => (
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
      {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((st) => (
        <option key={st} value={st}>
          {STATUS_LABEL[st]}
        </option>
      ))}
    </select>
  );
  const onlySeller = filters.sellers.length === 1 ? filters.sellers[0] : null;

  const days =
    filters.from && filters.to
      ? differenceInCalendarDays(
          parseISO(filters.to > format(new Date(), 'yyyy-MM-dd') ? format(new Date(), 'yyyy-MM-dd') : filters.to),
          parseISO(filters.from),
        ) + 1
      : summary.trendUnit === 'day'
        ? summary.trend.length
        : 0;

  const pct = (n: number) => (summary.orders ? `${Math.round((n / summary.orders) * 100)}% of orders` : '—');

  const filterText = [
    filters.sellers.length ? `Sellers: ${filters.sellers.join(', ')}` : 'All sellers',
    filters.platforms.length > 0 && `Platform: ${filters.platforms.join(', ')}`,
    filters.cities.length > 0 && `City: ${filters.cities.join(', ')}`,
    filters.categories.length > 0 && `Category: ${filters.categories.join(', ')}`,
    filters.statuses.length > 0 && `Status: ${filters.statuses.map((v) => STATUS_LABEL[v]).join(', ')}`,
    filters.shifts.length > 0 && `Shift: ${filters.shifts.map((v) => SHIFT_LABEL[v].en).join(', ')}`,
    filters.purchases.length > 0 && `Customer: ${filters.purchases.map((v) => PURCHASE_LABEL[v].en).join(', ')}`,
    filters.genders.length > 0 && `Gender: ${filters.genders.map((v) => GENDER_LABEL[v].en).join(', ')}`,
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
      <Card className="divide-y divide-slate-100">
        <FilterRow label="Period">
          <div className="flex flex-wrap gap-2">
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
            <div className="mt-3 grid gap-3 sm:max-w-md sm:grid-cols-2">
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
        </FilterRow>

        <FilterRow label="Sellers">
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
        </FilterRow>

        <FilterRow label="Filters">
          <label className="relative block">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              className={cn(selectClass, 'pl-10')}
              placeholder="Search customer, phone, item, address or #order…"
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MultiSelect
              label="Platform"
              options={options.platforms}
              selected={filters.platforms}
              counts={facetCounts.platforms}
              onChange={(v) => setFacet('platforms', v)}
            />
            <MultiSelect
              label="City"
              searchable
              options={options.cities}
              selected={filters.cities}
              counts={facetCounts.cities}
              onChange={(v) => setFacet('cities', v)}
            />
            <MultiSelect
              label="Category"
              searchable
              options={options.categories}
              selected={filters.categories}
              counts={facetCounts.categories}
              onChange={(v) => setFacet('categories', v)}
            />
            <MultiSelect
              label="Status"
              options={options.statuses}
              selected={filters.statuses}
              counts={facetCounts.statuses}
              onChange={(v) => setFacet('statuses', v)}
            />
            <MultiSelect
              label="Shift"
              options={options.shifts}
              selected={filters.shifts}
              counts={facetCounts.shifts}
              onChange={(v) => setFacet('shifts', v)}
            />
            <MultiSelect
              label="Customer"
              options={options.purchases}
              selected={filters.purchases}
              counts={facetCounts.purchases}
              onChange={(v) => setFacet('purchases', v)}
            />
            <MultiSelect
              label="Gender"
              options={options.genders}
              selected={filters.genders}
              counts={facetCounts.genders}
              onChange={(v) => setFacet('genders', v)}
            />
            {activeFilterCount(filters) > 0 && (
              <button
                type="button"
                onClick={() => update({ ...EMPTY_FILTERS, from: filters.from, to: filters.to })}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
              >
                <X width={15} height={15} /> Clear all
              </button>
            )}
          </div>
        </FilterRow>
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

      {/* On phones the two money cards lead, each on its own row, so the
          amounts have room; the four counts follow two by two. */}
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
          className="max-sm:order-first max-sm:col-span-2"
        />
        <Kpi
          label="Average order"
          value={Math.round(summary.average).toLocaleString('en-US')}
          unit="IQD"
          className="max-sm:order-first max-sm:col-span-2"
        />
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

      {filtered.length === 0 && orders.length > 0 && (
        <Card className="flex flex-wrap items-center gap-4 border-amber-200 bg-amber-50/70 p-5">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-amber-900">
              {activeFilterCount(filters) > 0
                ? 'No orders match these filters'
                : `No orders for ${describePeriod(filters).replace(/^All time$/, 'this period')}`}
            </div>
            <div className="text-sm text-amber-800">
              There are {orders.length.toLocaleString('en-US')} orders in total — the latest on{' '}
              {format(new Date(latestOrderAt), 'd MMM yyyy')}.
            </div>
          </div>
          <Button
            onClick={() => {
              setPeriod('all');
              update({ ...EMPTY_FILTERS, ...periodRange('all') });
            }}
          >
            Show all {orders.length.toLocaleString('en-US')} orders
          </Button>
        </Card>
      )}

      {notice && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-emerald-800">
          <CheckCircle width={20} height={20} className="shrink-0" />
          <span className="flex-1 font-semibold">{notice}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setNotice(null)}
            className="grid size-8 place-items-center rounded-lg opacity-60 hover:opacity-100"
          >
            <X width={16} height={16} />
          </button>
        </div>
      )}

      {/* ── Table or charts ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-2xl bg-slate-100 p-1">
          {(
            [
              { id: 'table', label: 'Orders table', count: sorted.length },
              { id: 'charts', label: 'Charts' },
            ] as { id: ReportView; label: string; count?: number }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                view === t.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs tabular-nums',
                    view === t.id ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-ink-500',
                  )}
                >
                  {t.count.toLocaleString('en-US')}
                </span>
              )}
            </button>
          ))}
        </div>
        {onlySeller && (
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-1.5 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: colorOf(onlySeller) }} />
            <span className="text-ink-500">Showing</span>
            <b dir="auto" className="text-ink-900">
              {onlySeller}
            </b>
            <span className="text-ink-500">only</span>
            <button
              type="button"
              onClick={() => update({ sellers: [] })}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
            >
              Show all sellers
            </button>
          </div>
        )}
      </div>

      {view === 'charts' ? (
        <>
          {/* ── Seller comparison ─────────────────────────────────────── */}
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-ink-900">Sellers</h3>
              <span className="text-xs text-ink-400">
                Click a seller to see their orders · share of sales, cancelled and returned not counted
              </span>
            </div>
            {summary.bySeller.length === 0 ? (
              <p className="py-4 text-sm text-ink-400">No orders in this period.</p>
            ) : (
              <>
                <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
                  {summary.bySeller.map((sl) => (
                    <div
                      key={sl.key}
                      title={`${sl.key}: ${formatIqd(sl.sales)}`}
                      style={{
                        width: `${summary.sales ? (sl.sales / summary.sales) * 100 : 100 / summary.bySeller.length}%`,
                        background: colorOf(sl.key),
                      }}
                    />
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {summary.bySeller.map((sl) => {
                    const share = summary.sales ? Math.round((sl.sales / summary.sales) * 100) : 0;
                    return (
                      <button
                        key={sl.key}
                        type="button"
                        onClick={() => showSeller(sl.key)}
                        className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="grid size-9 place-items-center rounded-full text-sm font-bold text-white"
                            style={{ background: colorOf(sl.key) }}
                          >
                            {sl.key.trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div dir="auto" className="truncate text-left font-bold text-ink-900">
                              {sl.key}
                            </div>
                            <div className="text-xs text-ink-400">{share}% of sales</div>
                          </div>
                          {topSeller?.key === sl.key && <Badge tone="success">Top seller</Badge>}
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-ink-400">Orders</div>
                            <div className="font-bold tabular-nums">{sl.orders}</div>
                          </div>
                          <div>
                            <div className="text-xs text-ink-400">Sales</div>
                            <div className="font-bold tabular-nums">{formatIqdShort(sl.sales)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-ink-400">Per order</div>
                            <div className="font-bold tabular-nums">
                              {formatIqdShort(sl.orders ? sl.sales / sl.orders : 0)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs font-semibold text-brand-700">See orders →</div>
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
              picked={filters.platforms}
              onPick={(v) => toggleFacet('platforms', v)}
            />
            <BreakdownCard title="City" items={summary.byCity} picked={filters.cities} onPick={(v) => toggleFacet('cities', v)} />
            <BreakdownCard
              title="Category"
              items={summary.byCategory}
              picked={filters.categories}
              onPick={(v) => toggleFacet('categories', v)}
            />
            <BreakdownCard
              title="Shift"
              items={summary.byShift}
              label={(key) =>
                key in SHIFT_LABEL
                  ? `${SHIFT_LABEL[key as keyof typeof SHIFT_LABEL].en} ${SHIFT_LABEL[key as keyof typeof SHIFT_LABEL].hours}`
                  : key
              }
              picked={filters.shifts}
              onPick={(v) => toggleFacet('shifts', v)}
            />
          </div>
        </>
      ) : (
        /* ── Orders table ─────────────────────────────────────────────── */
        <div ref={tableRef} className="scroll-mt-6">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-48">
                <h3 className="font-bold text-ink-900">
                  {onlySeller ? (
                    <>
                      <span dir="auto">{onlySeller}</span>’s orders
                    </>
                  ) : (
                    'All orders'
                  )}
                </h3>
                <p className="text-sm text-ink-500">
                  {sorted.length.toLocaleString('en-US')} {sorted.length === 1 ? 'order' : 'orders'} ·{' '}
                  {formatIqd(summary.sales)} in sales
                </p>
              </div>
              <label className="relative min-w-0 flex-1 basis-56">
                <Search
                  width={15}
                  height={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
                />
                <input
                  className={cn(selectClass, 'h-10 pl-9')}
                  placeholder="Search in these orders…"
                  value={filters.query}
                  onChange={(e) => update({ query: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-500">
                Show
                <select
                  className={cn(selectClass, 'h-10 w-auto')}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {actionError && (
              <p className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{actionError}</p>
            )}
            {pageRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-500">No orders match these filters.</p>
            ) : (
              <>
              <ul className="divide-y divide-slate-100 sm:hidden">
                {pageRows.map((o) => (
                  <li
                    key={o.id}
                    className={cn(
                      'px-4 py-3 transition-colors duration-700',
                      !countsAsSale(o.status) && 'bg-slate-50/60 text-ink-400',
                      highlight === o.id && 'bg-amber-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs text-ink-500">
                          <span className="font-mono text-ink-400">#{o.orderNo}</span>
                          <span>·</span>
                          <span>{format(new Date(o.createdAt), 'd MMM yy')}</span>
                          <span>·</span>
                          <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(sellerOf(o)) }} />
                          <span dir="auto" className="truncate">
                            {sellerOf(o)}
                          </span>
                        </div>
                        <div dir="auto" className="mt-1 truncate text-left font-semibold text-ink-900">
                          {o.customerName}
                        </div>
                        <div className="font-mono text-xs text-ink-500">{o.customerPhone}</div>
                        <div className="truncate text-xs text-ink-400">
                          <span dir="auto">{o.city}</span>
                          {o.itemModel && <span className="font-mono"> · {o.itemModel}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cn('font-bold tabular-nums text-ink-900', !countsAsSale(o.status) && 'line-through')}>
                          {o.totalPrice.toLocaleString('en-US')}
                        </div>
                        <div className="text-xs text-ink-400">IQD · {o.platform || '—'}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {statusSelect(o)}
                        {o.editedAt && <Badge tone="warning">Edited</Badge>}
                        {addedLater(o) && <Badge tone="note">Added later</Badge>}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
                          aria-label={`Edit order ${o.orderNo}`}
                          onClick={() => openOrder(o)}
                        >
                          <Pencil width={16} height={16} />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Delete order ${o.orderNo}`}
                          disabled={busyId === o.id}
                          onClick={() => void remove(o)}
                        >
                          <Trash width={16} height={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-ink-400">
                    <tr>
                      <SortHeader label="Order" sortKey="date" sort={sort} onSort={sortBy} />
                      <SortHeader label="Seller" sortKey="seller" sort={sort} onSort={sortBy} className="hidden xl:table-cell" />
                      <SortHeader label="Customer" sortKey="customer" sort={sort} onSort={sortBy} />
                      <SortHeader label="City" sortKey="city" sort={sort} onSort={sortBy} className="hidden 2xl:table-cell" />
                      <SortHeader label="Price" sortKey="price" sort={sort} onSort={sortBy} className="text-right" />
                      <SortHeader label="Status" sortKey="status" sort={sort} onSort={sortBy} className="hidden md:table-cell" />
                      <th className="px-3 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((o) => (
                      <tr
                        key={o.id}
                        className={cn(
                          'border-b border-slate-100 align-top transition-colors duration-700 last:border-0 hover:bg-slate-50/60',
                          !countsAsSale(o.status) && 'bg-slate-50/60 text-ink-400',
                          highlight === o.id && 'bg-amber-50 hover:bg-amber-50',
                        )}
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-mono text-xs text-ink-400">#{o.orderNo}</div>
                          <div className="font-medium">{format(new Date(o.createdAt), 'd MMM yyyy')}</div>
                          <div className="text-xs text-ink-400">{format(new Date(o.createdAt), 'hh:mm a')}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs xl:hidden">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(sellerOf(o)) }} />
                            <span dir="auto" className="max-w-[6rem] truncate">
                              {sellerOf(o)}
                            </span>
                          </div>
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
                        <td className="hidden whitespace-nowrap px-3 py-3 xl:table-cell">
                          <span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: colorOf(sellerOf(o)) }} />
                          <span dir="auto">{sellerOf(o)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div dir="auto" className="max-w-[11rem] truncate text-left font-semibold text-ink-900 xl:max-w-[14rem]">
                            {o.customerName}
                          </div>
                          <div className="font-mono text-xs text-ink-500">
                            {o.customerPhone}
                            {o.secondPhone && <span className="hidden sm:inline"> · {o.secondPhone}</span>}
                          </div>
                          <div dir="auto" className="max-w-[11rem] truncate text-left text-xs text-ink-500 xl:max-w-[14rem] 2xl:hidden">
                            {o.city}
                          </div>
                          <div
                            className="max-w-[11rem] truncate text-xs text-ink-400 xl:max-w-[14rem]"
                            title={[o.itemModel, o.itemCategory, o.note].filter(Boolean).join(' · ')}
                          >
                            <span className="font-mono">{o.itemModel}</span>
                            {o.itemCategory && <> · <bdi>{o.itemCategory}</bdi></>}
                          </div>
                          {((o.purchaseCount ?? 0) > 1 || (!o.purchaseCount && o.purchase && o.purchase !== 'first')) && (
                            <Badge tone="note" className="mt-1 whitespace-nowrap">
                              {purchaseText(o.purchaseCount, o.purchase)}
                            </Badge>
                          )}
                        </td>
                        <td className="hidden px-3 py-3 2xl:table-cell">
                          <div dir="auto" className="text-left">
                            {o.city}
                          </div>
                          <div dir="auto" className="max-w-[12rem] truncate text-left text-xs text-ink-400" title={o.address}>
                            {o.address}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <div className={cn('font-bold tabular-nums', !countsAsSale(o.status) && 'line-through')}>
                            {formatIqd(o.totalPrice)}
                          </div>
                          <div className="text-xs text-ink-400">{o.platform || '—'}</div>
                          <div className="mt-1 md:hidden">{statusSelect(o)}</div>
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">{statusSelect(o)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
                              title="Edit order"
                              aria-label={`Edit order ${o.orderNo}`}
                              onClick={() => openOrder(o)}
                            >
                              <Pencil width={16} height={16} />
                            </button>
                            <button
                              type="button"
                              className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete order"
                              aria-label={`Delete order ${o.orderNo}`}
                              disabled={busyId === o.id}
                              onClick={() => void remove(o)}
                            >
                              <Trash width={16} height={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-brand-50/50 px-4 py-3 text-sm sm:px-5">
              <span className="text-ink-700">
                {sorted.length > 0 && (
                  <>
                    {(page * pageSize + 1).toLocaleString('en-US')}–
                    {Math.min(sorted.length, (page + 1) * pageSize).toLocaleString('en-US')} of{' '}
                  </>
                )}
                <b>{sorted.length.toLocaleString('en-US')}</b> · Total{' '}
                <b className="tabular-nums text-brand-700">{formatIqd(summary.sales)}</b>
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(0)} aria-label="First page">
                    «
                  </Button>
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((pg) => pg - 1)}>
                    Previous
                  </Button>
                  <span className="px-1 text-xs tabular-nums text-ink-500">
                    {page + 1} / {pages}
                  </span>
                  <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((pg) => pg + 1)}>
                    Next
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pages - 1}
                    onClick={() => setPage(pages - 1)}
                    aria-label="Last page"
                  >
                    »
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      <p className="text-sm text-ink-400">
        Days are counted in this computer’s time zone. First day of the week is Saturday.
        {orders.length > 0 && ` Orders on record: ${orders.length}, the first on ${format(new Date(orders.map(orderDay).sort()[0]), 'd MMM yyyy')}.`}
      </p>

    </div>
  );
}
