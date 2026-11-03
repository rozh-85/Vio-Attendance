import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { PLATFORMS, countsAsSale } from './options';
import { orderDay } from './report';
import type { SalesOrder } from './types';

/**
 * Profit on the social media orders: what each piece cost, and what the
 * sponsored posts that brought the customers in cost.
 *
 *   Sales − cost of the goods = gross profit
 *   Gross profit − sponsors   = net profit
 *
 * A cost is set once per item model and every order of that model uses it;
 * one order can carry its own cost instead (two pieces, a different price
 * from the supplier). Orders with no cost are left out of the profit and
 * shown as "no cost yet", so a missing cost never reads as pure profit.
 */

export type SponsorCurrency = 'IQD' | 'USD';

/** One paid promotion — a sponsored post or ad — and the days it ran. */
export interface Sponsor {
  id: string;
  /** Instagram, Facebook, TikTok …; '' when not said. */
  platform: string;
  /** `yyyy-MM-dd`, both days included. */
  startDate: string;
  endDate: string;
  /** As paid, in `currency`. */
  amount: number;
  currency: SponsorCurrency;
  /** IQD for one dollar when paid in dollars; 1 when paid in IQD. */
  rate: number;
  /** The model or product it promoted, if any. */
  promoted: string;
  note: string;
  createdAt: string;
}

export type SponsorInput = Omit<Sponsor, 'id' | 'createdAt'>;

/** One item model on the owner's price list. */
export interface ModelCost {
  /** `modelKey()` of the model. */
  key: string;
  /** The model as written, e.g. V-502. */
  label: string;
  /** What one piece costs Vio, in IQD; null until written. */
  cost: number | null;
  /** What one piece sells for, in IQD; null until written. */
  price: number | null;
  /** The item type its orders are saved under, e.g. هیتەر. */
  category: string;
  /** The product's name, e.g. Air Fryer; '' to use the catalogue's. */
  name: string;
  /** Its picture's address; '' to use the catalogue's. */
  image: string;
  /** Offered to sellers on the order form. */
  active: boolean;
  updatedAt: string;
}

/** A model as it is saved: everything but the time. */
export type ModelValues = Omit<ModelCost, 'updatedAt'>;

/**
 * The model `key` as saved now, with `patch` laid over it — what a page
 * sends to save one change without losing the model's other fields.
 */
export function modelWith(
  data: ProfitData,
  key: string,
  label: string,
  patch: Partial<Pick<ModelCost, 'cost' | 'price' | 'category' | 'name' | 'image' | 'active'>>,
): ModelValues {
  const m = data.models[key];
  return {
    key,
    label: label.trim() || m?.label || key,
    cost: patch.cost !== undefined ? patch.cost : (m?.cost ?? null),
    price: patch.price !== undefined ? patch.price : (m?.price ?? null),
    category: patch.category !== undefined ? patch.category.trim() : (m?.category ?? ''),
    name: patch.name !== undefined ? patch.name.trim() : (m?.name ?? ''),
    image: patch.image !== undefined ? patch.image : (m?.image ?? ''),
    active: patch.active !== undefined ? patch.active : (m?.active ?? true),
  };
}

/** A model with no price, cost, type, name or picture of its own holds nothing worth keeping. */
export const isEmptyModel = (m: Pick<ModelCost, 'cost' | 'price' | 'category' | 'name' | 'image' | 'active'>) =>
  m.cost === null && m.price === null && !m.category.trim() && !m.name.trim() && !m.image && m.active;

export interface ProfitData {
  /** By `modelKey()`. */
  models: Record<string, ModelCost>;
  /** Order id → that order's own cost in IQD, over the model's. */
  orderCosts: Record<string, number>;
  sponsors: Sponsor[];
}

export const EMPTY_PROFIT: ProfitData = { models: {}, orderCosts: {}, sponsors: [] };

/** The dollar rate a new sponsor starts with until the owner types another. */
export const DEFAULT_USD_RATE = 1500;

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Kurdish / Arabic digits (٥٠٢, ۵۰۲) as 0–9. */
export function westernDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10));
}

/**
 * One key for every way a seller writes the same model, so a cost set once
 * covers them all: "V.502", "v 502", "V-502" and "V.٥٠٢" are all V502.
 */
export function modelKey(model: string): string {
  return westernDigits(model.normalize('NFKC'))
    .toUpperCase()
    .replace(/[\s.\-_/\\,·]+/g, '');
}

/** Whole IQD from what was typed: "45,000", "٤٥٠٠٠", "45000 IQD". */
export function parseIqd(value: string): number | null {
  const digits = westernDigits(value).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits.slice(0, 13));
  return Number.isFinite(n) ? n : null;
}

// ── One order ────────────────────────────────────────────────────────────────

