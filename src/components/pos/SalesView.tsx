import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, parseISO, startOfDay, startOfMonth, subDays } from 'date-fns';
import { formatPhone } from '@/services/repairs/logic';
import { posErrorMessage, type PosLang, type PosText } from '@/services/pos/i18n';
import { netTotal, newestFirst, num, piecesOf, saleLabel, saleStatus, showDay, showTime } from '@/services/pos/logic';
import type { PosStore } from '@/services/pos/store';
import type { PosItem, PosSettings, Sale, SaleStatus } from '@/services/pos/types';
import { Photo, lineImage } from './parts';
import { SaleDetail } from './SaleDetail';

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

/** Past sales: found by day, number, customer, mobile or model; opened to print, return, change or delete. */
export function SalesView({ store, items, settings, seller, openId, onEdit, lang, t }: {
  store: PosStore;
  items: PosItem[];
  settings: PosSettings;
  seller: string;
  /** A sale to open at once. */
  openId: string | null;
  onEdit: (sale: Sale) => void;
  lang: PosLang;
  t: PosText;
}) {
  const [period, setPeriod] = useState<Period>(openId ? 'all' : 'today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(openId);
  const request = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

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
  const figures = useMemo(
    () => ({
      invoices: shown.length,
      pieces: shown.reduce((n, s) => n + piecesOf(s.lines), 0),
      refunded: shown.reduce((n, s) => n + s.refunded, 0),
      net: shown.reduce((n, s) => n + netTotal(s), 0),
    }),
    [shown],
  );
  const open = sales.find((s) => s.id === selected) ?? null;

  /** A sale that changed here is put back in place without waiting for the server. */
  function changed(sale: Sale) {
    setSales((list) => (sale.deletedAt ? list.filter((s) => s.id !== sale.id) : list.map((s) => (s.id === sale.id ? sale : s))).sort(newestFirst));
    if (sale.deletedAt) setSelected(null);
    void load();
  }

  const periods: [Period, string][] = [
    ['today', t.today],
    ['yesterday', t.yesterday],
    ['week', t.week],
    ['month', t.month],
    ['all', t.all],
  ];
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const itemsText = (s: Sale) => s.lines.map((l) => (l.qty > 1 ? `${l.code} ×${l.qty}` : l.code)).join(', ');

  return (
    <div className={`pos-sales${open ? ' open' : ''}`}>
      <section className="pos-list" aria-label={t.pastSales}>
        <div className="pos-tools">
          <input className="pos-input grow" type="search" dir="auto" value={text} placeholder={t.searchSales} aria-label={t.searchSales} onChange={(e) => setText(e.target.value)} />
          <label className="pos-inline">
            <span>{t.status}</span>
            <select className="pos-input" value={status} onChange={(e) => setStatus(e.target.value as SaleStatus | '')}>
              <option value="">{t.allStatuses}</option>
              {(['sold', 'part', 'returned'] as const).map((s) => (
                <option key={s} value={s}>
                  {t.statusName[s]}
                </option>
              ))}
            </select>
          </label>
          <span className="pos-break" />
          <div className="pos-choice" role="group" aria-label={t.date}>
            {periods.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={!query && period === id}
                onClick={() => {
                  setPeriod(id);
                  setFrom('');
                  setTo('');
                  setText('');
                  setQuery('');
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="pos-inline">
            <span>{t.from}</span>
            <input className="pos-input" type="date" value={from} max={to || todayKey} onChange={(e) => { setFrom(e.target.value); setPeriod('days'); }} />
          </label>
          <label className="pos-inline">
            <span>{t.to}</span>
            <input className="pos-input" type="date" value={to} min={from} max={todayKey} onChange={(e) => { setTo(e.target.value); setPeriod('days'); }} />
          </label>
        </div>

        <div className="pos-figures">
          <div><span>{t.invoices}</span><b className="num">{num(figures.invoices)}</b></div>
          <div><span>{t.itemsSold}</span><b className="num">{num(figures.pieces)}</b></div>
          <div><span>{t.returned}</span><b className="num">{num(figures.refunded)}</b></div>
          <div><span>{t.net}</span><b className="num">{num(figures.net)} <em>IQD</em></b></div>
        </div>

        {error && <div className="pos-strip" role="alert">{error}</div>}
        <div className="pos-scroll">
          {!shown.length ? (
            <p className="pos-none">{loading ? t.loading : query ? t.noSalesFound : t.noSales}</p>
          ) : (
            <>
              <table className="pos-table">
                <thead>
                  <tr>
                    <th>{t.invoice}</th>
                    <th>{t.date}</th>
                    <th>{t.customer}</th>
                    <th>{t.item}</th>
                    <th className="hide-md">{t.seller}</th>
                    <th>{t.status}</th>
                    <th className="end">{t.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => {
                    const st = saleStatus(s);
                    return (
                      <tr key={s.id} aria-selected={s.id === selected} onClick={() => setSelected(s.id)}>
                        <td>
                          <button type="button" className="pos-open num" onClick={(e) => { e.stopPropagation(); setSelected(s.id); }}>
                            {saleLabel(s)}
                          </button>
                          {s.pending && <small className="st st-part">{t.notSent}</small>}
                        </td>
                        <td><b className="num">{showTime(s.soldAt)}</b><small className="num">{showDay(s.soldAt)}</small></td>
                        <td><b dir="auto">{s.customerName}</b><small className="num">{formatPhone(s.customerPhone)}</small></td>
                        <td>
                          <span className="pos-thumbs">
                            {s.lines.slice(0, 3).map((l) => <Photo key={l.id} image={lineImage(l, items)} sizes="40px" />)}
                            <span dir="ltr">{itemsText(s)}</span>
                          </span>
                        </td>
                        <td className="hide-md" dir="auto">{s.seller}</td>
                        <td><span className={`st st-${st}`}>{t.statusName[st]}</span></td>
                        <td className="end"><b className="num">{num(netTotal(s))}</b>{s.refunded > 0 && <small className="num"><s>{num(s.total)}</s></small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pos-rows">
                {shown.map((s) => {
                  const st = saleStatus(s);
                  return (
                    <button key={s.id} type="button" className="pos-row" onClick={() => setSelected(s.id)}>
                      <span className="pos-line-photo"><Photo image={lineImage(s.lines[0], items)} sizes="56px" /></span>
                      <span className="mid">
                        <b dir="auto">{s.customerName}</b>
                        <small className="num">{formatPhone(s.customerPhone)}</small>
                        <small dir="ltr">{itemsText(s)}</small>
                      </span>
                      <span className="end">
                        <b className="num">{num(netTotal(s))}</b>
                        <small className="num">{saleLabel(s)} · {showTime(s.soldAt)}</small>
                        <small className={`st st-${s.pending ? 'part' : st}`}>{s.pending ? t.notSent : st === 'sold' ? showDay(s.soldAt) : t.statusName[st]}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>

      {open && (
        <SaleDetail
          key={open.id}
          sale={open}
          store={store}
          items={items}
          settings={settings}
          seller={seller}
          onChanged={changed}
          onEdit={onEdit}
          onClose={() => setSelected(null)}
          lang={lang}
          t={t}
        />
      )}
    </div>
  );
}
