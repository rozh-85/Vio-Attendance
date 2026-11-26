import { format } from 'date-fns';
import { latinDigits } from '@/services/repairs/logic';
import { DEFAULT_USD_RATE } from '@/services/orders/profit';
import source from './items2026.json';
import type { PosCategory, PosItem, PosItemChange, PosOffer, PosSettings } from './types';

/** The price list as it was imported (scripts/import-pos-2026.py). */
export const BASE_ITEMS: PosItem[] = source.items as PosItem[];
export const CATEGORIES: PosCategory[] = source.categories;
export const COLORS: Record<string, { ku: string; hex: string }> = source.colors;

/** Until someone sets the dollar on a till, it is the rate the rest of the app starts from. */
export const DEFAULT_SETTINGS: PosSettings = {
  offer: source.offer,
  rate: DEFAULT_USD_RATE,
  rateSet: false,
  rounding: 250,
  phone: '',
  address: '',
};

/** The showroom, printed on the invoice and the report when nothing else is set in the settings. */
export const SHOP: { phones: readonly string[]; address: string } = { phones: ['0770 953 5959', '0770 953 5858'], address: 'سلێمانی، ژاڵە' };

/** The guarantee on every item, in years. */
export const GUARANTEE_YEARS = 2;

export const categoryName = (id: string, ku = false): string => {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? (ku ? c.ku : c.name) : id;
};

export const colorName = (color: string, ku = false): string => (ku ? (COLORS[color]?.ku ?? color) : color);

/** A photo at one of its two sizes. Photos the owner added are one data URL. */
export function photo(image: string, size: 256 | 640 = 256): string {
  if (!image) return '';
  return image.startsWith('data:') || /\.\w{3,4}$/.test(image) ? image : `${image}-${size}.webp`;
}

/** The price list with the owner's changes over it. */
export function mergeItems(changes: PosItemChange[]): PosItem[] {
  const gone = new Set(changes.filter((c) => c.deleted).map((c) => c.id));
  return allItems(changes).filter((i) => !gone.has(i.id));
}

/** The items the owner deleted, as they were, to be brought back. */
export function deletedItems(changes: PosItemChange[]): PosItem[] {
  const gone = new Set(changes.filter((c) => c.deleted).map((c) => c.id));
  return gone.size ? allItems(changes).filter((i) => gone.has(i.id)) : [];
}

function allItems(changes: PosItemChange[]): PosItem[] {
  const byId = new Map(changes.map((c) => [c.id, c]));
  const items = BASE_ITEMS.map((item) => {
    const change = byId.get(item.id);
    if (!change) return item;
    const next: PosItem = { ...item, hidden: change.hidden ?? false };
    if (change.price !== undefined) next.price = change.price;
    if (change.offer === null) delete next.offer;
    else if (change.offer !== undefined) next.offer = change.offer;
    if (next.price !== item.price || next.offer !== item.offer) delete next.percent;
    return next;
  });
  const baseIds = new Set(BASE_ITEMS.map((i) => i.id));
  for (const change of changes) {
    if (!change.custom || baseIds.has(change.id)) continue;
    items.push({ ...change.custom, id: change.id, custom: true, hidden: change.hidden ?? change.custom.hidden ?? false });
  }
  return items;
}

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

/** Whether the offer prices count today. */
export function offerRuns(offer: PosOffer, today = new Date()): boolean {
  const day = dayKey(today);
  return !!offer.from && !!offer.to && day >= offer.from && day <= offer.to;
}

/** What one piece costs today. */
export function priceOf(item: PosItem, offer: PosOffer, today = new Date()): number {
  return item.offer !== undefined && offerRuns(offer, today) ? item.offer : item.price;
}

/** The percentage off today, as the price list prints it. */
export function percentOff(item: PosItem, price: number): number {
  if (item.price <= 0 || price >= item.price) return 0;
  return item.percent ?? Math.round((1 - price / item.price) * 100);
}

/** "v 400", "V-400" and "v400" are the same; Kurdish digits too. */
export const modelKey = (text: string): string => latinDigits(text).toUpperCase().replace(/[\s.\-_/\\,·]+/g, '');

/** Items matching what was typed: a model (however it is spelled), a name, a colour code. */
export function searchItems(items: PosItem[], query: string): PosItem[] {
  const text = query.trim().toLowerCase();
  if (!text) return items;
  const key = modelKey(text);
  const scored = items
    .map((item) => {
      const codes = [item.model, ...(item.variants?.map((v) => v.code) ?? [])].map(modelKey);
      let score = 0;
      if (key && codes.includes(key)) score = 4;
      else if (key && codes.some((c) => c.startsWith(key))) score = 3;
      else if (key && codes.some((c) => c.includes(key))) score = 2;
      else if (
        item.name.toLowerCase().includes(text) ||
        item.ku.includes(query.trim()) ||
        categoryName(item.category).toLowerCase().includes(text) ||
        categoryName(item.category, true).includes(query.trim())
      )
        score = 1;
      return { item, score };
    })
    .filter((s) => s.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