export type CostSource = 'order' | 'model';

/**
 * What the goods of this order cost — its own cost, or its model's cost
 * times the pieces — and where that came from; null when unknown.
 */
export function costOf(order: SalesOrder, data: ProfitData): { cost: number; source: CostSource } | null {
  const own = data.orderCosts[order.id];
  if (own !== undefined) return { cost: own, source: 'order' };
  const key = modelKey(order.itemModel);
  const model = key ? data.models[key] : undefined;
  return model && model.cost !== null ? { cost: model.cost * (order.quantity || 1), source: 'model' } : null;
}

/** Price less cost for a sale; null for a cancelled or returned order, or one with no cost. */
export function profitOf(order: SalesOrder, data: ProfitData): number | null {
  if (!countsAsSale(order.status)) return null;
  const cost = costOf(order, data);
  return cost ? order.totalPrice - cost.cost : null;
}

// ── Sponsors ─────────────────────────────────────────────────────────────────

export function sponsorIqd(s: Pick<Sponsor, 'amount' | 'currency' | 'rate'>): number {
  return Math.round(s.amount * (s.currency === 'USD' ? s.rate : 1));
}

export function sponsorDays(s: Pick<Sponsor, 'startDate' | 'endDate'>): number {
  return Math.max(1, differenceInCalendarDays(parseISO(s.endDate), parseISO(s.startDate)) + 1);
}

/**
 * The part of a sponsor that falls between two days (both included; '' is
 * open). A 7-day sponsor of 70,000 IQD counts 10,000 IQD on each of its days,
 * so a week that holds three of them carries 30,000.
 */
export function sponsorInRange(s: Sponsor, from: string, to: string): { amount: number; days: number } {
  const start = from && from > s.startDate ? from : s.startDate;
  const end = to && to < s.endDate ? to : s.endDate;
  if (end < start) return { amount: 0, days: 0 };
  const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  return { amount: (sponsorIqd(s) * days) / sponsorDays(s), days };
}

// ── The whole period ─────────────────────────────────────────────────────────

/** One item model, as the cost list shows it. */
export interface ModelRow {
  /** `modelKey()`; '' for orders where no model was written. */
  key: string;
  /** The spelling sellers use most. */
  label: string;
  /** The other ways it was written. */
  spellings: string[];
  /** The item type it is most often saved under. */
  category: string;
  /** Cost of one piece; null until set. */
  cost: number | null;
  /** Sales of it on record, every period. */
  allOrders: number;
  /** Its average price for one piece, over every sale on record. */
  avgPrice: number;
  /** Sales of it in the period. */
  orders: number;
  sales: number;
  /** Price less cost over the period's sales that have a cost. */
  profit: number;
  /** Period sales that have a cost (the model's, or the order's own). */
  costedOrders: number;
}

export interface PlatformRow {
  key: string;
  orders: number;
  sales: number;
  /** Gross profit of its orders that have a cost. */
  gross: number;
  uncostedSales: number;
  /** Sponsors on this platform, the part in the period. */
  sponsor: number;
  /** Gross profit less its sponsors. */
  net: number;
  /** Sales brought in for each 1 IQD of sponsor; null with no sponsor. */
  roas: number | null;
}

export interface ProfitPoint {
  key: string;
  label: string;
  /** First and last day it covers, `yyyy-MM-dd`. */
  from: string;
  to: string;
  orders: number;
  sales: number;
  cogs: number;
  gross: number;
  uncostedSales: number;
  sponsor: number;
  net: number;
}

export interface ProfitSummary {
  /** Orders that count as a sale (not cancelled or returned). */
  orders: number;
  sales: number;
  costedOrders: number;
  costedSales: number;
  /** Cost of the goods sold, over the orders that have a cost. */
  cogs: number;
  /** costedSales − cogs. */
  gross: number;
  uncostedOrders: number;
  uncostedSales: number;
  /** Sponsors, the part that falls in the period. */
  sponsor: number;
  /** Sponsors that ran on at least one day of the period. */
  sponsorCount: number;
  /** gross − sponsor. */
  net: number;
  /** gross / costedSales. */
  margin: number | null;
  /** sales / sponsor. */
  roas: number | null;
  /** Average gross profit of an order with a cost, less sponsor per order. */
  profitPerOrder: number | null;
  /** How many orders' profit the sponsors ate; null with no sponsor or no profit. */
  breakEvenOrders: number | null;
  byModel: ModelRow[];
  byPlatform: PlatformRow[];
  trend: ProfitPoint[];
  trendUnit: 'day' | 'month';
}

const day = (date: Date) => format(date, 'yyyy-MM-dd');

function inPeriod(date: string, from: string, to: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}

