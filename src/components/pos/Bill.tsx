import { useEffect, useId, useState } from 'react';
import { Trash } from '@/components/icons';
import { latinDigits, normalizePhone } from '@/services/repairs/logic';
import { MAX_OPEN, MIN_OPEN, isEmpty, removeLine, setLine, type Cart, type Desk } from '@/services/pos/cart';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { colorName } from '@/services/pos/items';
import { discountOf, iqd, lineGross, lineTotal, num, phoneOk, piecesOf, saleLabel, showDay, subtotalOf, totalOf, usd } from '@/services/pos/logic';
import type { PosItem, Sale } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { IqdInput, Photo, PosDialog, Stepper, lineImage } from './parts';

/** Every open invoice: one for each customer being served, and one more when the shop is busy. */
export function CustomerTabs({ desk, saving, errors, onChoose, onAdd, t }: {
  desk: Desk;
  saving: ReadonlySet<string>;
  errors: Record<string, string>;
  onChoose: (id: string) => void;
  onAdd: () => void;
  t: PosText;
}) {
  return (
    <div className="pos-tabs" role="tablist" aria-label={t.invoice}>
      {desk.carts.map((c) => {
        const busy = saving.has(c.id);
        const bad = !busy && !!errors[c.id];
        return (
          <button key={c.id} type="button" role="tab" aria-selected={c.id === desk.active} className={cn(busy && 'busy', bad && 'bad')} onClick={() => onChoose(c.id)}>
            <b dir="auto">{c.editing ? `${t.invoice} ${saleLabel(c.editing)}` : c.customerName.trim() || t.customerNo(c.no)}</b>
            <small className="num">{busy ? t.saving : bad ? t.notSaved : c.lines.length ? num(totalOf(c.lines)) : '—'}</small>
          </button>
        );
      })}
      {desk.carts.length < MAX_OPEN && (
        <button type="button" className="add" title={t.addCustomer} aria-label={t.addCustomer} onClick={onAdd}>
          +
        </button>
      )}
    </div>
  );
}

