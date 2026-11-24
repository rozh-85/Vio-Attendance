import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { MultiSelect, type MultiSelectOption } from '@/components/orders/MultiSelect';
import { PriceList } from '@/components/pos/PriceList';
import { ItemsCard, TimeCard } from '@/components/pos/ReportViews';
import { SaleDrawer, type SaleMode } from '@/components/pos/SaleDrawer';
import { SalesList } from '@/components/pos/SalesList';
import { Labelled, Segmented, SummaryCard, field } from '@/components/pos/ui';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Download, FileText, Layers, Printer, Search, Tag, TrendingUp, Undo, Wallet, X } from '@/components/icons';
import { TEXT, posErrorMessage } from '@/services/pos/i18n';
import { CATEGORIES, DEFAULT_SETTINGS, categoryName, mergeItems } from '@/services/pos/items';
import { PosError, num, rateText, usd } from '@/services/pos/logic';
import { printInvoice } from '@/services/pos/print';
import { EMPTY_FILTERS, REPORT_PERIODS, REPORT_STATUSES, activeFilters, buildReport, describeDays, describeFilters, reportSales, type ReportFilters, type ReportPeriod, type ReportStatus } from '@/services/pos/report';
import { printReport } from '@/services/pos/reportPrint';
import { getPosStore, type PosSetup } from '@/services/pos/store';
import type { Sale } from '@/services/pos/types';
import { exportPosExcel } from '@/services/report/posExcel';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const t = TEXT.en;

