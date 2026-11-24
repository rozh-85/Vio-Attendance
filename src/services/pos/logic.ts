import { addYears, format } from 'date-fns';
import { normalizePhone } from '@/services/repairs/logic';
import { GUARANTEE_YEARS } from './items';
import type { Sale, SaleDraft, SaleEvent, SaleLine, SaleReturn, SaleStatus } from './types';

const whole = (n: number): number => Math.round(n);
const MINUS = '−';

/** 135,250 — dinars, with no unit. */
export const num = (n: number): string => `${n < 0 ? MINUS : ''}${Math.abs(whole(n)).toLocaleString('en-US')}`;

/** 135,250 IQD */
export const iqd = (n: number): string => `${num(n)} IQD`;

/** $80 — cents only when there are any. */
export function usd(n: number): string {
  const value = Math.round((n + Number.EPSILON) * 100) / 100;
  const text = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? MINUS : ''}$${text}`;
}

/** Dollars in dinars, rounded to a payable amount. */
export const toDinars = (dollars: number, rate: number, rounding: number): number =>
  rounding > 0 ? Math.round((dollars * rate) / rounding) * rounding : whole(dollars * rate);

/** $100 = 169,000 IQD */
export const rateText = (rate: number): string => `$100 = ${num(rate * 100)} IQD`;

// ── One line, one invoice ────────────────────────────────────────────────────

export const lineGross = (line: Pick<SaleLine, 'qty' | 'price'>): number => whole(line.qty * line.price);
export const lineTotal = (line: Pick<SaleLine, 'qty' | 'price' | 'discount'>): number =>
  Math.max(0, lineGross(line) - line.discount);
export const subtotalOf = (lines: SaleLine[]): number => lines.reduce((sum, l) => sum + lineGross(l), 0);
export const discountOf = (lines: SaleLine[]): number => lines.reduce((sum, l) => sum + l.discount, 0);
export const totalOf = (lines: SaleLine[]): number => lines.reduce((sum, l) => sum + lineTotal(l), 0);
export const piecesOf = (lines: Pick<SaleLine, 'qty'>[]): number => lines.reduce((sum, l) => sum + l.qty, 0);

/** Pieces of one line already returned. */
export const returnedQty = (sale: Pick<Sale, 'returns'>, lineId: string): number =>
  sale.returns.reduce((sum, r) => sum + r.lines.reduce((n, l) => n + (l.id === lineId ? l.qty : 0), 0), 0);

/** What was paid for `qty` pieces of a line, their part of its discount taken off. */
export const paidFor = (line: SaleLine, qty: number): number => whole((lineTotal(line) * qty) / line.qty);

export function saleStatus(sale: Sale): SaleStatus {
  if (sale.deletedAt) return 'deleted';
  if (!sale.returns.length) return 'sold';
  return sale.lines.every((l) => returnedQty(sale, l.id) >= l.qty) ? 'returned' : 'part';
}

export const netTotal = (sale: Sale): number => sale.total - sale.refunded;

/** The invoice number, or the device's own reference until it has one. */
export const saleLabel = (sale: Pick<Sale, 'saleNo' | 'ref'>): string => (sale.saleNo ? String(sale.saleNo) : sale.ref);

/** Every item is under guarantee until this day. */
export const guaranteeEnd = (soldAt: string): Date => addYears(new Date(soldAt), GUARANTEE_YEARS);

/** T-4F9A2C, from the sale's own id. */
export const refOf = (id: string): string => `T-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

export const showDay = (iso: string | Date): string => format(new Date(iso), 'dd/MM/yyyy');
export const showTime = (iso: string | Date): string => format(new Date(iso), 'HH:mm');

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// ── The customer: every sale needs a name and a mobile ───────────────────────

/** A whole mobile number: 07XXXXXXXXX, or a foreign one of at least 7 digits. */
export function phoneOk(phone: string): boolean {
  const digits = normalizePhone(phone);
  return digits.startsWith('07') ? digits.length === 11 : digits.length >= 7 && digits.length <= 15;
}

export const customerOk = (c: { customerName: string; customerPhone: string }): boolean =>
  c.customerName.trim() !== '' && phoneOk(c.customerPhone);

/** The form as it is saved: trimmed, the phone in its one spelling. */
export function cleanDraft(draft: SaleDraft): SaleDraft {
  return {
    ...draft,
    seller: draft.seller.trim(),
    customerName: draft.customerName.trim(),
    customerPhone: draft.customerPhone.trim() ? normalizePhone(draft.customerPhone) : '',
    customerAddress: draft.customerAddress.trim(),
    note: draft.note.trim(),
    // A photo the owner added is found again by item, not copied into each sale.
    lines: draft.lines.map((l) => ({ ...l, image: l.image.startsWith('data:') ? '' : l.image })),
  };
}

// ── The same rules as supabase/pos.sql, for sales still on this device ───────

