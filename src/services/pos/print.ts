import '@/components/pos/print-fonts.css';
import { formatPhone } from '@/services/repairs/logic';
import { colorName, photo } from './items';
import { guaranteeEnd, lineTotal, netTotal, num, paidFor, piecesOf, rateText, returnedQty, saleLabel, showDay, showTime, usd } from './logic';
import { vioMarkSvg } from './logo';
import type { PosItem, PosSettings, Sale, SaleLine, SaleReturn } from './types';

/**
 * The A4 invoice and return note, in English and Kurdish, in dinars. One grid
 * runs down the page: the left edge of the logo, the customer, the items and
 * the guarantee is the same line, and so is the right edge of everything in
 * figures. Pages are cut here rather than by the browser, so every page has its
 * own heading and footer and prints the same from a computer, a tablet or a
 * phone; the page margin is zero, which keeps the browser's own address and
 * date off the paper.
 */

export const esc = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c);

/** Rows an A4 page holds: with the totals under them (in full or smaller rows), without, and on later pages. */
const ROWS = { only: 5, compact: 7, first: 11, middle: 11, last: 5 } as const;

/** The fewest rows left for the page with the totals. */
const KEEP = 2;

/** `less`: rows taken up by a note or a long address. */
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

export const INVOICE_CSS = `
.pv,.pv *{box-sizing:border-box;margin:0;padding:0}
.pv{--ink:#111827;--mid:#4B5563;--soft:#6B7280;--line:#E5E7EB;--panel:#F6F7F9;--red:#A5292B;font-family:'Montserrat','Rabar 013',Arial,sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact;font-variant-numeric:tabular-nums lining-nums}
.pv-page{width:210mm;height:296.8mm;padding:13mm 14mm 10mm;background:#fff;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;font-size:9pt;line-height:1.4}
.pv-page:last-child{page-break-after:auto;break-after:auto}
.pv .ku{font-family:'Rabar 013',Tahoma,sans-serif;direction:rtl;unicode-bidi:isolate}
.pv .ltr{direction:ltr;unicode-bidi:isolate}

.pv-head{display:flex;align-items:center;justify-content:space-between;gap:8mm;flex:none}
.pv-brand{display:flex;align-items:center;gap:4.5mm;min-width:0}
.pv-logo{flex:none;width:21mm;height:21mm;border-radius:4.5mm;background:var(--red);display:flex;align-items:center;justify-content:center}
.pv-co b{display:block;font-size:13pt;font-weight:700;line-height:1.25}
.pv-co div{font-size:8.2pt;color:var(--soft);line-height:1.5}
.pv-title{text-align:right;flex:none}
.pv-title b{display:block;font-size:25pt;font-weight:700;line-height:1.05;letter-spacing:-.02em}
.pv-title span{display:block;margin-top:1mm;font-size:11.5pt;color:var(--soft);line-height:1.4}

.pv-info{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:8mm;flex:none}
.pv-card{border-radius:3.5mm;background:var(--panel);padding:4.6mm 5mm}
.pv-cap{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:7.6pt;font-weight:500;color:var(--soft);line-height:1.3;white-space:nowrap}
.pv-cap .ku{font-size:8.6pt}
.pv-who{display:flex;flex-direction:column}
.pv-name{margin-top:1.6mm;font-size:14pt;font-weight:700;line-height:1.3;text-align:left;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pv-who p{margin-top:1.4mm;font-size:9.6pt;font-weight:500;color:var(--mid);text-align:left;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pv-facts{display:grid;grid-template-columns:1fr 1fr;gap:3.6mm 4mm;align-content:space-between}
.pv-facts b{display:block;margin-top:.6mm;font-size:9.6pt;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}

.pv-table{width:100%;border-collapse:separate;border-spacing:0;margin-top:6mm;table-layout:fixed;flex:none}
.pv-table th{background:var(--panel);color:var(--ink);font-size:8.2pt;font-weight:600;text-align:left;line-height:1.25;padding:2.5mm 2.4mm 2.4mm;white-space:nowrap;vertical-align:middle}
.pv-table th .ku{display:block;font-size:8.4pt;font-weight:400;color:var(--soft);line-height:1.3}
.pv-table th:not(.r):not(.c) .ku{text-align:left}
.pv-table th:first-child{border-radius:2.6mm 0 0 2.6mm;padding-left:4mm}
.pv-table th:last-child{border-radius:0 2.6mm 2.6mm 0;padding-right:4mm}
.pv-table td{height:16.4mm;padding:0 2.4mm;border-bottom:.35pt solid var(--line);vertical-align:middle;overflow:hidden}
.pv-table td:first-child{padding-left:4mm}.pv-table td:last-child{padding-right:4mm}
.pv-table tr:last-child td{border-bottom:0}
.pv-table .r{text-align:right}.pv-table .c{text-align:center}
.pv-pic{display:flex;align-items:center;justify-content:center;width:13mm;height:13mm;border-radius:2.4mm;background:var(--panel)}
.pv-pic img{width:11mm;height:11mm;object-fit:contain;display:block}
.pv-table.compact td{height:14mm}.pv-table.compact .pv-pic{width:11.2mm;height:11.2mm}.pv-table.compact .pv-pic img{width:9.4mm;height:9.4mm}
.pv-it b{display:block;font-size:10pt;font-weight:700;line-height:1.3;white-space:nowrap}
.pv-it small{display:block;font-size:8pt;color:var(--mid);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-it small .ku{font-size:8.8pt;margin-left:1.6mm;color:var(--soft)}
.pv-table.compact .pv-it b{font-size:9.4pt;line-height:1.22}.pv-table.compact .pv-it small{font-size:7.5pt;line-height:1.28}.pv-table.compact .pv-it small .ku{font-size:8pt}
.pv-table td.q{font-size:10pt;font-weight:600}
.pv-table td.p{font-size:9.4pt;font-weight:500;color:var(--mid)}
.pv-table td s{display:block;font-size:7.6pt;font-weight:400;color:#9CA3AF;line-height:1.25}
.pv-table td.d{font-size:9.4pt;color:var(--red);font-weight:600}
.pv-table td.a{font-weight:700;font-size:10.4pt}
.pv-back{display:block;font-size:7pt;font-weight:600;color:var(--red);line-height:1.25;white-space:nowrap}

.pv-end{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:5mm;align-items:stretch;flex:none}
.pv-g{border-radius:3.5mm;border:.5pt solid var(--line);padding:4.6mm 5mm;display:flex;flex-direction:column}
.pv-g h3{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:11.5pt;font-weight:700;color:var(--red);line-height:1.3;white-space:nowrap}
.pv-g h3 .ku{font-size:12.5pt;font-weight:400}
.pv-g dl{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:2.8mm}
.pv-g dl>div{border-radius:2.4mm;background:var(--panel);padding:2.2mm 3mm}
.pv-g dd{margin-top:.4mm;font-size:10pt;font-weight:600}
.pv-g p{margin-top:2.8mm;font-size:7.6pt;line-height:1.5;color:var(--mid)}
.pv-g p.ku{font-size:8.8pt;margin-top:1mm;line-height:1.6}
.pv-sum{display:flex;flex-direction:column;border-radius:3.5mm;border:.5pt solid var(--line);overflow:hidden}
.pv-rows{flex:1;display:flex;flex-direction:column;justify-content:space-evenly;padding:2.2mm 0}
.pv-sum .l{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;padding:1.2mm 4mm 1.2mm 5mm;font-size:9.4pt}
.pv-sum .l span:first-child{color:var(--soft);white-space:nowrap}
.pv-sum .l .ku{font-size:9pt;margin-left:1.6mm}
.pv-sum .l b{font-weight:600;white-space:nowrap}
.pv-sum .l.red b{color:var(--red)}
.pv-total{flex:none;background:var(--red);color:#fff;padding:4.2mm 4mm 4.4mm 5mm}
.pv-total .pv-cap{color:rgba(255,255,255,.82);font-size:8.6pt}
.pv-total .pv-cap .ku{font-size:9.4pt}
.pv-total .v{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;margin-top:1.2mm}
.pv-total b{font-size:21pt;font-weight:700;line-height:1.1;letter-spacing:-.01em;white-space:nowrap}
.pv-total b em{font-style:normal;font-size:9.5pt;font-weight:600;letter-spacing:0}
.pv-total i{font-style:normal;font-size:10pt;font-weight:600;color:rgba(255,255,255,.88);white-space:nowrap}
.pv-note{margin-top:4mm;border-radius:3.5mm;background:var(--panel);padding:3.2mm 5mm;font-size:8.6pt;color:var(--mid);flex:none}
.pv-note b{font-weight:600;color:var(--ink);margin-right:2mm}

.pv-sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9mm;margin-top:auto;flex:none}
.pv-sign>div{margin-top:16mm;border-top:.5pt solid #9CA3AF;padding-top:1.8mm}
.pv-foot{display:flex;justify-content:space-between;gap:6mm;margin-top:6mm;padding-top:2.6mm;border-top:.35pt solid var(--line);font-size:7.4pt;color:var(--soft);flex:none}
.pv-gap{margin-top:auto}
`;

