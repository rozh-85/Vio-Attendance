import { formatPhone } from '@/services/repairs/logic';
import { colorName, photo } from './items';
import { guaranteeEnd, lineTotal, netTotal, num, paidFor, piecesOf, rateText, returnedQty, saleLabel, showDay, showTime, usd } from './logic';
import { vioMarkSvg } from './logo';
import type { PosItem, PosSettings, Sale, SaleLine, SaleReturn } from './types';

/**
 * The A4 invoice and return note, in English and Kurdish, in dinars. Pages are
 * cut here rather than by the browser, so every page has its own heading and
 * footer and prints the same from a computer, a tablet or a phone. The page
 * margin is zero, which also keeps the browser's own address and date off the
 * paper.
 */

const esc = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c);

/** Rows an A4 page holds: with the totals under them (in full or smaller rows), without, and on later pages. */
const ROWS = { only: 7, compact: 9, first: 13, middle: 15, last: 8 } as const;

/** The fewest rows left for the page with the totals. */
const KEEP = 3;

function pagesOf<T>(rows: T[]): T[][] {
  if (rows.length <= ROWS.compact) return [rows];
  const pages: T[][] = [];
  let rest = rows;
  const take = (n: number) => {
    pages.push(rest.slice(0, n));
    rest = rest.slice(n);
  };
  take(Math.min(ROWS.first, rest.length - KEEP));
  while (rest.length > ROWS.last) take(Math.min(ROWS.middle, rest.length - KEEP));
  pages.push(rest);
  return pages;
}