export class PosError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = 'PosError';
    this.code = code;
  }
}

function check(draft: SaleDraft): void {
  if (!draft.lines.length) throw new PosError('SALE_EMPTY');
  const bad = draft.lines.some(
    (l) =>
      !(l.qty >= 1 && l.qty <= 999) ||
      !(l.price >= 0 && l.price <= 1_000_000_000) ||
      !(l.discount >= 0 && l.discount <= lineGross(l)),
  );
  if (bad || !(draft.rate >= 1)) throw new PosError('SALE_INVALID');
  if (!customerOk(draft)) throw new PosError('CUSTOMER_REQUIRED');
}

const event = (action: SaleEvent['action'], by: string, note = ''): SaleEvent => ({
  at: new Date().toISOString(),
  action,
  by,
  note,
});

const sums = (lines: SaleLine[]) => ({
  subtotal: subtotalOf(lines),
  discount: discountOf(lines),
  total: totalOf(lines),
});

export function buildSale(input: SaleDraft, saleNo: number | null): Sale {
  const draft = cleanDraft(input);
  check(draft);
  const now = new Date().toISOString();
  return {
    ...draft,
    ...sums(draft.lines),
    saleNo,
    returns: [],
    refunded: 0,
    history: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deleteReason: '',
  };
}

export function applyEdit(sale: Sale, input: SaleDraft): Sale {
  if (sale.deletedAt) throw new PosError('SALE_NOT_FOUND');
  if (sale.returns.length) throw new PosError('SALE_HAS_RETURNS');
  const draft = cleanDraft(input);
  check(draft);
  const before: SaleEvent['before'] = {
    total: sale.total,
    discount: sale.discount,
    customerName: sale.customerName,
    lines: sale.lines.map((l) => ({ code: l.code, qty: l.qty, price: l.price, discount: l.discount })),
  };
  return {
    ...sale,
    ...draft,
    ...sums(draft.lines),
    id: sale.id,
    ref: sale.ref,
    soldAt: sale.soldAt,
    rate: sale.rate,
    device: sale.device,
    updatedAt: new Date().toISOString(),
    history: [...sale.history, { ...event('edit', draft.seller), before }],
  };
}

export function applyReturn(sale: Sale, ret: SaleReturn): Sale {
  if (sale.deletedAt) throw new PosError('SALE_NOT_FOUND');
  if (sale.returns.some((r) => r.id === ret.id)) return sale;
  const lines = ret.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new PosError('RETURN_EMPTY');
  for (const back of lines) {
    const line = sale.lines.find((l) => l.id === back.id);
    if (!line || returnedQty(sale, line.id) + back.qty > line.qty) throw new PosError('RETURN_INVALID');
  }
  const refunded = sale.refunded + ret.refund;
  if (ret.refund < 0 || refunded > sale.total) throw new PosError('RETURN_INVALID');
  return {
    ...sale,
    returns: [...sale.returns, { ...ret, lines }],
    refunded,
    updatedAt: new Date().toISOString(),
    history: [...sale.history, event('return', ret.by, ret.reason)],
  };
}

export function applyUndoReturn(sale: Sale, returnId: string, by: string): Sale {
  const ret = sale.returns.find((r) => r.id === returnId);
  if (!ret) return sale;
  return {
    ...sale,
    returns: sale.returns.filter((r) => r.id !== returnId),
    refunded: Math.max(0, sale.refunded - ret.refund),
    updatedAt: new Date().toISOString(),
    history: [...sale.history, event('undo_return', by)],
  };
}

export function applyDelete(sale: Sale, reason: string, by: string): Sale {
  if (sale.deletedAt) return sale;
  const now = new Date().toISOString();
  return {
    ...sale,
    deletedAt: now,
    deleteReason: reason.trim(),
    updatedAt: now,
    history: [...sale.history, event('delete', by, reason.trim())],
  };
}

export function applyRestore(sale: Sale): Sale {
  return {
    ...sale,
    deletedAt: null,
    deleteReason: '',
    updatedAt: new Date().toISOString(),
    history: [...sale.history, event('restore', 'owner')],
  };
}

/** Newest first; a sale waiting to be sent counts by its own time like the rest. */
export const newestFirst = (a: Sale, b: Sale): number =>
  b.soldAt.localeCompare(a.soldAt) || (b.saleNo ?? Infinity) - (a.saleNo ?? Infinity);

/** The same search as the server's, for sales on this device. */
export function matchesSale(sale: Sale, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    String(sale.saleNo ?? '') === q ||
    sale.ref.toLowerCase().includes(q) ||
    sale.customerName.toLowerCase().includes(q) ||
    sale.seller.toLowerCase().includes(q) ||
    (digits.length >= 4 && sale.customerPhone.includes(digits)) ||
    sale.lines.some((l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q))
  );
}
