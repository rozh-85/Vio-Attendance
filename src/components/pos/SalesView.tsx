import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { CheckCircle, FileText, Layers, Search, Undo, Wallet } from '@/components/icons';
import { posErrorMessage, type PosLang, type PosText } from '@/services/pos/i18n';
import { netTotal, newestFirst, num, piecesOf, saleLabel, saleStatus, showDay } from '@/services/pos/logic';
import { printInvoice } from '@/services/pos/print';
import type { PosStore } from '@/services/pos/store';
import type { PosItem, PosSettings, Sale, SaleStatus } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { SaleDrawer, type SaleMode } from './SaleDrawer';
import { SalesList } from './SalesList';
import { Labelled, Notice, Segmented, SelectBox, SummaryCard, field } from './ui';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'days';

const REFRESH_MS = 30_000;

/** The days a period covers; `to` is not included. */
function rangeOf(period: Period, from: string, to: string, now = new Date()): { from?: Date; to?: Date } {
  const today = startOfDay(now);
  if (period === 'today') return { from: today, to: addDays(today, 1) };
  if (period === 'yesterday') return { from: subDays(today, 1), to: today };
  if (period === 'week') return { from: subDays(today, 6), to: addDays(today, 1) };
  if (period === 'month') return { from: startOfMonth(now), to: addDays(today, 1) };
  if (period === 'days') return { from: from ? parseISO(from) : undefined, to: to ? addDays(parseISO(to), 1) : undefined };
  return {};
}

/** Past sales: found by day, number, customer, mobile or model; every action opens over this same page. */
export function SalesView({ store, items, settings, lang, t }: { store: PosStore; items: PosItem[]; settings: PosSettings; lang: PosLang; t: PosText }) {
  const [period, setPeriod] = useState<Period>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [open, setOpen] = useState<{ id: string; mode: SaleMode } | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(''), 5000);
    return () => window.clearTimeout(timer);
  }, [done]);

  const load = useCallback(async () => {
    const mine = ++request.current;
    try {
      // A search looks through every day, not only the chosen period.
      const rows = await store.list({ ...(query ? {} : rangeOf(period, from, to)), query });
      if (mine !== request.current) return;
      setSales(rows);
      setError('');
    } catch (err) {
      if (mine === request.current) setError(posErrorMessage(err, t));
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, [store, query, period, from, to, t]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const off = store.subscribe(() => void load());
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      off();
    };
  }, [load, store]);

  const shown = useMemo(() => (status ? sales.filter((s) => saleStatus(s) === status) : sales), [sales, status]);
  const figures = useMemo(() => {
    const net = shown.reduce((n, s) => n + netTotal(s), 0);
    return {
      invoices: shown.length,
      customers: new Set(shown.map((s) => s.customerPhone)).size,
      back: shown.reduce((n, s) => n + s.returns.reduce((m, r) => m + piecesOf(r.lines), 0), 0),
      pieces: shown.reduce((n, s) => n + piecesOf(s.lines), 0),
      refunded: shown.reduce((n, s) => n + s.refunded, 0),
      discount: shown.reduce((n, s) => n + s.discount, 0),
      net,
      average: shown.length ? net / shown.length : 0,
    };
  }, [shown]);
  const opened = open ? (sales.find((s) => s.id === open.id) ?? null) : null;

  /** A sale that changed here is put back in place without waiting for the server. */
  function changed(sale: Sale) {
    setSales((list) => (sale.deletedAt ? list.filter((s) => s.id !== sale.id) : list.map((s) => (s.id === sale.id ? sale : s))).sort(newestFirst));
    if (sale.deletedAt) {
      setOpen(null);
      setDone(`${t.invoice} ${saleLabel(sale)}: ${t.statusName.deleted}`);
    }
    void load();
  }

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const range = rangeOf(period, from, to);
  const days = query
    ? `${t.all} · “${query}”`
    : !range.from && !range.to
      ? t.all
      : [range.from && showDay(range.from), range.to && showDay(subDays(range.to, 1))].filter((x, i, a) => x && a.indexOf(x) === i).join(' – ');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="w-full space-y-4 p-3 sm:space-y-5 sm:p-5 lg:px-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">{t.pastSales}</h1>
          <p className="mt-1 text-ink-500">{days}</p>
        </div>

        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <Segmented<Period>
              phone={3}
              label={t.date}
              value={query ? null : period}
              options={[
                { id: 'today', label: t.today },
                { id: 'yesterday', label: t.yesterday },
                { id: 'week', label: t.week },
                { id: 'month', label: t.month },
                { id: 'all', label: t.all },
                { id: 'days', label: t.dates },
              ]}
              onChange={(id) => {
                setPeriod(id);
                setText('');
                setQuery('');
                if (id === 'days' && !from && !to) {
                  setFrom(todayKey);
                  setTo(todayKey);
                }
              }}
            />
            <div className="flex min-w-0 flex-1 gap-2.5 max-sm:flex-col">
              <label className="relative block min-w-0 flex-1">
                <Search width={17} height={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className={cn(field, 'ps-10')} dir="auto" value={text} placeholder={t.searchSales} aria-label={t.searchSales} onChange={(e) => setText(e.target.value)} />
              </label>
              <SelectBox className="shrink-0 sm:w-44" value={status} aria-label={t.status} onChange={(e) => setStatus(e.target.value as SaleStatus | '')}>
                <option value="">{t.allStatuses}</option>
                {(['sold', 'part', 'returned'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t.statusName[s]}
                  </option>
                ))}
              </SelectBox>
            </div>
          </div>
          {period === 'days' && !query && (
            <div className="grid grid-cols-2 gap-2.5 sm:max-w-md">
              <Labelled label={t.from}>
                <input className={field} type="date" value={from} max={to || todayKey} onChange={(e) => setFrom(e.target.value)} />
              </Labelled>
              <Labelled label={t.to}>
                <input className={field} type="date" value={to} min={from} max={todayKey} onChange={(e) => setTo(e.target.value)} />
              </Labelled>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <SummaryCard label={t.net} icon={Wallet} accent value={num(figures.net)} unit="IQD" note={`${t.average} ${num(figures.average)}`} />
          <SummaryCard label={t.invoices} icon={FileText} value={num(figures.invoices)} note={t.customers(figures.customers)} />
          <SummaryCard label={t.itemsSold} icon={Layers} value={num(figures.pieces)} note={`${t.discount} ${num(figures.discount)}`} />
          <SummaryCard label={t.returned} icon={Undo} value={num(figures.refunded)} unit="IQD" note={t.pieces(figures.back)} />
        </div>

        {done && (
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 font-semibold text-emerald-800">
            <CheckCircle width={20} height={20} className="shrink-0" /> {done}
          </div>
        )}
        {error && <Notice tone="danger">{error}</Notice>}

        {shown.length ? (
          <SalesList sales={shown} items={items} t={t} onOpen={(s, mode) => setOpen({ id: s.id, mode })} onPrint={(s) => void printInvoice(s, settings, items)} />
        ) : (
          <Card className="px-5 py-16 text-center text-ink-500">{loading ? t.loading : query ? t.noSalesFound : t.noSales}</Card>
        )}
      </div>

      {opened && open && (
        <SaleDrawer
          key={`${opened.id}-${open.mode}`}
          sale={opened}
          start={open.mode}
          store={store}
          items={items}
          settings={settings}
          onChanged={changed}
          onClose={() => setOpen(null)}
          lang={lang}
          t={t}
        />
      )}
    </div>
  );
}
