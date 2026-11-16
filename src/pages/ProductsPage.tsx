import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, CalendarDays, Check, CheckCircle, ChevronDown, ChevronUp, DollarSign, ImageIcon, Pencil, Plus, Search, Trash, X } from '@/components/icons';
import { BackLink, LoadProblem, iqd, signTone, signedIqd } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { CATEGORIES } from '@/services/orders/options';
import {
  costsToKeep,
  modelKey,
  ordersToFix,
  parseIqd,
  summarizeProfit,
  westernDigits,
  type ModelCost,
  type ModelRow,
  type ModelValues,
} from '@/services/orders/profit';
import { catalogItem, catalogItems, dollarPrices, wholesale2026, type CatalogItem, type DollarPrice } from '@/services/orders/products';
import { clearProfitNotice, readProfitNotice } from '@/services/orders/profitMemory';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import type { SalesOrder } from '@/services/orders/types';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const field =
  'h-10 w-full rounded-xl border border-slate-200 bg-card px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';
const today = () => format(new Date(), 'yyyy-MM-dd');
/** "45,000" as it is typed. */
const moneyText = (value: string) => {
  const n = parseIqd(value);
  return n === null ? '' : iqd(n);
};
const FIX_SHOWN = 8;

/** The product's picture on white — uploaded, else the catalogue's — or the model's first letters. */
function Photo({ model, image = '', className }: { model: string; image?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = image || catalogItem(model)?.image || '';
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white', className)}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain p-0.5" />
      ) : (
        <span className="font-mono text-[10px] font-bold text-slate-400">{model.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}</span>
      )}
    </span>
  );
}

function CostBox({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <span className="relative block">
      <input
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Cost of one piece"
        className={cn(field, 'pr-12 text-right font-semibold tabular-nums')}
        value={value}
        onChange={(e) => onChange(moneyText(e.target.value))}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">IQD</span>
    </span>
  );
}

