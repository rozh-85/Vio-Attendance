import { useMemo } from 'react';
import { CATEGORIES } from '@/services/orders/options';
import { modelKey, westernDigits } from '@/services/orders/profit';
import { catalogItem } from '@/services/orders/products';
import type { PriceListItem } from '@/services/orders/profitStore';
import { Check, Plus } from '@/components/icons';
import { cn } from '@/utils/cn';
import { FieldError, Label, inputClass } from './SellerFormParts';

/** The item fields of the order form this picker fills in. */
export interface ItemFields {
  itemModel: string;
  itemCategory: string;
  /** The total price as typed text, e.g. "170,000". */
  price: string;
  quantity: number;
  /** Kept for drafts saved by older versions of the form. */
  itemMode?: 'list' | 'manual';
  priceEdited?: boolean;
}

const SUGGESTED = 6;

const money = (n: number) => Math.round(n).toLocaleString('en-US');
const priceNumber = (price: string) => Number(westernDigits(price).replace(/\D/g, '')) || 0;

/** The product's picture on white — the owner's, else the catalogue's — or the model's letters. */
function Photo({ itemKey, model, image }: { itemKey: string; model: string; image: string }) {
  const src = image || catalogItem(itemKey)?.image || '';
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-contain p-0.5" />
      ) : (
        <span className="font-mono text-[10px] font-bold text-slate-300">{model.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}</span>
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
 * The item part of a seller's order. The seller writes the model and their
 * own total price. The owner's products are suggested as they write, so the
 * model is spelt the way the owner's list has it and the order gets its cost.
 */
export function ItemPicker({
  products,
  fields,
  errors,
  onChange,
}: {
  /** The owner's products; null while they load. */
  products: PriceListItem[] | null;
  fields: ItemFields;
  errors: { item?: string; price?: string };
  onChange: (patch: Partial<ItemFields>) => void;
}) {
  const quantity = fields.quantity || 1;
  const price = priceNumber(fields.price);
  const typed = modelKey(fields.itemModel);
  const match = typed ? products?.find((p) => p.key === typed) : undefined;

  const suggestions = useMemo(() => {
    if (!products?.length || match) return [];
    const q = typed;
    const rank = (p: PriceListItem) => (!q ? 0 : p.key.startsWith(q) || p.key.replace(/^[A-Z]+/, '').startsWith(q) ? 0 : 1);
    return products
      .filter((p) => !q || p.key.includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.model.localeCompare(b.model, undefined, { numeric: true }))
      .slice(0, SUGGESTED);
  }, [products, typed, match]);

  const typeOf = (p: PriceListItem) => p.category || catalogItem(p.key)?.typeKu || '';

  function writeModel(value: string) {
    const found = products?.find((p) => p.key === modelKey(value));
    onChange({
      itemModel: value,
      // A model on the list brings its type, unless the seller wrote one.
      ...(found && !fields.itemCategory.trim() ? { itemCategory: typeOf(found) } : {}),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label en="Item model" ku="مۆدێلی ئایتم" required />
        <input
          className={cn(inputClass, 'h-14 font-mono text-lg', errors.item ? 'border-rose-400' : 'border-slate-200')}
          placeholder="e.g. V-400"
          autoCapitalize="characters"
          autoComplete="off"
          value={fields.itemModel}
          onChange={(e) => writeModel(e.target.value)}
        />
        {match ? (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
              <Check width={12} height={12} strokeWidth={3} />
            </span>
            <span className="min-w-0 truncate">
              <b className="font-mono">{match.model}</b>
              {(match.name || catalogItem(match.key)?.name) && ` · ${match.name || catalogItem(match.key)?.name}`}
            </span>
          </div>
        ) : (
          suggestions.length > 0 && (
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {suggestions.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange({ itemModel: p.model, itemCategory: fields.itemCategory.trim() || typeOf(p) })}
                  className="flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-card py-1.5 pl-1.5 pr-3 transition active:scale-[0.98]"
                >
                  <Photo itemKey={p.key} model={p.model} image={p.image} />
                  <span className="text-left leading-tight">
                    <span className="block font-mono text-sm font-bold text-ink-900">{p.model}</span>
                    <span dir="auto" className="block max-w-32 truncate text-xs text-ink-500">
                      {p.name || typeOf(p) || ' '}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      <label className="block">
        <Label en="Item type" ku="کەتەگۆری ئایتم" />
        <input
          className={cn(inputClass, errors.item ? 'border-rose-400' : 'border-slate-200')}
          dir="auto"
          list="order-categories"
          placeholder="سەماوەر، هیتەر…"
          value={fields.itemCategory}
          onChange={(e) => onChange({ itemCategory: e.target.value })}
        />
        <datalist id="order-categories">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
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
              onChange({ price: n ? money(n) : '' });
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
