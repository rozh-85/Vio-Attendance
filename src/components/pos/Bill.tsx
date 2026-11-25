import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, CheckCircle, ChevronDown, Plus, Printer, User } from '@/components/icons';
import { latinDigits, normalizePhone } from '@/services/repairs/logic';
import { MAX_OPEN, MIN_OPEN, changeLine, isEmpty, removeLine, type Cart, type Desk } from '@/services/pos/cart';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { discountOf, num, phoneOk, piecesOf, saleLabel, subtotalOf, totalOf, usd } from '@/services/pos/logic';
import type { PosItem, Sale } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { LineEditor } from './Lines';
import { Labelled, Notice, PosDialog, field, ltrText } from './ui';

/** Every open invoice, one quiet tab each: the customer, and the total once there is one. */
export function CustomerTabs({ desk, saving, errors, onChoose, onAdd, t }: {
  desk: Desk;
  saving: ReadonlySet<string>;
  errors: Record<string, string>;
  onChoose: (id: string) => void;
  onAdd: () => void;
  t: PosText;
}) {
  const list = useRef<HTMLDivElement>(null);
  // The open invoice stays in sight when there are more than fit.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [desk.active, desk.carts.length]);
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
      <div ref={list} role="tablist" aria-label={t.invoice} className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {desk.carts.map((c) => {
          const on = c.id === desk.active;
          const busy = saving.has(c.id);
          const bad = !busy && !!errors[c.id];
          const name = c.customerName.trim() || t.customerNo(c.no);
          const total = c.lines.length ? num(totalOf(c.lines)) : '';
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={on}
              title={total ? `${name} · ${total} IQD` : name}
              onClick={() => onChoose(c.id)}
              className={cn(
                'flex h-9 min-w-0 shrink-0 grow basis-auto items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition',
                on ? 'bg-raised text-ink-900 shadow-sm ring-1 ring-slate-200/80' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {(busy || bad) && (
                <span className={cn('size-2 shrink-0 rounded-full', busy ? 'animate-pulse bg-amber-500' : 'bg-rose-500')}>
                  <span className="sr-only">{busy ? t.saving : t.notSaved}</span>
                </span>
              )}
              <span dir="auto" className="max-w-36 truncate">
                {name}
              </span>
              {total && <span className={cn('text-xs font-semibold tabular-nums', ltrText, on ? 'text-brand-600' : 'text-ink-400')}>{total}</span>}
            </button>
          );
        })}
      </div>
      {desk.carts.length < MAX_OPEN && (
        <button
          type="button"
          title={t.addCustomer}
          aria-label={t.addCustomer}
          onClick={onAdd}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink-500 transition hover:bg-brand-50 hover:text-brand-700"
        >
          <Plus width={18} height={18} />
        </button>
      )}
    </div>
  );
}

