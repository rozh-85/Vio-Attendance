import '@/components/pos/print-fonts.css';
import { formatPhone } from '@/services/repairs/logic';
import { SHOP, colorName, photo } from './items';
import { guaranteeEnd, lineTotal, netTotal, num, paidFor, piecesOf, returnedQty, saleLabel, showDay, showTime, usd } from './logic';
import { vioMarkSvg } from './logo';
import type { PosItem, PosSettings, Sale, SaleLine, SaleReturn } from './types';

/**
 * The A4 invoice and return note, in Kurdish, right to left, in dinars. A red
 * band with the company on top; who bought and the invoice's own facts under
 * it; a red bar over the items, each with its photo; then the totals, the
 * total also in words, and one quiet line for the guarantee at the foot. Pages are cut here rather than by the
 * browser, so every page has its own band and footer and prints the same from
 * a computer, a tablet or a phone; the page margin is zero, which keeps the
 * browser's own address and date off the paper.
 */

export const esc = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c);

/** Rows an A4 page holds: with the totals under them (in full or smaller rows), without, and on later pages. */
const ROWS = { only: 7, compact: 9, first: 12, middle: 12, last: 7 } as const;

/** The fewest rows left for the page with the totals. */
const KEEP = 2;

/** `less`: rows taken up by a long address. */
function pagesOf<T>(rows: T[], less: number): T[][] {
  if (rows.length <= ROWS.compact - less) return [rows];
  const pages: T[][] = [];
  let rest = rows;
  const take = (n: number) => {
    pages.push(rest.slice(0, n));
    rest = rest.slice(n);
  };
  take(Math.min(ROWS.first, rest.length - KEEP));
  while (rest.length > ROWS.last - less) take(Math.min(ROWS.middle, rest.length - KEEP));
  pages.push(rest);
  return pages;
}

// ── Dinars in Kurdish words ──────────────────────────────────────────────────

const ONES = ['', 'یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'شەش', 'حەوت', 'هەشت', 'نۆ', 'دە', 'یازدە', 'دوازدە', 'سێزدە', 'چواردە', 'پازدە', 'شازدە', 'حەڤدە', 'هەژدە', 'نۆزدە'];
const TENS = ['', '', 'بیست', 'سی', 'چل', 'پەنجا', 'شەست', 'حەفتا', 'هەشتا', 'نەوەد'];
const HUNDREDS = ['', 'سەد', 'دووسەد', 'سێسەد', 'چوارسەد', 'پێنجسەد', 'شەشسەد', 'حەوتسەد', 'هەشتسەد', 'نۆسەد'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const rest = n % 100;
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)], ONES[rest % 10]);
  else parts.push(ONES[rest]);
  return parts.filter(Boolean).join(' و ');
}

/** 135250 → سەد و سی و پێنج هەزار و دووسەد و پەنجا */
export function kurdishWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (!n) return 'سفر';
  const parts: string[] = [];
  for (const [size, name] of [[1e9, 'ملیار'], [1e6, 'ملیۆن'], [1e3, 'هەزار']] as const) {
    const k = Math.floor(n / size);
    if (k) parts.push(k === 1 && size === 1e3 ? name : `${underThousand(k)} ${name}`);
    n %= size;
  }
  if (n) parts.push(underThousand(n));
  return parts.join(' و ');
}

// ── The look ─────────────────────────────────────────────────────────────────

