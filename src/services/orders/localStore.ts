import { OrdersError } from './errors';
import type { OrdersStore } from './store';
import type {
  ImportedOrder,
  NewSalesOrder,
  NewSocialAccount,
  SalesOrder,
  SalesOrderPatch,
  SellerSession,
  SocialAccount,
} from './types';

/**
 * Orders kept in this browser, for the local sandbox with no Supabase. Same
 * rules as the database: sellers only add, the owner reads. Passwords are
 * stored hashed even here, but this is a test store, not a secure one.
 */

const KEYS = {
  orders: 'vio.socialOrders',
  accounts: 'vio.socialAccounts',
  sessions: 'vio.socialSessions',
} as const;

interface StoredAccount extends SocialAccount {
  passwordHash: string;
}

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class LocalOrdersStore implements OrdersStore {
  private async accountFor(token: string): Promise<StoredAccount | null> {
    const hash = await sha256(token);
    const session = read<{ hash: string; accountId: string }>(KEYS.sessions).find(
      (s) => s.hash === hash,
    );
    const account = session
      ? read<StoredAccount>(KEYS.accounts).find((a) => a.id === session.accountId)
      : undefined;
    return account?.active ? account : null;
  }

  async signIn(username: string, password: string): Promise<SellerSession> {
    const accounts = read<StoredAccount>(KEYS.accounts);
    const account = accounts.find(
      (a) => a.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!account?.active || account.passwordHash !== (await sha256(password))) {
      throw new OrdersError('WRONG_LOGIN');
    }
    const token = randomToken();
    write(KEYS.sessions, [
      ...read<{ hash: string; accountId: string }>(KEYS.sessions),
      { hash: await sha256(token), accountId: account.id },
    ]);
    write(
      KEYS.accounts,
      accounts.map((a) =>
        a.id === account.id ? { ...a, lastLoginAt: new Date().toISOString() } : a,
      ),
    );
    return { token, displayName: account.displayName };
  }

  async whoAmI(token: string): Promise<string | null> {
    return (await this.accountFor(token))?.displayName ?? null;
  }

  async signOut(token: string): Promise<void> {
    const hash = await sha256(token);
    write(
      KEYS.sessions,
      read<{ hash: string }>(KEYS.sessions).filter((s) => s.hash !== hash),
    );
  }

  async submitOrder(token: string, order: NewSalesOrder): Promise<{ orderNo: number }> {
    const account = await this.accountFor(token);
    if (!account) throw new OrdersError('SESSION_EXPIRED');
    if (
      !order.customerName.trim() ||
      !order.customerPhone.trim() ||
      !order.city.trim() ||
      !order.platform.trim() ||
      !(order.totalPrice > 0)
    ) {
      throw new OrdersError('ORDER_INCOMPLETE');
    }
    const orders = read<SalesOrder>(KEYS.orders);
    const orderNo = orders.reduce((max, o) => Math.max(max, o.orderNo), 0) + 1;
    write(KEYS.orders, [
      ...orders,
      {
        ...order,
        totalPrice: Math.round(order.totalPrice),
        id: crypto.randomUUID(),
        orderNo,
        accountId: account.id,
        sellerName: account.displayName,
        createdAt: new Date().toISOString(),
        status: 'new',
        source: 'app',
      },
    ]);
    return { orderNo };
  }

  async listOrders(): Promise<SalesOrder[]> {
    return read<SalesOrder>(KEYS.orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateOrder(id: string, patch: SalesOrderPatch): Promise<void> {
    write(
      KEYS.orders,
      read<SalesOrder>(KEYS.orders).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }

  async deleteOrder(id: string): Promise<void> {
    write(KEYS.orders, read<SalesOrder>(KEYS.orders).filter((o) => o.id !== id));
  }

  async importOrders(rows: ImportedOrder[]): Promise<{ added: number; skipped: number }> {
    const orders = read<SalesOrder & { importKey?: string }>(KEYS.orders);
    const seen = new Set(orders.map((o) => o.importKey).filter(Boolean));
    let orderNo = orders.reduce((max, o) => Math.max(max, o.orderNo), 0);
    let added = 0;
    for (const row of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (seen.has(row.importKey)) continue;
      seen.add(row.importKey);
      orderNo += 1;
      added += 1;
      orders.push({ ...row, id: crypto.randomUUID(), orderNo, status: 'new', source: 'import' });
    }
    write(KEYS.orders, orders);
    return { added, skipped: rows.length - added };
  }

  async listAccounts(): Promise<SocialAccount[]> {
    return read<StoredAccount>(KEYS.accounts).map(({ passwordHash: _hash, ...account }) => account);
  }

  async createAccount(input: NewSocialAccount): Promise<void> {
    const accounts = read<StoredAccount>(KEYS.accounts);
    if (!input.displayName.trim() || !/^[A-Za-z0-9._-]{3,32}$/.test(input.username.trim())) {
      throw new OrdersError('ACCOUNT_INVALID');
    }
    if (input.password.length < 6) throw new OrdersError('PASSWORD_TOO_SHORT');
    if (accounts.some((a) => a.username.toLowerCase() === input.username.trim().toLowerCase())) {
      throw new OrdersError('USERNAME_TAKEN');
    }
    write(KEYS.accounts, [
      ...accounts,
      {
        id: crypto.randomUUID(),
        displayName: input.displayName.trim(),
        username: input.username.trim(),
        employeeId: input.employeeId,
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        passwordHash: await sha256(input.password),
      },
    ]);
  }

  async setAccountPassword(id: string, password: string): Promise<void> {
    if (password.length < 6) throw new OrdersError('PASSWORD_TOO_SHORT');
    const passwordHash = await sha256(password);
    write(
      KEYS.accounts,
      read<StoredAccount>(KEYS.accounts).map((a) => (a.id === id ? { ...a, passwordHash } : a)),
    );
    write(
      KEYS.sessions,
      read<{ accountId: string }>(KEYS.sessions).filter((s) => s.accountId !== id),
    );
  }

  async updateAccount(
    id: string,
    patch: Partial<Pick<SocialAccount, 'displayName' | 'employeeId' | 'active'>>,
  ): Promise<void> {
    write(
      KEYS.accounts,
      read<StoredAccount>(KEYS.accounts).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  async deleteAccount(id: string): Promise<void> {
    write(KEYS.accounts, read<StoredAccount>(KEYS.accounts).filter((a) => a.id !== id));
    write(
      KEYS.orders,
      read<SalesOrder>(KEYS.orders).map((o) => (o.accountId === id ? { ...o, accountId: null } : o)),
    );
  }
}
