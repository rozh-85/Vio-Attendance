import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPhone } from '@/services/repairs/logic';
import { TEXT, posErrorMessage } from '@/services/pos/i18n';
import { categoryName } from '@/services/pos/items';
import { netTotal, num, saleLabel, saleStatus, showDay, showTime } from '@/services/pos/logic';
import { isEdited, isRaised, type ItemRow, type Report, type TimeRow } from '@/services/pos/report';
import type { PosItem, Sale } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { Photo, lineImage } from './parts';
import { SaleBody, SaleHistory, SaleSums } from './SaleDetail';

const t = TEXT.en;

/** A phone, or a window as narrow as one. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

type SortKey = 'code' | 'sold' | 'returned' | 'discount' | 'net';

/** Which items were sold, how many, and the money they brought in. */
export function ItemsTable({ report, items, onPick }: { report: Report; items: PosItem[]; onPick: (itemId: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'net', up: false });
  const rows = useMemo(() => {
    const by = (a: ItemRow, b: ItemRow) =>
      sort.key === 'code' ? a.code.localeCompare(b.code, 'en', { numeric: true }) : a[sort.key] - b[sort.key];
    return [...report.items].sort((a, b) => (sort.up ? by(a, b) : by(b, a)));
  }, [report.items, sort]);
  const most = Math.max(1, ...report.items.map((r) => r.net));
  const image = (r: ItemRow) => r.image || items.find((i) => i.id === r.itemId)?.image || '';

  if (!rows.length) return <p className="pr-none">No items were sold in this period.</p>;

  const th = (key: SortKey, label: string, end = true) => (
    <th className={end ? 'end' : undefined} aria-sort={sort.key === key ? (sort.up ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={cn(sort.key === key && 'on')} onClick={() => setSort((s) => ({ key, up: s.key === key ? !s.up : key === 'code' }))}>
        {label}
        {sort.key === key && <span aria-hidden>{sort.up ? ' ↑' : ' ↓'}</span>}
      </button>
    </th>
  );

  return (
    <section className="pr-box">
      <table className="pr-table items">
        <thead>
          <tr>
            {th('code', 'Item', false)}
            <th className="hide-sm">Category</th>
            {th('sold', 'Sold')}
            {th('returned', 'Returned')}
            {th('discount', 'Discount')}
            {th('net', 'Net IQD')}
            <th className="hide-sm share">Share of sales</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={() => onPick(r.itemId)} title="Show only this item">
              <td>
                <span className="pr-item">
                  <span className="pr-photo"><Photo image={image(r)} sizes="48px" /></span>
                  <span>
                    <b>{r.code}</b>
                    <small>{[r.name, r.color].filter(Boolean).join(' · ')}</small>
                  </span>
                </span>
              </td>
              <td className="hide-sm">{categoryName(r.category)}</td>
              <td className="end strong" data-label="Sold">{num(r.sold)}</td>
              <td className={cn('end', !r.returned && 'zero')} data-label="Returned">{r.returned ? num(r.returned) : '—'}</td>
              <td className={cn('end', !r.discount && 'zero')} data-label="Discount">{r.discount ? num(r.discount) : '—'}</td>
              <td className="end strong" data-label="Net IQD">{num(r.net)}</td>
              <td className="hide-sm share">
                <span className="pr-share" title={`${r.code}: ${num(r.net)} IQD`}>
                  <i style={{ width: `${Math.max(0, (r.net / most) * 100)}%` }} />
                  <em>{(r.share * 100).toFixed(r.share > 0 && r.share < 0.1 ? 1 : 0)}%</em>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{rows.length} {rows.length === 1 ? 'item' : 'items'}</td>
            <td className="hide-sm" />
            <td className="end" data-label="Sold">{num(report.sold)}</td>
            <td className={cn('end', !report.returned && 'zero')} data-label="Returned">{report.returned ? num(report.returned) : '—'}</td>
            <td className={cn('end', !report.discount && 'zero')} data-label="Discount">{report.discount ? num(report.discount) : '—'}</td>
            <td className="end" data-label="Net IQD">{num(report.net)}</td>
            <td className="hide-sm" />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

const PAGE = 50;

/** Every invoice of the period, opened with a click. */
export function InvoicesTable({ sales, items, onOpen }: { sales: Sale[]; items: PosItem[]; onOpen: (id: string) => void }) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [sales.length]);
  if (!sales.length) return <p className="pr-none">No invoices match this period and these filters.</p>;
  const marks = (s: Sale) =>
    [
      s.pending && 'Not sent yet',
      isEdited(s) && 'Changed',
      s.lines.some(isRaised) && 'Raised price',
      s.discount > 0 && `Discount ${num(s.discount)}`,
    ].filter(Boolean);

  return (
    <section className="pr-box">
      <table className="pr-table invoices">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Items</th>
            <th className="hide-sm">Seller</th>
            <th>Status</th>
            <th className="end">Net IQD</th>
          </tr>
        </thead>
        <tbody>
          {sales.slice(0, shown).map((s) => {
            const st = saleStatus(s);
            return (
              <tr key={s.id} onClick={() => onOpen(s.id)} className={cn(s.deletedAt && 'gone')}>
                <td data-label="Invoice">
                  <button type="button" className="pr-open" onClick={(e) => { e.stopPropagation(); onOpen(s.id); }}>{saleLabel(s)}</button>
                  <small>{showDay(s.soldAt)} {showTime(s.soldAt)}</small>
                </td>
                <td data-label="Customer">
                  <b dir="auto">{s.customerName}</b>
                  <small>{formatPhone(s.customerPhone)}</small>
                </td>
                <td data-label="Items">
                  <span className="pr-items">
                    {s.lines.slice(0, 3).map((l) => <span key={l.id} className="pr-photo small"><Photo image={lineImage(l, items)} sizes="36px" /></span>)}
                    <span>{s.lines.map((l) => (l.qty > 1 ? `${l.code} ×${l.qty}` : l.code)).join(', ')}</span>
                  </span>
                </td>
                <td className="hide-sm" dir="auto">{s.seller || '—'}</td>
                <td data-label="Status">
                  <span className={`st-${st}`}>{t.statusName[st]}</span>
                  {marks(s).length > 0 && <small>{marks(s).join(', ')}</small>}
                </td>
                <td className="end strong" data-label="Net IQD">
                  {num(netTotal(s))}
                  {s.refunded > 0 && <small><s>{num(s.total)}</s></small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sales.length > shown && (
        <button type="button" className="pr-more" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({num(sales.length - shown)} left)
        </button>
      )}
    </section>
  );
}

const UNIT = { hour: 'hour', day: 'day', month: 'month' } as const;

/** Net sales by hour, day or month: one series of columns, then the same in a table. */
export function TimeChart({ report }: { report: Report }) {
  const [over, setOver] = useState<TimeRow | null>(null);
  const { times, unit } = report;
  const top = niceTop(Math.max(0, ...times.map((x) => x.net)));
  const step = Math.ceil(times.length / (useNarrow() ? 5 : 14));
  const filled = times.filter((x) => x.invoices || x.net);
  if (!filled.length) return <p className="pr-none">No sales in this period.</p>;

  return (
    <section className="pr-box">
      <div className="pr-chart">
        <h2>Net sales by {UNIT[unit]}, IQD</h2>
        <p className="pr-tip" aria-live="polite">
          {over ? `${over.label}: ${num(over.net)} IQD, ${num(over.invoices)} ${over.invoices === 1 ? 'invoice' : 'invoices'}, ${num(over.sold)} sold` : 'Point at or touch a column to read it.'}
        </p>
        <div className="pr-plot">
          {[1, 0.5, 0].map((p) => (
            <span key={p} className="pr-grid-line" style={{ bottom: `${p * 100}%` }}>
              <em>{short(top * p)}</em>
            </span>
          ))}
          <div className="pr-cols" onMouseLeave={() => setOver(null)}>
            {times.map((x) => (
              <button
                key={x.key}
                type="button"
                className={cn(over?.key === x.key && 'on')}
                aria-label={`${x.label}: ${num(x.net)} IQD`}
                onMouseEnter={() => setOver(x)}
                onFocus={() => setOver(x)}
                onClick={() => setOver(x)}
              >
                <i style={{ height: `${top > 0 ? Math.max(0, (x.net / top) * 100) : 0}%` }} />
              </button>
            ))}
          </div>
        </div>
        <div className="pr-axis" aria-hidden>
          {times.map((x, i) => (
            <span key={x.key}>{i % step === 0 ? <em>{x.label}</em> : null}</span>
          ))}
        </div>
      </div>
      <table className="pr-table">
        <thead>
          <tr>
            <th>{unit === 'hour' ? 'Hour' : unit === 'day' ? 'Day' : 'Month'}</th>
            <th className="end">Invoices</th>
            <th className="end">Items sold</th>
            <th className="end">Discount</th>
            <th className="end">Given back</th>
            <th className="end">Net IQD</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((x) => (
            <tr key={x.key} className="plain">
              <td><b>{unit === 'day' ? showDay(x.key) : x.label}</b></td>
              <td className="end" data-label="Invoices">{num(x.invoices)}</td>
              <td className="end" data-label="Items sold">{num(x.sold)}</td>
              <td className="end" data-label="Discount">{x.discount ? num(x.discount) : '—'}</td>
              <td className="end" data-label="Given back">{x.refunded ? num(x.refunded) : '—'}</td>
              <td className="end strong" data-label="Net IQD">{num(x.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A round number at or above the highest column. */
function niceTop(max: number): number {
  if (max <= 0) return 0;
  const unit = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 4, 5, 8, 10].map((m) => m * unit).find((n) => n >= max) ?? 10 * unit;
}

const short = (n: number): string =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(Math.round(n));

/** One sale, whole, over the report; a deleted one can be put back. */
export function SaleWindow({ sale, items, onPrint, onRestore, onClose }: { sale: Sale; items: PosItem[]; onPrint: () => void; onRestore: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      before?.focus?.();
    };
  }, []);

  const status = saleStatus(sale);
  return (
    <div className="pos pr-window" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="pos-detail" role="dialog" aria-modal="true" aria-label={`Invoice ${saleLabel(sale)}`} tabIndex={-1}>
        <header className="pos-detail-head">
          <h2>
            Invoice <span className="num">{saleLabel(sale)}</span>
          </h2>
          <span className={`st st-${status}`}>{t.statusName[status]}</span>
          <button type="button" className="pos-link" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="pos-bill-scroll">
          {sale.deletedAt && (
            <div className="pos-strip">
              Deleted {showDay(sale.deletedAt)} {showTime(sale.deletedAt)}
              {sale.deleteReason && `: ${sale.deleteReason}`}
            </div>
          )}
          <SaleBody sale={sale} items={items} lang="en" t={t} />
          {sale.returns.length > 0 && (
            <div className="pos-block">
              <h3>Returns</h3>
              {sale.returns.map((r) => (
                <div key={r.id} className="row">
                  <span>
                    <b className="num">{showDay(r.at)} {showTime(r.at)}</b> {r.lines.map((b) => `${sale.lines.find((l) => l.id === b.id)?.code ?? ''} ×${b.qty}`).join(', ')}
                  </span>
                  <b className="num">{num(-r.refund)}</b>
                  {(r.reason || r.by) && <p dir="auto">{[r.reason, r.by].filter(Boolean).join(' · ')}</p>}
                </div>
              ))}
            </div>
          )}
          <SaleHistory sale={sale} t={t} />
        </div>
        <footer className="pos-bill-foot">
          <SaleSums sale={sale} t={t} />
          {error && <div className="pos-error" role="alert">{error}</div>}
          <div className="pos-go">
            <button type="button" className="pos-btn pos-btn-red" onClick={onPrint}>
              Print A4
            </button>
            {sale.deletedAt && (
              <button
                type="button"
                className="pos-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onRestore();
                    onClose();
                  } catch (err) {
                    setError(posErrorMessage(err));
                    setBusy(false);
                  }
                }}
              >
                Put this sale back
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
