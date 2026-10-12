import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { OrdersError, MESSAGES, type OrdersErrorCode } from './errors';
import { LocalOrdersStore } from './localStore';
import type {
  ImportedOrder,
  NewSalesOrder,
  NewSocialAccount,
  SalesOrder,
  SalesOrderPatch,
  SellerOrder,
  SellerSession,
  SocialAccount,
} from './types';

export { OrdersError, ordersErrorMessage, type OrdersErrorCode } from './errors';

export interface OrdersStore {
  // Seller — the only things the order page can do.
  signIn(username: string, password: string): Promise<SellerSession>;
  /** The seller's name while their token is valid, else null. */
  whoAmI(token: string): Promise<string | null>;
  signOut(token: string): Promise<void>;
  submitOrder(token: string, order: NewSalesOrder): Promise<{ orderNo: number }>;
  /** The seller's own orders of the last 24 hours, newest first. */
  listMyOrders(token: string): Promise<SellerOrder[]>;
  /** Fix one of those while it is still new. */
  updateMyOrder(token: string, id: string, order: NewSalesOrder): Promise<void>;
  deleteMyOrder(token: string, id: string): Promise<void>;

  // Owner report.
  listOrders(): Promise<SalesOrder[]>;
  updateOrder(id: string, patch: SalesOrderPatch): Promise<void>;
  deleteOrder(id: string): Promise<void>;
  /** Adds rows from the old sheet, skipping any already imported. */
  importOrders(rows: ImportedOrder[]): Promise<{ added: number; skipped: number }>;
  listAccounts(): Promise<SocialAccount[]>;
  createAccount(input: NewSocialAccount): Promise<void>;
  setAccountPassword(id: string, password: string): Promise<void>;
  updateAccount(id: string, patch: Partial<Pick<SocialAccount, 'displayName' | 'employeeId' | 'active'>>): Promise<void>;
  deleteAccount(id: string): Promise<void>;
}

let cached: OrdersStore | undefined;

/** Supabase when it is configured, otherwise this browser (local sandbox). */
export function getOrdersStore(): OrdersStore {
  if (!cached) {
    const client = getSupabaseClient();
    cached = client ? new SupabaseOrdersStore(client) : new LocalOrdersStore();
  }
  return cached;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  order_no: number;
  account_id: string | null;
  seller_name: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  second_phone: string;
  city: string;
  address: string;
  item_model: string;
  item_category: string;
  total_price: number | string;
  gender: SalesOrder['gender'];
  platform: string;
  purchase: SalesOrder['purchase'];
  shift: SalesOrder['shift'];
  note: string;
  status: SalesOrder['status'];
  source: SalesOrder['source'];
  edited_at?: string | null;
}

