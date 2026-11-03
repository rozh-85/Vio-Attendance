import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { LocalOrdersStore } from './localStore';
import { OrdersError } from './errors';
import {
  EMPTY_PROFIT,
  isEmptyModel,
  type ModelCost,
  type ModelValues,
  type ProfitData,
  type Sponsor,
  type SponsorInput,
} from './profit';

/**
 * Where the price list (each model's sale price, cost and type), per-order
 * costs and sponsors are kept: owner-only tables next to the orders
 * (supabase/social-profit.sql), or this browser in the local sandbox.
 * Sellers reach only `loadPriceList`, which never carries a cost.
 */
export interface ProfitStore {
  load(): Promise<ProfitData>;
  /** Saves these models whole, in one go; a model left with nothing is removed. */
  saveModels(models: ModelValues[]): Promise<void>;
  /** null goes back to the model's cost. */
  setOrderCost(orderId: string, cost: number | null): Promise<void>;
  /** Adds a sponsor, or changes the one with this id. */
  saveSponsor(input: SponsorInput, id?: string): Promise<Sponsor>;
  deleteSponsor(id: string): Promise<void>;
}

/** A model sellers can pick on the order form: its price and type, never its cost. */
export interface PriceListItem {
  key: string;
  model: string;
  category: string;
  price: number;
}

export class ProfitNotSetUpError extends Error {
  constructor(again = false) {
    super(
      again
        ? 'The price list needs the newest database script. Run supabase/social-profit.sql again in the Supabase SQL editor.'
        : 'Profit is not set up in the database yet. Run supabase/social-profit.sql once in the Supabase SQL editor.',
    );
    this.name = 'ProfitNotSetUpError';
  }
}

export function profitErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

let cached: ProfitStore | undefined;

export function getProfitStore(): ProfitStore {
  if (!cached) {
    const client = getSupabaseClient();
    cached = client ? new SupabaseProfitStore(client) : new LocalProfitStore();
  }
  return cached;
}

/**
 * The models on sale, for a signed-in seller's order form. An empty list
 * (nothing priced yet, or the database script not run) leaves the seller
 * typing the item and price as before.
 */
export async function loadPriceList(token: string): Promise<PriceListItem[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.rpc('social_price_list', { p_token: token });
    if (error) {
      if (error.message === 'SESSION_EXPIRED') throw new OrdersError('SESSION_EXPIRED');
      return [];
    }
    return ((data ?? []) as PriceListItem[]).map((p) => ({ ...p, price: Number(p.price) || 0 }));
  }
  if (!(await new LocalOrdersStore().whoAmI(token))) throw new OrdersError('SESSION_EXPIRED');
  return Object.values(read().models)
    .filter((m) => m.active && (m.price ?? 0) > 0)
    .map((m) => ({ key: m.key, model: m.label, category: m.category, price: m.price ?? 0 }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

// ── Supabase ─────────────────────────────────────────────────────────────────

interface ModelRow {
  model_key: string;
  model_label: string;
  cost: number | string | null;
  sale_price: number | string | null;
  category: string;
  active: boolean;
  updated_at: string;
}

interface OrderCostRow {
  order_id: string;
  cost: number | string;
}

interface SponsorRow {
  id: string;
  platform: string;
  start_date: string;
  end_date: string;
  amount: number | string;
  currency: Sponsor['currency'];
  rate: number | string;
  promoted: string;
  note: string;
  created_at: string;
}

const money = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);

function toModel(row: ModelRow): ModelCost {
  return {
    key: row.model_key,
    label: row.model_label,
    cost: money(row.cost),
    price: money(row.sale_price),
    category: row.category ?? '',
    active: row.active ?? true,
    updatedAt: row.updated_at,
  };
}

function toSponsor(row: SponsorRow): Sponsor {
  return {
    id: row.id,
    platform: row.platform,
    startDate: row.start_date,
    endDate: row.end_date,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    rate: Number(row.rate) || 1,
    promoted: row.promoted,
    note: row.note,
    createdAt: row.created_at,
  };
}

function sponsorColumns(input: SponsorInput): Omit<SponsorRow, 'id' | 'created_at'> {
  return {
    platform: input.platform.trim(),
    start_date: input.startDate,
    end_date: input.endDate < input.startDate ? input.startDate : input.endDate,
    amount: input.amount,
    currency: input.currency,
    rate: input.currency === 'USD' ? input.rate : 1,
    promoted: input.promoted.trim(),
    note: input.note.trim(),
  };
}

/**
 * A database that has not run social-profit.sql has none of the tables; one
 * that ran an older copy lacks the price columns.
 */
function translate(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (error.code === '42703' || (error.code === 'PGRST204' && /sale_price|category|active/.test(message))) {
    return new ProfitNotSetUpError(true);
  }
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(message)) {
    return new ProfitNotSetUpError();
  }
  return new Error(message || 'The database refused the request.');
}

