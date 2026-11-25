import { memo, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Card } from '@/components/ui/Card';
import { Minus, Plus, Search, X } from '@/components/icons';
import { countKey, todayPrice } from '@/services/pos/cart';
import { CATEGORIES, COLORS, colorName, modelKey, offerRuns, percentOff, searchItems } from '@/services/pos/items';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { num, showDay, usd } from '@/services/pos/logic';
import type { PosItem, PosSettings, PosVariant } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { Photo, field, ltrText } from './ui';

const ALL = 'all';
const OFFER = 'offer';

const countsOf = (item: PosItem, counts: Map<string, number>): string =>
  (item.variants ?? [{ code: item.model, color: '' }]).map((v) => counts.get(countKey(item.id, v.code, v.color)) ?? 0).join(',');

/** Every item as a card: its photo, model, name, price in dinars and dollars — and its colours. */
export function ItemGrid({ items, settings, counts, onAdd, onTake, lang, t, searchRef, rate }: {
  items: PosItem[];
  settings: PosSettings;
  /** Pieces of each item and colour on the open invoice. */
  counts: Map<string, number>;
  onAdd: (item: PosItem, variant?: PosVariant) => void;
  onTake: (item: PosItem, variant?: PosVariant) => void;
  lang: PosLang;
  t: PosText;
  searchRef: RefObject<HTMLInputElement | null>;
  /** The dollar button, shown here on a phone. */
  rate: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const scroll = useRef<HTMLDivElement>(null);
  const ku = lang === 'ku';
  const { offer } = settings;
  const running = offerRuns(offer);

  const shown = useMemo(() => items.filter((i) => !i.hidden), [items]);
  const groups = useMemo(() => {
    const count = (id: string) => shown.filter((i) => i.category === id).length;
    const list = [{ id: ALL, label: t.allItems, count: shown.length }];
    if (running) list.push({ id: OFFER, label: offer.name, count: shown.filter((i) => i.offer !== undefined).length });
    for (const c of CATEGORIES) if (count(c.id)) list.push({ id: c.id, label: ku ? c.ku : c.name, count: count(c.id) });
    return list;
  }, [shown, t, ku, running, offer.name]);

  const list = useMemo(() => {
    // A search looks through every item, whatever category is open.
    if (query.trim()) return searchItems(shown, query);
    if (category === OFFER && running) return shown.filter((i) => i.offer !== undefined);
    if (category !== ALL && category !== OFFER) return shown.filter((i) => i.category === category);
    return shown;
  }, [shown, query, category, running]);
  const chosen = query.trim() ? '' : category;

  function choose(id: string) {
    setCategory(id);
    setQuery('');
    scroll.current?.scrollTo({ top: 0 });
  }

  /** Enter adds the item when the search names exactly one. */
  function addFound() {
    if (!query.trim() || !list.length) return;
    const key = modelKey(query);
    for (const item of list) {
      const variant = item.variants?.find((v) => modelKey(v.code) === key);
      if (variant || modelKey(item.model) === key) {
        onAdd(item, variant ?? item.variants?.[0]);
        setQuery('');
        return;
      }
    }
    if (list.length === 1) {
      onAdd(list[0], list[0].variants?.[0]);
      setQuery('');
    }
  }

  return (
    <>
      {/* Categories: a list beside the items on a wide screen, a row of chips above them on others. */}
      <Card className="hidden min-h-0 overflow-y-auto p-2 [scrollbar-width:thin] min-[90rem]:block">
        <nav aria-label={t.allItems} className="space-y-0.5">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={chosen === g.id}
              onClick={() => choose(g.id)}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-start text-sm transition',
                chosen === g.id
                  ? 'bg-brand-600 font-semibold text-white'
                  : g.id === OFFER
                    ? 'font-semibold text-brand-700 hover:bg-brand-50'
                    : 'font-medium text-ink-700 hover:bg-slate-100',
              )}
            >
              <span className="min-w-0 truncate">{g.label}</span>
              <span className={cn('text-xs tabular-nums', chosen === g.id ? 'text-white/80' : 'text-ink-400')}>{g.count}</span>
            </button>
          ))}
        </nav>
      </Card>

      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-2.5 px-3 pt-3 sm:gap-3 sm:px-4 sm:pt-4 lg:px-0 lg:pt-0">
          <label className="relative block min-w-0 flex-1 basis-64">
            <Search width={18} height={18} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              ref={searchRef}
              className={cn(field, 'h-12! rounded-2xl! pe-11 ps-11 shadow-sm sm:text-[15px]!')}
              value={query}
              placeholder={t.search}
              aria-label={t.search}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFound();
                if (e.key === 'Escape') setQuery('');
              }}
            />
            {query && (
              <button type="button" aria-label={t.clear} onClick={() => setQuery('')} className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-900">
                <X width={16} height={16} />
              </button>
            )}
          </label>
          {rate}
          <span className={cn('inline-flex min-h-9 items-center rounded-full px-3.5 py-1 text-[13px] font-semibold', running ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-ink-500')}>
            <span className="max-sm:hidden">{running ? t.offerUntil(offer.name, showDay(offer.to)) : t.regularPrices}</span>
            <span className="sm:hidden">{running ? t.offerShort(offer.name, showDay(offer.to).slice(0, 5)) : t.regularPrices}</span>
          </span>
        </div>

        <nav aria-label={t.allItems} className="flex shrink-0 gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] sm:px-4 lg:px-0 min-[90rem]:hidden [&::-webkit-scrollbar]:hidden">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={chosen === g.id}
              onClick={() => choose(g.id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition',
                chosen === g.id
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : g.id === OFFER
                    ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                    : 'border-slate-200 bg-card text-ink-700 hover:bg-slate-50',
              )}
            >
              {g.label}
              <span className={cn('text-xs tabular-nums', chosen === g.id ? 'text-white/80' : 'text-ink-400')}>{g.count}</span>
            </button>
          ))}
        </nav>

        <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-width:thin] sm:px-4 lg:-me-2 lg:px-0 lg:pe-2 min-[90rem]:pt-4">
          {list.length ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-3.5">
              {list.map((item, i) => (
                <ItemCard key={item.id} item={item} settings={settings} counts={countsOf(item, counts)} onAdd={onAdd} onTake={onTake} lang={lang} t={t} eager={i < 14} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-ink-500">{t.noItems}</p>
          )}
        </div>
      </section>
    </>
  );
}

