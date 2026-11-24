import { memo, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { todayPrice } from '@/services/pos/cart';
import { CATEGORIES, COLORS, colorName, modelKey, offerRuns, percentOff, searchItems } from '@/services/pos/items';
import type { PosLang, PosText } from '@/services/pos/i18n';
import { num, showDay, usd } from '@/services/pos/logic';
import type { PosItem, PosSettings, PosVariant } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { Photo } from './parts';

const ALL = 'all';
const OFFER = 'offer';

/** Every item as a card: its photo, model, name, price in dinars and dollars — and its colours. */
export function ItemGrid({ items, settings, counts, onAdd, lang, t, searchRef, rate }: {
  items: PosItem[];
  settings: PosSettings;
  /** Pieces of each item on the open invoice. */
  counts: Map<string, number>;
  onAdd: (item: PosItem, variant?: PosVariant) => void;
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
    const list = [{ id: ALL, label: t.allItems, count: shown.length, offer: false }];
    if (running) list.push({ id: OFFER, label: offer.name, count: shown.filter((i) => i.offer !== undefined).length, offer: true });
    for (const c of CATEGORIES) if (count(c.id)) list.push({ id: c.id, label: ku ? c.ku : c.name, count: count(c.id), offer: false });
    return list;
  }, [shown, t, ku, running, offer.name]);

  const list = useMemo(() => {
    // A search looks through every item, whatever category is open.
    if (query.trim()) return searchItems(shown, query);
    if (category === OFFER && running) return shown.filter((i) => i.offer !== undefined);
    if (category !== ALL && category !== OFFER) return shown.filter((i) => i.category === category);
    return shown;
  }, [shown, query, category, running]);

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
      <nav className="pos-rail" aria-label={t.allItems}>
        {groups.map((g) => (
          <button key={g.id} type="button" className={cn(g.offer && 'offer')} aria-pressed={!query.trim() && category === g.id} onClick={() => choose(g.id)}>
            <span>{g.label}</span>
            <span className="num">{g.count}</span>
          </button>
        ))}
      </nav>
      <section className="pos-items">
        <div className="pos-find">
          <input
            ref={searchRef}
            className="pos-input"
            type="search"
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
          <p className={cn(running && 'offer')}>{running ? t.offerUntil(offer.name, showDay(offer.to)) : t.regularPrices}</p>
          {rate}
        </div>
        <nav className="pos-cats" aria-label={t.allItems}>
          {groups.map((g) => (
            <button key={g.id} type="button" className={cn(g.offer && 'offer')} aria-pressed={!query.trim() && category === g.id} onClick={() => choose(g.id)}>
              {g.label} <span className="num">{g.count}</span>
            </button>
          ))}
        </nav>
        <div className="pos-scroll" ref={scroll}>
          {list.length ? (
            <div className="pos-grid">
              {list.map((item, i) => (
                <Cell key={item.id} item={item} settings={settings} count={counts.get(item.id) ?? 0} onAdd={onAdd} lang={lang} t={t} eager={i < 14} />
              ))}
            </div>
          ) : (
            <p className="pos-none">{t.noItems}</p>
          )}
        </div>
      </section>
    </>
  );
}

const Cell = memo(function Cell({ item, settings, count, onAdd, lang, t, eager }: {
  item: PosItem;
  settings: PosSettings;
  count: number;
  onAdd: (item: PosItem, variant?: PosVariant) => void;
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

  return (
    <article className={cn('pos-cell', count > 0 && 'on', item.variants && 'has-colors')}>
      <button type="button" className="pos-cell-add" onClick={() => onAdd(item, variant)} aria-label={`${code} ${name} ${variant ? colorName(variant.color, ku) : ''} ${num(price.iqd)} IQD`}>
        <span className="pos-cell-photo">
          <Photo image={variant?.image ?? item.image} sizes="(max-width: 480px) 45vw, 210px" eager={eager} />
        </span>
        <span className="pos-cell-text">
          <b>{code}</b>
          <small>{name}{variant ? ` · ${colorName(variant.color, ku)}` : ''}</small>
          {item.spec && <small>{item.spec}</small>}
          <span className={cn('pos-cell-price', off > 0 && 'offer')}>
            <span className="num">
              <b>{num(price.iqd)}</b> <em>IQD</em>
            </span>
            <span className="pos-cell-usd num">
              {usd(price.usd)}
              {off > 0 && <s>{usd(item.price)}</s>}
              {off > 0 && <i>−{off}%</i>}
            </span>
          </span>
        </span>
      </button>
      {item.variants && (
        <div className="pos-colors">
          {item.variants.map((v, i) => (
            <button key={`${v.code}${v.color}`} type="button" className="pos-color" title={colorName(v.color, ku)} aria-label={`${item.model} ${colorName(v.color, ku)}`} aria-pressed={i === index} onClick={() => setIndex(i)}>
              <span style={{ background: COLORS[v.color]?.hex }} />
            </button>
          ))}
        </div>
      )}
      {count > 0 && (
        <span className="pos-cell-qty num" aria-label={t.inInvoice(count)}>
          {count}
        </span>
      )}
    </article>
  );
});
