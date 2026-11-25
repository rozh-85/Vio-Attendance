import { useMemo, useState, type ReactNode } from 'react';
import { Plus, Search, Trash } from '@/components/icons';
import { todayPrice } from '@/services/pos/cart';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { colorName, searchItems } from '@/services/pos/items';
import { lineGross, lineTotal, num, usd } from '@/services/pos/logic';
import type { PosItem, PosSettings, PosVariant, SaleLine } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { IconButton, IqdInput, Photo, Stepper, field, lineImage, ltrText } from './ui';

export const lineName = (line: Pick<SaleLine, 'name' | 'ku' | 'color'>, lang: PosLang): string =>
  [lang === 'ku' ? line.ku || line.name : line.name, line.color && colorName(line.color, lang === 'ku')].filter(Boolean).join(' · ');

/** A small name over a box in a line. */
function Field({ label, group, children }: { label: string; group?: boolean; children: ReactNode }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="block min-w-0">
      <span className="mb-1 block truncate text-xs font-medium text-ink-500">{label}</span>
      {children}
    </Tag>
  );
}

/** One line of an invoice being made or changed: the item and its total, then pieces, price, discount — one even row. */
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
  return (
    <li className={cn('px-4 py-3.5', roomy && 'sm:px-6')}>
      <div className="flex items-center gap-3">
        <Photo image={lineImage(line, items)} className="size-12 rounded-xl" pad="p-1" eager />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('min-w-0 truncate font-semibold text-ink-900', ltrText)}>{line.code}</span>
            <span className={cn('shrink-0 text-base font-bold tabular-nums text-ink-900', ltrText)}>{num(lineTotal(line))}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-ink-500">
              {lineName(line, lang)} · <span className={ltrText}>{usd(line.usd)}</span>
            </span>
            {line.discount > 0 ? (
              <s className={cn('shrink-0 tabular-nums text-ink-400', ltrText)}>{num(gross)}</s>
            ) : raised > 0 ? (
              <span className={cn('shrink-0 font-semibold tabular-nums text-emerald-700', ltrText)}>+{num(raised)}</span>
            ) : null}
          </div>
          {line.price !== line.list && <div className="mt-0.5 truncate text-xs text-ink-400">{t.listPrice(num(line.list))}</div>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-2">
        <Field label={t.qty} group>
          <Stepper wide value={line.qty} min={1} max={999} t={t} disabled={disabled} onChange={(qty) => onChange({ qty })} />
        </Field>
        <Field label={t.price}>
          <IqdInput value={line.price} disabled={disabled} className="h-10! px-3!" onChange={(price) => onChange({ price })} />
        </Field>
        <Field label={t.discount}>
          <IqdInput value={line.discount} max={gross} emptyIsZero placeholder="0" disabled={disabled} className="h-10! px-3!" onChange={(discount) => onChange({ discount })} />
        </Field>
        <IconButton icon={Trash} label={`${t.remove} ${line.code}`} tone="red" disabled={disabled} onClick={onRemove} className="size-10! rounded-xl! border border-slate-200 hover:border-brand-200" />
      </div>
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
