import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { CalendarDays, CheckCircle, Download, Wallet, X } from '@/components/icons';
import { Equation, MoneySplit } from '@/components/orders/profit/Overview';
import { DailyProfit, SponsorReturn } from '@/components/orders/profit/Charts';
import { GettingStarted, SponsorList, TopModels } from '@/components/orders/profit/Lists';
import { LoadProblem } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { summarizeProfit } from '@/services/orders/profit';
import {
  clearProfitNotice,
  readProfitNotice,
  readProfitPeriod,
  writeProfitPeriod,
  type ProfitPeriod,
} from '@/services/orders/profitMemory';
import { EMPTY_FILTERS, PERIODS, describePeriod, periodRange, type PeriodId } from '@/services/orders/report';
import { exportProfitExcel } from '@/services/report/profitExcel';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const segment = (on: boolean) =>
  cn(
    'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition',
    on ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
  );

const dateClass =
  'h-10 rounded-xl border border-slate-200 bg-card px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * Profit on the social media orders, on its own page: sales − goods −
 * sponsors = net profit for a period, the day-by-day profit, whether the
 * sponsors pay off, the sponsors and the best models. Costs and sponsors are
 * changed on their own pages, reached from here.
 */
export function ProfitPage() {
  const { orders, profit, error, loading, reload } = useProfitData();
  const [view, setView] = useState<ProfitPeriod>(readProfitPeriod);
  const [notice, setNotice] = useState(readProfitNotice);

  // The "saved" message from the page just left shows once, then fades.
  useEffect(() => {
    clearProfitNotice();
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pick = (period: PeriodId | 'custom', range = { from: view.from, to: view.to }) => {
    const next = { period, ...range };
    setView(next);
    writeProfitPeriod(next);
  };

  const s = useMemo(
    () => (orders && profit ? summarizeProfit(orders, profit, view.from, view.to) : null),
    [orders, profit, view.from, view.to],
  );
  const periodText = describePeriod({ ...EMPTY_FILTERS, from: view.from, to: view.to });
  const hasCosts = !!profit && (Object.keys(profit.models).length > 0 || Object.keys(profit.orderCosts).length > 0);
  const missingModels = s ? s.byModel.filter((r) => r.key && r.cost === null && r.orders > 0).length : 0;

  return (
    <AdminLayout>
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Profit</h1>
          <p className="mt-1 text-ink-500">What the social media orders earned after the goods and the sponsors.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to={paths.socialOrders}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-card px-4 text-sm font-semibold text-ink-700 transition hover:bg-slate-50"
          >
            <Wallet width={16} height={16} /> Orders
          </Link>
          <Button
            variant="outline"
            disabled={!s || !orders || !profit}
            leftIcon={<Download width={16} height={16} />}
            onClick={() =>
              s && orders && profit && exportProfitExcel({ orders, data: profit, summary: s, from: view.from, to: view.to, period: periodText })
            }
          >
            Excel
          </Button>
        </div>
      </div>

      {/* ── Period ────────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" className={segment(view.period === p.id)} onClick={() => pick(p.id, periodRange(p.id))}>
              {p.label}
            </button>
          ))}
          <button type="button" className={segment(view.period === 'custom')} onClick={() => pick('custom')}>
            Custom
          </button>
        </div>
        {view.period === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <input type="date" aria-label="From" className={dateClass} value={view.from} onChange={(e) => pick('custom', { from: e.target.value, to: view.to })} />
            <span>to</span>
            <input type="date" aria-label="To" className={dateClass} value={view.to} onChange={(e) => pick('custom', { from: view.from, to: e.target.value })} />
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700">
            <CalendarDays width={16} height={16} className="text-ink-400" />
            {periodText}
          </span>
        )}
      </div>

      {notice && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-emerald-800">
          <CheckCircle width={20} height={20} className="shrink-0" />
          <span className="flex-1 font-semibold">{notice}</span>
          <button type="button" aria-label="Close" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            <X width={16} height={16} />
          </button>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {error ? (
          <LoadProblem error={error} onRetry={() => void reload()} />
        ) : loading || !s || !profit ? (
          <p className="py-16 text-center text-ink-400">Loading…</p>
        ) : (
          <>
            {hasCosts ? (
              <>
                <Equation s={s} />
                <MoneySplit s={s} missingModels={missingModels} />
                <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
                  <div className="min-w-0 lg:col-span-2">
                    <DailyProfit s={s} />
                  </div>
                  <SponsorReturn s={s} />
                </div>
              </>
            ) : (
              <GettingStarted models={s.byModel.filter((r) => r.key).length} sponsors={profit.sponsors.length} />
            )}
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              <SponsorList
                sponsors={profit.sponsors}
                from={view.from}
                to={view.to}
                total={s.sponsor}
                sales={s.sales}
                days={s.trendUnit === 'day' ? s.trend.length : 0}
              />
              <TopModels s={s} />
            </div>
            <p className="pt-2 text-sm text-ink-400">
              Cancelled and returned orders are not counted. Orders with no cost are left out until their cost is
              written, so they never count as profit. A sponsor over several days counts an equal share on each day.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