const ItemCard = memo(function ItemCard({ item, settings, counts, onAdd, onTake, lang, t, eager }: {
  item: PosItem;
  settings: PosSettings;
  /** Pieces on the open invoice, one number for each colour: "0,2". */
  counts: string;
  onAdd: (item: PosItem, variant?: PosVariant) => void;
  onTake: (item: PosItem, variant?: PosVariant) => void;
  lang: PosLang;
  t: PosText;
  eager: boolean;
}) {
  const [index, setIndex] = useState(0);
  const ku = lang === 'ku';
  const variant = item.variants?.[index];
  const price = todayPrice(item, settings);
  const off = percentOff(item, price.usd);
  const name = ku ? item.ku || item.name : item.name;
  // A colour with its own code shows it; one code for all colours shows the model.
  const code = variant?.code ?? item.model;
  const each = counts.split(',').map(Number);
  const count = each[index] ?? 0;
  const chosen = each.some((n) => n > 0);
  // Models, specs and prices read left to right, and stand on the side the language starts from.
  const side = cn(ltrText, ku ? 'text-end' : 'text-start');

  return (
    <article
      className={cn(
        'group relative flex min-w-0 flex-col rounded-[20px] border bg-card p-1.5 transition duration-150 hover:shadow-md',
        chosen ? 'border-brand-300 shadow-sm ring-1 ring-inset ring-brand-300' : 'border-slate-200/80 shadow-sm hover:border-slate-300',
      )}
    >
      <button
        type="button"
        onClick={() => onAdd(item, variant)}
        aria-label={`${code} ${name} ${variant ? colorName(variant.color, ku) : ''} ${num(price.iqd)} IQD`}
        className="flex flex-1 flex-col rounded-2xl text-start outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Photo image={variant?.image ?? item.image} sizes="(max-width: 640px) 45vw, 220px" eager={eager} pad="p-4" className={cn('w-full rounded-[14px]', PHOTO, item.variants && 'pb-11')} />
        <span className="flex w-full flex-1 flex-col px-2 pt-3">
          <span className={cn('block text-[15px] font-bold leading-5 text-ink-900 [overflow-wrap:anywhere]', side)}>{code}</span>
          <span className="block truncate text-[13px] leading-5 text-ink-600">{name}{variant ? ` · ${colorName(variant.color, ku)}` : ''}</span>
          <span className={cn('block h-[18px] truncate text-xs leading-[18px] text-ink-400', side)}>{item.spec}</span>
          <span className={cn('mt-auto block whitespace-nowrap pt-2.5 text-[17px] font-bold leading-6 tabular-nums', side, off > 0 ? 'text-brand-700' : 'text-ink-900')}>
            {num(price.iqd)} <span className="text-[11px] font-semibold text-ink-400">IQD</span>
          </span>
          <span className={cn('block whitespace-nowrap text-xs font-medium leading-[18px] tabular-nums text-ink-500', side)}>
            {usd(price.usd)}
            {off > 0 && <s className="ms-1.5 font-normal text-ink-400">{usd(item.price)}</s>}
          </span>
        </span>
      </button>

      <div className="px-0.5 pb-0.5 pt-2.5">
        {count > 0 ? (
          <div role="group" aria-label={`${code} ${t.inInvoice(count)}`} className="flex h-9 items-center rounded-xl bg-brand-600 p-1 text-white [direction:ltr]">
            <StepButton label={`${t.less} ${code}`} icon={Minus} onClick={() => onTake(item, variant)} />
            <span className="min-w-0 flex-1 text-center text-sm font-bold tabular-nums">{count}</span>
            <StepButton label={`${t.more} ${code}`} icon={Plus} onClick={() => onAdd(item, variant)} />
          </div>
        ) : (
          <button
            type="button"
            aria-label={`${t.add} ${code}`}
            onClick={() => onAdd(item, variant)}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 text-[13px] font-semibold text-ink-700 outline-none transition hover:bg-brand-600 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Plus width={15} height={15} strokeWidth={2.4} /> {t.add}
          </button>
        )}
      </div>

      {off > 0 && (
        // Its own direction would also decide which side "start" is, so the text inside has it.
        <span className="pointer-events-none absolute start-3 top-3 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold leading-4 tabular-nums text-white">
          <span className={ltrText}>−{off}%</span>
        </span>
      )}
      {item.variants && (
        // Over the foot of the photo, so every card keeps the same height.
        <div className={cn('pointer-events-none absolute inset-x-1.5 top-1.5 flex items-end justify-center pb-2', PHOTO)}>
          <div className="pointer-events-auto flex rounded-full bg-white px-1 shadow-sm ring-1 ring-black/5">
            {item.variants.map((v, i) => (
              <button
                key={`${v.code}${v.color}`}
                type="button"
                title={colorName(v.color, ku)}
                aria-label={`${item.model} ${colorName(v.color, ku)}${each[i] ? ` ${t.inInvoice(each[i])}` : ''}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className="relative grid size-7 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className={cn('size-4 rounded-full border border-black/15', i === index && 'ring-2 ring-brand-600 ring-offset-2 ring-offset-[#fff]')} style={{ background: COLORS[v.color]?.hex }} />
                {each[i] > 0 && i !== index && <span className="absolute end-1 top-1 size-2 rounded-full bg-brand-600 ring-2 ring-white" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
});

/** The shape of a card's photo, and of what stands over it. */
const PHOTO = 'aspect-[1/0.88]';

function StepButton({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid h-7 w-9 shrink-0 place-items-center rounded-lg bg-white/15 outline-none transition hover:bg-white/30 active:bg-white/40 focus-visible:ring-2 focus-visible:ring-white">
      <Icon width={15} height={15} strokeWidth={2.6} />
    </button>
  );
}
