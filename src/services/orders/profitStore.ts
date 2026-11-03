import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { EMPTY_PROFIT, type ModelCost, type ProfitData, type Sponsor, type SponsorInput } from './profit';

/**
 * Where model costs, per-order costs and sponsors are kept: three owner-only
 * tables next to the orders (supabase/social-profit.sql), or this browser in
 * the local sandbox. Sellers never reach any of it.
 */
export interface ProfitStore {
  load(): Promise<ProfitData>;
  /** null removes the cost. */
  setModelCost(key: string, label: string, cost: number | null): Promise<void>;
  /** null goes back to the model's cost. */
  setOrderCost(orderId: string, cost: number | null): Promise<void>;
  /** Adds a sponsor, or changes the one with this id. */
  saveSponsor(input: SponsorInput, id?: string): Promise<Sponsor>;
  deleteSponsor(id: string): Promise<void>;
}

export class ProfitNotSetUpError extends Error {
  constructor() {
    super('Profit is not set up in the database yet. Run supabase/social-profit.sql once in the Supabase SQL editor.');
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

// ── Supabase ─────────────────────────────────────────────────────────────────

interface ModelRow {
  model_key: string;
  model_label: string;
  cost: number | string;
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

/** A database that has not run social-profit.sql has none of the tables. */
function translate(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|could not find the table/i.test(message)
  ) {
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
      this.all<ModelRow>('social_model_costs', 'model_key, model_label, cost, updated_at', 'model_key'),
      this.all<OrderCostRow>('social_order_costs', 'order_id, cost', 'order_id'),
      this.all<SponsorRow>('social_sponsors', '*', 'id'),
    ]);
    return {
      models: Object.fromEntries(
        models.map((m) => [
          m.model_key,
          { key: m.model_key, label: m.model_label, cost: Number(m.cost) || 0, updatedAt: m.updated_at } satisfies ModelCost,
        ]),
      ),
      orderCosts: Object.fromEntries(orderCosts.map((o) => [o.order_id, Number(o.cost) || 0])),
      sponsors: sponsors.map(toSponsor).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    };
  }

  async setModelCost(key: string, label: string, cost: number | null): Promise<void> {
    const { error } =
      cost === null
        ? await this.client.from('social_model_costs').delete().eq('model_key', key)
        : await this.client.from('social_model_costs').upsert(
            { model_key: key, model_label: label.trim(), cost: Math.round(cost), updated_at: new Date().toISOString() },
            { onConflict: 'model_key' },
          );
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
    return { ...EMPTY_PROFIT, ...stored };
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

  async setModelCost(key: string, label: string, cost: number | null): Promise<void> {
    const data = read();
    const models = { ...data.models };
    if (cost === null) delete models[key];
    else models[key] = { key, label: label.trim(), cost: Math.round(cost), updatedAt: new Date().toISOString() };
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
