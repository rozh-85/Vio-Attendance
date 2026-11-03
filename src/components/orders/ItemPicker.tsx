import { useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '@/services/orders/options';
import { modelKey, westernDigits } from '@/services/orders/profit';
import { catalogItem } from '@/services/orders/products';
import type { PriceListItem } from '@/services/orders/profitStore';
import { Check, Pencil, Plus, Search, X } from '@/components/icons';
import { cn } from '@/utils/cn';
import { FieldError, Label, inputClass } from './SellerFormParts';

/** The item fields of the order form this picker fills in. */
export interface ItemFields {
  itemModel: string;
  itemCategory: string;
  /** The total price as typed text, e.g. "170,000". */
  price: string;
  quantity: number;
  /** 'manual' when the seller writes the item and price themselves. */
  itemMode?: 'list' | 'manual';
  /** The seller set a price other than the price list's. */
  priceEdited?: boolean;
}

const RECENT_KEY = 'vio.sellerRecentModels';
const FIRST = 8;

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const priceNumber = (price: string) => Number(westernDigits(price).replace(/\D/g, '')) || 0;

function loadRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberRecent(key: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...loadRecent().filter((k) => k !== key)].slice(0, 6)));
  } catch {
    // Not remembered this time.
  }
}

/** The product photo on white, as the catalogue shoots it, or the model's letters. */
function Photo({ itemKey, model, className }: { itemKey: string; model: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = catalogItem(itemKey)?.image ?? '';
  return (
    <span className={cn('grid place-items-center overflow-hidden bg-white', className)}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain p-2" />
      ) : (
        <span className="font-mono text-lg font-bold text-slate-300">{model.replace(/[^A-Za-z0-9]/g, '').slice(0, 5)}</span>
      )}
    </span>
  );
}

/** − 2 + with buttons big enough for a thumb. */
function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const button =
    'grid size-11 place-items-center rounded-xl border border-slate-200 bg-card text-xl font-bold text-ink-700 transition active:scale-95 disabled:opacity-40';
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="One piece less" className={button} disabled={value <= 1} onClick={() => onChange(value - 1)}>
        {'−'}
      </button>
      <span className="w-10 text-center text-2xl font-bold tabular-nums text-ink-900" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="One piece more" className={button} disabled={value >= 99} onClick={() => onChange(value + 1)}>
        <Plus width={18} height={18} />
      </button>
    </div>
  );
}

/**
 * The item part of a seller's order. With a price list, the seller searches
 * the model number, taps the product and sets the pieces — the price fills in
 * by itself. An item not on the list is written by hand, as before.
 */
