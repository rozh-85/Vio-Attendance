import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import '@/components/pos/pos.css';
import { Bill, CustomerTabs } from '@/components/pos/Bill';
import { ItemGrid } from '@/components/pos/ItemGrid';
import { RateButton } from '@/components/pos/RateButton';
import { SalesView } from '@/components/pos/SalesView';
import { VioMark } from '@/components/pos/parts';
import { activeCart, addItem, changeCart, closeCart, draftFrom, isEmpty, keepDesk, keepSeller, loadDesk, loadSeller, loadSellers, nextCart, openCart, openSale, rememberSeller, repriceDesk, type Cart, type Desk } from '@/services/pos/cart';
import { TEXT, posErrorMessage, readLang, saveLang, type PosLang } from '@/services/pos/i18n';
import { DEFAULT_SETTINGS, mergeItems } from '@/services/pos/items';
import { customerOk, num, piecesOf, rateText, totalOf } from '@/services/pos/logic';
import { printInvoice } from '@/services/pos/print';
import { getPosStore } from '@/services/pos/store';
import type { PosItem, PosItemChange, PosSettings, PosVariant, Sale } from '@/services/pos/types';

/**
 * The till (/pos): no sign-in. Items as cards on one side, the invoices on the
 * other — several customers at once, each with their own invoice, and a save
 * never holds up the next one. Past sales to print, return, change or delete.
 * In English and Kurdish, on a computer, a tablet and a phone, and with no
 * internet.
 */
