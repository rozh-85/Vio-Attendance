import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { DEFAULT_SETTINGS } from './items';
import {
  PosError,
  applyDelete,
  applyEdit,
  applyRestore,
  applyReturn,
  applyUndoReturn,
  buildSale,
  cleanDraft,
  matchesSale,
  newestFirst,
} from './logic';
import type { PosItemChange, PosSettings, Sale, SaleDraft, SaleReturn } from './types';

/**
 * The till's sales. They live in Supabase (supabase/pos.sql); a sale made with
 * no internet — or before that file has been run — waits on this device and is
 * sent by itself later, under the same id, so it is never saved twice. With no
 * Supabase configured at all, everything stays in this browser.
 */

export interface SaleQuery {
  from?: Date;
  /** Up to, not including. */
  to?: Date;
  query?: string;
}

/** online: saved on the server · offline: no internet · setup: the SQL is not run yet · local: no server at all. */
export type PosState = 'online' | 'offline' | 'setup' | 'local';

export interface PosStatus {
  state: PosState;
  /** Sales waiting on this device. */
  waiting: number;
}

export interface PosSetup {
  settings: PosSettings;
  changes: PosItemChange[];
}

export interface PosStore {
  status(): PosStatus;
  subscribe(listener: () => void): () => void;
  /** Sends what is waiting; resolves when there is nothing more to try. */
  sync(): Promise<void>;
  setup(): Promise<PosSetup>;
  list(query: SaleQuery): Promise<Sale[]>;
  save(draft: SaleDraft): Promise<Sale>;
  update(id: string, draft: SaleDraft): Promise<Sale>;
  addReturn(id: string, ret: SaleReturn): Promise<Sale>;
  undoReturn(id: string, returnId: string, by: string): Promise<Sale>;
  remove(id: string, reason: string, by: string): Promise<Sale>;
  /** The dollar, for every till. */
  setRate(rate: number): Promise<void>;
  // The owner's side (a signed-in supervisor).
  report(): Promise<Sale[]>;
  restore(id: string): Promise<Sale>;
  saveSettings(settings: PosSettings): Promise<void>;
  saveItem(change: PosItemChange): Promise<void>;
  resetItem(id: string): Promise<void>;
}

// ── This device's storage ────────────────────────────────────────────────────

const KEYS = {
  sales: 'vio.pos.sales',
  outbox: 'vio.pos.outbox',
  cache: 'vio.pos.cache',
  setup: 'vio.pos.setup',
  /** A dollar rate set with no internet, still to be sent. */
  rate: 'vio.pos.rate',
} as const;

/** How many of the server's sales are kept for looking up with no internet. */
const CACHE_SIZE = 200;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Throws when it cannot be kept: a sale must never vanish quietly. */
function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function tryWrite(key: string, value: unknown): void {
  try {
    write(key, value);
  } catch {
    // Storage full or blocked: only a convenience copy is lost.
  }
}

const inRange = (sale: Sale, { from, to }: SaleQuery): boolean => {
  const at = new Date(sale.soldAt).getTime();
  return (!from || at >= from.getTime()) && (!to || at < to.getTime());
};

const visible = (sales: Sale[], query: SaleQuery): Sale[] =>
  sales.filter((s) => !s.deletedAt && inRange(s, query) && matchesSale(s, query.query ?? ''));

function setupFrom(raw: Partial<PosSettings> | null | undefined, changes: PosItemChange[]): PosSetup {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...raw,
      offer: { ...DEFAULT_SETTINGS.offer, ...raw?.offer },
      rate: Number(raw?.rate) > 0 ? Number(raw?.rate) : DEFAULT_SETTINGS.rate,
      rateSet: Number(raw?.rate) > 0,
      rounding: Number(raw?.rounding) > 0 ? Number(raw?.rounding) : DEFAULT_SETTINGS.rounding,
    },
    changes,
  };
}

/** What is written down of the settings: `rateSet` is only worked out. */
const stored = ({ rateSet, rate, ...rest }: PosSettings): Partial<PosSettings> => (rateSet ? { ...rest, rate } : rest);

class Listeners {
  private set = new Set<() => void>();
  add(fn: () => void): () => void {
    this.set.add(fn);
    return () => this.set.delete(fn);
  }
  fire(): void {
    for (const fn of this.set) fn();
  }
}

// ── No server: everything in this browser ────────────────────────────────────

class LocalPosStore implements PosStore {
  private listeners = new Listeners();

