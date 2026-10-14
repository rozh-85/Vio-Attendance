import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OrdersReport } from '@/components/orders/OrdersReport';
import { SellerAccounts } from '@/components/orders/SellerAccounts';
import { OrderImport } from '@/components/orders/OrderImport';
import { useDataService } from '@/services/data/context';
import { lockOwner } from '@/services/auth/ownerGate';
import { sellerColor } from '@/services/orders/options';
import { sellerList } from '@/services/orders/report';
import { OrdersError, getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { SalesOrder, SocialAccount } from '@/services/orders/types';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';

const TABS = [
  { id: 'report', label: 'Report' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'import', label: 'Import' },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** New orders show up without a reload while the report is open. */
const REFRESH_MS = 30_000;

/**
 * Owner page: every order the social media sellers logged, with totals,
 * filters by seller and everything else, and PDF / Excel. It sits behind the
 * owner password with the other /rozhadmin reports; sellers never reach it.
 */
export function SocialOrdersPage() {
  const data = useDataService();
  const [tab, setTab] = useState<Tab>('report');
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ setup: boolean; message: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const reload = useCallback(async () => {
    const store = getOrdersStore();
    try {
      const [nextOrders, nextAccounts] = await Promise.all([store.listOrders(), store.listAccounts()]);
      setOrders(nextOrders);
      setAccounts(nextAccounts);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError({
        setup: err instanceof OrdersError && err.code === 'NOT_SET_UP',
        message: ordersErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    data
      .listEmployees()
      .then(setEmployees)
      .catch(() => setEmployees([]));
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, REFRESH_MS);
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [data, reload]);

  // Accounts first, in the order they were made, then any other name from the
  // old sheet by how many orders it has — so each seller keeps one colour.
  const sellers = useMemo(() => sellerList(orders, accounts.map((a) => a.displayName)), [orders, accounts]);

  const colorOf = useCallback(
    (seller: string) => {
      const index = sellers.indexOf(seller);
      return sellerColor(index < 0 ? sellers.length : index);
    },
    [sellers],
  );

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Social media orders</h1>
          <p className="mt-1 max-w-3xl text-ink-500">
            Every order the sellers saved on their order page, with the money it brought in. Only this private report
            shows them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="hidden items-center gap-2 text-sm text-ink-400 sm:inline-flex">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => {
              lockOwner();
              window.location.reload();
            }}
          >
            Lock report
          </Button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition',
              tab === t.id ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {t.label}
            {t.id === 'accounts' && accounts.length > 0 && (
              <span className="ml-1.5 text-ink-400">{accounts.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {error ? (
          <Card className="border-amber-200 bg-amber-50/60 p-6 text-amber-900">
            <h2 className="text-lg font-bold">{error.setup ? 'One step left' : 'Could not load the orders'}</h2>
            <p className="mt-1">{error.message}</p>
            {error.setup && (
              <p className="mt-2 text-sm">
                Open Supabase → SQL editor, paste the file <code className="font-mono">supabase/social-orders.sql</code>,
                press Run, then come back here.
              </p>
            )}
            <Button className="mt-4" variant="outline" onClick={() => void reload()}>
              Try again
            </Button>
          </Card>
        ) : loading ? (
          <p className="py-10 text-center text-ink-400">Loading…</p>
        ) : tab === 'report' ? (
          <OrdersReport orders={orders} sellers={sellers} colorOf={colorOf} onChanged={() => void reload()} />
        ) : tab === 'accounts' ? (
          <SellerAccounts
            accounts={accounts}
            employees={employees}
            orders={orders}
            colorOf={colorOf}
            onChanged={() => void reload()}
          />
        ) : (
          <OrderImport accounts={accounts} onImported={() => void reload()} />
        )}
      </div>
    </AdminLayout>
  );
}
