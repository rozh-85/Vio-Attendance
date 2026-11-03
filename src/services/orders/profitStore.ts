import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { LocalOrdersStore } from './localStore';
import { OrdersError } from './errors';
import {
  EMPTY_PROFIT,
  type ModelCost,
  type ModelValues,
  type ProfitData,
  type Sponsor,
  type SponsorInput,
} from './profit';

/**
 * Where the owner's products (each with its cost), per-order costs, the start
 * day and sponsors are kept: owner-only tables next to the orders
 * (supabase/social-profit.sql), or this browser in the local sandbox.
 * Sellers reach only `loadPriceList`, which never carries a cost.
 */
export interface ProfitStore {
  load(): Promise<ProfitData>;
  /** Adds these products, or changes them, in one go. */
  saveModels(models: ModelValues[]): Promise<void>;
  deleteModels(keys: string[]): Promise<void>;
  /** null goes back to the product's cost. */
  setOrderCost(orderId: string, cost: number | null): Promise<void>;
  /** Several orders' own costs in one go. */
  setOrderCosts(costs: Record<string, number>): Promise<void>;
  /** The first day whose orders count. */
  setStartDate(day: string): Promise<void>;
  /** Adds a sponsor, or changes the one with this id. */
  saveSponsor(input: SponsorInput, id?: string): Promise<Sponsor>;
  deleteSponsor(id: string): Promise<void>;
}

/** A product sellers see as they write the model: never its cost. */
export interface PriceListItem {
  key: string;
  model: string;
  name: string;
  category: string;
}

export class ProfitNotSetUpError extends Error {
  constructor(again = false) {
    super(
      again
        ? 'The product list needs the newest database script. Run supabase/social-profit.sql again in the Supabase SQL editor.'
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
 * The owner's products, suggested to a signed-in seller as they write the
 * model. An empty list (no product yet, or the database script not run)
 * just means no suggestions.
 */
export async function loadPriceList(token: string): Promise<PriceListItem[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.rpc('social_price_list', { p_token: token });
    if (error) {
      if (error.message === 'SESSION_EXPIRED') throw new OrdersError('SESSION_EXPIRED');
      return [];
    }
    return ((data ?? []) as Partial<PriceListItem>[]).map((p) => ({
      key: p.key ?? '',
      model: p.model ?? '',
      name: p.name ?? '',
      category: p.category ?? '',
    }));
  }
  if (!(await new LocalOrdersStore().whoAmI(token))) throw new OrdersError('SESSION_EXPIRED');
  return Object.values(read().models)
    .map((m) => ({ key: m.key, model: m.label, name: m.name, category: m.category }))
    .sort((a, b) => a.model.localeCompare(b.model, undefined, { numeric: true }));
}

// ── Supabase ─────────────────────────────────────────────────────────────────

interface ModelRow {
  model_key: string;
  model_label: string;
  product_name: string;
  cost: number | string | null;
  category: string;
  created_at: string;
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
    name: row.product_name ?? '',
    cost: money(row.cost),
    category: row.category ?? '',
    createdAt: row.created_at,
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
 * that ran an older copy lacks the product columns or the start day.
 */
function translate(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (
    error.code === '42703' ||
    (error.code === 'PGRST204' && /product_name|created_at|category/.test(message)) ||
    /social_profit_settings/.test(message)
  ) {
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
    const [models, orderCosts, sponsors, settings] = await Promise.all([
      this.all<ModelRow>(
        'social_model_costs',
        'model_key, model_label, product_name, cost, category, created_at, updated_at',
        'model_key',
      ),
      this.all<OrderCostRow>('social_order_costs', 'order_id, cost', 'order_id'),
      this.all<SponsorRow>('social_sponsors', '*', 'id'),
      this.all<{ starts_on: string | null }>('social_profit_settings', 'starts_on', 'id'),
    ]);
    return {
      models: Object.fromEntries(models.map((m) => [m.model_key, toModel(m)])),
      orderCosts: Object.fromEntries(orderCosts.map((o) => [o.order_id, Number(o.cost) || 0])),
      sponsors: sponsors.map(toSponsor).sort((a, b) => b.startDate.localeCompare(a.startDate)),
      startDate: settings[0]?.starts_on ?? null,
    };
  }

  async saveModels(models: ModelValues[]): Promise<void> {
    if (!models.length) return;
    const { error } = await this.client.from('social_model_costs').upsert(
      models.map((m) => ({
        model_key: m.key,
        model_label: m.label.trim(),
        product_name: m.name.trim(),
        cost: m.cost === null ? null : Math.round(m.cost),
        category: m.category.trim(),
        active: true,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'model_key' },
    );
    if (error) throw translate(error);
  }

  async deleteModels(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const { error } = await this.client.from('social_model_costs').delete().in('model_key', keys);
    if (error) throw translate(error);
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

  async setOrderCosts(costs: Record<string, number>): Promise<void> {
    const rows = Object.entries(costs).map(([order_id, cost]) => ({
      order_id,
      cost: Math.round(cost),
      updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.client.from('social_order_costs').upsert(rows.slice(i, i + 500), { onConflict: 'order_id' });
      if (error) throw translate(error);
    }
  }

  async setStartDate(day: string): Promise<void> {
    const { error } = await this.client
      .from('social_profit_settings')
      .upsert({ id: true, starts_on: day, updated_at: new Date().toISOString() }, { onConflict: 'id' });
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
    // Models saved before products had names: fill the new fields.
    const models: ProfitData['models'] = {};
    for (const [key, m] of Object.entries(data.models)) {
      models[key] = { ...m, name: m.name ?? '', cost: m.cost ?? null, category: m.category ?? '', createdAt: m.createdAt ?? m.updatedAt };
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
      models[m.key] = {
        key: m.key,
        label: m.label.trim(),
        name: m.name.trim(),
        cost: m.cost === null ? null : Math.round(m.cost),
        category: m.category.trim(),
        createdAt: models[m.key]?.createdAt ?? now,
        updatedAt: now,
      };
    }
    write({ ...data, models });
  }

  async deleteModels(keys: string[]): Promise<void> {
    const data = read();
    const models = { ...data.models };
    for (const key of keys) delete models[key];
    write({ ...data, models });
  }

  async setOrderCost(orderId: string, cost: number | null): Promise<void> {
    const data = read();
    const orderCosts = { ...data.orderCosts };
    if (cost === null) delete orderCosts[orderId];
    else orderCosts[orderId] = Math.round(cost);
    write({ ...data, orderCosts });
  }

  async setOrderCosts(costs: Record<string, number>): Promise<void> {
    const data = read();
    const orderCosts = { ...data.orderCosts };
    for (const [id, cost] of Object.entries(costs)) orderCosts[id] = Math.round(cost);
    write({ ...data, orderCosts });
  }

  async setStartDate(day: string): Promise<void> {
    write({ ...read(), startDate: day });
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