export const INVOICE_CSS = `
.pv,.pv *{box-sizing:border-box;margin:0;padding:0}
.pv{font-family:'Montserrat','Rabar 013',Arial,sans-serif;color:#1C1D1F;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-variant-numeric:tabular-nums lining-nums}
.pv-page{width:210mm;height:296.8mm;padding:0 14mm 9mm;background:#fff;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;font-size:9pt;line-height:1.35}
.pv-page:last-child{page-break-after:auto;break-after:auto}
.pv .ku{font-family:'Rabar 013',Tahoma,sans-serif;direction:rtl;unicode-bidi:isolate}
.pv-head{display:flex;align-items:stretch;justify-content:space-between;height:37mm;flex:none}
.pv-brand{display:flex;gap:6mm}
.pv-tab{background:#A5292B;color:#fff;width:40mm;height:31mm;display:flex;flex-direction:column;justify-content:flex-end;padding:0 6mm 4.6mm}
.pv-tab span{display:block;margin-top:1.9mm;font-size:4.9pt;font-weight:800;letter-spacing:.035em;white-space:nowrap}
.pv-co{padding-top:10.5mm;font-size:8pt;line-height:1.5;color:#4A4E54}
.pv-co b{display:block;font-size:11pt;font-weight:700;color:#1C1D1F;line-height:1.3}
.pv-title{text-align:right;padding-top:9.5mm}
.pv-title b{display:block;font-size:23pt;font-weight:800;letter-spacing:.06em;line-height:1.05}
.pv-title span{display:block;font-size:12.5pt;color:#4A4E54;line-height:1.5}
.pv-meta{display:grid;border-bottom:.6pt solid #1C1D1F;flex:none}
.pv-meta.top{border-top:1.4pt solid #1C1D1F}
.pv-meta>div{padding:2.1mm 3mm 2.3mm;border-left:.4pt solid #C9CDD1;min-width:0}
.pv-meta>div:first-child{border-left:0;padding-left:0}
.pv-meta>div:last-child{padding-right:0}
.pv-meta small{display:flex;justify-content:space-between;gap:2mm;font-size:6.4pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6B7077;white-space:nowrap}
.pv-meta small .ku{font-size:8pt;font-weight:400;letter-spacing:0;line-height:1}
.pv-meta b{display:block;margin-top:.7mm;font-size:10pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-meta.who b{font-size:10.5pt;line-height:1.25;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pv-table{width:100%;border-collapse:collapse;margin-top:5mm;table-layout:fixed;flex:none}
.pv-table th{font-size:6.8pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:left;padding:1.8mm 1.6mm 1.6mm;border-top:1.4pt solid #1C1D1F;border-bottom:.6pt solid #1C1D1F;vertical-align:bottom;white-space:nowrap}
.pv-table th .ku{display:block;font-size:8.6pt;font-weight:400;letter-spacing:0;color:#4A4E54;line-height:1.3}
.pv-table th:not(.r):not(.c) .ku{text-align:left}
.pv-table td{height:13.6mm;padding:0 1.6mm;border-bottom:.4pt solid #C9CDD1;vertical-align:middle;overflow:hidden}
.pv-table th:first-child,.pv-table td:first-child{padding-left:0}
.pv-table th:last-child,.pv-table td:last-child{padding-right:0}
.pv-table .r{text-align:right}.pv-table .c{text-align:center}
.pv-table img{width:11.6mm;height:11.6mm;object-fit:contain;display:block}
.pv-table.compact td{height:10.9mm}.pv-table.compact img{width:9.4mm;height:9.4mm}
.pv-no{color:#6B7077}
.pv-it{display:flex;align-items:center;justify-content:space-between;gap:3mm}
.pv-it>span:first-child{flex:1 1 54%;min-width:0}
.pv-it b{display:block;font-size:10pt;font-weight:700;line-height:1.25;white-space:nowrap}
.pv-it small{display:block;font-size:8pt;color:#4A4E54;line-height:1.25}
.pv-it .ku{flex:0 1 auto;max-width:46%;font-size:9.4pt;line-height:1.3;color:#4A4E54;text-align:right}
.pv-table td.q{font-size:10pt;font-weight:600}
.pv-table td s{display:block;font-size:7.4pt;color:#8A8D92;line-height:1.2}
.pv-table td.d{color:#A5292B;font-weight:600}
.pv-table td.a{font-weight:700;font-size:10pt}
.pv-back{display:block;font-size:7pt;font-weight:600;color:#A5292B;line-height:1.2;white-space:nowrap}
.pv-end{display:grid;grid-template-columns:1fr 78mm;gap:9mm;margin-top:6mm;flex:none}
.pv-g{border:1pt solid #1C1D1F;padding:3.6mm 4.2mm 3.8mm}
.pv-g h3{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;font-size:12pt;font-weight:800;line-height:1.2;white-space:nowrap}
.pv-g h3 .ku{font-size:13.5pt;font-weight:400}
.pv-g dl{display:grid;grid-template-columns:1fr 1fr;margin-top:2.6mm;border-top:.5pt solid #1C1D1F;border-bottom:.5pt solid #1C1D1F}
.pv-g dl div{padding:1.5mm 0 1.6mm}
.pv-g dl div+div{border-left:.4pt solid #C9CDD1;padding-left:3mm}
.pv-g dt{display:flex;justify-content:space-between;padding-right:3mm;font-size:6.4pt;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6B7077}
.pv-g dl div+div dt{padding-right:0}
.pv-g dt .ku{font-size:8pt;font-weight:400;letter-spacing:0;line-height:1}
.pv-g dd{font-size:10pt;font-weight:700}
.pv-g p{margin-top:2.4mm;font-size:7.4pt;line-height:1.45;color:#2E3136}
.pv-g p.ku{font-size:9pt;margin-top:1mm;line-height:1.55}
.pv-sum{align-self:start;border-top:1.4pt solid #1C1D1F}
.pv-sum>div{display:flex;justify-content:space-between;align-items:baseline;gap:3mm;padding:1.7mm 0;border-bottom:.4pt solid #C9CDD1;font-size:9pt}
.pv-sum>div>span:first-child{color:#4A4E54;white-space:nowrap}
.pv-sum .ku{font-size:9.4pt;margin-left:1.4mm}
.pv-sum b{font-weight:600;white-space:nowrap}
.pv-sum .red b{color:#A5292B}
.pv-sum .t{border-top:1pt solid #1C1D1F;border-bottom:1.4pt solid #1C1D1F;padding:2.6mm 0}
.pv-sum .t>span:first-child{font-size:10pt;font-weight:700;color:#1C1D1F}
.pv-sum .t .ku{font-weight:400}
.pv-sum .t b{font-size:18pt;font-weight:800;line-height:1;color:#A5292B}
.pv-sum .t b em{font-style:normal;font-size:9pt;font-weight:700}
.pv-note{margin-top:4mm;font-size:8.4pt;flex:none}
.pv-note b{font-weight:700}
.pv-sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10mm;margin-top:auto;flex:none}
.pv-sign div{margin-top:21mm;border-top:.6pt solid #1C1D1F;padding-top:1.6mm;display:flex;justify-content:space-between;font-size:7.4pt;font-weight:500;color:#2E3136}
.pv-sign .ku{font-size:9pt;font-weight:400}
.pv-foot{display:flex;justify-content:space-between;gap:6mm;margin-top:6mm;padding-top:2mm;border-top:.4pt solid #C9CDD1;font-size:7.2pt;color:#6B7077;flex:none}
.pv-gap{margin-top:auto}
`;