/** The invoice beside the items: the customer, the lines, the total, and saving it. */
export function Bill({ cart, change, deskSize, seller, setSeller, sellers, rate, items, last, saving, error, checked, onSave, onPrint, onClose, onBack, findCustomer, open, tabs, lang, t }: {
  cart: Cart;
  change: (fn: (cart: Cart) => Cart) => void;
  deskSize: number;
  seller: string;
  setSeller: (seller: string) => void;
  sellers: string[];
  rate: number;
  items: PosItem[];
  /** The sale just saved, for printing it again. */
  last: { sale: Sale; changed: boolean } | null;
  saving: boolean;
  error: string;
  /** Saving was tried, so what is missing is pointed out. */
  checked: boolean;
  onSave: (print: boolean) => void;
  onPrint: (sale: Sale) => void;
  /** Empties (or closes) this invoice. */
  onClose: () => void;
  /** Closes the invoice on a phone. */
  onBack: () => void;
  /** Who bought with this mobile before. */
  findCustomer: (phone: string) => Promise<{ name: string; address: string } | null>;
  open: boolean;
  tabs: React.ReactNode;
  lang: PosLang;
  t: PosText;
}) {
  const [asking, setAsking] = useState(false);
  const [more, setMore] = useState(false);
  const uid = useId();
  const ku = lang === 'ku';
  const editing = cart.editing;
  const subtotal = subtotalOf(cart.lines);
  const discount = discountOf(cart.lines);
  const total = totalOf(cart.lines);
  const atRate = editing ? editing.rate : rate;
  const nameBad = checked && !cart.customerName.trim();
  const phoneBad = checked && !phoneOk(cart.customerPhone);
  const details = more || !!(cart.customerAddress || cart.note);
  const closable = !isEmpty(cart) || deskSize > MIN_OPEN;

  useEffect(() => setMore(false), [cart.id]);

  /** A whole mobile number fills in the name it bought with before. */
  async function phoneTyped(value: string) {
    change((c) => ({ ...c, customerPhone: value }));
    if (cart.customerName.trim() || !/^07\d{9}$/.test(normalizePhone(value))) return;
    const found = await findCustomer(normalizePhone(value));
    if (!found) return;
    change((c) =>
      c.customerName.trim() || normalizePhone(c.customerPhone) !== normalizePhone(value)
        ? c
        : { ...c, customerName: found.name, customerAddress: c.customerAddress || found.address },
    );
  }

  return (
    <section className={cn('pos-bill', open && 'show')} aria-label={t.invoice}>
      <button type="button" className="pos-back" onClick={onBack}>
        {t.backToItems}
      </button>
      {tabs}

      {last && !editing && (
        <div className="pos-note" role="status">
          <span>
            {last.changed ? t.changed(saleLabel(last.sale)) : t.saved(saleLabel(last.sale))}
            {last.sale.pending && <small className="st st-part">{t.notSent}</small>}
          </span>
          <button type="button" className="pos-link" onClick={() => onPrint(last.sale)}>
            {t.printAgain}
          </button>
        </div>
      )}

      <div className="pos-bill-scroll">
        <div className="pos-who">
          <header>
            <h2>{editing ? t.editing(saleLabel(editing)) : t.newInvoice}</h2>
            <span className="num">{showDay(editing?.soldAt ?? new Date())}</span>
            {closable && (
              <button type="button" className="pos-link" disabled={saving} onClick={() => (isEmpty(cart) ? onClose() : setAsking(true))}>
                {editing ? t.cancelEdit : isEmpty(cart) ? t.closeCustomer : t.clear}
              </button>
            )}
          </header>
          <div className="pos-two">
            <label className={cn('pos-field', nameBad && 'bad')}>
              <span>{t.name}</span>
              <input id="pos-name" className="pos-input" dir="auto" autoComplete="off" aria-invalid={nameBad} disabled={saving} value={cart.customerName} onChange={(e) => change((c) => ({ ...c, customerName: e.target.value }))} />
              {nameBad && <small>{t.nameNeeded}</small>}
            </label>
            <label className={cn('pos-field', phoneBad && 'bad')}>
              <span>{t.phone}</span>
              <input id="pos-phone" className="pos-input" dir="ltr" inputMode="tel" autoComplete="off" placeholder="0750 000 0000" aria-invalid={phoneBad} disabled={saving} value={cart.customerPhone} onChange={(e) => void phoneTyped(latinDigits(e.target.value))} />
              {phoneBad && <small>{t.phoneNeeded}</small>}
            </label>
          </div>
        </div>

        {cart.lines.length === 0 ? (
          <div className="pos-empty">
            <b>{t.emptyBill}</b>
            {t.emptyBillHint}
          </div>
        ) : (
          <ul className="pos-lines">
            {cart.lines.map((line) => {
              const gross = lineGross(line);
              const raised = line.price > line.list;
              return (
                <li key={line.id} className="pos-line">
                  <span className="pos-line-photo">
                    <Photo image={lineImage(line, items)} sizes="62px" eager />
                  </span>
                  <span className="pos-line-name">
                    <b>{line.code}</b>
                    <small>
                      {ku ? line.ku || line.name : line.name}
                      {line.color && ` · ${colorName(line.color, ku)}`}
                    </small>
                    <small className="num">{usd(line.usd)}{line.price !== line.list && ` · ${t.listPrice(num(line.list))}`}</small>
                  </span>
                  <span className="pos-line-sum num">
                    {num(lineTotal(line))}
                    {line.discount > 0 && <s>{num(gross)}</s>}
                    {raised && line.discount === 0 && <i>+{num((line.price - line.list) * line.qty)}</i>}
                  </span>
                  <span className="pos-line-do">
                    <span className="pos-mini">
                      <span>{t.qty}</span>
                      <Stepper value={line.qty} min={1} max={999} t={t} onChange={(qty) => change((c) => setLine(c, line.id, { qty }))} />
                    </span>
                    <label className="pos-mini">
                      <span>{t.price}</span>
                      <IqdInput value={line.price} onChange={(price) => change((c) => setLine(c, line.id, { price }))} />
                    </label>
                    <label className="pos-mini">
                      <span>{t.discount}</span>
                      <IqdInput value={line.discount} max={gross} emptyIsZero placeholder="0" onChange={(d) => change((c) => setLine(c, line.id, { discount: d }))} />
                    </label>
                    <button type="button" className="pos-icon" title={t.remove} aria-label={`${t.remove} ${line.code}`} onClick={() => change((c) => removeLine(c, line.id))}>
                      <Trash width={18} height={18} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {cart.lines.length > 0 && (
          <div className="pos-form">
            {details ? (
              <>
                <div className="pos-two">
                  <label className="pos-field">
                    <span>{t.address}</span>
                    <input className="pos-input" dir="auto" autoComplete="off" value={cart.customerAddress} onChange={(e) => change((c) => ({ ...c, customerAddress: e.target.value }))} />
                  </label>
                  <label className="pos-field">
                    <span>{t.seller}</span>
                    <input className="pos-input" dir="auto" autoComplete="off" list={uid} value={seller} onChange={(e) => setSeller(e.target.value)} />
                    <datalist id={uid}>
                      {sellers.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <label className="pos-field">
                  <span>{t.note}</span>
                  <textarea className="pos-input" dir="auto" rows={2} value={cart.note} onChange={(e) => change((c) => ({ ...c, note: e.target.value }))} />
                </label>
              </>
            ) : (
              <button type="button" className="pos-link" onClick={() => setMore(true)}>
                {t.moreDetails}: {t.address}, {t.seller}, {t.note}
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="pos-bill-foot">
        {discount > 0 && (
          <>
            <div className="pos-sum">
              <span>{t.subtotal}</span>
              <span className="num">{num(subtotal)}</span>
            </div>
            <div className="pos-sum red">
              <span>{t.discount}</span>
              <span className="num">{num(-discount)}</span>
            </div>
          </>
        )}
        <div className="pos-total">
          <span>
            {t.total}
            <small>{t.pieces(piecesOf(cart.lines))}</small>
          </span>
          <b className="num">
            {num(total)} <em>IQD</em>
            {total > 0 && <small>{usd(total / atRate)}</small>}
          </b>
        </div>
        {error && (
          <div className="pos-error" role="alert">
            {error}
          </div>
        )}
        {saving ? (
          <p className="pos-busy" role="status">
            <b>{t.saving}</b> {t.savingOthers}
          </p>
        ) : (
          <div className="pos-go">
            <button type="button" className="pos-btn pos-btn-red" disabled={!cart.lines.length} onClick={() => onSave(true)}>
              {editing ? t.saveChangesPrint : t.savePrint}
            </button>
            <button type="button" className="pos-btn" disabled={!cart.lines.length} onClick={() => onSave(false)}>
              {editing ? t.saveChanges : t.saveOnly}
            </button>
          </div>
        )}
      </footer>

      {asking && (
        <PosDialog
          title={editing ? `${t.cancelEdit}?` : t.clearTitle}
          hint={editing ? iqd(editing.total) : t.clearHint}
          onClose={() => setAsking(false)}
          actions={
            <>
              <button type="button" className="pos-btn" onClick={() => setAsking(false)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="pos-btn pos-btn-red"
                onClick={() => {
                  setAsking(false);
                  onClose();
                }}
              >
                {editing ? t.cancelEdit : t.clearYes}
              </button>
            </>
          }
        />
      )}
    </section>
  );
}