/** The invoice beside the items: the customer, the lines, the total, and saving it. */
export function Bill({ cart, change, deskSize, rate, items, last, saving, error, checked, onSave, onPrint, onClose, onBack, findCustomer, open, tabs, lang, t }: {
  cart: Cart;
  change: (fn: (cart: Cart) => Cart) => void;
  deskSize: number;
  rate: number;
  items: PosItem[];
  /** The sale just saved, for printing it again. */
  last: Sale | null;
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
  tabs: ReactNode;
  lang: PosLang;
  t: PosText;
}) {
  const [asking, setAsking] = useState(false);
  const [more, setMore] = useState(false);
  const subtotal = subtotalOf(cart.lines);
  const discount = discountOf(cart.lines);
  const total = totalOf(cart.lines);
  const nameBad = checked && !cart.customerName.trim();
  const phoneBad = checked && !phoneOk(cart.customerPhone);
  const closable = !isEmpty(cart) || deskSize > MIN_OPEN;
  const setLines = (fn: (lines: Cart['lines']) => Cart['lines']) => change((c) => ({ ...c, lines: fn(c.lines) }));

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
    <section
      aria-label={t.invoice}
      className={cn(
        'min-h-0 min-w-0 flex-col bg-card md:flex md:rounded-2xl md:border md:border-slate-200/80 md:shadow-sm',
        open ? 'fixed inset-0 z-40 flex md:static md:z-auto' : 'hidden',
      )}
    >
      <button type="button" onClick={onBack} className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-4 text-sm font-semibold text-ink-600 md:hidden">
        <ArrowLeft width={17} height={17} className="rtl:rotate-180" /> {t.backToItems}
      </button>
      <div className="border-b border-slate-200">{tabs}</div>

      {last && (
        <div role="status" className="flex shrink-0 items-center gap-2.5 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
          <CheckCircle width={17} height={17} className="shrink-0" />
          <span className="min-w-0 flex-1">
            {t.saved(saleLabel(last))}
            {last.pending && <span className="ms-2 font-medium text-amber-700">{t.notSent}</span>}
          </span>
          <button type="button" onClick={() => onPrint(last)} className="shrink-0 rounded-lg px-2.5 py-1.5 transition hover:bg-emerald-100">
            {t.printAgain}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="px-4 pb-4 pt-3.5">
          <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
              <User width={17} height={17} className="text-ink-400" /> {t.customer}
            </h2>
            {closable && (
              <button type="button" disabled={saving} onClick={() => (isEmpty(cart) ? onClose() : setAsking(true))} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink-500 transition hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50">
                {isEmpty(cart) ? t.closeCustomer : t.clear}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 items-start gap-2.5">
            <Labelled label={t.name} error={nameBad ? t.nameNeeded : undefined}>
              <input id="pos-name" className={cn(field, nameBad && 'border-rose-400')} dir="auto" autoComplete="off" aria-invalid={nameBad} disabled={saving} value={cart.customerName} onChange={(e) => change((c) => ({ ...c, customerName: e.target.value }))} />
            </Labelled>
            <Labelled label={t.phone} error={phoneBad ? t.phoneNeeded : undefined}>
              <input id="pos-phone" className={cn(field, 'max-[22.5rem]:px-2.5!', phoneBad && 'border-rose-400')} dir="ltr" inputMode="tel" autoComplete="off" placeholder="0750 000 0000" aria-invalid={phoneBad} disabled={saving} value={cart.customerPhone} onChange={(e) => void phoneTyped(latinDigits(e.target.value))} />
            </Labelled>
          </div>
        </div>

        {cart.lines.length === 0 ? (
          <div className="border-t border-slate-100 px-4 py-14 text-center">
            <div className="font-semibold text-ink-900">{t.emptyBill}</div>
            <div className="mt-1 text-sm text-ink-500">{t.emptyBillHint}</div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {cart.lines.map((line) => (
              <LineEditor
                key={line.id}
                line={line}
                items={items}
                disabled={saving}
                lang={lang}
                t={t}
                onChange={(c) => setLines((l) => changeLine(l, line.id, c))}
                onRemove={() => setLines((l) => removeLine(l, line.id))}
              />
            ))}
          </ul>
        )}

        {cart.lines.length > 0 && (
          <div className="px-4 py-3">
            <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between gap-3 rounded-lg py-1.5 text-sm font-semibold text-ink-600 hover:text-ink-900">
              <span className="min-w-0 truncate">{t.moreDetails}: {t.address}, {t.note}</span>
              <ChevronDown width={17} height={17} className={cn('shrink-0 transition', more && 'rotate-180')} />
            </button>
            {more && (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <Labelled label={t.address} className="col-span-2">
                  <input className={field} dir="auto" autoComplete="off" value={cart.customerAddress} onChange={(e) => change((c) => ({ ...c, customerAddress: e.target.value }))} />
                </Labelled>
                <Labelled label={t.note} className="col-span-2">
                  <textarea className={cn(field, 'h-auto! min-h-18 resize-y py-2.5')} dir="auto" rows={2} value={cart.note} onChange={(e) => change((c) => ({ ...c, note: e.target.value }))} />
                </Labelled>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-slate-50/70 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 md:rounded-b-2xl">
        <Totals subtotal={subtotal} discount={discount} total={total} rate={rate} pieces={piecesOf(cart.lines)} t={t} />
        {error && (
          <Notice tone="danger" className="mt-3">
            {error}
          </Notice>
        )}
        {saving ? (
          <p role="status" className="mt-3 flex items-center gap-3 py-2 text-sm text-ink-500">
            <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <span>
              <b className="text-ink-900">{t.saving}</b> {t.savingOthers}
            </span>
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-[1.7fr_1fr] gap-2.5 md:max-lg:grid-cols-1 md:max-lg:gap-2">
            <Button size="lg" className="h-[3.25rem]! px-3! max-[22.5rem]:px-2! max-[22.5rem]:text-sm!" disabled={!cart.lines.length} leftIcon={<Printer width={18} height={18} />} onClick={() => onSave(true)}>
              {t.savePrint}
            </Button>
            <Button size="lg" variant="outline" className="h-[3.25rem]! px-2! max-[22.5rem]:text-sm!" disabled={!cart.lines.length} onClick={() => onSave(false)}>
              {t.saveOnly}
            </Button>
          </div>
        )}
      </footer>

      {asking && (
        <PosDialog
          title={t.clearTitle}
          hint={t.clearHint}
          onClose={() => setAsking(false)}
          actions={
            <>
              <Button variant="outline" onClick={() => setAsking(false)}>
                {t.cancel}
              </Button>
              <Button
                onClick={() => {
                  setAsking(false);
                  onClose();
                }}
              >
                {t.clearYes}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}

/** What an invoice adds up to. */
export function Totals({ subtotal, discount, refunded = 0, total, rate, pieces, t }: { subtotal: number; discount: number; refunded?: number; total: number; rate: number; pieces?: number; t: PosText }) {
  return (
    <div className="space-y-1.5">
      {(discount > 0 || refunded > 0) && (
        <div className="flex justify-between gap-3 text-sm text-ink-500">
          <span>{t.subtotal}</span>
          <span className={cn('tabular-nums', ltrText)}>{num(subtotal)}</span>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between gap-3 text-sm font-medium text-brand-700">
          <span>{t.discount}</span>
          <span className={cn('tabular-nums', ltrText)}>{num(-discount)}</span>
        </div>
      )}
      {refunded > 0 && (
        <div className="flex justify-between gap-3 text-sm font-medium text-brand-700">
          <span>{t.returned}</span>
          <span className={cn('tabular-nums', ltrText)}>{num(-refunded)}</span>
        </div>
      )}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold text-ink-900">{t.total}</span>
          <span className={cn('whitespace-nowrap text-[28px] font-bold leading-none tabular-nums text-ink-900', ltrText)}>
            {num(total)} <span className="text-sm font-semibold text-ink-400">IQD</span>
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-ink-500">
          <span>{pieces !== undefined && t.pieces(pieces)}</span>
          <span className={cn('font-medium tabular-nums', ltrText)}>{usd(rate > 0 ? total / rate : 0)}</span>
        </div>
      </div>
    </div>
  );
}