  status(): PosStatus {
    return { state: 'local', waiting: 0 };
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.add(listener);
  }

  async sync(): Promise<void> {}

  private all(): Sale[] {
    return read<Sale[]>(KEYS.sales, []);
  }

  private change(id: string, fn: (sale: Sale) => Sale): Sale {
    const sales = this.all();
    const sale = sales.find((s) => s.id === id);
    if (!sale) throw new PosError('SALE_NOT_FOUND');
    const next = fn(sale);
    write(KEYS.sales, sales.map((s) => (s.id === id ? next : s)));
    return next;
  }

  async setup(): Promise<PosSetup> {
    const saved = read<{ settings?: Partial<PosSettings>; changes?: PosItemChange[] }>(KEYS.setup, {});
    return setupFrom(saved.settings, saved.changes ?? []);
  }

  async list(query: SaleQuery): Promise<Sale[]> {
    return visible(this.all(), query).sort(newestFirst);
  }

  async save(draft: SaleDraft): Promise<Sale> {
    const sales = this.all();
    const existing = sales.find((s) => s.id === draft.id);
    if (existing) return existing;
    const sale = buildSale(draft, sales.reduce((max, s) => Math.max(max, s.saleNo ?? 0), 1000) + 1);
    write(KEYS.sales, [...sales, sale]);
    return sale;
  }

  async update(id: string, draft: SaleDraft): Promise<Sale> {
    return this.change(id, (s) => applyEdit(s, draft));
  }

  async addReturn(id: string, ret: SaleReturn): Promise<Sale> {
    return this.change(id, (s) => applyReturn(s, ret));
  }

  async undoReturn(id: string, returnId: string, by: string): Promise<Sale> {
    return this.change(id, (s) => applyUndoReturn(s, returnId, by));
  }

  async remove(id: string, reason: string, by: string): Promise<Sale> {
    return this.change(id, (s) => applyDelete(s, reason, by));
  }

  async setRate(rate: number): Promise<void> {
    const { settings, changes } = await this.setup();
    write(KEYS.setup, { settings: { ...settings, rate }, changes });
  }

  async report(): Promise<Sale[]> {
    return this.all().sort(newestFirst);
  }

  async restore(id: string): Promise<Sale> {
    return this.change(id, applyRestore);
  }

  async saveSettings(settings: PosSettings): Promise<void> {
    const { changes } = await this.setup();
    write(KEYS.setup, { settings: stored(settings), changes });
  }

  async saveItem(change: PosItemChange): Promise<void> {
    const { settings, changes } = await this.setup();
    write(KEYS.setup, { settings, changes: [...changes.filter((c) => c.id !== change.id), change] });
  }

  async resetItem(id: string): Promise<void> {
    const { settings, changes } = await this.setup();
    write(KEYS.setup, { settings, changes: changes.filter((c) => c.id !== id) });
  }
}

// ── Supabase, with this device standing in when it cannot be reached ─────────

type RpcError = { code?: string; message?: string };

function translate(error: RpcError): PosError {
  const message = error.message ?? '';
  if (
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the (function|table)|does not exist/i.test(message)
  )
    return new PosError('NOT_SET_UP');
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|aborted|timed? ?out/i.test(message))
    return new PosError('OFFLINE');
  if (/permission denied|NOT_ALLOWED|row-level security/i.test(message)) return new PosError('NOT_ALLOWED');
  const known = /\b(SALE_[A-Z_]+|RETURN_[A-Z_]+|CUSTOMER_[A-Z_]+|RATE_[A-Z_]+)\b/.exec(message);
  return new PosError(known ? known[1] : message || 'UNKNOWN');
}

/** Only the device being cut off or the SQL not being run; a refused sale is refused. */
const canWait = (err: unknown): err is PosError =>
  err instanceof PosError && (err.code === 'OFFLINE' || err.code === 'NOT_SET_UP');

/** A till is never kept waiting on a dead connection. */
const TIMEOUT_MS = 12_000;

const toSale = (raw: Sale): Sale => ({
  ...raw,
  saleNo: raw.saleNo === null ? null : Number(raw.saleNo),
  soldAt: new Date(raw.soldAt).toISOString(),
  subtotal: Number(raw.subtotal),
  discount: Number(raw.discount),
  total: Number(raw.total),
  refunded: Number(raw.refunded),
  rate: Number(raw.rate),
  returns: (raw.returns ?? []).map((r) => ({ ...r, refund: Number(r.refund) })),
  history: raw.history ?? [],
});

