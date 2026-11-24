import { useMemo, useState } from 'react';
import { formatPhone } from '@/services/repairs/logic';
import { colorName } from '@/services/pos/items';
import { posErrorMessage, type PosLang, type PosText } from '@/services/pos/i18n';
import { guaranteeEnd, lineTotal, netTotal, newId, num, paidFor, rateText, returnedQty, saleLabel, saleStatus, showDay, showTime, usd } from '@/services/pos/logic';
import { printInvoice, printReturn } from '@/services/pos/print';
import type { PosStore } from '@/services/pos/store';
import type { PosItem, PosSettings, Sale, SaleReturn } from '@/services/pos/types';
import { IqdInput, Photo, PosDialog, Stepper, lineImage } from './parts';

/** One sale, whole: its items, returns and history, with everything that can be done to it. */
export function SaleDetail({ sale, store, items, settings, seller, onChanged, onEdit, onClose, lang, t }: {
  sale: Sale;
  store: PosStore;
  items: PosItem[];
  settings: PosSettings;
  seller: string;
  onChanged: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onClose: () => void;
  lang: PosLang;
  t: PosText;
}) {
  const [dialog, setDialog] = useState<'return' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const status = saleStatus(sale);
  const label = saleLabel(sale);

  async function run(work: () => Promise<Sale>): Promise<Sale | null> {
    setBusy(true);
    setError('');
    try {
      const next = await work();
      onChanged(next);
      return next;
    } catch (err) {
      setError(posErrorMessage(err, t));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function edit() {
    if (sale.returns.length) setError(t.errors.SALE_HAS_RETURNS);
    else onEdit(sale);
  }

  return (
    <aside className="pos-detail" aria-label={`${t.invoice} ${label}`}>
      <header className="pos-detail-head">
        <h2>
          {t.invoice} <span className="num">{label}</span>
        </h2>
        <span className={`st st-${status}`}>{t.statusName[status]}</span>
        <button type="button" className="pos-link" onClick={onClose}>
          {t.close}
        </button>
      </header>

      <div className="pos-bill-scroll">
        <SaleBody sale={sale} items={items} lang={lang} t={t} />
        {sale.returns.length > 0 && (
          <div className="pos-block">
            <h3>{t.returns}</h3>
            {sale.returns.map((r) => (
              <div key={r.id} className="row">
                <span>
                  <b className="num">{showDay(r.at)} {showTime(r.at)}</b>{' '}
                  <span dir="ltr">{r.lines.map((b) => `${sale.lines.find((l) => l.id === b.id)?.code ?? ''} ×${b.qty}`).join(', ')}</span>
                </span>
                <b className="num">{num(-r.refund)}</b>
                {r.reason && <p dir="auto">{r.reason}</p>}
                <span className="links">
                  <button type="button" className="pos-link" onClick={() => void printReturn(sale, r, settings, items)}>{t.printReturn}</button>
                  <button type="button" className="pos-link" disabled={busy} onClick={() => void run(() => store.undoReturn(sale.id, r.id, seller))}>{t.undoReturn}</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <SaleHistory sale={sale} t={t} />
      </div>

      <footer className="pos-bill-foot">
        <SaleSums sale={sale} t={t} />
        {error && <div className="pos-error" role="alert">{error}</div>}
        <div className="pos-detail-do">
          <button type="button" className="pos-btn pos-btn-red" onClick={() => void printInvoice(sale, settings, items)}>{t.print}</button>
          <button type="button" className="pos-btn" disabled={busy || status === 'returned'} onClick={() => setDialog('return')}>{t.returnItems}</button>
          <button type="button" className="pos-btn" disabled={busy} onClick={edit}>{t.edit}</button>
          <button type="button" className="pos-btn pos-btn-warn" disabled={busy} onClick={() => setDialog('delete')}>{t.delete}</button>
        </div>
      </footer>

      {dialog === 'return' && (
        <ReturnDialog
          sale={sale}
          items={items}
          seller={seller}
          busy={busy}
          error={error}
          lang={lang}
          t={t}
          onClose={() => { setDialog(null); setError(''); }}
          onSave={async (ret, print) => {
            const next = await run(() => store.addReturn(sale.id, ret));
            if (!next) return;
            setDialog(null);
            if (print) void printReturn(next, next.returns.find((r) => r.id === ret.id) ?? ret, settings, items);
          }}
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog label={label} busy={busy} error={error} t={t} onClose={() => { setDialog(null); setError(''); }} onDelete={(reason) => void run(() => store.remove(sale.id, reason, seller))} />
      )}
    </aside>
  );
}

/** The customer, the facts and the items of a sale. */
export function SaleBody({ sale, items, lang, t }: { sale: Sale; items: PosItem[]; lang: PosLang; t: PosText }) {
  const ku = lang === 'ku';
  return (
    <>
      <div className="pos-facts">
        <div><span>{t.customer}</span><b dir="auto">{sale.customerName}</b></div>
        <div><span>{t.phone}</span><b className="num">{formatPhone(sale.customerPhone)}</b></div>
        <div><span>{t.date}</span><b className="num">{showDay(sale.soldAt)} {showTime(sale.soldAt)}</b></div>
        <div><span>{t.seller}</span><b dir="auto">{sale.seller || '—'}</b></div>
        <div><span>{t.dollarThen}</span><b className="num">{rateText(sale.rate)}</b></div>
        <div><span>{t.guarantee}</span><b className="num">{showDay(guaranteeEnd(sale.soldAt))}</b></div>
        {sale.customerAddress && <div className="full"><span>{t.address}</span><b dir="auto">{sale.customerAddress}</b></div>}
        {sale.note && <div className="full"><span>{t.note}</span><b dir="auto">{sale.note}</b></div>}
      </div>
      {sale.lines.map((line) => {
        const back = returnedQty(sale, line.id);
        return (
          <div key={line.id} className="pos-sold">
            <span className="pos-line-photo"><Photo image={lineImage(line, items)} sizes="56px" /></span>
            <span className="pos-line-name">
              <b>{line.code}</b>
              <small>{ku ? line.ku || line.name : line.name}{line.color && ` · ${colorName(line.color, ku)}`}</small>
              <small className="num">{line.qty} × {num(line.price)}</small>
              {line.price !== line.list && <small>{t.listPrice(num(line.list))}</small>}
              {line.discount > 0 && <small className="red">{t.discount} {num(line.discount)}</small>}
              {back > 0 && <small className="red">{t.returned} {back}</small>}
            </span>
            <span className="pos-line-sum num">{num(lineTotal(line))}</span>
          </div>
        );
      })}
    </>
  );
}

export function SaleHistory({ sale, t }: { sale: Sale; t: PosText }) {
  if (!sale.history.length) return null;
  return (
    <div className="pos-block">
      <h3>{t.history}</h3>
      {sale.history.map((h, i) => (
        <div key={i} className="row">
          <span>
            {t.eventName[h.action]}
            {h.before && <>, {t.wasTotal(num(h.before.total))}</>}
            {h.by && <> · <span dir="auto">{h.by}</span></>}
          </span>
          <span className="num">{showDay(h.at)} {showTime(h.at)}</span>
          {h.note && <p dir="auto">{h.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function SaleSums({ sale, t }: { sale: Sale; t: PosText }) {
  return (
    <>
      {(sale.discount > 0 || sale.refunded > 0) && <div className="pos-sum"><span>{t.subtotal}</span><span className="num">{num(sale.subtotal)}</span></div>}
      {sale.discount > 0 && <div className="pos-sum red"><span>{t.discount}</span><span className="num">{num(-sale.discount)}</span></div>}
      {sale.refunded > 0 && <div className="pos-sum red"><span>{t.returned}</span><span className="num">{num(-sale.refunded)}</span></div>}
      <div className="pos-total">
        <span>{t.total}</span>
        <b className="num">
          {num(netTotal(sale))} <em>IQD</em>
          <small>{usd(netTotal(sale) / sale.rate)}</small>
        </b>
      </div>
    </>
  );
}

function ReturnDialog({ sale, items, seller, busy, error, onSave, onClose, lang, t }: {
  sale: Sale;
  items: PosItem[];
  seller: string;
  busy: boolean;
  error: string;
  onSave: (ret: SaleReturn, print: boolean) => Promise<void>;
  onClose: () => void;
  lang: PosLang;
  t: PosText;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [id] = useState(newId);
  const ku = lang === 'ku';
  const left = useMemo(
    () => sale.lines.map((line) => ({ line, left: line.qty - returnedQty(sale, line.id) })).filter((l) => l.left > 0),
    [sale],
  );
  const most = netTotal(sale);
  const all = left.every((l) => (qty[l.line.id] ?? 0) === l.left);
  // Returning everything gives back exactly what is left of the invoice.
  const worth = all ? most : Math.min(most, left.reduce((n, l) => n + paidFor(l.line, qty[l.line.id] ?? 0), 0));
  const refund = typed ?? worth;
  const pieces = Object.values(qty).reduce((n, q) => n + q, 0);

  const set = (line: string, n: number) => {
    setQty((q) => ({ ...q, [line]: n }));
    setTyped(null);
  };
  const save = (print: boolean) =>
    void onSave(
      {
        id,
        at: new Date().toISOString(),
        reason: reason.trim(),
        by: seller,
        refund,
        lines: Object.entries(qty).filter(([, n]) => n > 0).map(([line, n]) => ({ id: line, qty: n })),
      },
      print,
    );

  return (
    <PosDialog
      title={t.returnTitle(saleLabel(sale))}
      hint={t.returnHint}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="pos-btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="pos-btn" disabled={!pieces || busy} onClick={() => save(false)}>{t.saveReturn}</button>
          <button type="button" className="pos-btn pos-btn-red" disabled={!pieces || busy} onClick={() => save(true)}>{t.saveReturnPrint}</button>
        </>
      }
    >
      <div>
        {left.map(({ line, left: n }) => (
          <div key={line.id} className="pos-back-line">
            <span className="pos-line-photo"><Photo image={lineImage(line, items)} sizes="48px" eager /></span>
            <span className="pos-line-name">
              <b>{line.code}</b>
              <small>{ku ? line.ku || line.name : line.name}{line.color && ` · ${colorName(line.color, ku)}`}</small>
              <small>{t.left(n)}</small>
            </span>
            <Stepper value={qty[line.id] ?? 0} min={0} max={n} t={t} onChange={(q) => set(line.id, q)} />
          </div>
        ))}
        <button type="button" className="pos-link" onClick={() => { setQty(Object.fromEntries(left.map((l) => [l.line.id, l.left]))); setTyped(null); }}>
          {t.returnAll}
        </button>
      </div>
      <div className="pos-two">
        <label className="pos-field">
          <span>{t.refund}</span>
          <IqdInput value={refund} max={most} emptyIsZero placeholder="0" onChange={setTyped} />
        </label>
        <label className="pos-field">
          <span>{t.reason}</span>
          <input className="pos-input" dir="auto" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      {error && <div className="pos-error" role="alert">{error}</div>}
    </PosDialog>
  );
}

function DeleteDialog({ label, busy, error, onDelete, onClose, t }: { label: string; busy: boolean; error: string; onDelete: (reason: string) => void; onClose: () => void; t: PosText }) {
  const [reason, setReason] = useState('');
  return (
    <PosDialog
      title={t.deleteTitle(label)}
      hint={t.deleteHint}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="pos-btn" onClick={onClose}>{t.cancel}</button>
          <button type="button" className="pos-btn pos-btn-red" disabled={busy} onClick={() => onDelete(reason)}>{t.deleteYes}</button>
        </>
      }
    >
      <label className="pos-field">
        <span>{t.reason}</span>
        <input className="pos-input" dir="auto" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <div className="pos-error" role="alert">{error}</div>}
    </PosDialog>
  );
}