/** Dollars as typed: "83", "83.5", "٨٣", "1,200" → 83, 83.5, 83, 1200; null when empty. */
function parseUsd(value: string): number | null {
  const text = westernDigits(value).replace(/[٫]/g, '.').replace(/[^\d.]/g, '');
  if (!text) return null;
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/** The IQD cost of a dollar price at "IQD for 100 $", as the cost box writes it; '' when either is missing. */
function dollarsToIqd(usd: string, per100: string): string {
  const dollars = parseUsd(usd);
  const rate = (parseIqd(per100) ?? 0) / 100;
  return dollars === null || rate <= 0 ? '' : iqd(Math.round(dollars * rate));
}

/** The dollar price to save with a product: the dollars typed, at their rate, or none. */
function dollarsToSave(form: { usd: string; per100: string; cost: string }): { usd: number | null; rate: number | null } {
  const usd = parseUsd(form.usd);
  const rate = (parseIqd(form.per100) ?? 0) / 100;
  return usd !== null && rate > 0 && form.cost ? { usd, rate } : { usd: null, rate: null };
}

/**
 * Optional: the cost of one piece in dollars, at this product's own dollar
 * rate. Typing either fills in the IQD cost above; only the IQD cost is saved.
 */
function DollarBox({
  usd,
  per100,
  onChange,
}: {
  usd: string;
  per100: string;
  onChange: (next: { usd: string; per100: string }) => void;
}) {
  const result = dollarsToIqd(usd, per100);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
      <span className="font-medium text-ink-600">Cost in dollars (optional)</span>
      <span className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-ink-400">$</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label="Cost of one piece in dollars"
          placeholder="83"
          className={cn(field, 'w-28 pl-7 text-right font-semibold tabular-nums')}
          value={usd}
          onChange={(e) => onChange({ usd: e.target.value.replace(/[^\d.,٠-٩۰-۹٫]/g, ''), per100 })}
        />
      </span>
      <span className="text-ink-500">at 100 $ =</span>
      <span className="relative">
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label="IQD for 100 dollars, for this product"
          className={cn(field, 'w-36 pr-12 text-right font-semibold tabular-nums')}
          value={per100}
          onChange={(e) => onChange({ usd, per100: moneyText(e.target.value) })}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">IQD</span>
      </span>
      {result && (
        <span className="text-ink-500">
          = <b className="tabular-nums text-ink-900">{result} IQD</b>
        </span>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-1 block text-xs font-medium text-ink-500">{children}</span>;
}

/** A new product: picked from the catalogue, or written by hand, with its cost. */
function AddProduct({
  taken,
  prefill,
  rateNow,
  busy,
  onSave,
  onCancel,
}: {
  taken: Set<string>;
  prefill: string;
  /** IQD for one dollar that a dollar price starts at. */
  rateNow: number;
  busy: boolean;
  onSave: (product: ModelValues) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  // A model written on an order is filled in as the catalogue writes it, when it is there.
  const [form, setForm] = useState(() => {
    const item = prefill ? catalogItem(prefill) : undefined;
    return {
      label: item?.model ?? prefill,
      name: item?.name ?? '',
      category: item ? item.typeKu || item.group : '',
      cost: '',
      usd: '',
      per100: iqd(rateNow * 100),
    };
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblem(null);
  };

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    const q = modelKey(query);
    if (!text) return [];
    return catalogItems()
      .filter((i) => !taken.has(i.key) && ((q && i.key.includes(q)) || i.name.toLowerCase().includes(text)))
      .slice(0, 8);
  }, [query, taken]);

  const pick = (item: CatalogItem) => {
    set({ label: item.model, name: item.name, category: item.typeKu || item.group });
    setQuery('');
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    const key = modelKey(form.label);
    if (!key) return setProblem('Write the model, e.g. V-400.');
    if (taken.has(key)) return setProblem(`${form.label.trim()} is already on your list.`);
    onSave({
      key,
      label: form.label.trim(),
      name: form.name.trim(),
      image: '',
      category: form.category.trim(),
      cost: parseIqd(form.cost),
      ...dollarsToSave(form),
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">Add a product</h2>
          <p className="mt-0.5 text-sm text-ink-500">Find it in the catalogue, or write it yourself.</p>
        </div>
        <button type="button" aria-label="Close" onClick={onCancel} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100">
          <X width={18} height={18} />
        </button>
      </div>

      <div className="relative mt-4">
        <Search width={17} height={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          className={cn(field, 'h-11 pl-9')}
          placeholder="Search the catalogue: 400, kettle, heater…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query.trim() && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {matches.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => pick(item)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
            >
              <Photo model={item.key} className="size-11" />
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-bold text-ink-900">{item.model}</span>
                <span className="block truncate text-xs text-ink-500">{item.name}</span>
              </span>
            </button>
          ))}
          {matches.length === 0 && (
            <p className="col-span-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-ink-500">
              Not in the catalogue. Write it in the boxes below.
            </p>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 border-t border-slate-100 pt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <label className="block">
          <FieldLabel>Model *</FieldLabel>
          <input className={cn(field, 'font-mono font-semibold')} placeholder="V-400" value={form.label} onChange={(e) => set({ label: e.target.value })} />
        </label>
        <label className="block">
          <FieldLabel>Name</FieldLabel>
          <input className={field} placeholder="Air Fryer" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="block">
          <FieldLabel>Type</FieldLabel>
          <input className={field} dir="auto" list="product-types" placeholder="ئایەرفرای" value={form.category} onChange={(e) => set({ category: e.target.value })} />
        </label>
        <label className="block">
          <FieldLabel>Your cost (one piece)</FieldLabel>
          {/* Writing the IQD cost by hand drops the dollars it came from. */}
          <CostBox value={form.cost} onChange={(cost) => set({ cost, usd: '' })} />
        </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <DollarBox
            usd={form.usd}
            per100={form.per100}
            onChange={({ usd, per100 }) => set({ usd, per100, cost: dollarsToIqd(usd, per100) || form.cost })}
          />
          <Button type="submit" loading={busy} leftIcon={<Check width={16} height={16} />} className="h-10">
            Save product
          </Button>
        </div>
      </form>
      {problem && <p className="mt-2 text-sm font-semibold text-rose-600">{problem}</p>}
    </Card>
  );
}

/** One product in the list: shown, being changed, or asking before it goes. */
function ProductRow({
  product,
  dollars,
  rateNow,
  taken,
  stats,
  mode,
  busy,
  onEdit,
  onDelete,
  onCancel,
  onSave,
  onConfirmDelete,
}: {
  product: ModelCost;
  stats: ModelRow | undefined;
  mode: 'view' | 'edit' | 'delete';
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSave: (product: ModelValues, oldKey: string) => void;
  onConfirmDelete: () => void;
  /** Its dollar price, saved or read from the wholesale list. */
  dollars?: DollarPrice;
  rateNow: number;
  /** Models already on the list, so a new model number cannot take one. */
  taken: Set<string>;
}) {
  const [form, setForm] = useState({
    label: product.label,
    name: product.name,
    category: product.category,
    cost: product.cost === null ? '' : iqd(product.cost),
    usd: dollars ? String(dollars.usd) : '',
    per100: iqd((dollars?.rate ?? rateNow) * 100),
  });
  const costChanged = parseIqd(form.cost) !== product.cost;
  const newKey = modelKey(form.label);
  const modelProblem = !newKey
    ? 'Write the model, e.g. V-400.'
    : newKey !== product.key && taken.has(newKey)
      ? `${form.label.trim()} is already on your list.`
      : '';

  if (mode === 'edit') {
    return (
      <tr className="bg-brand-50/30">
        <td colSpan={6} className="px-5 py-4">
          <div className="flex items-center gap-3">
            <Photo model={product.key} image={product.image} className="size-10" />
            <span className="font-mono text-sm font-bold text-ink-900">{product.label}</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <label className="block">
              <FieldLabel>Model</FieldLabel>
              <input
                className={cn(field, 'font-mono font-semibold')}
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </label>
            <label className="block">
              <FieldLabel>Name</FieldLabel>
              <input className={field} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <FieldLabel>Type</FieldLabel>
              <input className={field} dir="auto" list="product-types" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
            </label>
            <label className="block">
              <FieldLabel>Your cost (one piece)</FieldLabel>
              <CostBox value={form.cost} autoFocus onChange={(cost) => setForm((f) => ({ ...f, cost, usd: '' }))} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <DollarBox
              usd={form.usd}
              per100={form.per100}
              onChange={({ usd, per100 }) =>
                setForm((f) => ({ ...f, usd, per100, cost: dollarsToIqd(usd, per100) || f.cost }))
              }
            />
            <div className="flex gap-2">
              <Button variant="ghost" className="h-10" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                className="h-10"
                loading={busy}
                disabled={!!modelProblem}
                leftIcon={<Check width={16} height={16} />}
                onClick={() =>
                  onSave(
                    {
                      key: newKey,
                      label: form.label.trim(),
                      name: form.name.trim(),
                      image: product.image,
                      category: form.category.trim(),
                      cost: parseIqd(form.cost),
                      ...dollarsToSave(form),
                    },
                    product.key,
                  )
                }
              >
                Save
              </Button>
            </div>
          </div>
          {modelProblem && <p className="mt-2 text-sm font-semibold text-rose-600">{modelProblem}</p>}
          {!modelProblem && newKey !== product.key && (
            <p className="mt-2 text-xs text-ink-500">
              The model becomes {form.label.trim()}. Orders already sold as {product.label} keep their cost; new orders need to be written as{' '}
              {form.label.trim()}.
            </p>
          )}
          {costChanged && product.cost !== null && (
            <p className="mt-2 text-xs text-ink-500">
              Orders already sold keep {iqd(product.cost)} IQD. The new cost is for new orders only.
            </p>
          )}
        </td>
      </tr>
    );
  }

  if (mode === 'delete') {
    return (
      <tr className="bg-rose-50/60">
        <td colSpan={6} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 basis-64 text-sm text-rose-900">
              <b>Delete {product.label}?</b> Orders already sold keep their profit. New orders of it will show under “Orders to fix”.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Keep it
              </Button>
              <Button size="sm" variant="danger" loading={busy} leftIcon={<Trash width={15} height={15} />} onClick={onConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const name = product.name || catalogItem(product.key)?.name || '';
  return (
    <tr>
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <Photo model={product.key} image={product.image} className="size-11" />
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-bold text-ink-900">{product.label}</div>
            {name && <div className="truncate text-xs text-ink-500">{name}</div>}
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-3 text-sm text-ink-600 md:table-cell">
        <bdi>{product.category || '—'}</bdi>
      </td>
      <td className="px-3 py-3 text-right">
        {product.cost === null ? (
          <button type="button" onClick={onEdit} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
            Add cost
          </button>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-ink-900">{iqd(product.cost)}</span>
        )}
      </td>
      <td className="hidden px-3 py-3 text-right text-sm tabular-nums text-ink-600 sm:table-cell">{stats?.orders ?? 0}</td>
      <td className="hidden px-3 py-3 text-right text-sm sm:table-cell">
        {stats && stats.costedOrders > 0 ? (
          <span className={cn('font-semibold tabular-nums', signTone(stats.profit))}>{signedIqd(stats.profit)}</span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </td>
      <td className="py-3 pl-3 pr-4 text-right">
        <div className="inline-flex gap-1">
          <button type="button" title="Edit" aria-label={`Edit ${product.label}`} onClick={onEdit} className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-slate-100 hover:text-ink-900">
            <Pencil width={16} height={16} />
          </button>
          <button type="button" title="Delete" aria-label={`Delete ${product.label}`} onClick={onDelete} className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-rose-50 hover:text-rose-600">
            <Trash width={16} height={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Counted orders whose model matches no product: the owner says which product each one is. */
/** Does a product match what was typed in a search box? Model, name or type. */
function matches(p: Pick<ModelCost, 'key' | 'label' | 'name' | 'category'>, query: string): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const key = modelKey(query);
  return (
    (!!key && p.key.includes(key)) ||
    p.label.toLowerCase().includes(text) ||
    p.name.toLowerCase().includes(text) ||
    p.category.toLowerCase().includes(text)
  );
}

/**
 * The product a seller most likely meant: the one whose model the seller's
 * model starts with, as V-657W (a colour letter added) is V-657 — when only
 * one product fits that well.
 */
function guessProduct(model: string, products: ModelCost[]): ModelCost | undefined {
  const key = modelKey(model);
  if (key.length < 4) return undefined;
  let best: ModelCost[] = [];
  let bestLength = 0;
  for (const p of products) {
    if (!p.cost || p.key.length < 4) continue;
    if (!(key.startsWith(p.key) || p.key.startsWith(key))) continue;
    const length = Math.min(p.key.length, key.length);
    if (length > bestLength) {
      best = [p];
      bestLength = length;
    } else if (length === bestLength) best.push(p);
  }
  return best.length === 1 ? best[0] : undefined;
}

/**
 * The product an order surely is, to be matched without asking: the seller
 * wrote a product's model with only letters after it — a colour, as V-657W or
 * V.801BLACK — and no other product fits as well. Anything less sure stays a
 * suggestion for the owner to save.
 */
function sureProduct(model: string, products: ModelCost[]): ModelCost | undefined {
  const key = modelKey(model);
  const fits = products.filter(
    (p) => p.cost && p.key.length >= 4 && key.startsWith(p.key) && /^[A-Z]{1,5}$/.test(key.slice(p.key.length)),
  );
  const longest = Math.max(0, ...fits.map((p) => p.key.length));
  const best = fits.filter((p) => p.key.length === longest);
  return best.length === 1 ? best[0] : undefined;
}

/**
 * A product picker you search instead of scroll: type a few letters of the
 * model or the name and pick from what is left. Products without a cost are
 * shown but cannot be picked.
 */
function ProductPicker({
  products,
  value,
  onChange,
  label,
  suggested,
}: {
  products: ModelCost[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  /** Shown as "Suggested" while it is the pick. */
  suggested?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // On a phone, tapping a product takes the focus off the search box before
  // the tap reaches the product. Closing the list a moment later, not at once,
  // keeps the product there to be tapped.
  const closing = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(closing.current), []);
  const picked = products.find((p) => p.key === value);
  const list = useMemo(() => products.filter((p) => matches(p, query)), [products, query]);
  const choose = (p: ModelCost) => {
    window.clearTimeout(closing.current);
    onChange(p.key);
    setQuery('');
    setOpen(false);
    // Put the phone keyboard away once a product is picked.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  return (
    <div className="relative min-w-0 flex-1 basis-64 scroll-mt-24 [&_input]:scroll-mt-24">
      {picked && !open ? (
        <button
          type="button"
          aria-label={label}
          onClick={() => setOpen(true)}
          className={cn(field, 'flex items-center gap-2 text-left')}
        >
          <Photo model={picked.label} image={picked.image} className="size-7" />
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">{picked.label}</b>
            {picked.name && <span className="text-ink-500"> · {picked.name}</span>}
          </span>
          {picked.key === suggested && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Suggested</span>}
          <Search width={15} height={15} className="shrink-0 text-ink-400" />
        </button>
      ) : (
        <span className="relative block">
          <Search width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            aria-label={label}
            autoFocus={open}
            autoComplete="off"
            placeholder="Search model or name — e.g. 657"
            className={cn(field, 'pl-9')}
            value={query}
            onFocus={(e) => {
              window.clearTimeout(closing.current);
              setOpen(true);
              // On a phone the keyboard covers the lower half: bring the box
              // up so the matches below it stay in sight.
              const box = e.currentTarget;
              window.setTimeout(() => box.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
            }}
            onBlur={() => {
              window.clearTimeout(closing.current);
              closing.current = window.setTimeout(() => setOpen(false), 300);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              const first = list.find((p) => p.cost);
              if (e.key === 'Enter' && first) {
                e.preventDefault();
                choose(first);
              }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </span>
      )}
      {open && (
        // In the page, not floating over it: nothing can cut it off or sit on top of it.
        <ul
          role="listbox"
          aria-label={label}
          className="mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-card py-1 shadow-sm"
        >
          {list.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-500">No product matches “{query.trim()}”.</li>
          ) : (
            list.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.key === value}
                  disabled={!p.cost}
                  onClick={() => choose(p)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
                    p.cost ? 'hover:bg-slate-50' : 'cursor-not-allowed opacity-50',
                    p.key === value && 'bg-brand-50',
                  )}
                >
                  <Photo model={p.label} image={p.image} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink-900">{p.label}</span>
                    <span className="block truncate text-xs text-ink-500">{p.name || p.category || '—'}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-500">{p.cost ? `${iqd(p.cost)} IQD` : 'no cost yet'}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function OrdersToFix({
  orders,
  products,
  busy,
  onFix,
  onAdd,
}: {
  orders: SalesOrder[];
  products: ModelCost[];
  busy: boolean;
  onFix: (order: SalesOrder, key: string) => void;
  onAdd: (model: string) => void;
}) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [all, setAll] = useState(false);
  const shown = all ? orders : orders.slice(0, FIX_SHOWN);
  return (
    <Card className="overflow-hidden border-amber-200">
      <div className="flex flex-wrap items-start gap-3 bg-amber-50 px-5 py-4">
        <AlertTriangle width={20} height={20} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-amber-950">
            {orders.length} {orders.length === 1 ? 'order needs' : 'orders need'} a product
          </h2>
          <p className="text-sm text-amber-900">
            The model the seller wrote is not on your list, so the profit leaves {orders.length === 1 ? 'it' : 'them'} out. Pick the
            product, or add the model as a new product.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {shown.map((o) => {
          const guess = guessProduct(o.itemModel, products);
          const pick = picks[o.id] ?? guess?.key ?? '';
          const product = pick ? products.find((p) => p.key === pick && p.cost) : undefined;
          return (
            <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-sm font-bold text-ink-900">{o.itemModel.trim() || 'No model written'}</span>
                  {o.itemCategory && <bdi className="truncate text-xs text-ink-500">{o.itemCategory}</bdi>}
                </div>
                <div className="text-xs text-ink-500">
                  #{o.orderNo} · {format(new Date(o.createdAt), 'd MMM')} · <bdi>{o.sellerName || 'Seller'}</bdi> ·{' '}
                  <b className="tabular-nums text-ink-700">{iqd(o.totalPrice)}</b> IQD{(o.quantity || 1) > 1 && ` · ${o.quantity} pieces`}
                </div>
              </div>
              <ProductPicker
                label={`Product for order #${o.orderNo}`}
                products={products}
                value={pick}
                suggested={guess?.key}
                onChange={(key) => setPicks((p) => ({ ...p, [o.id]: key }))}
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={!product || busy} leftIcon={<Check width={15} height={15} />} onClick={() => product && onFix(o, product.key)}>
                  Save
                </Button>
                {modelKey(o.itemModel) && (
                  <Button size="sm" variant="outline" leftIcon={<Plus width={15} height={15} />} onClick={() => onAdd(o.itemModel.trim())}>
                    Add as product
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {orders.length > FIX_SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-slate-100 py-3 text-sm font-semibold text-brand-700 hover:bg-slate-50">
          {all ? 'Show fewer' : `Show all ${orders.length}`}
        </button>
      )}
    </Card>
  );
}

/**
 * The dollar rate of every product priced in dollars, changed in one go:
 * products added before or after, from the wholesale list or by hand.
 */
function DollarRateForAll({
  products,
  prices,
  rateNow,
  open,
  setOpen,
  busy,
  storesDollars,
  onApply,
}: {
  products: ModelCost[];
  prices: Map<string, DollarPrice>;
  rateNow: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: boolean;
  /** False until social-profit.sql is run again: dollars typed by hand are then not kept. */
  storesDollars: boolean;
  onApply: (rate: number) => void;
}) {
  const [per100, setPer100] = useState(iqd(rateNow * 100));
  const rate = (parseIqd(per100) ?? 0) / 100;
  const changes = products.flatMap((p) => {
    const price = prices.get(p.key);
    if (!price || rate <= 0) return [];
    const cost = Math.round(price.usd * rate);
    return cost === p.cost ? [] : [{ p, price, cost }];
  });
  const example = changes[0];
  return (
    <Card className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <DollarSign width={18} height={18} className="shrink-0 text-ink-400" />
        <span className="min-w-0 flex-1 text-ink-600">
          Dollar rate <b className="text-ink-900">100 $ = {iqd(rateNow * 100)} IQD</b> · {prices.size}{' '}
          {prices.size === 1 ? 'product is' : 'products are'} priced in dollars
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setPer100(iqd(rateNow * 100));
              setOpen(true);
            }}
            className="font-semibold text-brand-700 hover:underline"
          >
            Change for all
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink-900">New rate for all</span>
            <span className="text-ink-600">100 $ =</span>
            <span className="relative">
              <input
                inputMode="numeric"
                autoFocus
                aria-label="New IQD for 100 dollars, for every product"
                className={cn(field, 'w-36 pr-12 text-right font-semibold tabular-nums')}
                value={per100}
                onChange={(e) => setPer100(moneyText(e.target.value))}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">IQD</span>
            </span>
          </label>
          <p className="text-sm text-ink-600">
            {changes.length === 0 ? (
              'No cost changes at this rate.'
            ) : (
              <>
                <b className="text-ink-900">{changes.length}</b> {changes.length === 1 ? 'cost changes' : 'costs change'}
                {example && (
                  <>
                    {' '}
                    — e.g. {example.p.label}: ${example.price.usd} = {example.p.cost === null ? '—' : iqd(example.p.cost)} →{' '}
                    <b className="text-ink-900">{iqd(example.cost)} IQD</b>
                  </>
                )}
                . Orders already sold keep their cost. Costs written in IQD stay as they are.
              </>
            )}
          </p>
          {!storesDollars && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Dollars you type for a product yourself are only kept once supabase/social-profit.sql has been run again in Supabase.
              Until then this changes the wholesale list’s products.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || rate <= 0 || changes.length === 0} loading={busy} leftIcon={<Check width={16} height={16} />} onClick={() => onApply(rate)}>
              {changes.length ? `Change ${changes.length} ${changes.length === 1 ? 'cost' : 'costs'}` : 'Nothing to change'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Where a wholesale price stands against the owner's own list. */
type WholesaleState = 'new' | 'no-cost' | 'same' | 'different';

const STATE_TEXT: Record<WholesaleState, { label: string; tone: string }> = {
  new: { label: 'New — added', tone: 'bg-brand-50 text-brand-700' },
  'no-cost': { label: 'Cost filled in', tone: 'bg-amber-50 text-amber-800' },
  same: { label: 'Already this cost', tone: 'bg-emerald-50 text-emerald-700' },
  different: { label: 'Your cost differs', tone: 'bg-slate-100 text-ink-600' },
};

/**
 * The 2026 wholesale price list in dollars, turned into IQD at the rate the
 * owner types: adds the products not on the list yet and fills in the costs
 * that are missing — and, only when asked, replaces costs the owner wrote.
 */
function WholesalePrices({
  models,
  rateNow,
  busy,
  onApply,
  onClose,
}: {
  models: Record<string, ModelCost>;
  rateNow: number;
  busy: boolean;
  onApply: (rate: number, replace: boolean) => void;
  onClose: () => void;
}) {
  const [per100, setPer100] = useState(iqd(rateNow * 100));
  const [replace, setReplace] = useState(false);
  const [showList, setShowList] = useState(false);
  const rate = (parseIqd(per100) ?? 0) / 100;
  const rows = useMemo(
    () =>
      wholesale2026().map((w) => {
        const mine = models[w.key];
        const cost = Math.round(w.usd * rate);
        const state: WholesaleState = !mine ? 'new' : !mine.cost ? 'no-cost' : mine.cost === cost ? 'same' : 'different';
        return { ...w, cost, mine, state, image: mine?.image || catalogItem(w.key)?.image || '' };
      }),
    [models, rate],
  );
  const count = (state: WholesaleState) => rows.filter((r) => r.state === state).length;
  const added = count('new');
  const filled = count('no-cost');
  const same = count('same');
  const different = count('different');
  const noPicture = rows.filter((r) => !r.image);
  const changes = added + filled + (replace ? different : 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-900">Wholesale price list 2026</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {rows.length} products in dollars. Each one’s cost is its wholesale price × the dollar rate.
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-slate-100 hover:text-ink-700">
          <X width={18} height={18} />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-ink-900">Dollar rate today</span>
          <span className="text-ink-600">100 $ =</span>
          <span className="relative">
            <input
              inputMode="numeric"
              aria-label="IQD for 100 dollars"
              className={cn(field, 'w-36 pr-12 text-right font-semibold tabular-nums')}
              value={per100}
              onChange={(e) => setPer100(moneyText(e.target.value))}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">IQD</span>
          </span>
          {rate > 0 && <span className="text-ink-500">· 1 $ = {iqd(rate)} IQD</span>}
        </label>

        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li className="rounded-xl bg-slate-50 px-3 py-2">
            <b className="text-ink-900">{added}</b> new {added === 1 ? 'product is' : 'products are'} added with {added === 1 ? 'its' : 'their'} cost
          </li>
          <li className="rounded-xl bg-slate-50 px-3 py-2">
            <b className="text-ink-900">{filled}</b> of yours without a cost {filled === 1 ? 'gets' : 'get'} one
          </li>
          <li className="rounded-xl bg-slate-50 px-3 py-2">
            <b className="text-ink-900">{same}</b> already {same === 1 ? 'has' : 'have'} this cost
          </li>
          <li className={cn('rounded-xl px-3 py-2', noPicture.length ? 'bg-amber-50 text-amber-900' : 'bg-slate-50')}>
            {noPicture.length === 0 ? (
              <>Every product has a picture</>
            ) : (
              <>
                <b>{noPicture.length}</b> without a picture: {noPicture.map((r) => r.model).join(', ')} —{' '}
                <Link to={paths.profitAddProducts} className="font-semibold underline">
                  add pictures
                </Link>
              </>
            )}
          </li>
        </ul>

        {different > 0 && (
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>
              Also change the <b>{different}</b> {different === 1 ? 'cost' : 'costs'} you wrote yourself to the wholesale price.{' '}
              <span className="text-ink-500">Orders already sold keep the old cost.</span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={busy || rate <= 0 || changes === 0} loading={busy} leftIcon={<Check width={17} height={17} />} onClick={() => onApply(rate, replace)}>
            {changes === 0 ? 'Nothing to change' : `Add and set ${changes} ${changes === 1 ? 'cost' : 'costs'}`}
          </Button>
          <Button
            variant="ghost"
            leftIcon={showList ? <ChevronUp width={16} height={16} /> : <ChevronDown width={16} height={16} />}
            onClick={() => setShowList((v) => !v)}
          >
            {showList ? 'Hide the prices' : `Show the ${rows.length} prices`}
          </Button>
        </div>
      </div>

      {showList && (
        <div className="max-h-[32rem] overflow-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-ink-500">
              <tr>
                <th className="py-2 pl-5 pr-3 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Wholesale</th>
                <th className="px-3 py-2 text-right font-medium">Cost (IQD)</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Your cost now</th>
                <th className="py-2 pl-3 pr-5 font-medium">
                  <span className="sr-only">State</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                      <Photo model={r.model} image={r.mine?.image} className="size-9" />
                      <div className="min-w-0">
                        <div className="font-semibold text-ink-900">{r.model}</div>
                        <div className="truncate text-xs text-ink-500">{r.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">${r.usd}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-900">{iqd(r.cost)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-ink-500 sm:table-cell">
                    {r.mine?.cost == null ? '—' : iqd(r.mine.cost)}
                  </td>
                  <td className="py-2 pl-3 pr-5">
                    <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', STATE_TEXT[r.state].tone)}>
                      {r.state === 'different' && replace ? 'Changed' : STATE_TEXT[r.state].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * The owner's products: a short list, each with what one piece costs. Sellers
 * write the model and their own price on each order; an order whose model is
 * on this list gets the product's cost, so its profit works itself out.
 * Orders from before the start day are not counted.
 */
export function ProductsPage() {
  const navigate = useNavigate();
  const { orders, profit, error, loading, reload, update } = useProfitData();
  const autoDone = useRef(false);
  const [adding, setAdding] = useState<{ prefill: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [startEdit, setStartEdit] = useState<string | null>(null);
  const [wholesaleOpen, setWholesaleOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [busy, setBusy] = useState(false);
  // The "added" message from Add from pictures shows here once.
  const [notice, setNotice] = useState(readProfitNotice);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    clearProfitNotice();
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), notice.includes('wholesale prices') || notice.includes('matched') ? 15000 : 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const products = useMemo(
    () => Object.values(profit?.models ?? {}).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [profit],
  );
  const taken = useMemo(() => new Set(products.map((p) => p.key)), [products]);
  // Products priced in dollars and the rate most of them are at today.
  const dollars = useMemo(() => dollarPrices(profit?.models ?? {}), [profit]);
  const rateNow = dollars.rate;
  const shownProducts = useMemo(() => products.filter((p) => matches(p, listQuery)), [products, listQuery]);
  const stats = useMemo(
    () => new Map(orders && profit ? summarizeProfit(orders, profit, '', '').byModel.map((r) => [r.key, r]) : []),
    [orders, profit],
  );
  const toFix = useMemo(() => (orders && profit ? ordersToFix(orders, profit) : []), [orders, profit]);
  const noCost = products.filter((p) => p.cost === null).length;
  // Products of the wholesale list that still need a cost: not on the list
  // yet, or on it without a cost (or with 0).
  const wholesaleNeeded = useMemo(
    () => wholesale2026().filter((w) => !profit?.models[w.key]?.cost).length,
    [profit],
  );

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setProblem(null);
    try {
      setNotice(await action());
    } catch (err) {
      setProblem(profitErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const addProduct = (product: ModelValues) =>
    run(async () => {
      if (!profit) return '';
      const store = getProfitStore();
      await store.saveModels([product]);
      // The first product starts the count: orders from today on.
      const startDate = profit.startDate ?? today();
      if (!profit.startDate) await store.setStartDate(startDate);
      const now = new Date().toISOString();
      update((d) => ({ ...d, startDate, models: { ...d.models, [product.key]: { ...product, createdAt: now, updatedAt: now } } }));
      setAdding(null);
      return `${product.label} added`;
    });

  // The 2026 wholesale price list at the owner's dollar rate: products not on
  // the list yet are added with their cost, products without a cost get one,
  // and costs the owner wrote are only replaced when asked — orders already
  // sold keep the cost they had.
  const applyWholesale = (rate: number, replace: boolean) =>
    run(async () => {
      if (!profit || !orders || rate <= 0) return '';
      const list: ModelValues[] = [];
      const keep: Record<string, number> = {};
      let added = 0;
      let filled = 0;
      let changed = 0;
      for (const w of wholesale2026()) {
        const cost = Math.round(w.usd * rate);
        const mine = profit.models[w.key];
        if (!mine) {
          list.push({ key: w.key, label: w.model, name: w.name, image: '', cost, category: w.type, usd: w.usd, rate });
          added += 1;
        } else if (!mine.cost || (replace && mine.cost !== cost)) {
          // A cost of 0 is a cost nobody wrote yet, so it is filled in too.
          if (!mine.cost) filled += 1;
          else {
            Object.assign(keep, costsToKeep(orders, profit, w.key));
            changed += 1;
          }
          list.push({ key: mine.key, label: mine.label, name: mine.name, image: mine.image, cost, category: mine.category, usd: w.usd, rate });
        }
      }
      if (!list.length) return 'Every product already has its wholesale cost';
      const store = getProfitStore();
      if (Object.keys(keep).length) await store.setOrderCosts(keep);
      await store.saveModels(list);
      const startDate = profit.startDate ?? today();
      if (!profit.startDate) await store.setStartDate(startDate);
      const now = new Date().toISOString();
      update((d) => {
        const models = { ...d.models };
        for (const m of list) models[m.key] = { ...m, createdAt: d.models[m.key]?.createdAt ?? now, updatedAt: now };
        return { ...d, startDate, models, orderCosts: { ...d.orderCosts, ...keep } };
      });
      setWholesaleOpen(false);
      return [
        added ? `${added} ${added === 1 ? 'product' : 'products'} added` : '',
        filled ? `${filled} ${filled === 1 ? 'cost' : 'costs'} filled in` : '',
        changed ? `${changed} ${changed === 1 ? 'cost' : 'costs'} changed` : '',
      ]
        .filter(Boolean)
        .join(' · ') + ` at 100 $ = ${iqd(rate * 100)} IQD`;
    });

  // The model number may change too: the product then moves to its new
  // model, and orders already sold under the old one keep their cost.
  const saveProduct = (product: ModelValues, oldKey: string) =>
    run(async () => {
      if (!profit || !orders) return '';
      const before = profit.models[oldKey];
      const moving = product.key !== oldKey;
      if (moving && profit.models[product.key]) throw new Error(`${product.label} is already on your list.`);
      // A new cost is for new orders: those already sold keep the old one.
      const keep =
        before && before.cost !== null && (moving || product.cost !== before.cost) ? costsToKeep(orders, profit, oldKey) : {};
      const store = getProfitStore();
      if (Object.keys(keep).length) await store.setOrderCosts(keep);
      await store.saveModels([product]);
      if (moving) await store.deleteModels([oldKey]);
      const now = new Date().toISOString();
      update((d) => {
        const models = { ...d.models };
        if (moving) delete models[oldKey];
        models[product.key] = { ...product, createdAt: before?.createdAt ?? now, updatedAt: now };
        return { ...d, orderCosts: { ...d.orderCosts, ...keep }, models };
      });
      setEditing(null);
      const kept = Object.keys(keep).length;
      const what = moving ? `${before?.label ?? oldKey} is now ${product.label}` : `${product.label} saved`;
      return kept ? `${what} · ${kept} ${kept === 1 ? 'order' : 'orders'} already sold keep the old cost` : what;
    });

  // A new dollar rate for every product priced in dollars — added before or
  // after, from the wholesale list or by hand. Costs written in IQD stay; orders
  // already sold keep the cost they had.
  const applyRateToAll = (rate: number) =>
    run(async () => {
      if (!profit || !orders || rate <= 0) return '';
      const list: ModelValues[] = [];
      const keep: Record<string, number> = {};
      let changed = 0;
      for (const m of Object.values(profit.models)) {
        const price = dollars.prices.get(m.key);
        if (!price) continue;
        const cost = Math.round(price.usd * rate);
        if (cost === m.cost && m.usd === price.usd && m.rate === rate) continue;
        if (m.cost !== null && cost !== m.cost) {
          Object.assign(keep, costsToKeep(orders, profit, m.key));
          changed += 1;
        }
        list.push({ key: m.key, label: m.label, name: m.name, image: m.image, category: m.category, cost, usd: price.usd, rate });
      }
      if (!list.length) return `Every dollar price is already at 100 $ = ${iqd(rate * 100)} IQD`;
      const store = getProfitStore();
      if (Object.keys(keep).length) await store.setOrderCosts(keep);
      await store.saveModels(list);
      const now = new Date().toISOString();
      update((d) => {
        const models = { ...d.models };
        for (const m of list) models[m.key] = { ...m, createdAt: d.models[m.key]?.createdAt ?? now, updatedAt: now };
        return { ...d, models, orderCosts: { ...d.orderCosts, ...keep } };
      });
      setRateOpen(false);
      return `${changed} ${changed === 1 ? 'cost' : 'costs'} changed to 100 $ = ${iqd(rate * 100)} IQD`;
    });

  const deleteProduct = (key: string) =>
    run(async () => {
      if (!profit || !orders) return '';
      const label = profit.models[key]?.label ?? key;
      const keep = costsToKeep(orders, profit, key);
      const store = getProfitStore();
      if (Object.keys(keep).length) await store.setOrderCosts(keep);
      await store.deleteModels([key]);
      update((d) => {
        const models = { ...d.models };
        delete models[key];
        return { ...d, models, orderCosts: { ...d.orderCosts, ...keep } };
      });
      setDeleting(null);
      return `${label} deleted`;
    });

  // Once the page has its data: every product of the wholesale list that is
  // on the owner's list without a cost (or with 0) gets the wholesale cost at
  // today's rate, and every order whose model is surely one product (its
  // model plus a colour letter) is counted as that product. Costs the owner
  // wrote are never touched, and no product is added or brought back.
  useEffect(() => {
    if (autoDone.current || !profit || !orders) return;
    autoDone.current = true;
    void run(async () => {
      const store = getProfitStore();
      const filled: ModelValues[] = [];
      for (const w of wholesale2026()) {
        const mine = profit.models[w.key];
        if (mine && !mine.cost)
          filled.push({ key: mine.key, label: mine.label, name: mine.name, image: mine.image, cost: Math.round(w.usd * rateNow), category: mine.category, usd: w.usd, rate: rateNow });
      }
      if (filled.length) await store.saveModels(filled);
      // Products filled in before dollar prices were kept: keep their dollar
      // price now, so a later rate reaches them even without the list. Their
      // cost does not change.
      if (store.storesDollars()) {
        const unsaved = Object.values(profit.models).flatMap((m) => {
          const price = dollars.prices.get(m.key);
          return price && m.usd === null && m.cost ? [{ ...m, usd: price.usd, rate: price.rate }] : [];
        });
        if (unsaved.length) {
          await store.saveModels(unsaved);
          update((d) => {
            const models = { ...d.models };
            for (const m of unsaved) if (models[m.key]) models[m.key] = { ...models[m.key], usd: m.usd, rate: m.rate };
            return { ...d, models };
          });
        }
      }
      const now = new Date().toISOString();
      const models = { ...profit.models };
      for (const m of filled) models[m.key] = { ...m, createdAt: profit.models[m.key]?.createdAt ?? now, updatedAt: now };
      const list = Object.values(models);
      const matched: Record<string, number> = {};
      for (const o of ordersToFix(orders, { ...profit, models })) {
        const product = sureProduct(o.itemModel, list);
        if (product?.cost) matched[o.id] = product.cost * (o.quantity || 1);
      }
      const count = Object.keys(matched).length;
      if (count) await store.setOrderCosts(matched);
      if (!filled.length && !count) return '';
      update((d) => ({
        ...d,
        models: { ...d.models, ...Object.fromEntries(filled.map((m) => [m.key, models[m.key]])) },
        orderCosts: { ...d.orderCosts, ...matched },
      }));
      return [
        filled.length ? `${filled.length} ${filled.length === 1 ? 'cost' : 'costs'} added from the wholesale prices (100 $ = ${iqd(rateNow * 100)} IQD)` : '',
        count ? `${count} ${count === 1 ? 'order' : 'orders'} matched to ${count === 1 ? 'its' : 'their'} product` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    });
    // Runs once (autoDone), when the data first arrives.
  }, [profit, orders]);

  const fixOrder = (order: SalesOrder, key: string) =>
    run(async () => {
      const product = profit?.models[key];
      if (!product || product.cost === null) return '';
      const cost = product.cost * (order.quantity || 1);
      await getProfitStore().setOrderCost(order.id, cost);
      update((d) => ({ ...d, orderCosts: { ...d.orderCosts, [order.id]: cost } }));
      return `Order #${order.orderNo} counted as ${product.label}`;
    });

  const saveStart = (day: string) =>
    run(async () => {
      await getProfitStore().setStartDate(day);
      update((d) => ({ ...d, startDate: day }));
      setStartEdit(null);
      return `Profit now counts orders from ${format(parseISO(day), 'd MMM yyyy')}`;
    });

  const addButton = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button variant="secondary" leftIcon={<DollarSign width={17} height={17} />} onClick={() => setWholesaleOpen(true)}>
        Wholesale prices 2026
      </Button>
      <Link to={paths.profitAddProducts} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-card px-5 text-sm font-semibold text-ink-700 transition-colors hover:bg-slate-50">
        <ImageIcon width={17} height={17} /> Add from pictures
      </Link>
      <Button leftIcon={<Plus width={17} height={17} />} onClick={() => setAdding({ prefill: '' })}>
        Add product
      </Button>
    </div>
  );

  return (
    <AdminLayout>
      <BackLink label="Back to profit" onClick={() => navigate(paths.profit)} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-bold text-ink-900">Products</h1>
          <p className="mt-1 text-ink-500">
            The products you sell and what one piece costs you. Sellers write the model and their own price on each order;
            profit is their price minus your cost.
          </p>
        </div>
        {products.length > 0 && !adding && addButton}
      </div>

      {notice && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-emerald-800">
          <CheckCircle width={20} height={20} className="shrink-0" />
          <span className="flex-1 font-semibold">{notice}</span>
          <button type="button" aria-label="Close" onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            <X width={16} height={16} />
          </button>
        </div>
      )}
      {problem && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800">{problem}</div>
      )}

      <div className="mt-5 space-y-4">
        {error ? (
          <LoadProblem error={error} onRetry={() => void reload()} />
        ) : loading || !profit || !orders ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" aria-label="Loading" />
        ) : (
          <>
            <datalist id="product-types">
              {[...new Set([...CATEGORIES, ...products.map((p) => p.category).filter(Boolean)])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            {/* Which orders count. */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-card px-4 py-3 text-sm">
              <CalendarDays width={18} height={18} className="shrink-0 text-ink-400" />
              {startEdit !== null ? (
                <>
                  <span className="text-ink-600">Count orders from</span>
                  <input type="date" aria-label="Count orders from" className={cn(field, 'w-auto')} value={startEdit} max={today()} onChange={(e) => setStartEdit(e.target.value)} />
                  <Button size="sm" disabled={!startEdit || busy} onClick={() => void saveStart(startEdit)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStartEdit(null)}>
                    Cancel
                  </Button>
                </>
              ) : profit.startDate ? (
                <>
                  <span className="min-w-0 flex-1 text-ink-600">
                    Profit counts orders from <b className="text-ink-900">{format(parseISO(profit.startDate), 'd MMM yyyy')}</b>. Older orders
                    are not counted.
                  </span>
                  <button type="button" onClick={() => setStartEdit(profit.startDate)} className="font-semibold text-brand-700 hover:underline">
                    Change
                  </button>
                </>
              ) : (
                <span className="text-ink-600">Profit starts counting orders on the day you add your first product. Older orders are not counted.</span>
              )}
            </div>

            {wholesaleNeeded > 0 && !wholesaleOpen && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:flex sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-amber-900">
                    {wholesaleNeeded} {wholesaleNeeded === 1 ? 'product needs a cost' : 'products need a cost'}
                  </p>
                  <p className="mt-0.5 text-sm text-amber-800">
                    From the 2026 wholesale prices at 100 $ = {iqd(rateNow * 100)} IQD — e.g. V-400 is $83 = {iqd(83 * rateNow)} IQD.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
                  <Button disabled={busy} loading={busy} leftIcon={<Check width={17} height={17} />} onClick={() => void applyWholesale(rateNow, false)}>
                    Add {wholesaleNeeded} {wholesaleNeeded === 1 ? 'cost' : 'costs'}
                  </Button>
                  <Button variant="ghost" onClick={() => setWholesaleOpen(true)}>
                    Change the rate
                  </Button>
                </div>
              </div>
            )}

            {dollars.prices.size > 0 && (
              <DollarRateForAll
                products={products}
                prices={dollars.prices}
                rateNow={rateNow}
                open={rateOpen}
                setOpen={setRateOpen}
                busy={busy}
                storesDollars={getProfitStore().storesDollars()}
                onApply={(rate) => void applyRateToAll(rate)}
              />
            )}

            {wholesaleOpen && (
              <WholesalePrices models={profit.models} rateNow={rateNow} busy={busy} onApply={(rate, replace) => void applyWholesale(rate, replace)} onClose={() => setWholesaleOpen(false)} />
            )}

            {adding && (
              <AddProduct
                key={adding.prefill}
                taken={taken}
                prefill={adding.prefill}
                rateNow={rateNow}
                busy={busy}
                onSave={(p) => void addProduct(p)}
                onCancel={() => setAdding(null)}
              />
            )}

            {toFix.length > 0 && products.length > 0 && (
              <OrdersToFix
                orders={toFix}
                products={products}
                busy={busy}
                onFix={(o, key) => void fixOrder(o, key)}
                onAdd={(model) => {
                  setAdding({ prefill: model });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {products.length === 0 ? (
              !adding && (
                <Card className="px-6 py-10 text-center">
                  <h2 className="text-lg font-semibold text-ink-900">No products yet</h2>
                  <ol className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-ink-600">
                    <li className="flex gap-3">
                      <b className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs text-ink-700">1</b>
                      Add each product you sell, with what one piece costs you.
                    </li>
                    <li className="flex gap-3">
                      <b className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs text-ink-700">2</b>
                      Sellers write the model and their price on each order, as always.
                    </li>
                    <li className="flex gap-3">
                      <b className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs text-ink-700">3</b>
                      Each order’s profit is the seller’s price minus your cost.
                    </li>
                  </ol>
                  <div className="mt-6">{addButton}</div>
                </Card>
              )
            ) : (
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
                  <h2 className="text-base font-semibold text-ink-900">
                    {products.length} {products.length === 1 ? 'product' : 'products'}
                  </h2>
                  {noCost > 0 && (
                    <span className="text-sm text-amber-700">
                      {noCost} without a cost — {noCost === 1 ? 'its' : 'their'} orders are left out of the profit
                    </span>
                  )}
                </div>
                <div className="px-5 pt-3">
                  <span className="relative block sm:max-w-sm">
                    <Search width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      type="search"
                      aria-label="Search products"
                      placeholder="Search model or name — e.g. 657"
                      className={cn(field, 'pl-9')}
                      value={listQuery}
                      onChange={(e) => setListQuery(e.target.value)}
                    />
                  </span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs font-medium text-ink-500">
                        <th className="py-2 pl-5 pr-3 font-medium">Product</th>
                        <th className="hidden px-3 py-2 font-medium md:table-cell">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Your cost</th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Sold</th>
                        <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Profit</th>
                        <th className="py-2 pl-3 pr-5 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {shownProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-sm text-ink-500">
                            No product matches “{listQuery.trim()}”.
                          </td>
                        </tr>
                      )}
                      {shownProducts.map((p) => (
                        <ProductRow
                          key={`${p.key}-${p.updatedAt}`}
                          product={p}
                          dollars={dollars.prices.get(p.key)}
                          rateNow={rateNow}
                          taken={taken}
                          stats={stats.get(p.key)}
                          mode={editing === p.key ? 'edit' : deleting === p.key ? 'delete' : 'view'}
                          busy={busy}
                          onEdit={() => {
                            setDeleting(null);
                            setEditing(p.key);
                          }}
                          onDelete={() => {
                            setEditing(null);
                            setDeleting(p.key);
                          }}
                          onCancel={() => {
                            setEditing(null);
                            setDeleting(null);
                          }}
                          onSave={(next, oldKey) => void saveProduct(next, oldKey)}
                          onConfirmDelete={() => void deleteProduct(p.key)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-ink-400">
                  Sold and profit count orders from the start day on. Changing a cost changes new orders only.
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
