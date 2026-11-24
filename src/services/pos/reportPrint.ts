import { format } from 'date-fns';
import { categoryName, photo } from './items';
import { num, usd } from './logic';
import { vioMarkSvg } from './logo';
import { INVOICE_CSS, printPages } from './print';
import { describeDays, type Report } from './report';
import type { PosItem } from './types';

const esc = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c);

const CSS = `${INVOICE_CSS}
.pr-figs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:.6pt solid #1C1D1F;flex:none}
.pr-figs div{padding:2.4mm 3mm;border-left:.4pt solid #C9CDD1;border-top:.4pt solid #C9CDD1}
.pr-figs div:nth-child(3n+1){border-left:0;padding-left:0}
.pr-figs div:nth-child(-n+3){border-top:0}
.pr-figs small{display:block;font-size:6.8pt;font-weight:600;color:#6B7077}
.pr-figs b{display:block;font-size:13pt;font-weight:800;line-height:1.25;white-space:nowrap}
.pr-figs b em{font-style:normal;font-size:7pt;font-weight:700}
.pr-t td{height:9.2mm}.pr-t img{width:8mm;height:8mm}
.pr-t td b{font-size:9pt;font-weight:700}
.pr-t td:nth-child(4){font-size:8pt}
.pr-t td small{font-size:7.6pt;color:#4A4E54;margin-left:2mm}
.pr-t tfoot td{border-top:1pt solid #1C1D1F;border-bottom:1.4pt solid #1C1D1F;font-weight:800}
`;

/** Rows on the first page, under the figures, and on the next ones. */
const FIRST = 20;
const NEXT = 24;

/** The report's items and figures, on A4. */
export function printReport(report: Report, filters: string, items: PosItem[]): Promise<void> {
  const period = describeDays(report.days);
  const figures: [string, string][] = [
    ['Net sales', `${num(report.net)} <em>IQD</em>`],
    ['In dollars', usd(report.netUsd)],
    ['Invoices', num(report.invoices)],
    ['Items sold', num(report.sold)],
    ['Discounts', num(report.discount)],
    ['Returned', `${num(report.refunded)} <em>${report.returned} pcs</em>`],
  ];
  const rows = report.items.map((r, i) => {
    const image = photo(r.image || items.find((x) => x.id === r.itemId)?.image || '');
    return (
      `<td class="pv-no">${i + 1}</td><td>${image ? `<img src="${esc(image)}" alt="">` : ''}</td>` +
      `<td><b>${esc(r.code)}</b><small>${esc([r.name, r.color].filter(Boolean).join(' · '))}</small></td>` +
      `<td>${esc(categoryName(r.category))}</td><td class="c q">${r.sold}</td><td class="c">${r.returned || ''}</td>` +
      `<td class="r">${r.discount ? num(r.discount) : ''}</td><td class="r a">${num(r.net)}</td>`
    );
  });
  const pages: string[][] = [rows.slice(0, FIRST)];
  for (let at = FIRST; at < rows.length; at += NEXT) pages.push(rows.slice(at, at + NEXT));

  const head =
    `<colgroup><col style="width:7mm"><col style="width:11mm"><col><col style="width:34mm"><col style="width:13mm"><col style="width:17mm"><col style="width:22mm"><col style="width:27mm"></colgroup>` +
    `<thead><tr><th>No.</th><th></th><th>Item</th><th>Category</th><th class="c">Sold</th><th class="c">Returned</th><th class="r">Discount</th><th class="r">Net IQD</th></tr></thead>`;
  const foot = `<tfoot><tr><td></td><td></td><td>Total</td><td></td><td class="c">${num(report.sold)}</td><td class="c">${report.returned || ''}</td><td class="r">${report.discount ? num(report.discount) : ''}</td><td class="r">${num(report.net)}</td></tr></tfoot>`;

  const html = `<div class="pv">${pages
    .map(
      (page, i) =>
        `<section class="pv-page"><div class="pv-head"><div class="pv-brand"><div class="pv-tab">${vioMarkSvg('#fff', '100%')}<span>SPECIAL TO YOUR HOME</span></div>` +
        `<div class="pv-co"><b>Vio Company</b><div>${esc(period)}</div><div>${esc(filters || 'All items and sellers')}</div></div></div>` +
        `<div class="pv-title"><b>POS REPORT</b><span class="ku">ڕاپۆرتی فرۆشتن</span></div></div>` +
        (i === 0
          ? `<div class="pr-figs" style="border-top:1.4pt solid #1C1D1F">${figures.map(([l, v]) => `<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>`
          : '') +
        `<table class="pv-table pr-t">${head}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody>${i === pages.length - 1 ? foot : ''}</table>` +
        `<div class="pv-gap"></div><div class="pv-foot"><span>Vio Company</span><span>Printed ${format(new Date(), 'dd/MM/yyyy HH:mm')}</span><span>Page ${i + 1} of ${pages.length}</span></div></section>`,
    )
    .join('')}</div>`;
  return printPages(html, `Vio POS report ${period.replace(/\//g, '-')}`, CSS);
}