type Fact = [label: string, ku: string, value: string];

const cap = (label: string, ku: string) => `<div class="pv-cap"><span>${label}</span><span class="ku">${ku}</span></div>`;

/** The company on the left, what the paper is on the right. */
export function headHtml(settings: PosSettings, title: string, titleKu: string): string {
  const contact = ['www.vioappliance.com', ...settings.phone.split('\n'), ...settings.address.split('\n')].filter((l) => l.trim());
  return (
    `<div class="pv-head"><div class="pv-brand"><div class="pv-logo">${vioMarkSvg('#fff', '15mm')}</div>` +
    `<div class="pv-co"><b>Vio Company</b>${contact.slice(0, 3).map((l) => `<div dir="auto">${esc(l.trim())}</div>`).join('')}</div></div>` +
    `<div class="pv-title"><b>${title}</b><span class="ku">${titleKu}</span></div></div>`
  );
}

/** Who bought, beside the paper's own facts. */
function infoHtml(sale: Sale, facts: Fact[]): string {
  const shown = facts.filter((f) => f[2]);
  return (
    `<div class="pv-info"><div class="pv-card pv-who">${cap('Customer', 'کڕیار')}` +
    `<div class="pv-name"><bdi>${esc(sale.customerName)}</bdi></div>` +
    `<p><span class="ltr">${esc(formatPhone(sale.customerPhone))}</span></p>` +
    (sale.customerAddress ? `<p><bdi>${esc(sale.customerAddress)}</bdi></p>` : '') +
    `</div><div class="pv-card pv-facts">` +
    shown.map(([l, k, v]) => `<div>${cap(l, k)}<b><bdi>${esc(v)}</bdi></b></div>`).join('') +
    `</div></div>`
  );
}

