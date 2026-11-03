import { useCallback, useEffect, useState } from 'react';
import { OrdersError, getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import { ProfitNotSetUpError, getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import type { ProfitData } from '@/services/orders/profit';
import type { SalesOrder } from '@/services/orders/types';

export interface ProfitLoadError {
  /** Which database script still has to be run, if that is the trouble. */
  script: 'social-orders.sql' | 'social-profit.sql' | null;
  message: string;
}

/**
 * The orders and the costs and sponsors behind the Profit pages. Loads both,
 * again when the window gets focus, and lets a page change the loaded
 * profit data in place after a save.
 */
export function useProfitData() {
  const [orders, setOrders] = useState<SalesOrder[] | null>(null);
  const [profit, setProfit] = useState<ProfitData | null>(null);
  const [error, setError] = useState<ProfitLoadError | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextOrders, nextProfit] = await Promise.all([getOrdersStore().listOrders(), getProfitStore().load()]);
      setOrders(nextOrders);
      setProfit(nextProfit);
      setError(null);
    } catch (err) {
      if (err instanceof ProfitNotSetUpError) setError({ script: 'social-profit.sql', message: err.message });
      else if (err instanceof OrdersError && err.code === 'NOT_SET_UP') {
        setError({ script: 'social-orders.sql', message: ordersErrorMessage(err) });
      } else setError({ script: null, message: err instanceof OrdersError ? ordersErrorMessage(err) : profitErrorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const update = useCallback((change: (data: ProfitData) => ProfitData) => {
    setProfit((current) => (current ? change(current) : current));
  }, []);

  return { orders, profit, error, loading: !error && (!orders || !profit), reload, update };
}