type Fact = [label: string, ku: string, value: string];

interface Doc {
  title: string;
  titleKu: string;
  meta: Fact[];
  customer: Fact[];
  settings: PosSettings;
  footer: string;
}

const fact = ([label, ku, value]: Fact) =>
  `<div><small><span>${label}</span><span class="ku">${ku}</span></small><b dir="auto">${esc(value) || '&nbsp;'}</b></div>`;

/** The company and the invoice's own facts; who bought it on every page. */
function heading(doc: Doc): string {
  const { settings } = doc;
  const contact = ['www.vioappliance.com', ...settings.phone.split('\n'), ...settings.address.split('\n')].filter((l) => l.trim());
  const customer = doc.customer.filter((c) => c[2]);
  return (
    `<div class="pv-head"><div class="pv-brand">` +
    `<div class="pv-tab">${vioMarkSvg('#fff', '100%')}<span>SPECIAL TO YOUR HOME</span></div>` +
    `<div class="pv-co"><b>Vio Company</b>${contact.slice(0, 4).map((l) => `<div dir="auto">${esc(l.trim())}</div>`).join('')}</div></div>` +
    `<div class="pv-title"><b>${doc.title}</b><span class="ku">${doc.titleKu}</span></div></div>` +
    `<div class="pv-meta top" style="grid-template-columns:repeat(${doc.meta.length},auto)">${doc.meta.map(fact).join('')}</div>` +
    `<div class="pv-meta who" style="grid-template-columns:${['1.2fr', '1fr', '1.4fr'].slice(0, customer.length).join(' ')}">${customer.map(fact).join('')}</div>`
  );
}

const col = (widths: number[]) => `<colgroup>${widths.map((w) => `<col${w ? ` style="width:${w}mm"` : ''}>`).join('')}</colgroup>`;

const tableHead = (discounts: boolean) =>
  col(discounts ? [7, 14, 0, 15, 25, 23, 27] : [7, 15, 0, 18, 28, 31]) +
  `<thead><tr><th>No.</th><th></th><th>Item<span class="ku">کاڵا</span></th>` +
  `<th class="c">Qty<span class="ku">دانە</span></th>` +
  `<th class="r">Price<span class="ku">نرخ</span></th>` +
  (discounts ? `<th class="r">Discount<span class="ku">داشکاندن</span></th>` : '') +
  `<th class="r">Amount<span class="ku">کۆ</span></th></tr></thead>`;

/** Photos of items the owner added are kept with the item, not in each sale. */
const imageOf = (line: SaleLine, items: PosItem[]): string => photo(line.image || items.find((i) => i.id === line.itemId)?.image || '');