export const INVOICE_CSS = `
.pv,.pv *{box-sizing:border-box;margin:0;padding:0}
.pv{--ink:#111827;--mid:#4B5563;--soft:#6B7280;--line:#E2E5EA;--rule:#9CA3AF;--panel:#F5F6F8;--red:#A5292B;font-family:'Montserrat','Rabar 013',Tahoma,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;font-variant-numeric:tabular-nums lining-nums}
.pv-page{direction:rtl;width:210mm;height:296.8mm;padding:10mm 12mm 9mm;background:#fff;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;font-size:9.4pt;line-height:1.45}
.pv-page:last-child{page-break-after:auto;break-after:auto}
.pv .ltr{direction:ltr;unicode-bidi:isolate}
.pv svg.i{width:3.6mm;height:3.6mm;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

.pv-band{flex:none;background:var(--red);color:#fff;border-radius:2.6mm;padding:5.4mm 6mm 3.8mm}
.pv-band-top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:4mm}
.pv-band-top .s{font-size:12.5pt;font-weight:500;white-space:nowrap}
.pv-band-top .e{text-align:left;font-size:9.6pt;font-weight:500;color:rgba(255,255,255,.88);white-space:nowrap}
.pv-mark{display:flex;align-items:center;justify-content:center}
.pv-contacts{display:flex;justify-content:space-between;gap:6mm;margin-top:4.6mm;font-size:8.6pt;color:rgba(255,255,255,.92)}
.pv-contacts span{display:flex;align-items:center;gap:1.6mm;white-space:nowrap;min-width:0}

.pv-meta{flex:none;display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;margin-top:6.4mm;padding:0 2mm}
.pv-meta p{display:flex;align-items:center;gap:1.8mm;line-height:1.5}
.pv-meta svg.i{color:var(--soft)}
.pv-who .n{font-size:12.5pt;font-weight:700}
.pv-who .t{margin-top:.6mm;font-size:10.4pt;font-weight:600}
.pv-who .a{margin-top:.4mm;font-size:9pt;color:var(--mid);max-width:95mm}
.pv-ref{text-align:left}
.pv-ref b{display:block;font-size:12.5pt;font-weight:700;line-height:1.4}
.pv-ref span{display:block;margin-top:.6mm;font-size:9.4pt;font-weight:500;color:var(--mid)}

.pv-bar{flex:none;display:flex;justify-content:space-between;align-items:center;gap:6mm;margin-top:5.4mm;background:var(--red);color:#fff;border-radius:2.2mm;padding:2.4mm 5mm;font-size:11pt;font-weight:600}
.pv-bar span:last-child{font-size:9.6pt;font-weight:500;color:rgba(255,255,255,.88)}

.pv-table{flex:none;width:100%;border-collapse:collapse;table-layout:fixed;margin-top:2.4mm}
.pv-table th{color:var(--red);font-size:9.2pt;font-weight:600;text-align:right;line-height:1.3;padding:2mm 2.4mm 1.8mm;border-bottom:.9pt solid var(--rule);white-space:nowrap}
.pv-table td{height:15.4mm;padding:1.2mm 2.4mm;border-bottom:.5pt solid var(--line);vertical-align:middle;overflow:hidden}
.pv-table th+th,.pv-table td+td{border-right:.5pt solid var(--line)}
.pv-table .c{text-align:center}
.pv-table td.v{font-size:9.6pt;font-weight:500;white-space:nowrap}
.pv-table td.q{font-size:10.4pt;font-weight:700}
.pv-table td.d{color:var(--red);font-weight:600}
.pv-table td.a{font-size:10pt;font-weight:700}
.pv-table td s{display:block;font-size:7.6pt;font-weight:400;color:#9CA3AF;line-height:1.2}
.pv-table td.k{font-size:9.6pt;font-weight:700;white-space:nowrap}
.pv-cur{font-size:7.6pt;font-weight:500;color:var(--soft);margin-right:.8mm}
.pv-pic{display:flex;align-items:center;justify-content:center;width:12.4mm;height:12.4mm;border-radius:2.2mm;background:var(--panel)}
.pv-pic img{width:10.6mm;height:10.6mm;object-fit:contain;display:block}
.pv-table.compact td{height:13.2mm}.pv-table.compact .pv-pic{width:10.6mm;height:10.6mm}.pv-table.compact .pv-pic img{width:9mm;height:9mm}
.pv-it b{display:block;font-size:9.6pt;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:right}
.pv-it small{display:block;font-size:8.8pt;color:var(--mid);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-back{display:block;font-size:7.4pt;font-weight:600;color:var(--red);line-height:1.2;white-space:nowrap}

.pv-end{flex:none;display:grid;grid-template-columns:1fr 1fr;gap:9mm;margin-top:6mm;align-items:start}
.pv-box{border-radius:2.6mm;background:var(--panel);padding:3.4mm 4.4mm}
.pv-box h3{font-size:9.6pt;font-weight:700;color:var(--ink);line-height:1.3}
.pv-box p{margin-top:1mm;font-size:9.4pt;line-height:1.6;color:var(--mid)}
.pv-sum .r{display:flex;justify-content:space-between;align-items:baseline;gap:4mm;padding:2.3mm 1mm;border-bottom:.8pt solid var(--rule);font-size:10pt}
.pv-sum .r>span:first-child{font-weight:600;white-space:nowrap}
.pv-sum .r b{font-weight:600;white-space:nowrap}
.pv-sum .r.red b{color:var(--red)}
.pv-sum .r i{font-style:normal;font-size:8.8pt;color:var(--red);margin-left:1.4mm}
.pv-sum .t{padding:3mm 1mm 2.6mm;border-bottom:.8pt solid var(--rule)}
.pv-sum .t .r{padding:0;border:0;align-items:center}
.pv-sum .t b{font-size:21pt;font-weight:700;color:var(--red);line-height:1.1;letter-spacing:-.01em}
.pv-sum .t b .pv-cur{font-size:11pt;color:var(--red);font-weight:600}
.pv-sum .t i{font-size:9.6pt;font-weight:600}
.pv-sum .w{margin-top:1.4mm;font-size:9.4pt;font-weight:500;color:var(--mid);text-align:left}
.pv-guar{flex:none;margin-top:auto;display:flex;align-items:center;gap:2.2mm;border:.5pt solid var(--line);border-radius:2.2mm;padding:2.2mm 4mm;font-size:8.2pt;line-height:1.4;color:var(--mid)}
.pv-guar svg.i{width:3.8mm;height:3.8mm;color:var(--red)}
.pv-guar b{font-weight:700;color:var(--red);white-space:nowrap}
.pv-guar .d{font-weight:600;color:var(--ink);white-space:nowrap}
.pv-guar .x{margin-right:auto;color:var(--soft)}
.pv-foot{display:flex;justify-content:space-between;gap:6mm;margin-top:5mm;padding-top:2.4mm;border-top:.35pt solid var(--line);font-size:7.8pt;color:var(--soft);flex:none}
.pv-gap{margin-top:auto}
`;