export function PosPage() {
  const store = getPosStore();
  const [lang, setLang] = useState<PosLang>(readLang);
  const [view, setView] = useState<'sell' | 'sales'>('sell');
  const [settings, setSettings] = useState<PosSettings>(DEFAULT_SETTINGS);
  const [changes, setChanges] = useState<PosItemChange[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(store.status());
  const [desk, setDeskState] = useState<Desk>(loadDesk);
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [seller, setSellerState] = useState(loadSeller);
  const [sellers, setSellers] = useState(loadSellers);
  const [last, setLast] = useState<{ sale: Sale; changed: boolean } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [today, setToday] = useState(() => new Date());
  const search = useRef<HTMLInputElement>(null);
  const t = TEXT[lang];

  // The newest of each, for quick taps, the keyboard, and saves under way.
  const deskRef = useRef(desk);
  const savingRef = useRef(saving);
  const setDesk = useCallback((fn: (desk: Desk) => Desk) => {
    const next = fn(deskRef.current);
    if (next === deskRef.current) return;
    deskRef.current = next;
    setDeskState(next);
    keepDesk(next);
  }, []);
  const change = useCallback(
    (fn: (cart: Cart) => Cart) => {
      const id = deskRef.current.active;
      if (savingRef.current.has(id)) return;
      setDesk((d) => changeCart(d, id, fn));
      setErrors((e) => (e[id] ? { ...e, [id]: '' } : e));
    },
    [setDesk],
  );
  const markSaving = (id: string, on: boolean) => {
    const next = new Set(savingRef.current);
    if (on) next.add(id);
    else next.delete(id);
    savingRef.current = next;
    setSaving(next);
  };

  const setSeller = useCallback((next: string) => {
    setSellerState(next);
    keepSeller(next);
  }, []);

  // Prices, the dollar and settings for every till, and what is waiting to be sent.
  const refresh = useCallback(async () => {
    const setup = await store.setup();
    setSettings(setup.settings);
    setChanges(setup.changes);
    setReady(true);
    await store.sync();
    setStatus(store.status());
    setToday(new Date());
  }, [store]);

  useEffect(() => {
    document.title = 'Vio POS';
    void refresh();
    const off = store.subscribe(() => setStatus(store.status()));
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void refresh(), 30_000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      off();
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [store, refresh]);

  const items = useMemo(() => mergeItems(changes), [changes]);

  // A new dollar rate or price reaches the open invoices.
  useEffect(() => {
    if (ready) setDesk((d) => repriceDesk(d, items, settings));
  }, [ready, items, settings, setDesk]);

  const cart = activeCart(desk);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of cart.lines) map.set(l.itemId, (map.get(l.itemId) ?? 0) + l.qty);
    return map;
  }, [cart.lines]);

  const add = useCallback(
    (item: PosItem, variant?: PosVariant) => change((c) => addItem(c, item, variant, settings)),
    [settings, change],
  );

  const setRate = useCallback(
    async (rate: number) => {
      await store.setRate(rate);
      await refresh();
    },
    [store, refresh],
  );

  const findCustomer = useCallback(
    async (phone: string) => {
      try {
        const found = (await store.list({ query: phone })).find((s) => s.customerPhone === phone);
        return found ? { name: found.customerName, address: found.customerAddress } : null;
      } catch {
        return null;
      }
    },
    [store],
  );

  /** Saves the open invoice; the next customer can be served at once. */
  const save = useCallback(
    async (print: boolean) => {
      const current = activeCart(deskRef.current);
      if (!current.lines.length || savingRef.current.has(current.id)) return;
      if (!customerOk(current)) {
        setChecked((c) => new Set(c).add(current.id));
        setErrors((e) => ({ ...e, [current.id]: t.errors.CUSTOMER_REQUIRED }));
        const field = document.getElementById(current.customerName.trim() ? 'pos-phone' : 'pos-name');
        field?.scrollIntoView({ block: 'center' });
        field?.focus();
        return;
      }
      const draft = draftFrom(current, seller, settings.rate);
      const changed = !!current.editing;
      markSaving(current.id, true);
      setErrors((e) => ({ ...e, [current.id]: '' }));
      setLast(null);
      // The counter is free for the next customer while this one is saved.
      setDesk((d) => nextCart(d, savingRef.current));
      setBillOpen(false);
      try {
        const sale = changed ? await store.update(current.id, draft) : await store.save(draft);
        markSaving(current.id, false);
        setDesk((d) => closeCart(d, current.id));
        setSellers(rememberSeller(seller));
        setLast({ sale, changed });
        if (print) await printInvoice(sale, settings, items);
      } catch (err) {
        markSaving(current.id, false);
        setErrors((e) => ({ ...e, [current.id]: posErrorMessage(err, t) }));
        // Back to it, unless the next customer is already being served.
        if (isEmpty(activeCart(deskRef.current))) {
          setDesk((d) => ({ ...d, active: current.id }));
          setBillOpen(true);
        }
      }
    },
    [seller, settings, store, items, setDesk, t],
  );

  // "/" to search, F9 to save and print.
  useEffect(() => {
    if (view !== 'sell') return;
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? '');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === 'F9') {
        e.preventDefault();
        void save(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, save]);

  function startEditing(sale: Sale) {
    setDesk((d) => openSale(d, sale, savingRef.current));
    setLast(null);
    setView('sell');
    setBillOpen(true);
  }

  function closeActive() {
    const editing = cart.editing;
    setDesk((d) => closeCart(d, cart.id));
    setErrors((e) => ({ ...e, [cart.id]: '' }));
    if (!editing) return;
    setOpenId(editing.id);
    setBillOpen(false);
    setView('sales');
  }

  const state = status.state === 'offline' ? t.offline : status.state === 'online' && !status.waiting ? t.online : t.onDevice;
  const strip =
    status.state === 'setup'
      ? t.setupNote
      : status.waiting > 0
        ? `${status.state === 'offline' ? `${t.offline} · ` : ''}${t.waiting(status.waiting)}`
        : status.state === 'offline'
          ? t.offline
          : ready && !settings.rateSet
            ? t.rateNotSet(rateText(settings.rate))
            : '';
  const tabs = (
    <CustomerTabs
      desk={desk}
      saving={saving}
      errors={errors}
      onChoose={(id) => setDesk((d) => ({ ...d, active: id }))}
      onAdd={() => setDesk((d) => openCart(d))}
      t={t}
    />
  );
  const rateButton = <RateButton rate={settings.rate} isSet={settings.rateSet || !ready} onSave={setRate} t={t} />;

  return (
    <div className="pos" dir={lang === 'ku' ? 'rtl' : 'ltr'} lang={lang === 'ku' ? 'ckb' : 'en'}>
      <header className="pos-top">
        <span className="pos-tab">
          <VioMark />
        </span>
        <nav className="pos-nav" aria-label="POS">
          <button type="button" aria-current={view === 'sell' ? 'page' : undefined} onClick={() => setView('sell')}>
            {t.sell}
          </button>
          <button type="button" aria-current={view === 'sales' ? 'page' : undefined} onClick={() => { setOpenId(null); setView('sales'); }}>
            {t.sales}
          </button>
        </nav>
        <div className="pos-top-end">
          <span className="date num">{format(today, 'EEE d MMM yyyy')}</span>
          <span className="state">{state}</span>
          <span className="rate">{rateButton}</span>
          <span className="pos-lang" role="group" aria-label="Language">
            {(['en', 'ku'] as const).map((l) => (
              <button key={l} type="button" lang={l === 'ku' ? 'ckb' : 'en'} aria-pressed={lang === l} onClick={() => { setLang(l); saveLang(l); }}>
                {l === 'en' ? 'English' : 'کوردی'}
              </button>
            ))}
          </span>
        </div>
      </header>
      {strip && <div className="pos-strip" role="status">{strip}</div>}

      {view === 'sell' ? (
        <div className="pos-sell">
          <ItemGrid items={items} settings={settings} counts={counts} onAdd={add} lang={lang} t={t} searchRef={search} rate={<span className="rate-phone">{rateButton}</span>} />
          <Bill
            cart={cart}
            change={change}
            deskSize={desk.carts.length}
            seller={seller}
            setSeller={setSeller}
            sellers={sellers}
            rate={settings.rate}
            items={items}
            last={last}
            saving={saving.has(cart.id)}
            error={errors[cart.id] ?? ''}
            checked={checked.has(cart.id)}
            onSave={(print) => void save(print)}
            onPrint={(sale) => void printInvoice(sale, settings, items)}
            onClose={closeActive}
            onBack={() => setBillOpen(false)}
            findCustomer={findCustomer}
            open={billOpen}
            tabs={tabs}
            lang={lang}
            t={t}
          />
          <div className="pos-bar">
            {tabs}
            {last && (
              <div className="pos-note" role="status">
                <span>{last.changed ? t.changed(last.sale.saleNo ? String(last.sale.saleNo) : last.sale.ref) : t.saved(last.sale.saleNo ? String(last.sale.saleNo) : last.sale.ref)}</span>
                <button type="button" className="pos-link" onClick={() => void printInvoice(last.sale, settings, items)}>
                  {t.printAgain}
                </button>
              </div>
            )}
            <div className="pos-bar-go">
              <span>
                {t.total} · {t.pieces(piecesOf(cart.lines))}
                <b className="num">
                  {num(totalOf(cart.lines))} <em>IQD</em>
                </b>
              </span>
              <button type="button" className="pos-btn pos-btn-red" onClick={() => setBillOpen(true)}>
                {t.openBill}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <SalesView store={store} items={items} settings={settings} seller={seller} openId={openId} onEdit={startEditing} lang={lang} t={t} />
      )}
    </div>
  );
}