class SupabaseProfitStore implements ProfitStore {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Every row of a table, 1000 at a time (Supabase's limit per request). */
  private async all<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      // A fixed order, so no row is skipped or read twice between pages.
      const { data, error } = await this.client.from(table).select(columns).order(orderBy).range(from, from + 999);
      if (error) throw translate(error);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) break;
    }
    return rows;
  }

  async load(): Promise<ProfitData> {
    const [models, orderCosts, sponsors] = await Promise.all([
      this.all<ModelRow>(
        'social_model_costs',
        'model_key, model_label, cost, sale_price, category, active, updated_at',
        'model_key',
      ),
      this.all<OrderCostRow>('social_order_costs', 'order_id, cost', 'order_id'),
      this.all<SponsorRow>('social_sponsors', '*', 'id'),
    ]);
    return {
      models: Object.fromEntries(models.map((m) => [m.model_key, toModel(m)])),
      orderCosts: Object.fromEntries(orderCosts.map((o) => [o.order_id, Number(o.cost) || 0])),
      sponsors: sponsors.map(toSponsor).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    };
  }

  async saveModels(models: ModelValues[]): Promise<void> {
    const keep = models.filter((m) => !isEmptyModel(m));
    const drop = models.filter((m) => isEmptyModel(m)).map((m) => m.key);
    const now = new Date().toISOString();
    if (keep.length) {
      const { error } = await this.client.from('social_model_costs').upsert(
        keep.map((m) => ({
          model_key: m.key,
          model_label: m.label.trim(),
          cost: m.cost === null ? null : Math.round(m.cost),
          sale_price: m.price === null ? null : Math.round(m.price),
          category: m.category.trim(),
          active: m.active,
          updated_at: now,
        })),
        { onConflict: 'model_key' },
      );
      if (error) throw translate(error);
    }
    if (drop.length) {
      const { error } = await this.client.from('social_model_costs').delete().in('model_key', drop);
      if (error) throw translate(error);
    }
  }

  async setOrderCost(orderId: string, cost: number | null): Promise<void> {
    const { error } =
      cost === null
        ? await this.client.from('social_order_costs').delete().eq('order_id', orderId)
        : await this.client.from('social_order_costs').upsert(
            { order_id: orderId, cost: Math.round(cost), updated_at: new Date().toISOString() },
            { onConflict: 'order_id' },
          );
    if (error) throw translate(error);
  }

  async saveSponsor(input: SponsorInput, id?: string): Promise<Sponsor> {
    const row = sponsorColumns(input);
    const { data, error } = id
      ? await this.client.from('social_sponsors').update(row).eq('id', id).select('*').single()
      : await this.client.from('social_sponsors').insert(row).select('*').single();
    if (error) throw translate(error);
    return toSponsor(data as SponsorRow);
  }

  async deleteSponsor(id: string): Promise<void> {
    const { error } = await this.client.from('social_sponsors').delete().eq('id', id);
    if (error) throw translate(error);
  }
}

// ── This browser (local sandbox) ─────────────────────────────────────────────

const KEY = 'vio.socialProfit';

function read(): ProfitData {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProfitData> | null;
    const data = { ...EMPTY_PROFIT, ...stored };
    // Models saved before prices were kept: fill the new fields.
    const models: ProfitData['models'] = {};
    for (const [key, m] of Object.entries(data.models)) {
      models[key] = { ...m, cost: m.cost ?? null, price: m.price ?? null, category: m.category ?? '', active: m.active ?? true };
    }
    return { ...data, models };
  } catch {
    return { ...EMPTY_PROFIT };
  }
}

function write(data: ProfitData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

class LocalProfitStore implements ProfitStore {
  async load(): Promise<ProfitData> {
    const data = read();
    return { ...data, sponsors: [...data.sponsors].sort((a, b) => b.startDate.localeCompare(a.startDate)) };
  }

  async saveModels(list: ModelValues[]): Promise<void> {
    const data = read();
    const models = { ...data.models };
    const now = new Date().toISOString();
    for (const m of list) {
      if (isEmptyModel(m)) delete models[m.key];
      else {
        models[m.key] = {
          ...m,
          label: m.label.trim(),
          cost: m.cost === null ? null : Math.round(m.cost),
          price: m.price === null ? null : Math.round(m.price),
          category: m.category.trim(),
          updatedAt: now,
        };
      }
    }
    write({ ...data, models });
  }

  async setOrderCost(orderId: string, cost: number | null): Promise<void> {
    const data = read();
    const orderCosts = { ...data.orderCosts };
    if (cost === null) delete orderCosts[orderId];
    else orderCosts[orderId] = Math.round(cost);
    write({ ...data, orderCosts });
  }

  async saveSponsor(input: SponsorInput, id?: string): Promise<Sponsor> {
    const data = read();
    const row = sponsorColumns(input);
    const existing = id ? data.sponsors.find((s) => s.id === id) : undefined;
    const sponsor = toSponsor({
      ...row,
      id: existing?.id ?? crypto.randomUUID(),
      created_at: existing?.createdAt ?? new Date().toISOString(),
    });
    write({ ...data, sponsors: [...data.sponsors.filter((s) => s.id !== sponsor.id), sponsor] });
    return sponsor;
  }

  async deleteSponsor(id: string): Promise<void> {
    const data = read();
    write({ ...data, sponsors: data.sponsors.filter((s) => s.id !== id) });
  }
}