// ── Pieces of a page ─────────────────────────────────────────────────────────

const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
} as const;
const icon = (name: keyof typeof ICONS) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** A dinar amount, its figures left to right inside the Kurdish line. */
export const dinars = (n: number): string => `<bdi class="ltr">${num(n)}</bdi><span class="pv-cur">د.ع</span>`;

/** The red band: what the paper is, the Vio mark in the middle, and how to reach it. */
export function bandHtml(settings: PosSettings, what: string, aside = ''): string {
  const lines = (text: string) => text.split(/\n|\s+[·/|,]\s+/).map((l) => l.trim()).filter(Boolean);
  // What the owner typed in the settings, else the showroom's own.
  const phones = lines(settings.phone).length ? lines(settings.phone) : SHOP.phones;
  const address = lines(settings.address)[0] ?? SHOP.address;
  const contacts = [
    `<span>${icon('phone')}<bdi class="ltr">${phones.map(esc).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</bdi></span>`,
    address && `<span>${icon('pin')}<bdi>${esc(address)}</bdi></span>`,
    `<span>${icon('web')}<bdi class="ltr">www.vioappliance.com</bdi></span>`,
  ].filter(Boolean);
  return (
    `<header class="pv-band"><div class="pv-band-top"><span class="s">${what}</span>` +
    `<div class="pv-mark">${vioMarkSvg('#fff', '20mm')}</div>` +
    `<span class="e">${aside}</span></div>` +
    `<div class="pv-contacts">${contacts.join('')}</div></header>`
  );
}

