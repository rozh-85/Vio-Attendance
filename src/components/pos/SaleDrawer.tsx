import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Pencil, Printer, Trash, Undo } from '@/components/icons';
import { formatPhone, latinDigits } from '@/services/repairs/logic';
import { addItem, changeLine, loadSellers, removeLine } from '@/services/pos/cart';
import { posErrorMessage, type PosLang, type PosText } from '@/services/pos/i18n';
import { discountOf, guaranteeEnd, lineTotal, netTotal, newId, num, paidFor, phoneOk, piecesOf, rateText, returnedQty, saleLabel, saleStatus, showDay, showTime, subtotalOf, totalOf } from '@/services/pos/logic';
import { printInvoice, printReturn } from '@/services/pos/print';
import type { PosStore } from '@/services/pos/store';
import type { PosItem, PosSettings, Sale, SaleReturn } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { Totals } from './Bill';
import { ItemAdder, LineEditor, lineName } from './Lines';
import { Drawer, IqdInput, Labelled, Notice, Photo, StatusBadge, Stepper, field, lineImage, ltrText } from './ui';

export type SaleMode = 'view' | 'edit' | 'return' | 'delete';

interface Props {
  sale: Sale;
  /** What to open on: the sale itself, or straight on one of its actions. */
  start: SaleMode;
  store: PosStore;
  items: PosItem[];
  settings: PosSettings;
  seller: string;
  onChanged: (sale: Sale) => void;
  onClose: () => void;
  /** The owner may put a deleted sale back. */
  owner?: boolean;
  lang: PosLang;
  t: PosText;
}