const col = (widths: number[]) => `<colgroup>${widths.map((w) => `<col${w ? ` style="width:${w}mm"` : ''}>`).join('')}</colgroup>`;

const tableHead = (discounts: boolean) =>
  col(discounts ? [20, 0, 14, 28, 27, 32] : [20, 0, 18, 34, 38]) +
  `<thead><tr><th colspan="2">Item<span class="ku">کاڵا</span></th>` +
  `<th class="c">Qty<span class="ku">دانە</span></th>` +
  `<th class="r">Price<span class="ku">نرخ</span></th>` +
  (discounts ? `<th class="r">Discount<span class="ku">داشکاندن</span></th>` : '') +
  `<th class="r">Amount<span class="ku">کۆ</span></th></tr></thead>`;

/** Photos of items the owner added are kept with the item, not in each sale. */
const imageOf = (line: SaleLine, items: PosItem[]): string => photo(line.image || items.find((i) => i.id === line.itemId)?.image || '');

function itemCells(line: SaleLine, items: PosItem[]): string {
  const image = imageOf(line, items);
  const en = [line.name, line.color].filter(Boolean).join(' · ');
  const ku = [line.ku, line.color ? colorName(line.color, true) : ''].filter(Boolean).join('، ');
  return (
    `<td><div class="pv-pic">${image ? `<img src="${esc(image)}" alt="">` : ''}</div></td>` +
    `<td><div class="pv-it"><b>${esc(line.code)}</b><small>${esc(en)}</small>${ku ? `<small><span class="ku" style="margin-left:0">${esc(ku)}</span></small>` : ''}</div></td>`
  );
}