/** Who bought on one side; the paper's number, day and dollar on the other. */
function metaHtml(sale: Sale, title: string, line: string): string {
  return (
    `<div class="pv-meta"><div class="pv-who">` +
    `<p class="n">${icon('user')}<bdi>${esc(sale.customerName)}</bdi></p>` +
    `<p class="t">${icon('phone')}<bdi class="ltr">${esc(formatPhone(sale.customerPhone))}</bdi></p>` +
    (sale.customerAddress ? `<p class="a">${icon('pin')}<bdi>${esc(sale.customerAddress)}</bdi></p>` : '') +
    `</div><div class="pv-ref"><b>${title}</b><span>${line}</span></div></div>`
  );
}

const barHtml = (title: string, aside: string) => `<div class="pv-bar"><span>${title}</span><span>${aside}</span></div>`;

const col = (widths: number[]) => `<colgroup>${widths.map((w) => `<col${w ? ` style="width:${w}mm"` : ''}>`).join('')}</colgroup>`;

const tableHead = (discounts: boolean, priceLabel = 'نرخی دانە') =>
  col(discounts ? [17, 23, 0, 13, 27, 23, 29] : [17, 25, 0, 15, 30, 32]) +
  `<thead><tr><th>وێنە</th><th>کۆد</th><th>کاڵا</th><th class="c">دانە</th><th>${priceLabel}</th>` +
  (discounts ? `<th>داشکاندن</th>` : '') +
  `<th>گشتی</th></tr></thead>`;

/** Photos of items the owner added are kept with the item, not in each sale. */
const imageOf = (line: SaleLine, items: PosItem[]): string => photo(line.image || items.find((i) => i.id === line.itemId)?.image || '');

function itemCells(line: SaleLine, items: PosItem[]): string {
  const image = imageOf(line, items);
  const ku = [line.ku, line.color ? colorName(line.color, true) : ''].filter(Boolean).join('، ');
  const en = [line.name, line.color].filter(Boolean).join(' · ');
  return (
    `<td><div class="pv-pic">${image ? `<img src="${esc(image)}" alt="">` : ''}</div></td>` +
    `<td class="k"><bdi class="ltr">${esc(line.code)}</bdi></td>` +
    `<td><div class="pv-it"><b>${esc(en)}</b>${ku ? `<small>${esc(ku)}</small>` : ''}</div></td>`
  );
}

const sumRow = (label: string, value: string, cls = '') => `<div class="r ${cls}"><span>${label}</span><b>${value}</b></div>`;

/** The big total in red, its dollars, and the dinars in words. */
const totalHtml = (label: string, amount: number, rate: number) =>
  `<div class="t"><div class="r"><span>${label}</span><span><i class="ltr">(${usd(rate > 0 ? amount / rate : 0)})</i><b>${dinars(amount)}</b></span></div>` +
  `<div class="w">${kurdishWords(amount)} دینار</div></div>`;


interface Doc {
  band: string;
  meta: string;
  bar: string;
  head: string;
  rows: string[];
  end: string;
  /** At the foot of the last page, over the footer. */
  bottom?: string;
  footer: string;
  /** Rows the page gives up to a long address. */
  less: number;
}

function documentHtml({ band, meta, bar, head, rows, end, bottom = '<div class="pv-gap"></div>', footer, less }: Doc): string {
  const pages = pagesOf(rows, less);
  return `<div class="pv">${pages
    .map((page, i) => {
      const last = i === pages.length - 1;
      const compact = pages.length === 1 && page.length > ROWS.only - less;
      return (
        `<section class="pv-page">${band}${meta}${bar}` +
        `<table class="pv-table${compact ? ' compact' : ''}">${head}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>` +
        (last ? end + bottom : '<div class="pv-gap"></div>') +
        `<div class="pv-foot"><span class="ltr">Vio Company · www.vioappliance.com</span><span>${footer}</span><span>پەڕەی <bdi class="ltr">${i + 1} / ${pages.length}</bdi></span></div></section>`
      );
    })
    .join('')}</div>`;
}