function mostCommon(values: Map<string, number>): string {
  let best = '';
  let count = -1;
  for (const [value, n] of values) if (n > count) [best, count] = [value, n];
  return best;
}

function bump(map: Map<string, number>, key: string, by = 1) {
  if (key) map.set(key, (map.get(key) ?? 0) + by);
}

/** The cost list: every model ever sold, with its numbers for the period. */
function modelRows(all: SalesOrder[], data: ProfitData, from: string, to: string): ModelRow[] {
  interface Acc {
    spellings: Map<string, number>;
    categories: Map<string, number>;
    allOrders: number;
    allSales: number;
    allPieces: number;
    orders: number;
    sales: number;
    profit: number;
    costedOrders: number;
  }
  const map = new Map<string, Acc>();
  for (const order of all) {
    if (!countsAsSale(order.status)) continue;
    const key = modelKey(order.itemModel);
    const acc =
      map.get(key) ??
      ({
        spellings: new Map(),
        categories: new Map(),
        allOrders: 0,
        allSales: 0,
        allPieces: 0,
        orders: 0,
        sales: 0,
        profit: 0,
        costedOrders: 0,
      } satisfies Acc);
    bump(acc.spellings, order.itemModel.trim());
    bump(acc.categories, order.itemCategory.trim());
    acc.allOrders += 1;
    acc.allSales += order.totalPrice;
    acc.allPieces += order.quantity || 1;
    if (inPeriod(orderDay(order), from, to)) {
      acc.orders += 1;
      acc.sales += order.totalPrice;
      const profit = profitOf(order, data);
      if (profit !== null) {
        acc.profit += profit;
        acc.costedOrders += 1;
      }
    }
    map.set(key, acc);
  }
  // Models with a cost but no sale left (renamed, deleted orders) stay listed.
  for (const cost of Object.values(data.models)) {
    if (!map.has(cost.key)) {
      map.set(cost.key, {
        spellings: new Map([[cost.label, 0]]),
        categories: new Map(),
        allOrders: 0,
        allSales: 0,
        allPieces: 0,
        orders: 0,
        sales: 0,
        profit: 0,
        costedOrders: 0,
      });
    }
  }
  return [...map.entries()]
    .map(([key, acc]): ModelRow => {
      const label = key ? mostCommon(acc.spellings) || data.models[key]?.label || key : '';
      return {
        key,
        label,
        spellings: [...acc.spellings.keys()].filter((s) => s && s !== label),
        category: mostCommon(acc.categories),
        cost: key ? (data.models[key]?.cost ?? null) : null,
        allOrders: acc.allOrders,
        avgPrice: acc.allPieces ? acc.allSales / acc.allPieces : 0,
        orders: acc.orders,
        sales: acc.sales,
        profit: acc.profit,
        costedOrders: acc.costedOrders,
      };
    })
    .sort((a, b) => b.orders - a.orders || b.allOrders - a.allOrders || a.label.localeCompare(b.label));
}

/** Days for two months or less, months for longer — as the orders report does. */
function buildTrend(
  sales: SalesOrder[],
  data: ProfitData,
  sponsors: Sponsor[],
  from: string,
  to: string,
): { trend: ProfitPoint[]; trendUnit: 'day' | 'month' } {
  const days = [
    ...sales.map(orderDay),
    ...sponsors.flatMap((s) => [s.startDate, s.endDate]),
  ].sort();
  const first = from || days[0];
  const last = to || days[days.length - 1];
  if (!first || !last) return { trend: [], trendUnit: 'day' };
  // A period that runs into the future (this year) stops at today.
  const today = day(new Date());
  const startDate = parseISO(first);
  const endDate = parseISO(last > today && first <= today ? today : last);
  const span = differenceInCalendarDays(endDate, startDate);
  if (span < 0) return { trend: [], trendUnit: 'day' };
  const unit = span > 62 ? 'month' : 'day';

  const blank = (key: string, label: string, a: string, b: string): ProfitPoint => ({
    key,
    label,
    from: a,
    to: b,
    orders: 0,
    sales: 0,
    cogs: 0,
    gross: 0,
    uncostedSales: 0,
    sponsor: 0,
    net: 0,
  });
  const points = new Map<string, ProfitPoint>();
  if (unit === 'day') {
    for (let i = 0; i <= span; i++) {
      const d = addDays(startDate, i);
      points.set(day(d), blank(day(d), format(d, 'd MMM'), day(d), day(d)));
    }
  } else {
    for (let d = startOfMonth(startDate); d <= endDate; d = startOfMonth(subMonths(d, -1))) {
      const a = day(d) < first ? first : day(d);
      const b = day(endOfMonth(d)) > day(endDate) ? day(endDate) : day(endOfMonth(d));
      points.set(format(d, 'yyyy-MM'), blank(format(d, 'yyyy-MM'), format(d, 'MMM yy'), a, b));
    }
  }
  for (const order of sales) {
    const key = unit === 'day' ? orderDay(order) : orderDay(order).slice(0, 7);
    const point = points.get(key);
    if (!point) continue;
    point.orders += 1;
    point.sales += order.totalPrice;
    const cost = costOf(order, data);
    if (cost) {
      point.cogs += cost.cost;
      point.gross += order.totalPrice - cost.cost;
    } else {
      point.uncostedSales += order.totalPrice;
    }
  }
  for (const point of points.values()) {
    point.sponsor = sponsors.reduce((sum, s) => sum + sponsorInRange(s, point.from, point.to).amount, 0);
    point.net = point.gross - point.sponsor;
  }
  return { trend: [...points.values()], trendUnit: unit };
}

