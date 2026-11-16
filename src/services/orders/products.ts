import reference from '@/services/catalog/reference.json';
import catalog2026Data from '@/services/catalog/catalog2026.json';
import wholesale2026Data from '@/services/catalog/wholesale2026.json';
import { DEFAULT_USD_RATE, modelKey, type ModelCost } from './profit';

/**
 * The Vio catalogue's products by model, for a photo and a name next to a
 * model on the products list and on the seller's model search. The photos ship
 * with the app (public/catalog-assets), so sellers see them without reading
 * the owner's catalog.
 */
export interface CatalogItem {
  key: string;
  /** The model as the catalogue writes it, e.g. V-400. */
  model: string;
  /** e.g. Air Fryer. */
  name: string;
  image: string;
  /** The catalogue's group, e.g. Air Fryer. */
  group: string;
  /** The item type in the words the order form uses, when it is clear. */
  typeKu: string;
}

/** Catalogue groups whose order-form type is plain; the rest keep the English name. */
const TYPE_KU: Record<string, string> = {
  'ref-air-fryer': 'ئایەرفرای',
  'ref-chopper': 'چوپەر',
  'ref-coffee-maker': 'جیهازی قاوە',
  'ref-heater': 'هیتەر',
  'ref-iron': 'ئوتوو',
  'ref-oven': 'فرن',
  'ref-stand-mixer': 'عەجانە',
  'ref-tea-maker': 'سەماوەر',
};

const data = reference as unknown as {
  categories: { id: string; name: string }[];
  products: { sku: string; name: string; categoryId: string; mainImage: string; status?: string }[];
};

let byKey: Map<string, CatalogItem> | null = null;

function index(): Map<string, CatalogItem> {
  if (byKey) return byKey;
  const groups = new Map(data.categories.map((c) => [c.id, c.name]));
  byKey = new Map();
  for (const p of data.products) {
    const key = modelKey(p.sku);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, {
      key,
      model: p.sku,
      name: p.name,
      image: p.mainImage?.startsWith('/') ? p.mainImage : '',
      group: groups.get(p.categoryId) ?? '',
      typeKu: TYPE_KU[p.categoryId] ?? '',
    });
  }
  return byKey;
}

export function catalogItems(): CatalogItem[] {
  return [...index().values()];
}

export function catalogItem(keyOrModel: string): CatalogItem | undefined {
  return index().get(modelKey(keyOrModel));
}

/** One product of "Vio Catalog 2026 – Showroom Prices": model, name and type, no price. */
export interface Catalog2026Item {
  key: string;
  model: string;
  name: string;
  type: string;
}

/** Every model of the 2026 showroom catalogue (scripts/import-catalog-2026.py), in its page order. */
export function catalog2026(): Catalog2026Item[] {
  return (catalog2026Data as { products: { model: string; name: string; type: string }[] }).products.map((p) => ({
    key: modelKey(p.model),
    model: p.model,
    name: p.name,
    type: p.type,
  }));
}

/** One product of "Vio Wholesale (Jumla) Price List 2026", with its price in dollars. */
export interface Wholesale2026Item extends Catalog2026Item {
  /** The wholesale price of one piece, in US dollars. */
  usd: number;
}

/**
 * Every model of the 2026 wholesale price list (scripts/import-wholesale-2026.py),
 * named and typed as in the 2026 catalogue, in its page order.
 */
export function wholesale2026(): Wholesale2026Item[] {
  const named = new Map(catalog2026().map((c) => [c.key, c]));
  return (wholesale2026Data as { products: { model: string; name: string; usd: number }[] }).products.map((p) => {
    const key = modelKey(p.model);
    const known = named.get(key);
    return {
      key,
      model: known?.model ?? p.model,
      name: known?.name ?? p.name,
      type: known?.type ?? '',
      usd: p.usd,
    };
  });
}

/** A product's price in dollars and the IQD for one dollar its cost is at. */
export interface DollarPrice {
  usd: number;
  rate: number;
}

/** The value seen most often, or undefined for none. */
function mostCommon(values: number[]): number | undefined {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best: number | undefined;
  let most = 0;
  for (const [v, n] of count)
    if (n > most) {
      best = v;
      most = n;
    }
  return best;
}

/**
 * Every product priced in dollars, and the dollar rate most of them are at.
 * A product's dollar price is the one saved with it; a product of the
 * wholesale list saved before dollar prices were kept counts too while its
 * cost is still its list price × the one rate the list's products share
 * (169,000 per 100 $ when they were filled in) — a cost written by hand
 * almost never lands exactly on that.
 */
export function dollarPrices(models: Record<string, ModelCost>): { prices: Map<string, DollarPrice>; rate: number } {
  const list = new Map(wholesale2026().map((w) => [w.key, w.usd]));
  const listRate = mostCommon(
    Object.values(models).flatMap((m) => {
      const usd = list.get(m.key);
      if (m.usd !== null || !usd || !m.cost) return [];
      const rate = m.cost / usd;
      return Number.isInteger(rate) ? [rate] : [];
    }),
  );
  const prices = new Map<string, DollarPrice>();
  for (const m of Object.values(models)) {
    if (m.usd !== null && m.rate) prices.set(m.key, { usd: m.usd, rate: m.rate });
    else {
      const usd = list.get(m.key);
      if (usd && listRate && m.cost === Math.round(usd * listRate)) prices.set(m.key, { usd, rate: listRate });
    }
  }
  return { prices, rate: mostCommon([...prices.values()].map((p) => p.rate)) ?? DEFAULT_USD_RATE };
}
