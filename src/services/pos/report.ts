import { addDays, differenceInCalendarDays, eachDayOfInterval, endOfMonth, format, parseISO, startOfMonth, subDays, subMonths } from 'date-fns';
import { lineGross, lineTotal, matchesSale, paidFor, saleStatus } from './logic';
import type { Sale, SaleLine } from './types';

/**
 * The owner's report, worked out from every sale. A sale counts on the day it
 * was made and a return on the day it came back, so each day's money is what
 * was really in the till.
 */

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'all' | 'days';

export const REPORT_PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'All time' },
  { id: 'days', label: 'Dates' },
];

/** Every kind of sale the report can be narrowed to. Deleted sales show only when they are asked for. */
export const REPORT_STATUSES = [
  { id: 'sold', label: 'Not returned' },
  { id: 'part', label: 'Part returned' },
  { id: 'returned', label: 'Returned' },
  { id: 'discount', label: 'With a discount' },
  { id: 'raised', label: 'With a raised price' },
  { id: 'edited', label: 'Changed after saving' },
  { id: 'deleted', label: 'Deleted' },
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number]['id'];

/** Each list holds the values to keep; an empty list keeps every value. */
export interface ReportFilters {
  period: ReportPeriod;
  /** `yyyy-MM-dd`, for `days`. */
  from: string;
  to: string;
  query: string;
  items: string[];
  categories: string[];
  statuses: ReportStatus[];
}

export const EMPTY_FILTERS: ReportFilters = {
  period: 'today',
  from: '',
  to: '',
  query: '',
  items: [],
  categories: [],
  statuses: [],
};

/** How many lists are narrowed. */
export const activeFilters = (f: ReportFilters): number =>
  [f.items, f.categories, f.statuses].filter((l) => l.length).length + (f.query.trim() ? 1 : 0);

const key = (date: Date): string => format(date, 'yyyy-MM-dd');

/** The first and last day of a period, both included; '' is open. */
export function reportDays(f: Pick<ReportFilters, 'period' | 'from' | 'to'>, now = new Date()): { from: string; to: string } {
  switch (f.period) {
    case 'today':
      return { from: key(now), to: key(now) };
    case 'yesterday':
      return { from: key(subDays(now, 1)), to: key(subDays(now, 1)) };
    case 'week':
      return { from: key(subDays(now, 6)), to: key(now) };
    case 'month':
      return { from: key(startOfMonth(now)), to: key(now) };
    case 'lastMonth':
      return { from: key(startOfMonth(subMonths(now, 1))), to: key(endOfMonth(subMonths(now, 1))) };
    case 'days':
      return { from: f.from, to: f.to };
    default:
      return { from: '', to: '' };
  }
}

const show = (day: string): string => format(parseISO(day), 'dd/MM/yyyy');

export function describeDays({ from, to }: { from: string; to: string }): string {
  if (!from && !to) return 'All time';
  if (from === to) return show(from);
  if (!from) return `Until ${show(to)}`;
  if (!to) return `From ${show(from)}`;
  return `${show(from)} – ${show(to)}`;
}

const within = (iso: string, { from, to }: { from: string; to: string }): boolean => {
  const day = key(new Date(iso));
  return (!from || day >= from) && (!to || day <= to);
};

export const isEdited = (sale: Sale): boolean => sale.history.some((h) => h.action === 'edit');
export const isRaised = (line: SaleLine): boolean => line.price > line.list;

const lineMatches = (line: SaleLine, f: ReportFilters): boolean =>
  (!f.items.length || f.items.includes(line.itemId)) && (!f.categories.length || f.categories.includes(line.category));

function isKind(sale: Sale, kind: ReportStatus): boolean {
  switch (kind) {
    case 'discount':
      return sale.lines.some((l) => l.discount > 0);
    case 'raised':
      return sale.lines.some(isRaised);
    case 'edited':
      return isEdited(sale);
    default:
      return saleStatus(sale) === kind;
  }
}