const sumRow = (label: string, ku: string, value: string, cls = '') =>
  `<div class="l ${cls}"><span>${label}<span class="ku">${ku}</span></span><b>${value}</b></div>`;

const totalBox = (label: string, ku: string, amount: number, rate: number) =>
  `<div class="pv-total">${cap(label, ku)}<div class="v"><b>${num(amount)} <em>IQD</em></b><i>${usd(rate > 0 ? amount / rate : 0)}</i></div></div>`;

const signatures =
  `<div class="pv-sign"><div>${cap('Seller', 'واژووی فرۆشیار')}</div><div>${cap('Customer', 'واژووی کڕیار')}</div><div>${cap('Company stamp', 'مۆری کۆمپانیا')}</div></div>`;

interface Doc {
  head: string;
  info: string;
  rows: string[];
  discounts: boolean;
  end: string;
  footer: string;
  /** Rows the page gives up to a note or a long address. */
  less: number;
}

function documentHtml({ head, info, rows, discounts, end, footer, less }: Doc): string {
  const pages = pagesOf(rows, less);
  return `<div class="pv">${pages
    .map((page, i) => {
      const last = i === pages.length - 1;
      const compact = pages.length === 1 && page.length > ROWS.only - less;
      return (
        `<section class="pv-page">${head}${info}` +
        `<table class="pv-table${compact ? ' compact' : ''}">${tableHead(discounts)}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>` +
        (last ? end + signatures : '<div class="pv-gap"></div>') +
        `<div class="pv-foot"><span>Vio Company</span><span>${esc(footer)}</span><span>Page ${i + 1} of ${pages.length}</span></div></section>`
      );
    })
    .join('')}</div>`;
}

