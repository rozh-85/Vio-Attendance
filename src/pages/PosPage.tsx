import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Bill, CustomerTabs } from '@/components/pos/Bill';
import { ItemGrid } from '@/components/pos/ItemGrid';
import { RateButton } from '@/components/pos/RateButton';
import { SalesView } from '@/components/pos/SalesView';
import { Segmented, VioTile, ltrText } from '@/components/pos/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { activeCart, addItem, changeCart, closeCart, draftFrom, isEmpty, keepDesk, keepSeller, loadDesk, loadSeller, loadSellers, nextCart, openCart, rememberSeller, repriceDesk, type Cart, type Desk } from '@/services/pos/cart';
import { TEXT, posErrorMessage, readLang, saveLang, type PosLang } from '@/services/pos/i18n';
import { DEFAULT_SETTINGS, mergeItems } from '@/services/pos/items';
import { customerOk, num, piecesOf, rateText, totalOf } from '@/services/pos/logic';
import { printInvoice } from '@/services/pos/print';
import { getPosStore } from '@/services/pos/store';
import type { PosItem, PosItemChange, PosSettings, PosVariant, Sale } from '@/services/pos/types';
import { cn } from '@/utils/cn';

/**
 * The till (/pos): no sign-in. Items as cards on one side, the invoices on the
 * other — several customers at once, each with their own invoice, and a save
 * never holds up the next one. Past sales to print, return, change or delete,
 * all on their own page. In English and Kurdish, light and dark, on a computer,
 * a tablet and a phone, and with no internet.
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
  const [last, setLast] = useState<Sale | null>(null);
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
    (item: PosItem, variant?: PosVariant) => change((c) => ({ ...c, lines: addItem(c.lines, item, variant, settings) })),
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
        setBillOpen(true);
        requestAnimationFrame(() => {
          const box = document.getElementById(current.customerName.trim() ? 'pos-phone' : 'pos-name');
          box?.scrollIntoView({ block: 'center' });
          box?.focus();
        });
        return;
      }
      const draft = draftFrom(current, seller, settings.rate);
      markSaving(current.id, true);
      setErrors((e) => ({ ...e, [current.id]: '' }));
      setLast(null);
      // The counter is free for the next customer while this one is saved.
      setDesk((d) => nextCart(d, savingRef.current));
      setBillOpen(false);
      try {
        const sale = await store.save(draft);
        markSaving(current.id, false);
        setDesk((d) => closeCart(d, current.id));
        setSellers(rememberSeller(seller));
        setLast(sale);
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

  const online = status.state === 'online' && !status.waiting;
  const state = status.state === 'offline' ? t.offline : online ? t.online : t.onDevice;
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
    <CustomerTabs desk={desk} saving={saving} errors={errors} onChoose={(id) => setDesk((d) => ({ ...d, active: id }))} onAdd={() => setDesk((d) => openCart(d))} t={t} />
  );
  const rateButton = (className?: string) => <RateButton rate={settings.rate} isSet={settings.rateSet || !ready} onSave={setRate} t={t} className={className} />;

  return (
    <div className="flex h-dvh flex-col bg-surface text-ink-900" dir={lang === 'ku' ? 'rtl' : 'ltr'} lang={lang === 'ku' ? 'ckb' : 'en'}>
      <header className="z-30 flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 bg-card px-3 sm:gap-4 sm:px-4 lg:px-6">
        <VioTile className="size-10" />
        <span className="hidden text-lg font-bold lg:inline">Vio POS</span>
        <Segmented<'sell' | 'sales'>
          label="Vio POS"
          value={view}
          options={[
            { id: 'sell', label: t.sell },
            { id: 'sales', label: t.sales },
          ]}
          onChange={setView}
          className="lg:ms-3"
        />
        <div className="ms-auto flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className={cn('hidden whitespace-nowrap text-sm text-ink-500 min-[86rem]:inline', ltrText)}>{format(today, 'EEE d MMM yyyy')}</span>
          <span className="hidden items-center gap-2 whitespace-nowrap text-sm text-ink-500 min-[76rem]:inline-flex">
            <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-amber-500')} />
            {state}
          </span>
          {rateButton('max-md:hidden')}
          <div className="hidden sm:block">
            <Segmented<PosLang>
              small
              label="Language"
              value={lang}
              options={[
                { id: 'en', label: 'English' },
                { id: 'ku', label: 'کوردی' },
              ]}
              onChange={(l) => {
                setLang(l);
                saveLang(l);
              }}
            />
          </div>
          <button
            type="button"
            className="h-10 shrink-0 rounded-xl border border-slate-200 bg-card px-3 text-sm font-semibold text-ink-700 sm:hidden"
            onClick={() => {
              const next = lang === 'en' ? 'ku' : 'en';
              setLang(next);
              saveLang(next);
            }}
          >
            {lang === 'en' ? 'کوردی' : 'English'}
          </button>
          <ThemeToggle variant="icon" className="max-sm:hidden" />
        </div>
      </header>
      {strip && (
        <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 lg:px-6">
          {strip}
        </div>
      )}

      {view === 'sell' ? (
        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-1 md:gap-3 md:pe-3 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 lg:p-5 min-[90rem]:grid-cols-[216px_minmax(0,1fr)_436px] min-[137rem]:grid-cols-[248px_minmax(0,1fr)_520px] md:max-lg:py-3">
          <ItemGrid items={items} settings={settings} counts={counts} onAdd={add} lang={lang} t={t} searchRef={search} rate={rateButton('md:hidden [&>span]:hidden')} />
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
            onClose={() => {
              setDesk((d) => closeCart(d, cart.id));
              setErrors((e) => ({ ...e, [cart.id]: '' }));
            }}
            onBack={() => setBillOpen(false)}
            findCustomer={findCustomer}
            open={billOpen}
            tabs={tabs}
            lang={lang}
            t={t}
          />
          {/* A phone keeps the customers and the total in reach; the invoice opens over the items. */}
          <div className="border-t border-slate-200 bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(15_23_42/0.06)] md:hidden">
            {tabs}
            {last && (
              <button type="button" onClick={() => void printInvoice(last, settings, items)} className="flex w-full items-center justify-between gap-3 border-t border-emerald-100 bg-emerald-50 px-4 py-2 text-start text-sm font-semibold text-emerald-800">
                <span className="min-w-0 truncate">{t.saved(last.saleNo ? String(last.saleNo) : last.ref)}</span>
                <span className="shrink-0 underline underline-offset-4">{t.printAgain}</span>
              </button>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <div className={cn('whitespace-nowrap text-xl font-bold leading-tight tabular-nums', ltrText)}>
                  {num(totalOf(cart.lines))} <span className="text-xs font-semibold text-ink-400">IQD</span>
                </div>
                <div className="text-[13px] text-ink-500">{t.pieces(piecesOf(cart.lines))}</div>
              </div>
              <Button size="lg" className="h-12!" onClick={() => setBillOpen(true)}>
                {t.openBill}
              </Button>
            </div>
          </div>
        </main>
      ) : (
        <SalesView store={store} items={items} settings={settings} seller={seller} lang={lang} t={t} />
      )}
    </div>
  );
}
