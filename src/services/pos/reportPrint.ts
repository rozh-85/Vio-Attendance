import { format, parseISO } from 'date-fns';
import { categoryName, photo } from './items';
import { num, usd } from './logic';
import { INVOICE_CSS, bandHtml, dinars, esc, printPages } from './print';
import { describeDays, type Report } from './report';
import type { PosItem, PosSettings } from './types';

/** The report on A4, in the invoice's own look: the red band, the figures, then every item with its photo. */
const CSS = `${INVOICE_CSS}
.pr-sub{flex:none;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;margin-top:6mm;padding:0 2mm}
.pr-sub b{display:block;font-size:12.5pt;font-weight:700;line-height:1.4}
.pr-sub span{display:block;margin-top:.4mm;font-size:9.4pt;color:var(--mid)}
.pr-sub .e{text-align:left}
.pr-figs{flex:none;display:grid;grid-template-columns:1.35fr repeat(4,1fr);gap:3mm;margin-top:5mm}
.pr-figs div{border-radius:2.6mm;background:var(--panel);padding:3.2mm 3.8mm;min-width:0}
.pr-figs div:first-child{background:var(--red);color:#fff}
.pr-figs small{display:block;font-size:8.6pt;color:var(--soft)}
.pr-figs div:first-child small,.pr-figs div:first-child i,.pr-figs div:first-child .pv-cur{color:rgba(255,255,255,.85)}
.pr-figs b{display:block;margin-top:.4mm;font-size:13pt;font-weight:700;line-height:1.25;white-space:nowrap}
.pr-figs i{display:block;margin-top:.2mm;font-style:normal;font-size:8.2pt;color:var(--soft);white-space:nowrap}
.pr-t td{height:10.4mm;padding-top:.6mm;padding-bottom:.6mm}
.pr-t .pv-pic{width:8.6mm;height:8.6mm;border-radius:1.8mm}.pr-t .pv-pic img{width:7.4mm;height:7.4mm}
.pr-t td.g{font-size:8.8pt;color:var(--mid);white-space:nowrap;text-overflow:ellipsis}
.pr-t .pv-it b{font-size:9pt}.pr-t .pv-it small{font-size:8pt;line-height:1.3}
.pr-t tfoot td{height:11mm;border-bottom:0;background:var(--panel);font-weight:700;font-size:10pt}
`;

/** Rows on the first page, under the figures, and on the next ones. */
const FIRST = 16;
const NEXT = 20;

const day = (key: string) => format(parseISO(key), 'dd/MM/yyyy');

/** The days of the report, in Kurdish. */
function kurdishDays({ from, to }: { from: string; to: string }): string {
  if (!from && !to) return 'هەموو کات';
  if (from === to) return `<bdi class="ltr">${day(from)}</bdi>`;
  if (!from) return `تا <bdi class="ltr">${day(to)}</bdi>`;
  if (!to) return `لە <bdi class="ltr">${day(from)}</bdi>`;
  return `<bdi class="ltr">${day(from)} – ${day(to)}</bdi>`;
}

/** The report's items and figures, on A4. */
export function printReport(report: Report, filters: string, items: PosItem[], settings: PosSettings): Promise<void> {
  const period = kurdishDays(report.days);
  const figures: [string, string, string][] = [
    ['کۆی فرۆشتن', dinars(report.net), `<bdi class="ltr">${usd(report.netUsd)}</bdi>`],
    ['کاڵای فرۆشراو', num(report.sold), report.returned ? `<bdi class="ltr">${num(report.returned)}</bdi> گەڕاوە` : 'هیچ نەگەڕاوە'],
    ['پسوولەکان', num(report.invoices), `<bdi class="ltr">${num(report.customers)}</bdi> کڕیار`],
    ['داشکاندن', dinars(report.discount), '&nbsp;'],
    ['پارەی گەڕاوە', dinars(report.refunded), '&nbsp;'],
  ];
  const rows = report.items.map((r) => {
    const image = photo(r.image || items.find((x) => x.id === r.itemId)?.image || '');
    return (
      `<td><div class="pv-pic">${image ? `<img src="${esc(image)}" alt="">` : ''}</div></td>` +
      `<td class="k"><bdi class="ltr">${esc(r.code)}</bdi></td>` +
      `<td><div class="pv-it"><b>${esc([r.name, r.color].filter(Boolean).join(' · '))}</b></div></td>` +
      `<td class="g">${esc(categoryName(r.category, true))}</td><td class="c q">${r.sold}</td><td class="c">${r.returned || '—'}</td>` +
      `<td class="v d">${r.discount ? dinars(r.discount) : ''}</td><td class="v a">${dinars(r.net)}</td>`
    );
  });
  const pages: string[][] = [rows.slice(0, FIRST)];
  for (let at = FIRST; at < rows.length; at += NEXT) pages.push(rows.slice(at, at + NEXT));

  const head =
    `<colgroup><col style="width:13mm"><col style="width:23mm"><col><col style="width:27mm"><col style="width:15mm"><col style="width:15mm"><col style="width:24mm"><col style="width:28mm"></colgroup>` +
    `<thead><tr><th>وێنە</th><th>کۆد</th><th>کاڵا</th><th>جۆر</th><th class="c">فرۆشراو</th><th class="c">گەڕاوە</th><th>داشکاندن</th><th>کۆ</th></tr></thead>`;
  const foot =
    `<tfoot><tr><td></td><td colspan="3">کۆی گشتی</td><td class="c">${num(report.sold)}</td><td class="c">${report.returned || '—'}</td>` +
    `<td class="v d">${report.discount ? dinars(report.discount) : ''}</td><td class="v a">${dinars(report.net)}</td></tr></tfoot>`;
  const printed = format(new Date(), 'dd/MM/yyyy HH:mm');

  const html = `<div class="pv">${pages
    .map(
      (page, i) =>
        `<section class="pv-page">${bandHtml(settings, 'ڕاپۆرتی فرۆشتن')}` +
        `<div class="pr-sub"><div><b>${period}</b><span dir="auto">${esc(filters || 'هەموو کاڵا و جۆرەکان')}</span></div>` +
        `<div class="e"><span>چاپکراوە <bdi class="ltr">${printed}</bdi></span></div></div>` +
        (i === 0 ? `<div class="pr-figs">${figures.map(([l, v, n]) => `<div><small>${l}</small><b>${v}</b><i>${n}</i></div>`).join('')}</div>` : '') +
        `<div class="pv-bar"><span>کاڵاکان</span><span><bdi class="ltr">${num(report.items.length)}</bdi> جۆر کاڵا</span></div>` +
        `<table class="pv-table pr-t">${head}<tbody>${page.map((r) => `<tr>${r}</tr>`).join('')}</tbody>${i === pages.length - 1 ? foot : ''}</table>` +
        `<div class="pv-gap"></div><div class="pv-foot"><span class="ltr">Vio Company · www.vioappliance.com</span><span>ڕاپۆرتی فرۆشتن · ${period}</span><span>پەڕەی <bdi class="ltr">${i + 1} / ${pages.length}</bdi></span></div></section>`,
    )
    .join('')}</div>`;
  return printPages(html, `Vio sales report ${describeDays(report.days).replace(/\//g, '-')}`, CSS);
}