const saleNo = (sale: Sale) => `<bdi class="ltr">#${esc(saleLabel(sale))}</bdi>`;
const when = (iso: string, rate: number) =>
  `<bdi class="ltr">${showDay(iso)} · ${showTime(iso)}</bdi> · <bdi class="ltr">$1 = ${num(rate)}</bdi> د.ع`;

/** The invoice, as HTML (every value escaped). */
export function invoiceHtml(sale: Sale, settings: PosSettings, items: PosItem[]): string {
  const discounts = sale.discount > 0;
  const rows = sale.lines.map((line) => {
    const back = returnedQty(sale, line.id);
    return (
      itemCells(line, items) +
      `<td class="c q">${line.qty}${back ? `<span class="pv-back">${back} گەڕاوە</span>` : ''}</td>` +
      // A price the seller raised is never printed as if it were an offer.
      `<td class="v">${line.price <= line.list && line.price < line.regular ? `<s class="ltr">${num(line.regular)}</s>` : ''}${dinars(line.price)}</td>` +
      (discounts ? `<td class="v d">${line.discount ? dinars(line.discount) : ''}</td>` : '') +
      `<td class="v a">${dinars(lineTotal(line))}</td>`
    );
  });

  const net = netTotal(sale);
  const percent = sale.subtotal > 0 ? `(${((sale.discount / sale.subtotal) * 100).toFixed(2)}%)` : '';
  const guarantee =
    `<div class="pv-guar">${icon('shield')}<b>زەمانی دوو ساڵ</b>` +
    `<span class="d">لە <bdi class="ltr">${showDay(sale.soldAt)}</bdi> تا <bdi class="ltr">${showDay(guaranteeEnd(sale.soldAt))}</bdi></span>` +
    `<span class="x">زەمانی کارەبایی بۆ هەموو کاڵاکان. پسوولەکە بپارێزە، ئەمە زەمانەکەتە.</span></div>`;
  const sum =
    `<div class="pv-sum">` +
    sumRow('ژمارەی دانە', `<bdi class="ltr">${num(piecesOf(sale.lines))}</bdi>`) +
    sumRow(discounts ? 'کۆی گشتی پێش داشکاندن' : 'کۆی نرخ', dinars(sale.subtotal)) +
    (discounts ? sumRow('داشکاندن', `<i class="ltr">${percent}</i>${dinars(sale.discount)}`, 'red') : '') +
    (sale.refunded ? sumRow('گەڕاوە', dinars(sale.refunded), 'red') : '') +
    totalHtml('گشتی', net, sale.rate) +
    `</div>`;

  return documentHtml({
    band: bandHtml(settings, `فرۆشتن ${saleNo(sale)}`),
    meta: metaHtml(sale, `پسوولەی فرۆشتن ${saleNo(sale)}`, when(sale.soldAt, sale.rate)),
    bar: barHtml('پسوولەی فرۆشتن', `<bdi class="ltr">${num(piecesOf(sale.lines))}</bdi> دانە`),
    head: tableHead(discounts),
    rows,
    end:
      // The note, when there is one, stands beside the totals.
      `<div class="pv-end"><div>${sale.note ? `<div class="pv-box"><h3>تێبینی</h3><p><bdi>${esc(sale.note)}</bdi></p></div>` : ''}</div>${sum}</div>`,
    bottom: guarantee,
    footer: `پسوولەی ${saleNo(sale)} · <bdi class="ltr">${showDay(sale.soldAt)}</bdi>`,
    less: sale.customerAddress.length > 42 ? 1 : 0,
  });
}