function itemCells(line: SaleLine, no: number, items: PosItem[]): string {
  const image = imageOf(line, items);
  const en = [line.name, line.color].filter(Boolean).join(' · ');
  const ku = [line.ku, line.color ? colorName(line.color, true) : ''].filter(Boolean).join('، ');
  return (
    `<td class="pv-no">${no}</td><td>${image ? `<img src="${esc(image)}" alt="">` : ''}</td>` +
    `<td><div class="pv-it"><span><b>${esc(line.code)}</b><small>${esc(en)}</small></span><span class="ku">${esc(ku)}</span></div></td>`
  );
}

const sumRow = (label: string, ku: string, value: string, cls = '') =>
  `<div class="${cls}"><span>${label}<span class="ku">${ku}</span></span><b>${value}</b></div>`;

const totalRow = (label: string, ku: string, amount: number) => sumRow(label, ku, `${num(amount)} <em>IQD</em>`, 't');

const signatures =
  `<div class="pv-sign"><div><span>Seller</span><span class="ku">واژووی فرۆشیار</span></div>` +
  `<div><span>Customer</span><span class="ku">واژووی کڕیار</span></div>` +
  `<div><span>Company stamp</span><span class="ku">مۆری کۆمپانیا</span></div></div>`;

function documentHtml(doc: Doc, rows: string[], discounts: boolean, end: string): string {
  const pages = pagesOf(rows);
  return `<div class="pv">${pages
    .map((page, i) => {
      const last = i === pages.length - 1;
      const compact = pages.length === 1 && page.length > ROWS.only;
      return (
        `<section class="pv-page">${heading(doc)}` +
        `<table class="pv-table${compact ? ' compact' : ''}">${tableHead(discounts)}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>` +
        (last ? end + signatures : '<div class="pv-gap"></div>') +
        `<div class="pv-foot"><span>Vio Company</span><span>${esc(doc.footer)}</span><span>Page ${i + 1} of ${pages.length}</span></div></section>`
      );
    })
    .join('')}</div>`;
}

const customerFacts = (sale: Sale): Fact[] => [
  ['Customer', 'کڕیار', sale.customerName],
  ['Mobile', 'ژمارەی مۆبایل', formatPhone(sale.customerPhone)],
  ['Address', 'ناونیشان', sale.customerAddress],
];

/** The invoice, as HTML (every value escaped). */
export function invoiceHtml(sale: Sale, settings: PosSettings, items: PosItem[]): string {
  const doc: Doc = {
    title: 'INVOICE',
    titleKu: 'پسوولەی فرۆشتن',
    meta: [
      ['Invoice no.', 'ژمارە', saleLabel(sale)],
      ['Date', 'بەروار', showDay(sale.soldAt)],
      ['Time', 'کات', showTime(sale.soldAt)],
      ['Dollar', 'دۆلار', rateText(sale.rate)],
      ...(sale.seller ? [['Seller', 'فرۆشیار', sale.seller] as Fact] : []),
    ],
    customer: customerFacts(sale),
    settings,
    footer: `Invoice ${saleLabel(sale)} · ${showDay(sale.soldAt)}`,
  };

  const discounts = sale.discount > 0;
  const rows = sale.lines.map((line, i) => {
    const back = returnedQty(sale, line.id);
    return (
      itemCells(line, i + 1, items) +
      `<td class="c q">${line.qty}${back ? `<span class="pv-back">Returned ${back}</span>` : ''}</td>` +
      // A price the seller raised is never printed as if it were an offer.
      `<td class="r">${line.price <= line.list && line.price < line.regular ? `<s>${num(line.regular)}</s>` : ''}${num(line.price)}</td>` +
      (discounts ? `<td class="r d">${line.discount ? num(-line.discount) : ''}</td>` : '') +
      `<td class="r a">${num(lineTotal(line))}</td>`
    );
  });

  const net = netTotal(sale);
  const guarantee =
    `<div class="pv-g"><h3><span>2-Year Guarantee</span><span class="ku">زەمانی دوو ساڵ</span></h3>` +
    `<dl><div><dt><span>From</span><span class="ku">لە</span></dt><dd>${showDay(sale.soldAt)}</dd></div>` +
    `<div><dt><span>Until</span><span class="ku">تا</span></dt><dd>${showDay(guaranteeEnd(sale.soldAt))}</dd></div></dl>` +
    `<p>Every item on this invoice has a 2-year electrical guarantee. Keep this invoice: it is your guarantee.</p>` +
    `<p class="ku">هەموو کاڵاکانی سەر ئەم پسوولەیە زەمانی کارەبایی دوو ساڵیان هەیە. تکایە پسوولەکە بپارێزە، ئەمە زەمانەکەتە.</p></div>`;
  const sum =
    `<div class="pv-sum">` +
    sumRow('Pieces', 'ژمارەی دانە', num(piecesOf(sale.lines))) +
    (sale.discount
      ? sumRow('Subtotal', 'کۆی نرخ', num(sale.subtotal)) + sumRow('Discount', 'داشکاندن', num(-sale.discount), 'red')
      : '') +
    (sale.refunded ? sumRow('Returned', 'گەڕاوە', num(-sale.refunded), 'red') : '') +
    totalRow('Total', 'کۆی گشتی', net) +
    sumRow('In dollars', 'بە دۆلار', usd(net / sale.rate)) +
    `</div>`;
  const end =
    `<div class="pv-end">${guarantee}${sum}</div>` +
    (sale.note ? `<div class="pv-note"><b>Note</b> <span dir="auto">${esc(sale.note)}</span></div>` : '');
  return documentHtml(doc, rows, discounts, end);
}