interface AccountRow {
  id: string;
  employee_id: string | null;
  display_name: string;
  username: string;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

const ACCOUNT_COLUMNS = 'id, employee_id, display_name, username, active, created_at, last_login_at';

function toOrder(row: OrderRow): SalesOrder {
  return {
    id: row.id,
    orderNo: Number(row.order_no),
    accountId: row.account_id,
    sellerName: row.seller_name,
    createdAt: row.created_at,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    secondPhone: row.second_phone,
    city: row.city,
    address: row.address,
    itemModel: row.item_model,
    itemCategory: row.item_category,
    totalPrice: Number(row.total_price) || 0,
    gender: row.gender,
    platform: row.platform,
    purchase: row.purchase,
    shift: row.shift,
    note: row.note,
    status: row.status,
    source: row.source,
    editedAt: row.edited_at ?? null,
  };
}

function toAccount(row: AccountRow): SocialAccount {
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    employeeId: row.employee_id,
    active: row.active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/** Order fields in the column names the table uses. */
function orderColumns(order: SalesOrderPatch): Record<string, unknown> {
  const map: Record<string, string> = {
    customerName: 'customer_name',
    customerPhone: 'customer_phone',
    secondPhone: 'second_phone',
    city: 'city',
    address: 'address',
    itemModel: 'item_model',
    itemCategory: 'item_category',
    totalPrice: 'total_price',
    gender: 'gender',
    platform: 'platform',
    purchase: 'purchase',
    shift: 'shift',
    note: 'note',
    status: 'status',
    sellerName: 'seller_name',
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(order)) {
    if (value !== undefined && map[key]) row[map[key]] = value;
  }
  return row;
}

/**
 * The functions raise a bare code such as SESSION_EXPIRED; a database that has
 * not run social-orders.sql answers with "relation/function does not exist".
 */
function translate(error: { code?: string; message?: string }): Error {
  const message = error.message ?? '';
  if (message in MESSAGES) return new OrdersError(message as OrdersErrorCode);
  if (
    error.code === '42P01' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /does not exist|could not find the (function|table)/i.test(message)
  ) {
    return new OrdersError('NOT_SET_UP');
  }
  return new Error(message || 'The database refused the request.');
}

class SupabaseOrdersStore implements OrdersStore {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async signIn(username: string, password: string): Promise<SellerSession> {
    const { data, error } = await this.client.rpc('social_sign_in', {
      p_username: username.trim(),
      p_password: password,
    });
    if (error) throw translate(error);
    const result = data as { error?: OrdersErrorCode; token?: string; displayName?: string };
    if (result.error) throw new OrdersError(result.error);
    return { token: result.token ?? '', displayName: result.displayName ?? '' };
  }

  async whoAmI(token: string): Promise<string | null> {
    const { data, error } = await this.client.rpc('social_whoami', { p_token: token });
    if (error) throw translate(error);
    return (data as { displayName?: string } | null)?.displayName ?? null;
  }

  async signOut(token: string): Promise<void> {
    await this.client.rpc('social_sign_out', { p_token: token });
  }

  async submitOrder(token: string, order: NewSalesOrder): Promise<{ orderNo: number }> {
    const { data, error } = await this.client.rpc('submit_social_order', {
      p_token: token,
      p_order: order,
    });
    if (error) throw translate(error);
    return { orderNo: Number((data as { orderNo: number }).orderNo) };
  }

  async listMyOrders(token: string): Promise<SellerOrder[]> {
    const { data, error } = await this.client.rpc('social_my_orders', { p_token: token });
    if (error) throw translate(error);
    return ((data ?? []) as SellerOrder[]).map((o) => ({ ...o, totalPrice: Number(o.totalPrice) || 0 }));
  }

  async updateMyOrder(token: string, id: string, order: NewSalesOrder): Promise<void> {
    const { error } = await this.client.rpc('update_my_social_order', {
      p_token: token,
      p_order_id: id,
      p_order: order,
    });
    if (error) throw translate(error);
  }

  async deleteMyOrder(token: string, id: string): Promise<void> {
    const { error } = await this.client.rpc('delete_my_social_order', {
      p_token: token,
      p_order_id: id,
    });
    if (error) throw translate(error);
  }

  async listOrders(): Promise<SalesOrder[]> {
    // Supabase returns at most 1000 rows a request, so read in pages.
    const pageSize = 1000;
    const rows: OrderRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('social_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw translate(error);
      rows.push(...((data ?? []) as OrderRow[]));
      if (!data || data.length < pageSize) break;
    }
    return rows.map(toOrder);
  }

  async updateOrder(id: string, patch: SalesOrderPatch): Promise<void> {
    const { error } = await this.client.from('social_orders').update(orderColumns(patch)).eq('id', id);
    if (error) throw translate(error);
  }

  async deleteOrder(id: string): Promise<void> {
    const { error } = await this.client.from('social_orders').delete().eq('id', id);
    if (error) throw translate(error);
  }

  async importOrders(rows: ImportedOrder[]): Promise<{ added: number; skipped: number }> {
    let added = 0;
    // Oldest first, so order numbers follow the dates.
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < sorted.length; i += 200) {
      const batch = sorted.slice(i, i + 200).map((row) => ({
        ...orderColumns(row),
        seller_name: row.sellerName,
        account_id: row.accountId,
        created_at: row.createdAt,
        source: 'import',
        import_key: row.importKey,
      }));
      const { data, error } = await this.client
        .from('social_orders')
        .upsert(batch, { onConflict: 'import_key', ignoreDuplicates: true })
        .select('id');
      if (error) throw translate(error);
      added += data?.length ?? 0;
    }
    return { added, skipped: rows.length - added };
  }

  async listAccounts(): Promise<SocialAccount[]> {
    const { data, error } = await this.client
      .from('social_accounts')
      .select(ACCOUNT_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) throw translate(error);
    return ((data ?? []) as AccountRow[]).map(toAccount);
  }

  async createAccount(input: NewSocialAccount): Promise<void> {
    const { error } = await this.client.rpc('create_social_account', {
      p_display_name: input.displayName.trim(),
      p_username: input.username.trim(),
      p_password: input.password,
      p_employee_id: input.employeeId,
    });
    if (error) throw translate(error);
  }

  async setAccountPassword(id: string, password: string): Promise<void> {
    const { error } = await this.client.rpc('set_social_account_password', {
      p_account_id: id,
      p_password: password,
    });
    if (error) throw translate(error);
  }

  async updateAccount(
    id: string,
    patch: Partial<Pick<SocialAccount, 'displayName' | 'employeeId' | 'active'>>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
    if (patch.employeeId !== undefined) row.employee_id = patch.employeeId;
    if (patch.active !== undefined) row.active = patch.active;
    const { error } = await this.client.from('social_accounts').update(row).eq('id', id);
    if (error) throw translate(error);
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await this.client.from('social_accounts').delete().eq('id', id);
    if (error) throw translate(error);
  }
}