/** The invoice, as HTML (every value escaped). */
export function invoiceHtml(sale: Sale, settings: PosSettings, items: PosItem[]): string {
  const discounts = sale.discount > 0;
  const rows = sale.lines.map((line) => {
    const back = returnedQty(sale, line.id);
    return (
      itemCells(line, items) +
      `<td class="c q">${line.qty}${back ? `<span class="pv-back">Returned ${back}</span>` : ''}</td>` +
      // A price the seller raised is never printed as if it were an offer.
      `<td class="r p">${line.price <= line.list && line.price < line.regular ? `<s>${num(line.regular)}</s>` : ''}${num(line.price)}</td>` +
      (discounts ? `<td class="r d">${line.discount ? num(-line.discount) : ''}</td>` : '') +
      `<td class="r a">${num(lineTotal(line))}</td>`
    );
  });

  const net = netTotal(sale);
  const guarantee =
    `<div class="pv-g"><h3><span>2-Year Guarantee</span><span class="ku">زەمانی دوو ساڵ</span></h3>` +
    `<dl><div>${cap('From', 'لە')}<dd>${showDay(sale.soldAt)}</dd></div><div>${cap('Until', 'تا')}<dd>${showDay(guaranteeEnd(sale.soldAt))}</dd></div></dl>` +
    `<p>Every item on this invoice has a 2-year electrical guarantee. Keep this invoice: it is your guarantee.</p>` +
    `<p class="ku">هەموو کاڵاکانی سەر ئەم پسوولەیە زەمانی کارەبایی دوو ساڵیان هەیە. تکایە پسوولەکە بپارێزە، ئەمە زەمانەکەتە.</p></div>`;
  const sum =
    `<div class="pv-sum"><div class="pv-rows">` +
    sumRow('Pieces', 'ژمارەی دانە', num(piecesOf(sale.lines))) +
    sumRow('Subtotal', 'کۆی نرخ', num(sale.subtotal)) +
    (sale.discount ? sumRow('Discount', 'داشکاندن', num(-sale.discount), 'red') : '') +
    (sale.refunded ? sumRow('Returned', 'گەڕاوە', num(-sale.refunded), 'red') : '') +
    `</div>` +
    totalBox('Total', 'کۆی گشتی', net, sale.rate) +
    `</div>`;

  return documentHtml({
    head: headHtml(settings, 'Invoice', 'پسوولەی فرۆشتن'),
    info: infoHtml(sale, [
      ['Invoice no.', 'ژمارەی پسوولە', saleLabel(sale)],
      ['Date', 'بەروار', `${showDay(sale.soldAt)}  ${showTime(sale.soldAt)}`],
      ['Dollar', 'دۆلار', rateText(sale.rate)],
      ['Seller', 'فرۆشیار', sale.seller || '—'],
    ]),
    rows,
    discounts,
    end:
      `<div class="pv-end">${guarantee}${sum}</div>` +
      (sale.note ? `<div class="pv-note"><b>Note</b><bdi>${esc(sale.note)}</bdi></div>` : ''),
    footer: `Invoice ${saleLabel(sale)} · ${showDay(sale.soldAt)}`,
    less: (sale.note ? 1 : 0) + (sale.customerAddress.length > 42 ? 1 : 0),
  });
}

/** The note for one return. */
export function returnHtml(sale: Sale, ret: SaleReturn, settings: PosSettings, items: PosItem[]): string {
  const back = ret.lines.flatMap((b) => {
    const line = sale.lines.find((l) => l.id === b.id);
    return line ? [{ line, qty: b.qty }] : [];
  });
  const rows = back.map(({ line, qty }) => {
    const paid = paidFor(line, qty);
    return itemCells(line, items) + `<td class="c q">${qty}</td><td class="r p">${num(paid / qty)}</td><td class="r a">${num(paid)}</td>`;
  });
  const reason =
    `<div class="pv-g" style="min-height:38mm">${cap('Reason', 'هۆکار')}<p style="margin-top:1.8mm;font-size:10pt;font-weight:500;color:var(--ink)"><bdi>${esc(ret.reason) || '—'}</bdi></p></div>`;
  return documentHtml({
    head: headHtml(settings, 'Return', 'پسوولەی گەڕاندنەوە'),
    info: infoHtml(sale, [
      ['Invoice no.', 'ژمارەی پسوولە', saleLabel(sale)],
      ['Sold on', 'فرۆشراوە لە', showDay(sale.soldAt)],
      ['Returned on', 'گەڕاوەتەوە لە', `${showDay(ret.at)}  ${showTime(ret.at)}`],
      ['Seller', 'فرۆشیار', ret.by || '—'],
    ]),
    rows,
    discounts: false,
    end:
      `<div class="pv-end">${reason}<div class="pv-sum"><div class="pv-rows">` +
      sumRow('Pieces', 'ژمارەی دانە', num(back.reduce((n, b) => n + b.qty, 0))) +
      `</div>` +
      totalBox('Money back', 'پارەی گەڕاوە', ret.refund, sale.rate) +
      `</div></div>`,
    footer: `Return from invoice ${saleLabel(sale)} · ${showDay(ret.at)}`,
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