/** The note for one return. */
export function returnHtml(sale: Sale, ret: SaleReturn, settings: PosSettings, items: PosItem[]): string {
  const doc: Doc = {
    title: 'RETURN',
    titleKu: 'پسوولەی گەڕاندنەوە',
    meta: [
      ['Invoice no.', 'ژمارە', saleLabel(sale)],
      ['Sold on', 'فرۆشراوە لە', showDay(sale.soldAt)],
      ['Returned on', 'گەڕاوەتەوە لە', showDay(ret.at)],
      ['Time', 'کات', showTime(ret.at)],
      ...(ret.by ? [['Seller', 'فرۆشیار', ret.by] as Fact] : []),
    ],
    customer: customerFacts(sale),
    settings,
    footer: `Return from invoice ${saleLabel(sale)} · ${showDay(ret.at)}`,
  };
  const back = ret.lines.flatMap((b) => {
    const line = sale.lines.find((l) => l.id === b.id);
    return line ? [{ line, qty: b.qty }] : [];
  });
  const rows = back.map(({ line, qty }, i) => {
    const paid = paidFor(line, qty);
    return itemCells(line, i + 1, items) + `<td class="c q">${qty}</td><td class="r">${num(paid / qty)}</td><td class="r a">${num(paid)}</td>`;
  });
  const end =
    `<div class="pv-end"><div>${
      ret.reason ? `<div class="pv-note" style="margin-top:0"><b>Reason</b> <span dir="auto">${esc(ret.reason)}</span></div>` : ''
    }</div><div class="pv-sum">` +
    sumRow('Pieces', 'ژمارەی دانە', num(back.reduce((n, b) => n + b.qty, 0))) +
    totalRow('Money back', 'پارەی گەڕاوە', ret.refund) +
    `</div></div>`;
  return documentHtml(doc, rows, false, end);
}

// ── Printing ─────────────────────────────────────────────────────────────────

const ROOT_ID = 'vio-pos-print';
const STYLE_ID = 'vio-pos-print-style';

const within = <T>(work: Promise<T>, ms: number): Promise<T | void> =>
  Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, ms))]).catch(() => undefined);

/**
 * Prints A4 pages from inside the page itself (no pop-up to be blocked), once
 * its photos and letters are there. `title` names the file when it is saved as
 * a PDF. Two prints asked for together come one after the other.
 */
let queue: Promise<void> = Promise.resolve();

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
    ? [400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 12px Montserrat`)).concat(document.fonts.load('12px "Rabar 013"', 'پ'))
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
