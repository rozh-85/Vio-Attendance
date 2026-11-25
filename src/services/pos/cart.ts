import { priceOf } from './items';
import { lineGross, newId, refOf, toDinars } from './logic';
import type { PosItem, PosSettings, PosVariant, SaleDraft, SaleLine } from './types';

/** One open invoice. It is kept on the device, so a refresh never loses it. */
export interface Cart {
  /** Also the sale's id, so saving twice never makes two sales. */
  id: string;
  /** "Customer 2": it stays the same while other invoices come and go. */
  no: number;
  lines: SaleLine[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  note: string;
}

/** Every open invoice: while one customer decides, the next one is served. */
export interface Desk {
  carts: Cart[];
  active: string;
}

/** Two places are always open; more are added when the shop is busy. */
export const MIN_OPEN = 2;
export const MAX_OPEN = 8;

const DESK_KEY = 'vio.pos.desk';
const DEVICE_KEY = 'vio.pos.device';

/** The lowest customer number not on the counter. */
const freeNo = (carts: Pick<Cart, 'no'>[]): number => {
  for (let n = 1; ; n++) if (!carts.some((c) => c.no === n)) return n;
};

const emptyCart = (others: Pick<Cart, 'no'>[]): Cart => ({
  id: newId(),
  no: freeNo(others),
  lines: [],
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  note: '',
});

export const isEmpty = (cart: Cart): boolean =>
  !cart.lines.length && !cart.customerName && !cart.customerPhone && !cart.customerAddress && !cart.note;

const fill = (carts: Cart[]): Cart[] => {
  const next = [...carts];
  while (next.length < MIN_OPEN) next.push(emptyCart(next));
  return next;
};

export function emptyDesk(): Desk {
  const carts = fill([]);
  return { carts, active: carts[0].id };
}

export const activeCart = (desk: Desk): Cart => desk.carts.find((c) => c.id === desk.active) ?? desk.carts[0];

export const changeCart = (desk: Desk, id: string, fn: (cart: Cart) => Cart): Desk => ({
  ...desk,
  carts: desk.carts.map((c) => (c.id === id ? fn(c) : c)),
});

/** One more customer. */
export function openCart(desk: Desk): Desk {
  if (desk.carts.length >= MAX_OPEN) return desk;
  const cart = emptyCart(desk.carts);
  return { carts: [...desk.carts, cart], active: cart.id };
}

/** Takes an invoice off the counter; two places stay open. */
export function closeCart(desk: Desk, id: string): Desk {
  const at = desk.carts.findIndex((c) => c.id === id);
  if (at < 0) return desk;
  const rest = desk.carts.filter((c) => c.id !== id);
  // Its place is kept, empty, so the others do not move under the finger.
  const carts = rest.length < MIN_OPEN ? [...rest.slice(0, at), emptyCart(rest), ...rest.slice(at)] : rest;
  const active = desk.active === id ? (carts[Math.min(at, carts.length - 1)] ?? carts[0]).id : desk.active;
  return { carts, active };
}

/** Where to go while an invoice is being saved: the next one waiting, else an empty place. */
export function nextCart(desk: Desk, saving: ReadonlySet<string>): Desk {
  const free = desk.carts.filter((c) => c.id !== desk.active && !saving.has(c.id));
  const next = free.find((c) => !isEmpty(c)) ?? free[0];
  return next ? { ...desk, active: next.id } : openCart(desk);
}

const pick = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const put = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: it lasts until the page is closed.
  }
};

export function loadDesk(): Desk {
  try {
    const saved = JSON.parse(pick(DESK_KEY) || 'null') as Desk | null;
    const good = (saved?.carts ?? []).filter(
      (c) => c?.id && Array.isArray(c.lines) && c.lines.every((l) => typeof l.list === 'number'),
    );
    if (!good.length) return emptyDesk();
    const carts = fill(good.map((c, i) => ({ ...emptyCart([]), ...c, no: c.no || i + 1 })));
    return { carts, active: carts.some((c) => c.id === saved?.active) ? (saved as Desk).active : carts[0].id };
  } catch {
    return emptyDesk();
  }
}