/** The note for one return. */
export function returnHtml(sale: Sale, ret: SaleReturn, settings: PosSettings, items: PosItem[]): string {
  const back = ret.lines.flatMap((b) => {
    const line = sale.lines.find((l) => l.id === b.id);
    return line ? [{ line, qty: b.qty }] : [];
  });
  const pieces = back.reduce((n, b) => n + b.qty, 0);
  const rows = back.map(({ line, qty }) => {
    const paid = paidFor(line, qty);
    return itemCells(line, items) + `<td class="c q">${qty}</td><td class="v">${dinars(paid / qty)}</td><td class="v a">${dinars(paid)}</td>`;
  });
  const reason = `<div class="pv-box"><h3>هۆکار</h3><p><bdi>${esc(ret.reason) || '—'}</bdi></p></div>`;
  return documentHtml({
    band: bandHtml(settings, `گەڕاندنەوە ${saleNo(sale)}`),
    meta: metaHtml(
      sale,
      `گەڕاندنەوە لە پسوولەی ${saleNo(sale)}`,
      `فرۆشراوە <bdi class="ltr">${showDay(sale.soldAt)}</bdi> · گەڕاوە <bdi class="ltr">${showDay(ret.at)} · ${showTime(ret.at)}</bdi>`,
    ),
    bar: barHtml('پسوولەی گەڕاندنەوە', `<bdi class="ltr">${num(pieces)}</bdi> دانە`),
    head: tableHead(false, 'پارەی دانە'),
    rows,
    end:
      `<div class="pv-end">${reason}<div class="pv-sum">` +
      sumRow('ژمارەی دانە', `<bdi class="ltr">${num(pieces)}</bdi>`) +
      totalHtml('پارەی گەڕاوە', ret.refund, sale.rate) +
      `</div></div>`,
    footer: `گەڕاندنەوە لە پسوولەی ${saleNo(sale)} · <bdi class="ltr">${showDay(ret.at)}</bdi>`,
    less: 0,
  });
}

// ── Printing ─────────────────────────────────────────────────────────────────

const ROOT_ID = 'vio-pos-print';
const STYLE_ID = 'vio-pos-print-style';

const within = <T>(work: Promise<T>, ms: number): Promise<T | void> =>
  Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, ms))]).catch(() => undefined);

let queue: Promise<void> = Promise.resolve();

/**
 * Prints A4 pages from inside the page itself (no pop-up to be blocked), once
 * its photos and letters are there. `title` names the file when it is saved as
 * a PDF. Two prints asked for together come one after the other.
 */
export function printPages(html: string, title: string, css: string = INVOICE_CSS): Promise<void> {
  queue = queue.then(() => printNow(html, title, css)).catch(() => undefined);
  return queue;
}

async function printNow(html: string, title: string, css: string): Promise<void> {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `${css}
#${ROOT_ID}{position:fixed;top:0;left:-10000px;pointer-events:none}
@media print{
  @page{size:A4 portrait;margin:0}
  html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}
  body>*:not(#${ROOT_ID}){display:none!important}
  #${ROOT_ID}{position:static;left:auto}
}`;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = html;
  document.head.appendChild(style);
  document.body.appendChild(root);

  const images = [...root.querySelectorAll('img')].map((img) => {
    img.loading = 'eager';
    return img.decode().catch(() => img.remove());
  });
  const fonts = document.fonts
    ? [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 12px Montserrat`)).concat(document.fonts.load('12px "Rabar 013"', 'پ'))
    : [];
  await within(Promise.all([...images, ...fonts]), 4000);

  const before = document.title;
  document.title = title;
  const done = () => {
    window.removeEventListener('afterprint', done);
    document.title = before;
    // Some phones say "printed" before they have read the page.
    setTimeout(() => {
      root.remove();
      style.remove();
    }, 1500);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

export const printInvoice = (sale: Sale, settings: PosSettings, items: PosItem[]): Promise<void> =>
  printPages(invoiceHtml(sale, settings, items), `Vio invoice ${saleLabel(sale)}`);

export const printReturn = (sale: Sale, ret: SaleReturn, settings: PosSettings, items: PosItem[]): Promise<void> =>
  printPages(returnHtml(sale, ret, settings, items), `Vio return ${saleLabel(sale)}`);
