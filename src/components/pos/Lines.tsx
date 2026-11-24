import { useMemo, useState } from 'react';
import { Plus, Search, Trash } from '@/components/icons';
import { todayPrice } from '@/services/pos/cart';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { colorName, searchItems } from '@/services/pos/items';
import { lineGross, lineTotal, num, usd } from '@/services/pos/logic';
import type { PosItem, PosSettings, PosVariant, SaleLine } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { IconButton, IqdInput, Labelled, Photo, Stepper, field, lineImage, ltrText } from './ui';

export const lineName = (line: Pick<SaleLine, 'name' | 'ku' | 'color'>, lang: PosLang): string =>
  [lang === 'ku' ? line.ku || line.name : line.name, line.color && colorName(line.color, lang === 'ku')].filter(Boolean).join(' · ');

/** One line of an invoice being made or changed: pieces, price, discount. */
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
    <li className={cn('@container px-4 py-4', roomy && 'sm:px-6')}>
      <div className="flex items-start gap-3">
        <Photo image={lineImage(line, items)} className="size-14 rounded-xl" eager />
        <div className="min-w-0 flex-1">
          <div className={cn('truncate font-semibold text-ink-900', ltrText, lang === 'ku' ? 'text-end' : 'text-start')}>{line.code}</div>
          <div className="truncate text-sm text-ink-500">{lineName(line, lang)}</div>
          <div className="mt-0.5 text-[13px] text-ink-400">
            <span className={ltrText}>{usd(line.usd)}</span>
            {line.price !== line.list && <> · {t.listPrice(num(line.list))}</>}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-[17px] font-bold tabular-nums text-ink-900">
            <span className={ltrText}>{num(lineTotal(line))}</span>
          </div>
          {line.discount > 0 && (
            <div className="text-[13px] tabular-nums text-ink-400">
              <s className={ltrText}>{num(gross)}</s>
            </div>
          )}
          {line.discount === 0 && raised > 0 && (
            <div className="text-[13px] font-semibold tabular-nums text-emerald-700">
              <span className={ltrText}>+{num(raised)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end gap-x-2.5 gap-y-3 @[25rem]:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Labelled label={t.qty} group>
          <Stepper value={line.qty} min={1} max={999} t={t} disabled={disabled} onChange={(qty) => onChange({ qty })} />
        </Labelled>
        <IconButton icon={Trash} label={`${t.remove} ${line.code}`} tone="red" disabled={disabled} onClick={onRemove} className="size-10! justify-self-end @[25rem]:order-4" />
        <Labelled label={t.price}>
          <IqdInput value={line.price} disabled={disabled} className="h-10!" onChange={(price) => onChange({ price })} />
        </Labelled>
        <Labelled label={t.discount}>
          <IqdInput value={line.discount} max={gross} emptyIsZero placeholder="0" disabled={disabled} className="h-10!" onChange={(discount) => onChange({ discount })} />
        </Labelled>
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