export function ItemPicker({
  products,
  fields,
  errors,
  onChange,
}: {
  /** null while it loads; empty when nothing is priced yet. */
  products: PriceListItem[] | null;
  fields: ItemFields;
  errors: { item?: string; price?: string };
  onChange: (patch: Partial<ItemFields>) => void;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(FIRST);
  const [recent, setRecent] = useState(loadRecent);
  const searchRef = useRef<HTMLInputElement>(null);

  const quantity = fields.quantity || 1;
  const listed = products && products.length > 0;
  const picked = listed && fields.itemMode !== 'manual' ? products.find((p) => p.key === modelKey(fields.itemModel)) : undefined;
  const view: 'loading' | 'picked' | 'manual' | 'search' =
    products === null && fields.itemMode !== 'manual'
      ? 'loading'
      : !listed || fields.itemMode === 'manual' || (!picked && fields.itemModel.trim())
        ? 'manual'
        : picked
          ? 'picked'
          : 'search';

  const types = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products ?? []) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const results = useMemo(() => {
    const q = modelKey(query);
    const text = query.trim().toLowerCase();
    const rank = (p: PriceListItem) =>
      !q ? 0 : p.key === q ? 0 : p.key.replace(/^[A-Z]+/, '').startsWith(q) || p.key.startsWith(q) ? 1 : 2;
    return (products ?? [])
      .filter((p) => !type || p.category === type)
      .filter(
        (p) =>
          !text ||
          (q && p.key.includes(q)) ||
          p.category.toLowerCase().includes(text) ||
          (catalogItem(p.key)?.name.toLowerCase().includes(text) ?? false),
      )
      .sort((a, b) => rank(a) - rank(b) || a.model.localeCompare(b.model, undefined, { numeric: true }));
  }, [products, query, type]);

  const recentItems = recent.map((k) => products?.find((p) => p.key === k)).filter((p): p is PriceListItem => !!p);

  function pick(p: PriceListItem) {
    onChange({
      itemModel: p.model,
      itemCategory: p.category || catalogItem(p.key)?.typeKu || catalogItem(p.key)?.group || '',
      price: money(p.price),
      quantity: 1,
      itemMode: 'list',
      priceEdited: false,
    });
    rememberRecent(p.key);
    setRecent(loadRecent());
    setQuery('');
    setType('');
    setLimit(FIRST);
  }

  function clearPick() {
    onChange({ itemModel: '', itemCategory: '', price: '', quantity: 1, itemMode: 'list', priceEdited: false });
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div>
        <Label en="Find the model" ku="گەڕان بۆ مۆدێل" required />
        <div className={cn(inputClass, 'h-14 animate-pulse border-slate-200 bg-slate-50')} />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  // ── Written by hand ─────────────────────────────────────────────────────
  if (view === 'manual') {
    const price = priceNumber(fields.price);
    return (
      <div className="space-y-4">
        {listed && (
          <button
            type="button"
            onClick={() => onChange({ itemModel: '', itemCategory: '', price: '', quantity: 1, itemMode: 'list', priceEdited: false })}
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <Search width={18} height={18} className="shrink-0 text-brand-700" />
            <span className="min-w-0 flex-1 text-sm">
              <b className="block text-brand-700">Pick from the price list</b>
              <span className="text-ink-500">The price fills in by itself · نرخ خۆکار دادەنرێت</span>
            </span>
          </button>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <Label en="Item model" ku="جۆری ئایتم" />
            <input
              className={cn(inputClass, 'font-mono', errors.item ? 'border-rose-400' : 'border-slate-200')}
              placeholder="e.g. V.502"
              autoCapitalize="characters"
              value={fields.itemModel}
              onChange={(e) => onChange({ itemModel: e.target.value, itemMode: 'manual' })}
            />
          </label>
          <label className="block">
            <Label en="Item type" ku="کەتەگۆری ئایتم" />
            <input
              className={cn(inputClass, errors.item ? 'border-rose-400' : 'border-slate-200')}
              dir="auto"
              list="order-categories"
              placeholder="سەماوەر، هیتەر…"
              value={fields.itemCategory}
              onChange={(e) => onChange({ itemCategory: e.target.value, itemMode: 'manual' })}
            />
            <datalist id="order-categories">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <FieldError message={errors.item} />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
          <div>
            <Label en="Pieces" ku="دانە" />
            <Stepper value={quantity} onChange={(n) => onChange({ quantity: n })} />
          </div>
          <label className="block">
            <Label en="Total price (IQD)" ku="نرخی گشتی" required />
            <input
              className={cn(inputClass, 'text-lg font-bold tabular-nums', errors.price ? 'border-rose-400' : 'border-slate-200')}
              inputMode="numeric"
              placeholder="95,000"
              value={fields.price}
              onChange={(e) => {
                const n = priceNumber(e.target.value);
                onChange({ price: n ? money(n) : '', itemMode: 'manual' });
              }}
            />
          </label>
        </div>
        <FieldError message={errors.price} />
        {price > 0 && price < 1000 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>
              Did you mean <b>{money(price * 1000)} IQD</b>?
            </span>
            <button
              type="button"
              className="rounded-lg bg-card px-3 py-1.5 font-semibold text-amber-800 shadow-sm"
              onClick={() => onChange({ price: money(price * 1000) })}
            >
              Use {money(price * 1000)}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── The product picked ──────────────────────────────────────────────────
  if (view === 'picked' && picked) {
    const listTotal = picked.price * quantity;
    const total = priceNumber(fields.price);
    const custom = fields.priceEdited ?? total !== listTotal;
    const name = catalogItem(picked.key)?.name;
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-3xl border-2 border-brand-500/70 bg-card shadow-sm">
          <button
            type="button"
            onClick={clearPick}
            aria-label="Change the model"
            title="Change the model · گۆڕین"
            className="absolute right-2.5 top-2.5 grid size-10 place-items-center rounded-xl bg-slate-100 text-ink-600 transition hover:bg-slate-200 active:scale-95"
          >
            <X width={18} height={18} />
          </button>
          <div className="flex gap-3 p-3 pr-14">
            <Photo itemKey={picked.key} model={picked.model} className="size-24 shrink-0 rounded-2xl border border-slate-100" />
            <div className="min-w-0 flex-1 py-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                  <Check width={12} height={12} strokeWidth={3} />
                </span>
                <span className="truncate font-mono text-xl font-bold text-ink-900">{picked.model}</span>
              </span>
              <div dir="auto" className="mt-0.5 truncate text-left text-sm text-ink-500">
                {[fields.itemCategory, name].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-1.5 text-sm text-ink-700">
                <b className="tabular-nums">{money(picked.price)}</b> IQD <span className="text-ink-400">each · دانەی</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-ink-700">
              Pieces <span dir="rtl" className="font-medium text-ink-400">دانە</span>
            </span>
            <Stepper
              value={quantity}
              onChange={(n) => onChange(custom ? { quantity: n } : { quantity: n, price: money(picked.price * n), priceEdited: false })}
            />
          </div>
          <div className="flex items-center justify-between gap-3 bg-brand-600 px-4 py-3.5 text-white">
            <span className="text-sm font-semibold text-white/85">
              Total <span dir="rtl">کۆی گشتی</span>
            </span>
            <span className="text-2xl font-bold tabular-nums">
              {money(total)} <span className="text-sm font-semibold text-white/70">IQD</span>
            </span>
          </div>
        </div>

        {custom ? (
          <div className="rounded-2xl bg-amber-50 p-3.5">
            <label className="block">
              <Label en="Price for this customer" ku="نرخ بۆ ئەم کڕیارە" className="text-amber-900" />
              <input
                className={cn(inputClass, 'text-lg font-bold tabular-nums', errors.price ? 'border-rose-400' : 'border-amber-200')}
                inputMode="numeric"
                value={fields.price}
                onChange={(e) => {
                  const n = priceNumber(e.target.value);
                  onChange({ price: n ? money(n) : '', priceEdited: true });
                }}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-amber-800">
              <span>
                Price list: <b className="tabular-nums">{money(listTotal)}</b> IQD
              </span>
              <button
                type="button"
                className="rounded-lg bg-card px-3 py-1.5 font-semibold text-amber-800 shadow-sm"
                onClick={() => onChange({ price: money(listTotal), priceEdited: false })}
              >
                Use the list price
              </button>
            </div>
            <FieldError message={errors.price} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ priceEdited: true })}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
          >
            <Pencil width={14} height={14} /> A different price for this customer?
          </button>
        )}
      </div>
    );
  }

  // ── Search the price list ───────────────────────────────────────────────
  const shown = results.slice(0, limit);
  return (
    <div>
      <Label en="Find the model" ku="گەڕان بۆ مۆدێل" required />
      <div className="relative">
        <Search width={20} height={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={searchRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="characters"
          autoComplete="off"
          className={cn(inputClass, 'h-14 pl-12 pr-12 font-mono text-lg', errors.item ? 'border-rose-400' : 'border-slate-200')}
          placeholder="e.g. 400 or V-502"
          value={query}
          onChange={(e) => {
            setQuery(westernDigits(e.target.value));
            setLimit(FIRST);
          }}
          onKeyDown={(e) => {
            // Enter picks the only match, or an exact one.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const exact = results.find((p) => p.key === modelKey(query));
            if (exact || results.length === 1) pick(exact ?? results[0]);
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-ink-400 hover:bg-slate-100"
          >
            <X width={18} height={18} />
          </button>
        )}
      </div>
      <FieldError message={errors.item} />

      {!query && recentItems.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
            Your recent · <span dir="rtl">دوایین</span>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recentItems.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => pick(p)}
                className="flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-card py-1.5 pl-1.5 pr-3 transition active:scale-[0.98]"
              >
                <Photo itemKey={p.key} model={p.model} className="size-9 rounded-xl" />
                <span className="text-left leading-tight">
                  <span className="block font-mono text-sm font-bold text-ink-900">{p.model}</span>
                  <span className="block text-xs tabular-nums text-ink-500">{money(p.price)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {types.length > 1 && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {[['', products?.length ?? 0] as [string, number], ...types].map(([t, n]) => (
            <button
              key={t || 'all'}
              type="button"
              dir={t ? 'auto' : undefined}
              onClick={() => {
                setType(t);
                setLimit(FIRST);
              }}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition',
                type === t ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-card text-ink-700',
              )}
            >
              {t || 'All · هەموو'} <span className={type === t ? 'text-white/70' : 'text-ink-400'}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-ink-500">
          No model matches <b className="font-mono text-ink-700">{query}</b>.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
          {shown.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card text-left shadow-sm transition hover:border-brand-300 active:scale-[0.98]"
            >
              <Photo itemKey={p.key} model={p.model} className="aspect-[4/3] w-full border-b border-slate-100" />
              <span className="flex flex-1 flex-col p-3">
                <span className="truncate font-mono text-base font-bold text-ink-900">{p.model}</span>
                <span dir="auto" className="truncate text-left text-xs text-ink-500">
                  {p.category || catalogItem(p.key)?.name || '—'}
                </span>
                <span className="mt-auto pt-2 text-sm font-bold tabular-nums text-brand-700">
                  {money(p.price)} <span className="text-[10px] font-semibold text-ink-400">IQD</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(results.length)}
          className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-card text-sm font-semibold text-ink-700"
        >
          Show all {results.length} models
        </button>
      )}

      <button
        type="button"
        onClick={() => onChange({ itemMode: 'manual' })}
        className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-ink-500 transition hover:border-slate-400 hover:text-ink-900"
      >
        <Pencil width={16} height={16} className="shrink-0" />
        <span className="text-left leading-tight">
          <span className="block text-sm font-semibold">Not in the list? Write it yourself</span>
          <span dir="rtl" className="block text-xs">لە لیستەکەدا نییە؟ خۆت بینووسە</span>
        </span>
      </button>
    </div>
  );
}