export const keepDesk = (desk: Desk): void => put(DESK_KEY, JSON.stringify(desk));

/** A short name for this till, made once. */
export function deviceName(): string {
  let name = pick(DEVICE_KEY);
  if (!name) {
    name = `till-${newId().slice(0, 6)}`;
    put(DEVICE_KEY, name);
  }
  return name;
}

/** What an item costs today, in dollars and in dinars. */
export function todayPrice(item: PosItem, settings: PosSettings): { usd: number; iqd: number; regular: number } {
  const usd = priceOf(item, settings.offer);
  const dinars = (n: number) => toDinars(n, settings.rate, settings.rounding);
  return { usd, iqd: dinars(usd), regular: dinars(Math.max(item.price, usd)) };
}

/** One more piece; the same code and colour share a line. */
export function addItem(lines: SaleLine[], item: PosItem, variant: PosVariant | undefined, settings: PosSettings): SaleLine[] {
  const code = variant?.code ?? item.model;
  const color = variant?.color ?? '';
  const same = lines.find((l) => l.itemId === item.id && l.code === code && l.color === color);
  if (same) return changeLine(lines, same.id, { qty: Math.min(999, same.qty + 1) });
  const { usd, iqd, regular } = todayPrice(item, settings);
  return [
    ...lines,
    {
      id: newId(),
      itemId: item.id,
      code,
      name: item.name,
      ku: item.ku,
      category: item.category,
      color,
      image: variant?.image ?? item.image,
      qty: 1,
      price: iqd,
      discount: 0,
      list: iqd,
      regular,
      usd,
    },
  ];
}

/** A line changed; its discount never becomes more than the line itself. */
export const changeLine = (lines: SaleLine[], id: string, change: Partial<SaleLine>): SaleLine[] =>
  lines.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...change };
    return { ...next, discount: Math.min(next.discount, lineGross(next)) };
  });

/** One piece less; the last one takes the line away. */
export function takeItem(lines: SaleLine[], item: PosItem, variant: PosVariant | undefined): SaleLine[] {
  const key = countKey(item.id, variant?.code ?? item.model, variant?.color ?? '');
  const line = lines.find((l) => countKey(l.itemId, l.code, l.color) === key);
  if (!line) return lines;
  return line.qty > 1 ? changeLine(lines, line.id, { qty: line.qty - 1 }) : removeLine(lines, line.id);
}

/** One colour of an item on an invoice. */
export const countKey = (itemId: string, code: string, color: string): string => `${itemId}|${code}|${color}`;

export const removeLine = (lines: SaleLine[], id: string): SaleLine[] => lines.filter((l) => l.id !== id);

/**
 * A new dollar rate (or price list) on open invoices: a price the seller typed
 * stays as typed, the others follow.
 */
export function repriceDesk(desk: Desk, items: PosItem[], settings: PosSettings): Desk {
  let moved = false;
  const carts = desk.carts.map((cart) => {
    const lines = cart.lines.map((line) => {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) return line;
      const { usd, iqd, regular } = todayPrice(item, settings);
      if (line.list === iqd && line.usd === usd && line.regular === regular) return line;
      moved = true;
      const price = line.price === line.list ? iqd : line.price;
      const next = { ...line, usd, list: iqd, regular, price };
      return { ...next, discount: Math.min(next.discount, lineGross(next)) };
    });
    return { ...cart, lines };
  });
  return moved ? { ...desk, carts } : desk;
}

export function draftFrom(cart: Cart, rate: number): SaleDraft {
  return {
    id: cart.id,
    ref: refOf(cart.id),
    soldAt: new Date().toISOString(),
    // Waits for staff accounts.
    seller: '',
    customerName: cart.customerName,
    customerPhone: cart.customerPhone,
    customerAddress: cart.customerAddress,
    note: cart.note,
    lines: cart.lines,
    rate,
    device: deviceName(),
  };
}