/** Everything but the days. */
function saleMatches(sale: Sale, f: ReportFilters): boolean {
  if (sale.deletedAt && !f.statuses.includes('deleted')) return false;
  if (!matchesSale(sale, f.query)) return false;
  if (!sale.lines.some((l) => lineMatches(l, f))) return false;
  return !f.statuses.length || f.statuses.some((k) => isKind(sale, k));
}

/** The invoices of the period, newest first. */
export function reportSales(sales: Sale[], f: ReportFilters): Sale[] {
  const days = reportDays(f);
  return sales.filter((s) => within(s.soldAt, days) && saleMatches(s, f));
}

interface Move {
  sale: Sale;
  line: SaleLine;
  at: string;
  back: boolean;
  qty: number;
  /** Dinars, as paid (or paid back). */
  money: number;
  discount: number;
  raised: number;
}

/** Each line sold and each line returned in the period. */
function movesOf(sales: Sale[], f: ReportFilters): Move[] {
  const days = reportDays(f);
  const moves: Move[] = [];
  for (const sale of sales) {
    if (!saleMatches(sale, f)) continue;
    for (const line of sale.lines) {
      if (!lineMatches(line, f)) continue;
      if (within(sale.soldAt, days))
        moves.push({
          sale,
          line,
          at: sale.soldAt,
          back: false,
          qty: line.qty,
          money: lineTotal(line),
          discount: line.discount,
          raised: isRaised(line) ? (line.price - line.list) * line.qty : 0,
        });
      for (const ret of sale.returns) {
        if (!within(ret.at, days)) continue;
        const part = ret.lines.find((l) => l.id === line.id);
        if (!part) continue;
        // The money given back, shared over the pieces by what they cost.
        const worth = ret.lines.reduce((n, l) => {
          const own = sale.lines.find((x) => x.id === l.id);
          return n + (own ? paidFor(own, l.qty) : 0);
        }, 0);
        const own = paidFor(line, part.qty);
        moves.push({
          sale,
          line,
          at: ret.at,
          back: true,
          qty: part.qty,
          money: worth > 0 ? Math.round((ret.refund * own) / worth) : 0,
          discount: 0,
          raised: 0,
        });
      }
    }
  }
  return moves;
}

export interface ItemRow {
  key: string;
  itemId: string;
  code: string;
  name: string;
  ku: string;
  color: string;
  category: string;
  image: string;
  sold: number;
  returned: number;
  discount: number;
  /** Dinars, returns taken off. */
  net: number;
  /** Of everything in the report, 0–1. */
  share: number;
}

export interface TimeRow {
  key: string;
  label: string;
  invoices: number;
  sold: number;
  discount: number;
  refunded: number;
  net: number;
}

export interface Report {
  invoices: number;
  customers: number;
  sold: number;
  returned: number;
  /** Before discounts. */
  gross: number;
  discount: number;
  raised: number;
  refunded: number;
  net: number;
  /** The same, in dollars, each sale at its own rate. */
  netUsd: number;
  items: ItemRow[];
  /** Hours of a single day, else days (or months, over a long time). */
  times: TimeRow[];
  unit: 'hour' | 'day' | 'month';
  days: { from: string; to: string };
}

