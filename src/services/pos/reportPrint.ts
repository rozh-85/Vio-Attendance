import { format } from 'date-fns';
import { categoryName, photo } from './items';
import { num, usd } from './logic';
import { INVOICE_CSS, esc, headHtml, printPages } from './print';
import { describeDays, type Report } from './report';
import type { PosItem, PosSettings } from './types';

const CSS = `${INVOICE_CSS}
.pr-sub{margin-top:6mm;font-size:9.4pt;color:var(--mid);flex:none}
.pr-sub b{font-weight:700;color:var(--ink);font-size:12pt;display:block;margin-bottom:.6mm}
.pr-figs{display:grid;grid-template-columns:1.35fr repeat(4,1fr);gap:3mm;margin-top:4mm;flex:none}
.pr-figs div{border-radius:3mm;background:var(--panel);padding:3.4mm 3.8mm;min-width:0}
.pr-figs div:first-child{background:var(--red);color:#fff}
.pr-figs small{display:block;font-size:7.4pt;color:var(--soft)}
.pr-figs div:first-child small,.pr-figs div:first-child i{color:rgba(255,255,255,.85)}
.pr-figs b{display:block;margin-top:.6mm;font-size:13pt;font-weight:700;line-height:1.2;white-space:nowrap}
.pr-figs b em{font-style:normal;font-size:7.4pt;font-weight:600}
.pr-figs i{display:block;margin-top:.4mm;font-style:normal;font-size:7.4pt;color:var(--soft)}
.pr-t{margin-top:5mm}
.pr-t td{height:10mm}
.pr-t .pv-pic{width:8.4mm;height:8.4mm;border-radius:1.8mm}.pr-t .pv-pic img{width:7.2mm;height:7.2mm}
.pr-t td.n b{display:block;font-size:9pt;font-weight:700;line-height:1.25;white-space:nowrap}
.pr-t td.n small{display:block;font-size:7.4pt;line-height:1.3;color:var(--mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-t td.g{font-size:7.8pt;color:var(--mid);white-space:nowrap;text-overflow:ellipsis}
.pr-t tfoot td{height:11mm;border-bottom:0;background:var(--panel);font-weight:700;font-size:10pt}
.pr-t tfoot td:first-child{border-radius:2.6mm 0 0 2.6mm}.pr-t tfoot td:last-child{border-radius:0 2.6mm 2.6mm 0}
`;

/** Rows on the first page, under the figures, and on the next ones. */
const FIRST = 17;
const NEXT = 20;

/** The report's items and figures, on A4. */
export function printReport(report: Report, filters: string, items: PosItem[], settings: PosSettings): Promise<void> {
  const period = describeDays(report.days);
  const figures: [string, string, string][] = [
    ['Net sales', `${num(report.net)} <em>IQD</em>`, usd(report.netUsd)],
    ['Items sold', num(report.sold), report.returned ? `${num(report.returned)} came back` : 'none came back'],
    ['Invoices', num(report.invoices), report.customers === 1 ? '1 customer' : `${num(report.customers)} customers`],
    ['Discounts', num(report.discount), 'IQD'],
    ['Given back', num(report.refunded), 'IQD'],
  ];
  const rows = report.items.map((r) => {
    const image = photo(r.image || items.find((x) => x.id === r.itemId)?.image || '');
    return (
      `<td><div class="pv-pic">${image ? `<img src="${esc(image)}" alt="">` : ''}</div></td>` +
      `<td class="n"><b>${esc(r.code)}</b><small>${esc([r.name, r.color].filter(Boolean).join(' · '))}</small></td>` +
      `<td class="g">${esc(categoryName(r.category))}</td><td class="c q">${r.sold}</td><td class="c">${r.returned || '—'}</td>` +
      `<td class="r d">${r.discount ? num(r.discount) : ''}</td><td class="r a">${num(r.net)}</td>`
    );
  });
  const pages: string[][] = [rows.slice(0, FIRST)];
  for (let at = FIRST; at < rows.length; at += NEXT) pages.push(rows.slice(at, at + NEXT));

  const head =
    `<colgroup><col style="width:16mm"><col><col style="width:36mm"><col style="width:14mm"><col style="width:19mm"><col style="width:22mm"><col style="width:30mm"></colgroup>` +
    `<thead><tr><th colspan="2">Item</th><th>Category</th><th class="c">Sold</th><th class="c">Returned</th><th class="r">Discount</th><th class="r">Net IQD</th></tr></thead>`;
  const foot = `<tfoot><tr><td></td><td>Total</td><td></td><td class="c">${num(report.sold)}</td><td class="c">${report.returned || '—'}</td><td class="r">${report.discount ? num(report.discount) : ''}</td><td class="r">${num(report.net)}</td></tr></tfoot>`;

  const html = `<div class="pv">${pages
    .map(
      (page, i) =>
        `<section class="pv-page">${headHtml(settings, 'Sales report', 'ڕاپۆرتی فرۆشتن')}` +
        `<div class="pr-sub"><b>${esc(period)}</b>${esc(filters || 'All items and categories')}</div>` +
        (i === 0 ? `<div class="pr-figs">${figures.map(([l, v, n]) => `<div><small>${l}</small><b>${v}</b><i>${n}</i></div>`).join('')}</div>` : '') +
        `<table class="pv-table pr-t">${head}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody>${i === pages.length - 1 ? foot : ''}</table>` +
        `<div class="pv-gap"></div><div class="pv-foot"><span>Vio Company</span><span>Printed ${format(new Date(), 'dd/MM/yyyy HH:mm')}</span><span>Page ${i + 1} of ${pages.length}</span></div></section>`,
    )
    .join('')}</div>`;
  return printPages(html, `Vio sales report ${period.replace(/\//g, '-')}`, CSS);
}
