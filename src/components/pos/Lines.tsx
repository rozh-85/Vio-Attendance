import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash } from '@/components/icons';
import { todayPrice } from '@/services/pos/cart';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { COLORS, colorName, searchItems } from '@/services/pos/items';
import { lineGross, lineTotal, num, usd } from '@/services/pos/logic';
import type { PosItem, PosSettings, PosVariant, SaleLine } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { IconButton, IqdInput, Photo, Stepper, field, lineImage, ltrText } from './ui';

export const lineName = (line: Pick<SaleLine, 'name' | 'ku' | 'color'>, lang: PosLang): string =>
  [lang === 'ku' ? line.ku || line.name : line.name, line.color && colorName(line.color, lang === 'ku')].filter(Boolean).join(' · ');

/**
 * One line of an invoice: the item and its total, then the pieces and the
 * remove button under its name. Price and discount wait behind one small
 * button, since most sales keep the list price; a changed one stays open.
 */
export function LineEditor({ line, items, onChange, onRemove, disabled, roomy, lang, t }: {
  line: SaleLine;
  items: PosItem[];
  onChange: (change: Partial<SaleLine>) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** In a panel with wider sides. */
  roomy?: boolean;
  lang: PosLang;
  t: PosText;
}) {
  const gross = lineGross(line);
  const raised = (line.price - line.list) * line.qty;
  const changed = line.discount > 0 || line.price !== line.list;
  const [editing, setEditing] = useState(changed);
  const ku = lang === 'ku';
  const variants = items.find((i) => i.id === line.itemId)?.variants ?? [];
  const missing = variants.length > 0 && !line.color;
  // The colour has its own row of circles, so the name goes without it.
  const title = variants.length ? (ku ? line.ku || line.name : line.name) : lineName(line, lang);
  return (
    <li id={`pos-line-${line.id}`} className={cn('px-4 py-3.5', roomy && 'sm:px-6')}>
      <div className="flex items-center gap-3">
        <Photo image={lineImage(line, items)} className="size-12 rounded-xl" pad="p-1" eager />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('min-w-0 truncate font-semibold text-ink-900', ltrText)}>{line.code}</span>
            <span className={cn('shrink-0 text-base font-bold tabular-nums text-ink-900', ltrText)}>{num(lineTotal(line))}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-500">
              {title} · <span className={ltrText}>{usd(line.usd)}</span>
            </span>
            {line.discount > 0 ? (
              <s className={cn('shrink-0 tabular-nums text-ink-400', ltrText)}>{num(gross)}</s>
            ) : raised > 0 ? (
              <span className={cn('shrink-0 font-semibold tabular-nums text-emerald-700', ltrText)}>+{num(raised)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {variants.length > 0 && (
        <div className={cn('mt-3 flex items-center gap-2 rounded-xl p-1', missing && 'bg-brand-50 ring-1 ring-brand-200')}>
          <div role="radiogroup" aria-label={t.color} className="flex flex-wrap gap-1">
            {variants.map((v) => {
              const on = v.code === line.code && v.color === line.color;
              return (
                <button
                  key={`${v.code}${v.color}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={colorName(v.color, ku)}
                  title={colorName(v.color, ku)}
                  disabled={disabled}
                  onClick={() => onChange({ code: v.code, color: v.color, image: v.image })}
                  className="grid size-9 place-items-center rounded-full transition hover:bg-slate-100 disabled:opacity-50"
                >
                  <span
                    className={cn('size-6 rounded-full border border-black/15', on && 'ring-2 ring-ink-800 ring-offset-2 ring-offset-card')}
                    style={{ background: COLORS[v.color]?.hex }}
                  />
                </button>
              );
            })}
          </div>
          <span className={cn('min-w-0 truncate text-[13px] font-semibold', missing ? 'text-brand-700' : 'text-ink-500')}>
            {missing ? t.chooseColor : colorName(line.color, ku)}
          </span>
        </div>
      )}

      {/* The keys run the full width under the item, so nothing hangs under the photo. */}
      <div className="mt-3 flex items-center gap-2">
        <Stepper wide value={line.qty} min={1} max={999} t={t} disabled={disabled} onChange={(qty) => onChange({ qty })} />
        <button
          type="button"
          title={t.editPrice}
          aria-label={t.editPrice}
          aria-expanded={editing}
          disabled={disabled}
          onClick={() => setEditing((e) => !e)}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl border transition disabled:opacity-50',
            editing || changed ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-ink-400 hover:bg-slate-100 hover:text-ink-900',
          )}
        >
          <Pencil width={17} height={17} />
        </button>
        <IconButton icon={Trash} label={`${t.remove} ${line.code}`} tone="red" disabled={disabled} onClick={onRemove} className="size-10! rounded-xl! border border-slate-200" />
      </div>

      {editing && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <IqdInput value={line.price} label={t.price} placeholder={t.price} disabled={disabled} className="h-10!" onChange={(price) => onChange({ price })} />
          {/* A discount reads as a minus, so neither box needs a name over it. */}
          <span className="relative block min-w-0" dir="ltr">
            {line.discount > 0 && <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 font-semibold text-brand-700">−</span>}
            <IqdInput
              value={line.discount}
              max={gross}
              emptyIsZero
              label={t.discount}
              placeholder={t.discount}
              disabled={disabled}
              className={cn('h-10! placeholder:font-medium', line.discount > 0 && 'ps-7! text-brand-700')}
              onChange={(discount) => onChange({ discount })}
            />
          </span>
          {line.price !== line.list && <p className="col-span-2 text-xs text-ink-400">{t.listPrice(num(line.list))}</p>}
        </div>
      )}
    </li>
  );
}

/** Finds an item by model or name and puts it on the invoice — inside the same panel. */
export function ItemAdder({ items, settings, onAdd, lang, t }: { items: PosItem[]; settings: PosSettings; onAdd: (item: PosItem, variant?: PosVariant) => void; lang: PosLang; t: PosText }) {
  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    if (!query.trim()) return [];
    return searchItems(items.filter((i) => !i.hidden), query)
      .flatMap((item): { item: PosItem; variant?: PosVariant }[] => (item.variants ? item.variants.map((variant) => ({ item, variant })) : [{ item }]))
      .slice(0, 8);
  }, [items, query]);

  return (
    <div className="px-4 py-4 sm:px-6">
      <label className="relative block">
        <Search width={17} height={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input className={cn(field, 'ps-10')} value={query} placeholder={t.addItem} aria-label={t.addItem} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {found.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {found.map(({ item, variant }) => (
            <li key={`${item.id}${variant?.code ?? ''}${variant?.color ?? ''}`}>
              <button
                type="button"
                onClick={() => {
                  onAdd(item, variant);
                  setQuery('');
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-slate-50"
              >
                <Photo image={variant?.image ?? item.image} className="size-10 rounded-lg" pad="p-1" />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm font-semibold text-ink-900', ltrText, lang === 'ku' ? 'text-end' : 'text-start')}>{variant?.code ?? item.model}</span>
                  <span className="block truncate text-[13px] text-ink-500">{lineName({ name: item.name, ku: item.ku, color: variant?.color ?? '' }, lang)}</span>
                </span>
                <span className={cn('text-sm font-semibold tabular-nums text-ink-900', ltrText)}>{num(todayPrice(item, settings).iqd)}</span>
                <Plus width={17} height={17} className="text-ink-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