/**
 * The profit of the orders between `from` and `to` (`yyyy-MM-dd`, '' = open),
 * less the part of every sponsor that ran in those days.
 */
export function summarizeProfit(all: SalesOrder[], data: ProfitData, from: string, to: string): ProfitSummary {
  const sales = all.filter((o) => countsAsSale(o.status) && inPeriod(orderDay(o), from, to));
  const sponsors = data.sponsors.filter((s) => sponsorInRange(s, from, to).days > 0);

  let costedOrders = 0;
  let costedSales = 0;
  let cogs = 0;
  let total = 0;
  const platforms = new Map<string, PlatformRow>();
  const platformRow = (key: string) => {
    const row =
      platforms.get(key) ??
      ({ key, orders: 0, sales: 0, gross: 0, uncostedSales: 0, sponsor: 0, net: 0, roas: null } satisfies PlatformRow);
    platforms.set(key, row);
    return row;
  };

  for (const order of sales) {
    total += order.totalPrice;
    const row = platformRow(order.platform.trim());
    row.orders += 1;
    row.sales += order.totalPrice;
    const cost = costOf(order, data);
    if (cost) {
      costedOrders += 1;
      costedSales += order.totalPrice;
      cogs += cost.cost;
      row.gross += order.totalPrice - cost.cost;
    } else {
      row.uncostedSales += order.totalPrice;
    }
  }

  let sponsor = 0;
  for (const s of sponsors) {
    const part = sponsorInRange(s, from, to).amount;
    sponsor += part;
    platformRow(s.platform.trim()).sponsor += part;
  }

  const gross = costedSales - cogs;
  const net = gross - sponsor;
  const grossPerOrder = costedOrders ? gross / costedOrders : null;

  const known = new Map<string, number>(PLATFORMS.map((p, i) => [p, i]));
  const byPlatform = [...platforms.values()]
    .map((row) => ({ ...row, net: row.gross - row.sponsor, roas: row.sponsor > 0 ? row.sales / row.sponsor : null }))
    .sort((a, b) => b.sales + b.sponsor - (a.sales + a.sponsor) || (known.get(a.key) ?? 99) - (known.get(b.key) ?? 99));

  return {
    orders: sales.length,
    sales: total,
    costedOrders,
    costedSales,
    cogs,
    gross,
    uncostedOrders: sales.length - costedOrders,
    uncostedSales: total - costedSales,
    sponsor,
    sponsorCount: sponsors.length,
    net,
    margin: costedSales > 0 ? gross / costedSales : null,
    roas: sponsor > 0 ? total / sponsor : null,
    profitPerOrder: grossPerOrder === null ? null : grossPerOrder - (sales.length ? sponsor / sales.length : 0),
    breakEvenOrders: sponsor > 0 && grossPerOrder && grossPerOrder > 0 ? Math.ceil(sponsor / grossPerOrder) : null,
    byModel: modelRows(all, data, from, to),
    byPlatform,
    ...buildTrend(sales, data, sponsors, from, to),
  };
}

/** "1–7 Nov 2026", "28 Oct – 3 Nov 2026", "5 Nov 2026". */
export function sponsorDates(s: Pick<Sponsor, 'startDate' | 'endDate'>): string {
  const a = parseISO(s.startDate);
  const b = parseISO(s.endDate);
  if (s.startDate === s.endDate) return format(a, 'd MMM yyyy');
  if (format(a, 'yyyy-MM') === format(b, 'yyyy-MM')) return `${format(a, 'd')}–${format(b, 'd MMM yyyy')}`;
  if (format(a, 'yyyy') === format(b, 'yyyy')) return `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}`;
  return `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`;
}

/** "$50", "75,000 IQD" — as it was paid. */
export function sponsorPaid(s: Pick<Sponsor, 'amount' | 'currency'>): string {
  return s.currency === 'USD'
    ? `$${s.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `${Math.round(s.amount).toLocaleString('en-US')} IQD`;
}