const TABS = [
  { id: 'items', label: 'Items sold' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'times', label: 'Days and hours' },
  { id: 'prices', label: 'Prices and settings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const STATUS_OPTIONS: MultiSelectOption[] = REPORT_STATUSES.map((s) => ({ value: s.id, label: s.label }));

/** New sales show up without a reload while the report is open. */
const REFRESH_MS = 30_000;

/**
 * The owner's report on the till: what was sold, by whom and to whom, with
 * every filter, A4 and Excel — and the price list every till uses.
 */
export function PosReportPage() {
  const store = getPosStore();
  // In the address (?tab=invoices), so a refresh stays on the same tab.
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((x) => x.id === params.get('tab')) ? (params.get('tab') as Tab) : 'items';
  const setTab = (next: Tab) => setParams(next === 'items' ? {} : { tab: next }, { replace: true });
  const [sales, setSales] = useState<Sale[]>([]);
  const [setup, setSetup] = useState<PosSetup>({ settings: DEFAULT_SETTINGS, changes: [] });
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ setup: boolean; message: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<{ id: string; mode: SaleMode } | null>(null);
  const set = (change: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...change }));

  const load = useCallback(async () => {
    void store.setup().then(setSetup);
    try {
      setSales(await store.report());
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      setError({ setup: err instanceof PosError && err.code === 'NOT_SET_UP', message: posErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const items = useMemo(() => mergeItems(setup.changes), [setup.changes]);
  const report = useMemo(() => buildReport(sales, filters), [sales, filters]);
  const invoices = useMemo(() => reportSales(sales, filters), [sales, filters]);

  // Only what was ever sold can be picked, so a choice is never empty for good.
  const options = useMemo(() => {
    const sold = new Map<string, string>();
    const categories = new Set<string>();
    for (const s of sales) {
      for (const l of s.lines) {
        categories.add(l.category);
        sold.set(l.itemId, items.find((i) => i.id === l.itemId)?.model ?? l.code);
      }
    }
    return {
      items: [...sold].sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true })).map(([value, label]) => ({ value, label })),
      categories: CATEGORIES.filter((c) => categories.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
    };
  }, [sales, items]);

  const itemName = (id: string) => options.items.find((o) => o.value === id)?.label ?? id;
  const words = describeFilters(filters, itemName, (id) => categoryName(id));
  const days = describeDays(report.days);
  const opened = open ? (sales.find((s) => s.id === open.id) ?? null) : null;
  const today = format(new Date(), 'yyyy-MM-dd');

  /** A sale changed here shows at once; the next read brings the rest. */
  function changed(sale: Sale) {
    setSales((list) => list.map((s) => (s.id === sale.id ? sale : s)));
    void load();
  }

  return (
    <AdminLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">POS report</h1>
          <p className="mt-1 text-ink-500">Everything the till sold, and the prices it sells at.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {updatedAt && (
            <span className="hidden items-center gap-2 text-sm text-ink-400 sm:inline-flex">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" /> Live
            </span>
          )}
          <span className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-card px-4 text-sm">
            <span className="text-ink-500">Dollar</span>
            <b className="font-semibold tabular-nums text-ink-900">{rateText(setup.settings.rate)}</b>
          </span>
          <Link to={paths.pos} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700">
            Open the till
          </Link>
        </div>
      </div>

      <Segmented<Tab> phone={2} label="POS report" value={tab} options={[...TABS]} onChange={setTab} className="mt-5 sm:w-max sm:max-w-full" />

      <div className="mt-5 space-y-4 sm:space-y-5">
        {error && (
          <Card className="border-amber-200 bg-amber-50/60 p-6 text-amber-900">
            <h2 className="text-lg font-bold">{error.setup ? 'One step left' : 'Could not load the sales'}</h2>
            <p className="mt-1 max-w-3xl">
              {error.setup
                ? 'Open Supabase, SQL editor, paste the file supabase/pos.sql, press Run, then come back here. Until then each till keeps its sales on its own device and sends them afterwards.'
                : error.message}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </Card>
        )}

        {tab === 'prices' ? (
          <PriceList store={store} setup={setup} items={items} onChanged={() => void load()} />
        ) : (
          <>
            {/* The period and a search on top, the list filters as equal fields under them. */}
            <Card className="space-y-3 p-3 sm:p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <Segmented<ReportPeriod>
                  phone={4}
                  label="Period"
                  value={filters.period}
                  options={REPORT_PERIODS}
                  onChange={(period) => set(period === 'days' ? { period, from: filters.from || today, to: filters.to || today } : { period, from: '', to: '' })}
                />
                <label className="relative block min-w-0 flex-1">
                  <Search width={17} height={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input className={cn(field, 'ps-10')} dir="auto" value={filters.query} placeholder="Customer, mobile, invoice or model" aria-label="Search" onChange={(e) => set({ query: e.target.value })} />
                </label>
              </div>
              {filters.period === 'days' && (
                <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
                  <Labelled label="From">
                    <input className={field} type="date" value={filters.from} max={filters.to || today} onChange={(e) => set({ from: e.target.value })} />
                  </Labelled>
                  <Labelled label="To">
                    <input className={field} type="date" value={filters.to} min={filters.from} max={today} onChange={(e) => set({ to: e.target.value })} />
                  </Labelled>
                </div>
              )}
              <div className={cn('grid grid-cols-2 gap-2 lg:grid-cols-3 max-lg:[&>*:nth-child(3)]:col-span-2', activeFilters(filters) > 0 && 'lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]!')}>
                <MultiSelect label="Item" searchable options={options.items} selected={filters.items} onChange={(v) => set({ items: v })} />
                <MultiSelect label="Category" options={options.categories} selected={filters.categories} onChange={(v) => set({ categories: v })} />
                <MultiSelect label="Sales" options={STATUS_OPTIONS} selected={filters.statuses} onChange={(v) => set({ statuses: v as ReportStatus[] })} />
                {activeFilters(filters) > 0 && (
                  <button type="button" onClick={() => setFilters((f) => ({ ...EMPTY_FILTERS, period: f.period, from: f.from, to: f.to }))} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 max-lg:col-span-2">
                    <X width={15} height={15} /> Clear all
                  </button>
                )}
              </div>
            </Card>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-ink-900">{days}</h2>
                <p className="text-sm text-ink-500">{words || 'All items and categories'}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={!report.items.length} leftIcon={<Printer width={16} height={16} />} onClick={() => void printReport(report, words, items, setup.settings)}>
                  Print A4
                </Button>
                <Button variant="outline" disabled={!invoices.length} leftIcon={<Download width={16} height={16} />} onClick={() => exportPosExcel(report, invoices, words)}>
                  Excel
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6 xl:gap-3.5">
              <SummaryCard label="Net sales" icon={Wallet} accent value={num(report.net)} unit="IQD" note={usd(report.netUsd)} />
              <SummaryCard label="Items sold" icon={Layers} value={num(report.sold)} note={report.returned ? `${num(report.returned)} came back` : 'none came back'} />
              <SummaryCard label="Invoices" icon={FileText} value={num(report.invoices)} note={`${num(report.customers)} ${report.customers === 1 ? 'customer' : 'customers'}`} />
              <SummaryCard label="Discounts" icon={Tag} value={num(report.discount)} unit="IQD" note="taken off prices" />
              <SummaryCard label="Raised prices" icon={TrendingUp} value={num(report.raised)} unit="IQD" note="above the list" />
              <SummaryCard label="Given back" icon={Undo} value={num(report.refunded)} unit="IQD" note="for returns" />
            </div>

            {loading ? (
              <Card className="px-5 py-16 text-center text-ink-500">Loading…</Card>
            ) : tab === 'items' ? (
              report.items.length ? (
                <ItemsCard report={report} items={items} onPick={(id) => set({ items: filters.items.length === 1 && filters.items[0] === id ? [] : [id] })} />
              ) : (
                <Card className="px-5 py-16 text-center text-ink-500">No items were sold in this period.</Card>
              )
            ) : tab === 'invoices' ? (
              invoices.length ? (
                <SalesList sales={invoices} items={items} marks t={t} onOpen={(s, mode) => setOpen({ id: s.id, mode })} onPrint={(s) => void printInvoice(s, setup.settings, items)} />
              ) : (
                <Card className="px-5 py-16 text-center text-ink-500">No invoices match this period and these filters.</Card>
              )
            ) : report.times.some((x) => x.invoices || x.net) ? (
              <TimeCard report={report} />
            ) : (
              <Card className="px-5 py-16 text-center text-ink-500">No sales in this period.</Card>
            )}
          </>
        )}
      </div>

      {opened && open && (
        <SaleDrawer
          key={`${opened.id}-${open.mode}`}
          sale={opened}
          start={open.mode}
          store={store}
          items={items}
          settings={setup.settings}
          seller=""
          owner
          onChanged={changed}
          onClose={() => setOpen(null)}
          lang="en"
          t={t}
        />
      )}
    </AdminLayout>
  );
}
