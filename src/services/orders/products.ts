import reference from '@/services/catalog/reference.json';
import { modelKey } from './profit';

/**
 * The Vio catalogue's products by model, for a photo and a name next to a
 * model on the price list and on the seller's model search. The photos ship
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

/** A product a seller can pick: the owner's list laid over the catalogue. */
export interface Product {
  key: string;
  model: string;
  name: string;
  image: string;
  category: string;
  /** null until the owner writes it: the seller then writes the price. */
  price: number | null;
}

/**
 * Every product a seller can pick: each model on the owner's list that is
 * switched on, then every catalogue product the owner has not listed. A
 * product with a price comes first.
 */
export function sellerProducts(list: { key: string; model: string; category: string; price: number | null; name: string; image: string; active: boolean }[]): Product[] {
  const listed = new Map(list.map((p) => [p.key, p]));
  const out: Product[] = [];
  for (const p of list) {
    if (!p.active || !p.key) continue;
    const cat = index().get(p.key);
    out.push({
      key: p.key,
      model: p.model || cat?.model || p.key,
      name: p.name || cat?.name || '',
      image: p.image || cat?.image || '',
      category: p.category || cat?.typeKu || cat?.group || '',
      price: p.price !== null && p.price > 0 ? p.price : null,
    });
  }
  for (const cat of index().values()) {
    if (listed.has(cat.key)) continue;
    out.push({ key: cat.key, model: cat.model, name: cat.name, image: cat.image, category: cat.typeKu || cat.group, price: null });
  }
  return out.sort(
    (a, b) => Number(b.price !== null) - Number(a.price !== null) || a.model.localeCompare(b.model, undefined, { numeric: true }),
  );
}
