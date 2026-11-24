import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import '@/components/pos/pos.css';
import '@/components/pos/report.css';
import { AdminLayout } from '@/components/AdminLayout';
import { InvoicesTable, ItemsTable, SaleWindow, TimeChart } from '@/components/pos/ReportViews';
import { PriceList } from '@/components/pos/PriceList';
import { posErrorMessage } from '@/services/pos/i18n';
import { CATEGORIES, DEFAULT_SETTINGS, categoryName, mergeItems } from '@/services/pos/items';
import { PosError, num, rateText, usd } from '@/services/pos/logic';
import { printInvoice } from '@/services/pos/print';
import { EMPTY_FILTERS, REPORT_PERIODS, REPORT_STATUSES, buildReport, describeDays, describeFilters, reportSales, type ReportFilters, type ReportStatus } from '@/services/pos/report';
import { printReport } from '@/services/pos/reportPrint';
import { getPosStore, type PosSetup } from '@/services/pos/store';
import type { Sale } from '@/services/pos/types';
import { exportPosExcel } from '@/services/report/posExcel';
import { paths } from '@/routes';

const TABS = [
  { id: 'items', label: 'Items sold' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'times', label: 'Days and hours' },
  { id: 'prices', label: 'Prices and settings' },
] as const;
type Tab = (typeof TABS)[number]['id'];

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
  const tab: Tab = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as Tab) : 'items';
  const setTab = (next: Tab) => setParams(next === 'items' ? {} : { tab: next }, { replace: true });
  const [sales, setSales] = useState<Sale[]>([]);
  const [setup, setSetup] = useState<PosSetup>({ settings: DEFAULT_SETTINGS, changes: [] });
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ setup: boolean; message: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // On a phone the filters under the period open with a button.
  const [more, setMore] = useState(false);
  const set = (change: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...change }));

  const load = useCallback(async () => {
    void store.setup().then(setSetup);
    try {
      setSales(await store.report());
      setError(null);
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
  const choices = useMemo(() => {
    const soldItems = new Map<string, string>();
    const categories = new Set<string>();
    const sellers = new Set<string>();
    for (const s of sales) {
      sellers.add(s.seller || '—');
      for (const l of s.lines) {
        categories.add(l.category);
        soldItems.set(l.itemId, items.find((i) => i.id === l.itemId)?.model ?? l.code);
      }
    }
    return {
      items: [...soldItems].sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true })),
      categories: CATEGORIES.filter((c) => categories.has(c.id)),
      sellers: [...sellers].sort((a, b) => a.localeCompare(b)),
    };
  }, [sales, items]);

  const words = describeFilters(filters, (id) => choices.items.find(([i]) => i === id)?.[1] ?? id, (id) => categoryName(id));
  const narrowed = words !== '';
  const open = sales.find((s) => s.id === openId) ?? null;
  const today = format(new Date(), 'yyyy-MM-dd');
  const days = describeDays(report.days);

  const figures: { label: string; value: string; note?: string }[] = [
    { label: 'Net sales', value: num(report.net), note: `IQD · ${usd(report.netUsd)}` },
    { label: 'Items sold', value: num(report.sold), note: report.returned ? `${num(report.returned)} returned` : 'none returned' },
    { label: 'Invoices', value: num(report.invoices), note: `${num(report.customers)} ${report.customers === 1 ? 'customer' : 'customers'}` },
    { label: 'Discounts', value: num(report.discount), note: 'IQD' },
    { label: 'Raised prices', value: num(report.raised), note: 'IQD above the list' },
    { label: 'Money given back', value: num(report.refunded), note: 'IQD' },
  ];

  return (
    <AdminLayout>
      <div className="pr">
        <header className="pr-head">
          <div>
            <h1>POS report</h1>
            <p>
              {days}
              {narrowed && ` · ${words}`}
            </p>
          </div>
          <div className="pr-do">
            <Link className="pr-btn" to={paths.pos} target="_blank">
              Open the till
            </Link>
            <button type="button" className="pr-btn" disabled={!report.items.length} onClick={() => void printReport(report, words, items)}>
              Print A4
            </button>
            <button type="button" className="pr-btn" disabled={!invoices.length} onClick={() => exportPosExcel(report, invoices, words)}>
              Excel
            </button>
          </div>
        </header>

        <nav className="pr-tabs" aria-label="POS report">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <div className="pr-alert" role="alert">
            <b>{error.setup ? 'One step left' : 'Could not load the sales'}</b>
            <p>
              {error.setup
                ? 'Open Supabase, SQL editor, paste the file supabase/pos.sql, press Run, then come back here. Until then each till keeps its sales on its own device and sends them afterwards.'
                : error.message}
            </p>
            <button type="button" className="pr-btn" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {tab === 'prices' ? (
          <PriceList store={store} setup={setup} items={items} onChanged={() => void load()} />
        ) : (
          <>
            <section className="pr-filters" aria-label="Filters">
              <div className="pr-periods" role="group" aria-label="Period">
                {REPORT_PERIODS.map((p) => (
                  <button key={p.id} type="button" aria-pressed={filters.period === p.id} onClick={() => set({ period: p.id, from: '', to: '' })}>
                    {p.label}
                  </button>
                ))}
                {(narrowed || filters.period !== 'today') && (
                  <button type="button" className="clear" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Clear filters
                  </button>
                )}
              </div>
              <button type="button" className="pr-open-filters" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                {more ? 'Hide filters' : 'More filters'}
              </button>
              <div className={`pr-fields eight${more ? ' show' : ''}`}>
                <label>
                  <span>From</span>
                  <input type="date" value={filters.from} max={filters.to || today} onChange={(e) => set({ period: 'days', from: e.target.value })} />
                </label>
                <label>
                  <span>To</span>
                  <input type="date" value={filters.to} min={filters.from} max={today} onChange={(e) => set({ period: 'days', to: e.target.value })} />
                </label>
                <label>
                  <span>Item</span>
                  <select value={filters.item} onChange={(e) => set({ item: e.target.value })}>
                    <option value="">All items</option>
                    {choices.items.map(([id, model]) => (
                      <option key={id} value={id}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Category</span>
                  <select value={filters.category} onChange={(e) => set({ category: e.target.value })}>
                    <option value="">All categories</option>
                    {choices.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Seller</span>
                  <select value={filters.seller} onChange={(e) => set({ seller: e.target.value })}>
                    <option value="">All sellers</option>
                    {choices.sellers.map((s) => (
                      <option key={s} value={s}>
                        {s === '—' ? 'No seller written' : s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sales</span>
                  <select value={filters.status} onChange={(e) => set({ status: e.target.value as ReportStatus })}>
                    {REPORT_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  <span>Search</span>
                  <input type="search" dir="auto" value={filters.query} placeholder="Customer, mobile, invoice or model" onChange={(e) => set({ query: e.target.value })} />
                </label>
              </div>
            </section>

            <section className="pr-figures" aria-label="Figures">
              {figures.map((f) => (
                <div key={f.label}>
                  <span>{f.label}</span>
                  <b>{f.value}</b>
                  {f.note && <small>{f.note}</small>}
                </div>
              ))}
            </section>

            {loading ? (
              <p className="pr-none">Loading…</p>
            ) : tab === 'items' ? (
              <ItemsTable report={report} items={items} onPick={(id) => set({ item: filters.item === id ? '' : id })} />
            ) : tab === 'invoices' ? (
              <InvoicesTable sales={invoices} items={items} onOpen={setOpenId} />
            ) : (
              <TimeChart report={report} />
            )}
          </>
        )}

        <p className="pr-foot">
          Dollar today {rateText(setup.settings.rate)}
          {!setup.settings.rateSet && ' (not set on a till yet)'}
        </p>
      </div>

      {open && (
        <SaleWindow
          sale={open}
          items={items}
          onPrint={() => void printInvoice(open, setup.settings, items)}
          onRestore={async () => {
            await store.restore(open.id);
            await load();
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </AdminLayout>
  );
}
