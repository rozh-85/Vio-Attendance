import {
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { UNKNOWN_SELLER, countsAsSale } from './options';
import type { OrderPurchase, OrderShift, OrderStatus, SalesOrder, CustomerGender } from './types';

/** Each list holds the values to keep; an empty list keeps every value. */
export interface OrderFilters {
  /** `yyyy-MM-dd`, inclusive; '' = open. */
  from: string;
  to: string;
  sellers: string[];
  platforms: string[];
  cities: string[];
  categories: string[];
  statuses: OrderStatus[];
  shifts: OrderShift[];
  purchases: OrderPurchase[];
  genders: CustomerGender[];
  query: string;
}

/** The list filters other than seller, each read from one field of an order. */
export const FACETS = {
  platforms: (o: SalesOrder) => o.platform,
  cities: (o: SalesOrder) => o.city,
  categories: (o: SalesOrder) => o.itemCategory,
  statuses: (o: SalesOrder) => o.status,
  shifts: (o: SalesOrder) => o.shift,
  purchases: (o: SalesOrder) => o.purchase,
  genders: (o: SalesOrder) => o.gender,
} as const;

export type Facet = keyof typeof FACETS;

export const EMPTY_FILTERS: OrderFilters = {
  from: '',
  to: '',
  sellers: [],
  platforms: [],
  cities: [],
  categories: [],
  statuses: [],
  shifts: [],
  purchases: [],
  genders: [],
  query: '',
};

export const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
] as const;

export type PeriodId = (typeof PERIODS)[number]['id'];

const day = (date: Date) => format(date, 'yyyy-MM-dd');

export function periodRange(period: PeriodId, now = new Date()): { from: string; to: string } {
  switch (period) {
    case 'today':
      return { from: day(now), to: day(now) };
    case 'yesterday':
      return { from: day(subDays(now, 1)), to: day(subDays(now, 1)) };
    case 'week':
      // Iraq's week starts on Saturday.
      return { from: day(startOfWeek(now, { weekStartsOn: 6 })), to: day(now) };
    case 'month':
      return { from: day(startOfMonth(now)), to: day(now) };
    case 'lastMonth': {
      const last = subMonths(now, 1);
      return { from: day(startOfMonth(last)), to: day(endOfMonth(last)) };
    }
    case 'year':
      return { from: day(startOfYear(now)), to: day(endOfYear(now)) };
    case 'all':
      return { from: '', to: '' };
  }
}

export function sellerOf(order: SalesOrder): string {
  return order.sellerName.trim() || UNKNOWN_SELLER;
}

/** The calendar day an order was taken, in this browser's time zone. */
export function orderDay(order: SalesOrder): string {
  return day(new Date(order.createdAt));
}

const digits = (value: string) => value.replace(/\D/g, '');

