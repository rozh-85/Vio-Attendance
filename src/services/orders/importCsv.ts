import type { CustomerGender, ImportedOrder, OrderPurchase, OrderShift } from './types';

/**
 * Reads the old Google Form sheet ("Form Responses 1", downloaded as CSV)
 * into orders. Columns are found by their Kurdish headings, falling back to
 * the form's column order when a heading was renamed.
 */

/** RFC 4180: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

type Column =
  | 'timestamp'
  | 'name'
  | 'phone'
  | 'second'
  | 'city'
  | 'address'
  | 'model'
  | 'category'
  | 'price'
  | 'gender'
  | 'platform'
  | 'purchase'
  | 'shift'
  | 'note'
  | 'seller';

/** Heading words on the old form, and each column's place on it. */
const COLUMNS: Record<Column, { words: string[]; index: number }> = {
  timestamp: { words: ['timestamp'], index: 0 },
  name: { words: ['ناوی کڕیار'], index: 1 },
  phone: { words: ['ژمارەی کڕیار'], index: 2 },
  second: { words: ['ژمارەی دووەم'], index: 3 },
  city: { words: ['شار'], index: 4 },
  address: { words: ['ناونیشان'], index: 5 },
  model: { words: ['جۆری ئایتم'], index: 6 },
  category: { words: ['کەتەگۆری'], index: 7 },
  price: { words: ['نرخ'], index: 8 },
  gender: { words: ['ڕەگەز'], index: 9 },
  platform: { words: ['پلاتفۆرم'], index: 10 },
  purchase: { words: ['جاری چەندەمە'], index: 11 },
  shift: { words: ['چیات'], index: 12 },
  note: { words: ['تێبینی'], index: 13 },
  seller: { words: ['فرۆشیار'], index: 14 },
};

function columnIndexes(header: string[]): Record<Column, number> {
  const clean = header.map((h) => h.trim().toLowerCase());
  const result = {} as Record<Column, number>;
  for (const [column, { words, index }] of Object.entries(COLUMNS) as [
    Column,
    { words: string[]; index: number },
  ][]) {
    const found = clean.findIndex((h) => words.some((w) => h.includes(w.toLowerCase())));
    result[column] = found >= 0 ? found : index;
  }
  return result;
}

/**
 * Google Sheets writes "5/17/2025 10:29:28" (US) or "17/05/2025 10:29:28".
 * Which one the whole file uses is decided once: any first part over 12 means
 * day first.
 */
function timestampParser(values: string[]): (value: string) => Date | null {
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  const dayFirst = values.some((v) => {
    const m = slash.exec(v.trim());
    return !!m && Number(m[1]) > 12;
  });
  return (value) => {
    const text = value.trim();
    const m = slash.exec(text);
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])];
      const [dayOfMonth, month] = dayFirst ? [a, b] : [b, a];
      const date = new Date(
        Number(m[3]),
        month - 1,
        dayOfMonth,
        Number(m[4] ?? 0),
        Number(m[5] ?? 0),
        Number(m[6] ?? 0),
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const iso = new Date(text.replace(' ', 'T'));
    return Number.isNaN(iso.getTime()) ? null : iso;
  };
}

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function westernDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String(EASTERN_DIGITS.indexOf(d)));
}

/**
 * "95000" → 95,000. "120,000(no options)" → 120,000 and the words go to the
 * note. Under 1,000 was typed in thousands ("180" for 180,000).
 */
function parsePrice(raw: string): { price: number; extra: string; scaled: boolean } {
  const text = westernDigits(raw).trim();
  const m = /^[\s\d,.]+/.exec(text);
  const number = m ? Number(m[0].replace(/[,\s]/g, '')) : NaN;
  const extra = m ? text.slice(m[0].length).trim() : text;
  if (!Number.isFinite(number) || number <= 0) return { price: 0, extra: text, scaled: false };
  if (number < 1000) return { price: Math.round(number * 1000), extra, scaled: true };
  return { price: Math.round(number), extra, scaled: false };
}

function gender(value: string): CustomerGender | '' {
  if (value.includes('مێ')) return 'female';
  if (value.includes('نێر')) return 'male';
  return '';
}

function purchase(value: string): OrderPurchase | '' {
  if (value.includes('یەکەم')) return 'first';
  if (value.includes('دووەم')) return 'second';
  if (value.includes('زیاتر')) return 'repeat';
  return '';
}