/** One sale in a panel over the list: looked at, changed, returned or deleted without leaving the page. */
export function SaleDrawer(props: Props) {
  const { sale, start, onChanged, onClose, t } = props;
  const [mode, setMode] = useState<SaleMode>(start === 'edit' && sale.returns.length ? 'view' : start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(start === 'edit' && sale.returns.length ? t.errors.SALE_HAS_RETURNS : '');
  const [done, setDone] = useState('');

  /** Does one thing to the sale and says how it went. */
  async function run(work: () => Promise<Sale>, message = ''): Promise<Sale | null> {
    setBusy(true);
    setError('');
    try {
      const next = await work();
      onChanged(next);
      setDone(message);
      return next;
    } catch (err) {
      setError(posErrorMessage(err, t));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function go(next: SaleMode) {
    setDone('');
    if (next === 'edit' && sale.returns.length) {
      setError(t.errors.SALE_HAS_RETURNS);
      return;
    }
    setError('');
    setMode(next);
  }

  const panel = { ...props, busy, error, run, go };
  const label = saleLabel(sale);
  if (mode === 'edit') return <EditPanel {...panel} onDone={() => { setMode('view'); setDone(t.changed(label)); }} />;
  if (mode === 'return') return <ReturnPanel {...panel} />;
  if (mode === 'delete') return <DeletePanel {...panel} onDeleted={onClose} />;
  return <ViewPanel {...panel} done={done} />;
}

type PanelProps = Props & {
  busy: boolean;
  error: string;
  run: (work: () => Promise<Sale>, message?: string) => Promise<Sale | null>;
  go: (mode: SaleMode) => void;
};

// ── Looking at it ────────────────────────────────────────────────────────────

function Fact({ label, children, ltr, wide }: { label: string; children: ReactNode; ltr?: boolean; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-full')}>
      <div className="text-[13px] text-ink-500">{label}</div>
      <div className="mt-0.5 font-semibold text-ink-900 [overflow-wrap:anywhere]">{ltr ? <span className={ltrText}>{children}</span> : <bdi>{children}</bdi>}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-4 py-5 sm:px-6">
      <h3 className="mb-2 text-sm font-bold text-ink-900">{title}</h3>
      {children}
    </section>
  );
}

function ViewPanel({ sale, store, items, settings, seller, onClose, owner, lang, t, busy, error, done, run, go }: PanelProps & { done: string }) {
  const status = saleStatus(sale);
  const label = saleLabel(sale);
  return (
    <Drawer
      label={`${t.invoice} ${label}`}
      title={
        <>
          <span>
            {t.invoice} <span className={ltrText}>{label}</span>
          </span>
          <StatusBadge status={status} t={t} />
        </>
      }
      sub={<span className={ltrText}>{showDay(sale.soldAt)} · {showTime(sale.soldAt)}</span>}
      onClose={onClose}
      closeLabel={t.close}
      footer={
        <>
          <Totals subtotal={sale.subtotal} discount={sale.discount} refunded={sale.refunded} total={netTotal(sale)} rate={sale.rate} t={t} />
          {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
          {done && <Notice tone="success" className="mt-3">{done}</Notice>}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <Button className="max-sm:col-span-2" leftIcon={<Printer width={17} height={17} />} onClick={() => void printInvoice(sale, settings, items)}>
              {t.print}
            </Button>
            {sale.deletedAt ? (
              owner && (
                <Button variant="outline" className="col-span-2 sm:col-span-3" loading={busy} leftIcon={<Undo width={17} height={17} />} onClick={() => void run(() => store.restore(sale.id), 'The sale is back in the list.')}>
                  Put this sale back
                </Button>
              )
            ) : (
              <>
                <Button variant="outline" className="px-2!" disabled={busy || status === 'returned'} leftIcon={<Undo width={16} height={16} />} onClick={() => go('return')}>
                  {t.returnItems}
                </Button>
                <Button variant="outline" className="px-2!" disabled={busy} leftIcon={<Pencil width={16} height={16} />} onClick={() => go('edit')}>
                  {t.edit}
                </Button>
                <Button variant="outline" className="px-2! text-brand-700! hover:bg-brand-50! max-sm:col-span-2" disabled={busy} leftIcon={<Trash width={16} height={16} />} onClick={() => go('delete')}>
                  {t.delete}
                </Button>
              </>
            )}
          </div>
        </>
      }
    >
      {sale.deletedAt && (
        <Notice tone="danger" className="mx-4 mt-5 sm:mx-6">
          {t.statusName.deleted} <span className={ltrText}>{showDay(sale.deletedAt)} {showTime(sale.deletedAt)}</span>
          {sale.deleteReason && `: ${sale.deleteReason}`}
        </Notice>
      )}
      <div className="px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-slate-50 p-4 sm:p-5">
          <Fact label={t.customer}>{sale.customerName}</Fact>
          <Fact label={t.phone} ltr>{formatPhone(sale.customerPhone)}</Fact>
          <Fact label={t.seller}>{sale.seller || '—'}</Fact>
          <Fact label={t.dollarThen} ltr>{rateText(sale.rate)}</Fact>
          <Fact label={t.guarantee} ltr wide={!sale.customerAddress}>{showDay(guaranteeEnd(sale.soldAt))}</Fact>
          {sale.customerAddress && <Fact label={t.address}>{sale.customerAddress}</Fact>}
          {sale.note && <Fact label={t.note} wide>{sale.note}</Fact>}
        </div>
      </div>

      <Block title={t.itemsTitle}>
        <ul className="divide-y divide-slate-100">
          {sale.lines.map((line) => {
            const back = returnedQty(sale, line.id);
            return (
              <li key={line.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                <Photo image={lineImage(line, items)} className="size-14 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-semibold text-ink-900', ltrText, lang === 'ku' ? 'text-end' : 'text-start')}>{line.code}</div>
                  <div className="truncate text-sm text-ink-500">{lineName(line, lang)}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-500">
                    <span className={ltrText}>{line.qty} × {num(line.price)}</span>
                    {line.price !== line.list && <span>{t.listPrice(num(line.list))}</span>}
                    {line.discount > 0 && <span className="font-medium text-brand-700">{t.discount} <span className={ltrText}>{num(line.discount)}</span></span>}
                    {back > 0 && <span className="font-medium text-amber-700">{t.returned} {back}</span>}
                  </div>
                </div>
                <div className={cn('shrink-0 font-bold tabular-nums text-ink-900', ltrText)}>{num(lineTotal(line))}</div>
              </li>
            );
          })}
        </ul>
      </Block>

      {sale.returns.length > 0 && (
        <Block title={t.returns}>
          <ul className="space-y-2.5">
            {sale.returns.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn('font-semibold text-ink-900', ltrText, lang === 'ku' ? 'text-end' : 'text-start')}>{r.lines.map((b) => `${sale.lines.find((l) => l.id === b.id)?.code ?? ''} ×${b.qty}`).join(', ')}</div>
                    <div className="mt-0.5 text-[13px] text-ink-500">
                      <span className={ltrText}>{showDay(r.at)} {showTime(r.at)}</span>
                      {(r.reason || r.by) && <span dir="auto"> · {[r.reason, r.by].filter(Boolean).join(' · ')}</span>}
                    </div>
                  </div>
                  <b className={cn('shrink-0 tabular-nums text-brand-700', ltrText)}>{num(-r.refund)}</b>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-sm font-semibold">
                  <button type="button" className="-ms-2 rounded-lg px-2 py-1 text-ink-600 transition hover:bg-slate-100" onClick={() => void printReturn(sale, r, settings, items)}>{t.printReturn}</button>
                  {!sale.deletedAt && (
                    <button type="button" disabled={busy} className="rounded-lg px-2 py-1 text-ink-600 transition hover:bg-slate-100" onClick={() => void run(() => store.undoReturn(sale.id, r.id, seller), t.eventName.undo_return)}>{t.undoReturn}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {sale.history.length > 0 && (
        <Block title={t.history}>
          <ul className="space-y-2 text-sm">
            {sale.history.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4">
                <span className="min-w-0 text-ink-700">
                  <b className="font-semibold text-ink-900">{t.eventName[h.action]}</b>
                  {h.before && <> · {t.wasTotal(num(h.before.total))}</>}
                  {[h.by, h.note].filter(Boolean).map((x) => <span key={x} dir="auto"> · {x}</span>)}
                </span>
                <span className={cn('shrink-0 tabular-nums text-ink-400', ltrText)}>{showDay(h.at)} {showTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </Drawer>
  );
}

// ── Changing it ──────────────────────────────────────────────────────────────

function EditPanel({ sale, store, items, settings, seller, onClose, lang, t, busy, error, run, go, onDone }: PanelProps & { onDone: () => void }) {
  const [form, setForm] = useState(() => ({
    customerName: sale.customerName,
    customerPhone: formatPhone(sale.customerPhone),
    customerAddress: sale.customerAddress,
    seller: sale.seller || seller,
    note: sale.note,
    lines: sale.lines.map((l) => ({ ...l })),
  }));
  const [checked, setChecked] = useState(false);
  const uid = useId();
  const set = (change: Partial<typeof form>) => setForm((f) => ({ ...f, ...change }));
  const setLines = (fn: (lines: typeof form.lines) => typeof form.lines) => setForm((f) => ({ ...f, lines: fn(f.lines) }));
  const nameBad = checked && !form.customerName.trim();
  const phoneBad = checked && !phoneOk(form.customerPhone);
  // New items on an old sale are priced at that day's dollar.
  const then = useMemo(() => ({ ...settings, rate: sale.rate }), [settings, sale.rate]);

  async function save(print: boolean) {
    setChecked(true);
    if (!form.lines.length || !form.customerName.trim() || !phoneOk(form.customerPhone)) return;
    const next = await run(() =>
      store.update(sale.id, { id: sale.id, ref: sale.ref, soldAt: sale.soldAt, rate: sale.rate, device: sale.device, ...form }),
    );
    if (!next) return;
    onDone();
    if (print) void printInvoice(next, settings, items);
  }

  return (
    <Drawer
      label={t.editTitle(saleLabel(sale))}
      title={t.editTitle(saleLabel(sale))}
      sub={<span className={ltrText}>{showDay(sale.soldAt)} · {showTime(sale.soldAt)} · {rateText(sale.rate)}</span>}
      onClose={onClose}
      closeLabel={t.close}
      footer={
        <>
          <Totals subtotal={subtotalOf(form.lines)} discount={discountOf(form.lines)} total={totalOf(form.lines)} rate={sale.rate} pieces={piecesOf(form.lines)} t={t} />
          {(error || (checked && !form.lines.length)) && <Notice tone="danger" className="mt-3">{error || t.errors.SALE_EMPTY}</Notice>}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_1.5fr]">
            <Button variant="outline" className="px-2!" disabled={busy} onClick={() => go('view')}>{t.cancel}</Button>
            <Button variant="outline" className="px-2!" disabled={busy} onClick={() => void save(false)}>{t.saveChanges}</Button>
            <Button className="px-2! max-sm:col-span-2" loading={busy} leftIcon={<Printer width={17} height={17} />} onClick={() => void save(true)}>{t.saveChangesPrint}</Button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-2 items-start gap-3 px-4 py-5 sm:px-6">
        <Labelled label={t.name} error={nameBad ? t.nameNeeded : undefined}>
          <input className={cn(field, nameBad && 'border-rose-400')} dir="auto" value={form.customerName} disabled={busy} onChange={(e) => set({ customerName: e.target.value })} />
        </Labelled>
        <Labelled label={t.phone} error={phoneBad ? t.phoneNeeded : undefined}>
          <input className={cn(field, 'max-[22.5rem]:px-2.5!', phoneBad && 'border-rose-400')} dir="ltr" inputMode="tel" value={form.customerPhone} disabled={busy} onChange={(e) => set({ customerPhone: latinDigits(e.target.value) })} />
        </Labelled>
        <Labelled label={t.address}>
          <input className={field} dir="auto" value={form.customerAddress} disabled={busy} onChange={(e) => set({ customerAddress: e.target.value })} />
        </Labelled>
        <Labelled label={t.seller}>
          <input className={field} dir="auto" list={uid} value={form.seller} disabled={busy} onChange={(e) => set({ seller: e.target.value })} />
          <datalist id={uid}>
            {loadSellers().map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Labelled>
        <Labelled label={t.note} className="col-span-2">
          <input className={field} dir="auto" value={form.note} disabled={busy} onChange={(e) => set({ note: e.target.value })} />
        </Labelled>
      </div>
      <ul className="divide-y divide-slate-100 border-y border-slate-200">
        {form.lines.map((line) => (
          <LineEditor
            key={line.id}
            line={line}
            items={items}
            disabled={busy}
            roomy
            lang={lang}
            t={t}
            onChange={(c) => setLines((l) => changeLine(l, line.id, c))}
            onRemove={() => setLines((l) => removeLine(l, line.id))}
          />
        ))}
      </ul>
      <ItemAdder items={items} settings={then} lang={lang} t={t} onAdd={(item, variant) => setLines((l) => addItem(l, item, variant, then))} />
    </Drawer>
  );
}

// ── Returning some or all of it ──────────────────────────────────────────────

function ReturnPanel({ sale, store, items, settings, seller, onClose, lang, t, busy, error, run, go }: PanelProps) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [id] = useState(newId);
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

  async function save(print: boolean) {
    const ret: SaleReturn = {
      id,
      at: new Date().toISOString(),
      reason: reason.trim(),
      by: seller,
      refund,
      lines: Object.entries(qty).filter(([, n]) => n > 0).map(([line, n]) => ({ id: line, qty: n })),
    };
    const next = await run(() => store.addReturn(sale.id, ret), t.eventName.return);
    if (!next) return;
    go('view');
    if (print) void printReturn(next, next.returns.find((r) => r.id === id) ?? ret, settings, items);
  }

  return (
    <Drawer
      label={t.returnTitle(saleLabel(sale))}
      title={t.returnTitle(saleLabel(sale))}
      sub={t.returnHint}
      onClose={onClose}
      closeLabel={t.close}
      footer={
        <>
          <div className="grid grid-cols-2 gap-3">
            <Labelled label={`${t.refund} (IQD)`}>
              <IqdInput value={refund} max={most} emptyIsZero placeholder="0" disabled={busy} onChange={setTyped} />
            </Labelled>
            <Labelled label={t.reason}>
              <input className={field} dir="auto" value={reason} maxLength={300} disabled={busy} onChange={(e) => setReason(e.target.value)} />
            </Labelled>
          </div>
          {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_1.6fr]">
            <Button variant="outline" className="px-2!" disabled={busy} onClick={() => go('view')}>{t.cancel}</Button>
            <Button variant="outline" className="px-2!" disabled={!pieces || busy} onClick={() => void save(false)}>{t.saveReturn}</Button>
            <Button className="px-2! max-sm:col-span-2" disabled={!pieces} loading={busy} leftIcon={<Printer width={17} height={17} />} onClick={() => void save(true)}>{t.saveReturnPrint}</Button>
          </div>
        </>
      }
    >
      <div className="px-4 py-2 sm:px-6">
        <ul className="divide-y divide-slate-100">
          {left.map(({ line, left: n }) => (
            <li key={line.id} className="flex items-center gap-3 py-4">
              <Photo image={lineImage(line, items)} className="size-14 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate font-semibold text-ink-900', ltrText, lang === 'ku' ? 'text-end' : 'text-start')}>{line.code}</div>
                <div className="truncate text-sm text-ink-500">{lineName(line, lang)}</div>
                <div className="text-[13px] text-ink-400">{t.left(n)}</div>
              </div>
              <Stepper value={qty[line.id] ?? 0} min={0} max={n} t={t} disabled={busy} onChange={(q) => { setQty((all_) => ({ ...all_, [line.id]: q })); setTyped(null); }} />
            </li>
          ))}
        </ul>
        <button type="button" className="-ms-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50" onClick={() => { setQty(Object.fromEntries(left.map((l) => [l.line.id, l.left]))); setTyped(null); }}>
          {t.returnAll}
        </button>
      </div>
    </Drawer>
  );
}

// ── Deleting it ──────────────────────────────────────────────────────────────

function DeletePanel({ sale, store, items, seller, onClose, lang, t, busy, error, run, go, onDeleted }: PanelProps & { onDeleted: () => void }) {
  const [reason, setReason] = useState('');
  const label = saleLabel(sale);
  return (
    <Drawer
      label={t.deleteTitle(label)}
      title={t.deleteTitle(label)}
      sub={t.deleteHint}
      onClose={onClose}
      closeLabel={t.close}
      footer={
        <>
          <Labelled label={t.reason}>
            <input className={field} dir="auto" value={reason} maxLength={300} disabled={busy} onChange={(e) => setReason(e.target.value)} />
          </Labelled>
          {error && <Notice tone="danger" className="mt-3">{error}</Notice>}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Button variant="outline" disabled={busy} onClick={() => go('view')}>{t.cancel}</Button>
            <Button
              loading={busy}
              leftIcon={<Trash width={17} height={17} />}
              onClick={async () => {
                if (await run(() => store.remove(sale.id, reason, seller))) onDeleted();
              }}
            >
              {t.deleteYes}
            </Button>
          </div>
        </>
      }
    >
      <div className="px-4 py-5 sm:px-6">
        <div className="rounded-2xl bg-slate-50 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div dir="auto" className="min-w-0 truncate font-semibold text-ink-900">{sale.customerName}</div>
            <div className={cn('shrink-0 text-xl font-bold tabular-nums text-ink-900', ltrText)}>{num(netTotal(sale))} <span className="text-xs font-semibold text-ink-400">IQD</span></div>
          </div>
          <div className="mt-0.5 text-sm text-ink-500"><span className={ltrText}>{formatPhone(sale.customerPhone)} · {showDay(sale.soldAt)} {showTime(sale.soldAt)}</span></div>
          <ul className="mt-4 space-y-2.5">
            {sale.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3">
                <Photo image={lineImage(line, items)} className="size-11 rounded-lg" pad="p-1" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <b className={cn('font-semibold text-ink-900', ltrText)}>{line.code}</b> <span className="text-ink-500">{lineName(line, lang)}</span>
                </span>
                <span className={cn('text-sm tabular-nums text-ink-600', ltrText)}>{line.qty} × {num(line.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Drawer>
  );
}