function timesOf(moves: Move[], days: { from: string; to: string }): Pick<Report, 'times' | 'unit'> {
  const at = moves.map((m) => m.at).sort((a, b) => a.localeCompare(b));
  const from = days.from || (at.length ? key(new Date(at[0])) : key(new Date()));
  const to = days.to || (at.length ? key(new Date(at[at.length - 1])) : key(new Date()));
  const unit = from === to ? 'hour' : differenceInCalendarDays(parseISO(to), parseISO(from)) > 92 ? 'month' : 'day';
  const of = (iso: string): string => format(new Date(iso), unit === 'hour' ? 'HH' : unit === 'day' ? 'yyyy-MM-dd' : 'yyyy-MM');

  const rows = new Map<string, TimeRow & { ids: Set<string> }>();
  const add = (k: string, label: string) =>
    rows.set(k, { key: k, label, invoices: 0, sold: 0, discount: 0, refunded: 0, net: 0, ids: new Set() });
  if (unit === 'hour') {
    const hours = moves.map((m) => new Date(m.at).getHours());
    const first = Math.min(9, ...hours);
    const last = Math.max(21, ...hours);
    for (let h = first; h <= last; h++) add(String(h).padStart(2, '0'), `${String(h).padStart(2, '0')}:00`);
  } else if (unit === 'day') {
    const end = parseISO(to);
    for (const d of eachDayOfInterval({ start: parseISO(from), end: end < parseISO(from) ? addDays(parseISO(from), 0) : end }))
      add(key(d), format(d, 'dd/MM'));
  }
  for (const m of moves) {
    const k = of(m.at);
    if (!rows.has(k)) add(k, unit === 'month' ? format(new Date(m.at), 'MM/yyyy') : k);
    const row = rows.get(k)!;
    if (m.back) {
      row.refunded += m.money;
      row.net -= m.money;
    } else {
      row.ids.add(m.sale.id);
      row.sold += m.qty;
      row.discount += m.discount;
      row.net += m.money;
    }
  }
  const times = [...rows.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ ids, ...row }) => ({ ...row, invoices: ids.size }));
  return { times, unit };
}

export function buildReport(sales: Sale[], f: ReportFilters): Report {
  const days = reportDays(f);
  const moves = movesOf(sales, f);
  const items = new Map<string, ItemRow>();
  const invoices = new Set<string>();
  const customers = new Set<string>();
  const total = { sold: 0, returned: 0, gross: 0, discount: 0, raised: 0, refunded: 0, net: 0, netUsd: 0 };

  for (const m of moves) {
    const k = `${m.line.code}|${m.line.color}`;
    const row = items.get(k) ?? {
      key: k,
      itemId: m.line.itemId,
      code: m.line.code,
      name: m.line.name,
      ku: m.line.ku,
      color: m.line.color,
      category: m.line.category,
      image: m.line.image,
      sold: 0,
      returned: 0,
      discount: 0,
      net: 0,
      share: 0,
    };
    items.set(k, row);
    const rate = m.sale.rate || 1;
    if (m.back) {
      row.returned += m.qty;
      row.net -= m.money;
      total.returned += m.qty;
      total.refunded += m.money;
      total.net -= m.money;
      total.netUsd -= m.money / rate;
    } else {
      invoices.add(m.sale.id);
      customers.add(m.sale.customerPhone);
      row.sold += m.qty;
      row.discount += m.discount;
      row.net += m.money;
      total.sold += m.qty;
      total.gross += lineGross(m.line);
      total.discount += m.discount;
      total.raised += m.raised;
      total.net += m.money;
      total.netUsd += m.money / rate;
    }
  }
  const rows = [...items.values()].sort((a, b) => b.net - a.net || b.sold - a.sold);
  const all = rows.reduce((n, r) => n + Math.max(0, r.net), 0);
  for (const row of rows) row.share = all > 0 ? Math.max(0, row.net) / all : 0;
  return { ...total, invoices: invoices.size, customers: customers.size, items: rows, ...timesOf(moves, days), days };
}

/** What the report is narrowed to, in words. */
export function describeFilters(f: ReportFilters, itemName: (id: string) => string, category: (id: string) => string): string {
  const list = (label: string, values: string[]) => values.length > 0 && `${label}: ${values.join(', ')}`;
  return [
    list('Item', f.items.map(itemName)),
    list('Category', f.categories.map(category)),
    list('Sales', f.statuses.map((k) => REPORT_STATUSES.find((s) => s.id === k)?.label ?? k)),
    f.query.trim() && `Search: ${f.query.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