function shift(value: string): OrderShift | '' {
  if (value.includes('بەیانی')) return 'morning';
  if (value.includes('ئێوارە')) return 'afternoon';
  if (value.includes('شەو')) return 'night';
  return '';
}

function platform(value: string): string {
  const v = value.trim();
  if (/^tik\s*tok$/i.test(v)) return 'TikTok';
  return v;
}

export interface SheetImport {
  rows: Omit<ImportedOrder, 'accountId'>[];
  /** Rows with no usable date, or with neither a name nor a phone. */
  skipped: number;
  /** Prices typed in thousands and multiplied by 1,000. */
  scaledPrices: number;
  /** Rows with no price at all; imported at 0 with the text kept in the note. */
  missingPrices: number;
  /** Each seller name in the file, with how many orders it has. */
  sellers: { name: string; orders: number }[];
  firstDate: string | null;
  lastDate: string | null;
}

export function readOrderSheet(text: string): SheetImport {
  const [header = [], ...body] = parseCsv(text);
  const col = columnIndexes(header);
  const cell = (row: string[], column: Column) => (row[col[column]] ?? '').trim();
  const toDate = timestampParser(body.map((row) => cell(row, 'timestamp')));

  const rows: SheetImport['rows'] = [];
  let skipped = 0;
  let scaledPrices = 0;
  let missingPrices = 0;
  const sellers = new Map<string, number>();

  for (const row of body) {
    const when = toDate(cell(row, 'timestamp'));
    const name = cell(row, 'name');
    const phone = westernDigits(cell(row, 'phone'));
    if (!when || (!name && !phone)) {
      skipped++;
      continue;
    }
    const price = parsePrice(cell(row, 'price'));
    if (price.scaled) scaledPrices++;
    if (!price.price) missingPrices++;
    const seller = cell(row, 'seller');
    sellers.set(seller, (sellers.get(seller) ?? 0) + 1);

    rows.push({
      createdAt: when.toISOString(),
      sellerName: seller,
      customerName: name,
      customerPhone: phone,
      secondPhone: westernDigits(cell(row, 'second')),
      city: cell(row, 'city'),
      address: cell(row, 'address'),
      itemModel: cell(row, 'model'),
      itemCategory: cell(row, 'category'),
      totalPrice: price.price,
      gender: gender(cell(row, 'gender')),
      platform: platform(cell(row, 'platform')),
      purchase: purchase(cell(row, 'purchase')),
      shift: shift(cell(row, 'shift')),
      note: [
        cell(row, 'note'),
        (price.extra || price.scaled) && `Price as written: ${cell(row, 'price')}`,
      ]
        .filter(Boolean)
        .join(' · '),
      importKey: ['sheet', cell(row, 'timestamp'), phone, cell(row, 'model'), cell(row, 'price')].join('|'),
    });
  }

  const dates = rows.map((r) => r.createdAt).sort();
  return {
    rows,
    skipped,
    scaledPrices,
    missingPrices,
    sellers: [...sellers.entries()]
      .map(([name, orders]) => ({ name, orders }))
      .sort((a, b) => b.orders - a.orders),
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  };
}

/**
 * Seller names on the old sheet are Kurdish ("دڵنیا خان"); accounts are
 * usually Latin ("Dilnya"). Known pairs are matched up front so the owner
 * only has to check them.
 */
const KNOWN_SELLERS: Record<string, string[]> = {
  'دڵنیا': ['dilnya', 'dlnya', 'dilniya', 'dlnia'],
  'گەشبین': ['gashbin', 'gashben', 'gashbeen'],
  'سوزان': ['suzan', 'sozan'],
  'شاجوان': ['shajwan'],
};

export function guessAccount<T extends { id: string; displayName: string; username: string }>(
  sellerName: string,
  accounts: T[],
): T | null {
  for (const [kurdish, latin] of Object.entries(KNOWN_SELLERS)) {
    if (!sellerName.includes(kurdish)) continue;
    const match = accounts.find((a) => {
      const text = `${a.displayName} ${a.username}`.toLowerCase();
      return text.includes(kurdish) || latin.some((l) => text.includes(l));
    });
    if (match) return match;
  }
  return accounts.find((a) => a.displayName.trim() === sellerName.trim()) ?? null;
}