class SupabasePosStore implements PosStore {
  private client: SupabaseClient;
  private listeners = new Listeners();
  private state: PosState = 'online';
  private syncing: Promise<void> | null = null;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  status(): PosStatus {
    return { state: this.state, waiting: this.outbox().filter((s) => !s.deletedAt).length };
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.add(listener);
  }

  /** Only a real change is announced: whoever listens reads the sales again. */
  private set(state: PosState): void {
    if (this.state === state) return;
    this.state = state;
    this.listeners.fire();
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set('offline');
      throw new PosError('OFFLINE');
    }
    let result: { data: unknown; error: RpcError | null };
    try {
      result = await this.client.rpc(fn, args).abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    } catch (err) {
      result = { data: null, error: { message: err instanceof Error ? err.message : 'Failed to fetch' } };
    }
    if (result.error) {
      const error = translate(result.error);
      if (error.code === 'OFFLINE') this.set('offline');
      if (error.code === 'NOT_SET_UP') this.set('setup');
      throw error;
    }
    this.set('online');
    return result.data as T;
  }

  // Sales waiting on this device.
  private outbox(): Sale[] {
    return read<Sale[]>(KEYS.outbox, []);
  }

  private keep(sale: Sale): Sale {
    const next = { ...sale, pending: true };
    write(KEYS.outbox, [...this.outbox().filter((s) => s.id !== sale.id), next]);
    this.listeners.fire();
    return next;
  }

  private waiting(id: string): Sale | undefined {
    return this.outbox().find((s) => s.id === id);
  }

  /** Keeps a copy of what the server sent, to look up with no internet. */
  private remember(sales: Sale[]): void {
    const ids = new Set(sales.map((s) => s.id));
    const merged = [...sales, ...read<Sale[]>(KEYS.cache, []).filter((s) => !ids.has(s.id))];
    tryWrite(KEYS.cache, merged.sort(newestFirst).slice(0, CACHE_SIZE));
  }

  async sync(): Promise<void> {
    this.syncing ??= this.send().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async send(): Promise<void> {
    const rate = read<number | null>(KEYS.rate, null);
    if (rate) {
      try {
        await this.call('pos_set_rate', { p_rate: rate });
        localStorage.removeItem(KEYS.rate);
      } catch (err) {
        if (!canWait(err)) localStorage.removeItem(KEYS.rate);
      }
    }
    for (const sale of this.outbox()) {
      try {
        let done = toSale(await this.call<Sale>('pos_save', { p_sale: sale }));
        for (const ret of sale.returns) done = toSale(await this.call<Sale>('pos_return', { p_id: sale.id, p_return: ret }));
        if (sale.deletedAt) {
          const by = sale.history.filter((e) => e.action === 'delete').pop()?.by ?? '';
          done = toSale(await this.call<Sale>('pos_delete', { p_id: sale.id, p_reason: sale.deleteReason, p_by: by }));
        }
        write(KEYS.outbox, this.outbox().filter((s) => s.id !== sale.id));
        this.remember([done]);
        this.listeners.fire();
      } catch (err) {
        if (canWait(err)) return;
        // Refused by the server: it stays on this device, the next ones still go.
      }
    }
  }

  async setup(): Promise<PosSetup> {
    const saved = read<{ settings?: Partial<PosSettings>; changes?: PosItemChange[] }>(KEYS.setup, {});
    // A rate still to be sent counts on this till at once.
    const waiting = read<number | null>(KEYS.rate, null);
    const withRate = (raw: Partial<PosSettings> | undefined) => (waiting ? { ...raw, rate: waiting } : raw);
    try {
      const [settings, items] = await Promise.all([
        this.client.from('pos_settings').select('data').eq('id', 1).maybeSingle(),
        this.client.from('pos_items').select('id, data'),
      ]);
      if (settings.error || items.error) throw translate((settings.error ?? items.error) as RpcError);
      this.set('online');
      const next = {
        settings: (settings.data?.data ?? undefined) as Partial<PosSettings> | undefined,
        changes: (items.data ?? []).map((r) => ({ ...(r.data as Omit<PosItemChange, 'id'>), id: r.id as string })),
      };
      tryWrite(KEYS.setup, next);
      return setupFrom(withRate(next.settings), next.changes);
    } catch (err) {
      const code = err instanceof PosError ? err.code : 'OFFLINE';
      if (code === 'NOT_SET_UP') this.set('setup');
      if (code === 'OFFLINE') this.set('offline');
      // No internet, or the SQL is not run yet: the last settings seen.
      return setupFrom(withRate(saved.settings), saved.changes ?? []);
    }
  }

  async list(query: SaleQuery): Promise<Sale[]> {
    const mine = this.outbox();
    const ids = new Set(mine.map((s) => s.id));
    let rows: Sale[];
    try {
      rows = (
        (await this.call<Sale[] | null>('pos_list', {
          p_from: query.from?.toISOString() ?? null,
          p_to: query.to?.toISOString() ?? null,
          p_query: query.query?.trim() ?? '',
          p_limit: 500,
        })) ?? []
      ).map(toSale);
      this.remember(rows);
    } catch (err) {
      if (!canWait(err)) throw err;
      rows = visible(read<Sale[]>(KEYS.cache, []), query);
    }
    return [...visible(mine, query), ...rows.filter((s) => !ids.has(s.id))].sort(newestFirst);
  }

  async save(draft: SaleDraft): Promise<Sale> {
    try {
      const sale = toSale(await this.call<Sale>('pos_save', { p_sale: cleanDraft(draft) }));
      this.remember([sale]);
      return sale;
    } catch (err) {
      if (!canWait(err)) throw err;
      return this.keep(buildSale(draft, null));
    }
  }

  private async change(id: string, local: (sale: Sale) => Sale, fn: string, args: Record<string, unknown>): Promise<Sale> {
    const waiting = this.waiting(id);
    if (waiting) return this.keep(local(waiting));
    const sale = toSale(await this.call<Sale>(fn, args));
    this.remember([sale]);
    return sale;
  }

  update(id: string, draft: SaleDraft): Promise<Sale> {
    return this.change(id, (s) => applyEdit(s, draft), 'pos_update', {
      p_id: id,
      p_sale: { ...cleanDraft(draft), by: draft.seller },
    });
  }

  addReturn(id: string, ret: SaleReturn): Promise<Sale> {
    return this.change(id, (s) => applyReturn(s, ret), 'pos_return', { p_id: id, p_return: ret });
  }

  undoReturn(id: string, returnId: string, by: string): Promise<Sale> {
    return this.change(id, (s) => applyUndoReturn(s, returnId, by), 'pos_undo_return', {
      p_id: id,
      p_return_id: returnId,
      p_by: by,
    });
  }

  remove(id: string, reason: string, by: string): Promise<Sale> {
    return this.change(id, (s) => applyDelete(s, reason, by), 'pos_delete', { p_id: id, p_reason: reason, p_by: by });
  }

  async setRate(rate: number): Promise<void> {
    write(KEYS.rate, rate);
    try {
      await this.call('pos_set_rate', { p_rate: rate });
      localStorage.removeItem(KEYS.rate);
    } catch (err) {
      if (canWait(err)) return;
      localStorage.removeItem(KEYS.rate);
      throw err;
    }
  }

  async report(): Promise<Sale[]> {
    const mine = this.outbox();
    const ids = new Set(mine.map((s) => s.id));
    const rows = ((await this.call<Sale[] | null>('pos_report', {})) ?? []).map(toSale);
    return [...mine, ...rows.filter((s) => !ids.has(s.id))].sort(newestFirst);
  }

  async restore(id: string): Promise<Sale> {
    return this.change(id, applyRestore, 'pos_restore', { p_id: id });
  }

  private async table(work: PromiseLike<{ error: RpcError | null }>): Promise<void> {
    const { error } = await work;
    if (error) throw translate(error);
  }

  async saveSettings(settings: PosSettings): Promise<void> {
    await this.table(
      this.client.from('pos_settings').upsert({ id: 1, data: stored(settings), updated_at: new Date().toISOString() }),
    );
  }

  async saveItem(change: PosItemChange): Promise<void> {
    const { id, ...data } = change;
    await this.table(this.client.from('pos_items').upsert({ id, data, updated_at: new Date().toISOString() }));
  }

  async resetItem(id: string): Promise<void> {
    await this.table(this.client.from('pos_items').delete().eq('id', id));
  }
}

let cached: PosStore | undefined;

export function getPosStore(): PosStore {
  if (!cached) {
    const client = getSupabaseClient();
    cached = client ? new SupabasePosStore(client) : new LocalPosStore();
  }
  return cached;
}