export function filterOrders(orders: SalesOrder[], f: OrderFilters): SalesOrder[] {
  const query = f.query.trim().toLowerCase();
  const queryDigits = digits(query);
  const sellers = new Set(f.sellers);
  return orders.filter((order) => {
    const date = orderDay(order);
    if (f.from && date < f.from) return false;
    if (f.to && date > f.to) return false;
    if (sellers.size && !sellers.has(sellerOf(order))) return false;
    for (const facet of Object.keys(FACETS) as Facet[]) {
      const keep = f[facet] as string[];
      if (keep.length && !keep.includes(FACETS[facet](order))) return false;
    }
    if (query) {
      if (query.startsWith('#') && queryDigits) return String(order.orderNo) === queryDigits;
      const text = [
        order.customerName,
        order.city,
        order.address,
        order.itemModel,
        order.itemCategory,
        order.note,
        order.platform,
        sellerOf(order),
      ]
        .join(' ')
        .toLowerCase();
      const phoneHit =
        queryDigits.length >= 4 &&
        (digits(order.customerPhone).includes(queryDigits) ||
          digits(order.secondPhone).includes(queryDigits));
      if (!text.includes(query) && !phoneHit) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: OrderFilters): number {
  return (
    (f.sellers.length ? 1 : 0) +
    (Object.keys(FACETS) as Facet[]).filter((facet) => f[facet].length).length +
    (f.query.trim() ? 1 : 0)
  );
}

export interface Breakdown {
  key: string;
  orders: number;
  /** Money from orders that count as a sale (not cancelled or returned). */
  sales: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  orders: number;
  sales: number;
  /** The same two numbers for each seller, so the chart can stack them. */
  bySeller: Record<string, { orders: number; sales: number }>;
}

export interface OrderSummary {
  orders: number;
  /** Orders that brought in money. */
  saleOrders: number;
  sales: number;
  average: number;
  byStatus: Record<OrderStatus, number>;
  /** Customers (by phone) who appear more than once in these orders. */
  returningCustomers: number;
  customers: number;
  bySeller: Breakdown[];
  byPlatform: Breakdown[];
  byCity: Breakdown[];
  byCategory: Breakdown[];
  byShift: Breakdown[];
  byGender: Breakdown[];
  trend: TrendPoint[];
  trendUnit: 'day' | 'month';
}

function group(orders: SalesOrder[], keyOf: (order: SalesOrder) => string): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const order of orders) {
    const key = keyOf(order) || '—';
    const row = map.get(key) ?? { key, orders: 0, sales: 0 };
    row.orders += 1;
    if (countsAsSale(order.status)) row.sales += order.totalPrice;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.orders - a.orders || b.sales - a.sales);
}

/**
 * Days when the period is two months or less, months when it is longer. An
 * open-ended period runs from the first order to the last.
 */
function buildTrend(
  orders: SalesOrder[],
  from: string,
  to: string,
): { trend: TrendPoint[]; trendUnit: 'day' | 'month' } {
  const days = orders.map(orderDay).sort();
  const start = from || days[0];
  const end = to || days[days.length - 1];
  if (!start || !end) return { trend: [], trendUnit: 'day' };
  // A period that runs into the future (this year) stops at today.
  const today = day(new Date());
  const startDate = parseISO(start);
  const endDate = parseISO(end > today && start <= today ? today : end);
  const span = differenceInCalendarDays(endDate, startDate);
  const unit = span > 62 ? 'month' : 'day';

  const points = new Map<string, TrendPoint>();
  if (unit === 'day') {
    for (let i = 0; i <= Math.max(0, span); i++) {
      const d = subDays(endDate, span - i);
      const key = day(d);
      points.set(key, { key, label: format(d, 'd MMM'), orders: 0, sales: 0, bySeller: {} });
    }
  } else {
    for (let d = startOfMonth(startDate); d <= endDate; d = startOfMonth(subMonths(d, -1))) {
      const key = format(d, 'yyyy-MM');
      points.set(key, { key, label: format(d, 'MMM yy'), orders: 0, sales: 0, bySeller: {} });
    }
  }
  for (const order of orders) {
    const key = unit === 'day' ? orderDay(order) : orderDay(order).slice(0, 7);
    const point = points.get(key);
    if (!point) continue;
    const seller = (point.bySeller[sellerOf(order)] ??= { orders: 0, sales: 0 });
    point.orders += 1;
    seller.orders += 1;
    if (countsAsSale(order.status)) {
      point.sales += order.totalPrice;
      seller.sales += order.totalPrice;
    }
  }
  return { trend: [...points.values()], trendUnit: unit };
}

export function summarize(orders: SalesOrder[], f: OrderFilters): OrderSummary {
  const sales = orders.filter((o) => countsAsSale(o.status));
  const total = sales.reduce((sum, o) => sum + o.totalPrice, 0);
  const byStatus: Record<OrderStatus, number> = { new: 0, delivered: 0, cancelled: 0, returned: 0 };
  const phones = new Map<string, number>();
  for (const order of orders) {
    byStatus[order.status] += 1;
    const phone = digits(order.customerPhone).slice(-10);
    if (phone) phones.set(phone, (phones.get(phone) ?? 0) + 1);
  }
  return {
    orders: orders.length,
    saleOrders: sales.length,
    sales: total,
    average: sales.length ? total / sales.length : 0,
    byStatus,
    customers: phones.size,
    returningCustomers: [...phones.values()].filter((n) => n > 1).length,
    bySeller: group(orders, sellerOf),
    byPlatform: group(orders, (o) => o.platform),
    byCity: group(orders, (o) => o.city),
    byCategory: group(orders, (o) => o.itemCategory),
    byShift: group(orders, (o) => o.shift),
    byGender: group(orders, (o) => o.gender),
    ...buildTrend(orders, f.from, f.to),
  };
}

/** "1 Oct 2026 – 12 Oct 2026", "All time" … for headings and exports. */
export function describePeriod(f: OrderFilters): string {
  const nice = (value: string) => format(parseISO(value), 'd MMM yyyy');
  if (!f.from && !f.to) return 'All time';
  if (f.from && f.to) return f.from === f.to ? nice(f.from) : `${nice(f.from)} – ${nice(f.to)}`;
  return f.from ? `From ${nice(f.from)}` : `Until ${nice(f.to)}`;
}
