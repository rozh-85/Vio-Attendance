import { format } from 'date-fns';
import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from '@/brand';
import { SHIFT_LABEL, STATUS_LABEL, countsAsSale, formatIqd } from '@/services/orders/options';
import { sellerOf, type Breakdown } from '@/services/orders/report';
import type { OrdersExportInput } from './ordersExcel';

const STATUS_PAINT: Record<string, string> = {
  new: 'color:#3730A3;background:#EEF2FF;',
  delivered: 'color:#0C7A43;background:#E6F7EE;',
  cancelled: 'color:#9F1239;background:#FFE4E6;',
  returned: 'color:#8A5A00;background:#FEF3C7;',
};

/**
 * Opens a print-ready, Vio-branded orders report in a new tab and starts the
 * print dialog, where it is saved as PDF — the same way as the attendance
 * reports. Kurdish names keep their own direction inside each cell.
 */
export function exportOrdersPdf(
  input: OrdersExportInput & { sellerColors: Map<string, string> },
): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(buildOrdersPdfHtml(input));
  win.document.close();
}

function bars(title: string, items: Breakdown[], total: number, limit = 8, colorOf?: (key: string) => string): string {
  const max = Math.max(1, ...items.map((i) => i.orders));
  const rows = items
    .slice(0, limit)
    .map((item) => {
      const color = colorOf?.(item.key) ?? BRAND.red;
      const share = total ? Math.round((item.sales / total) * 100) : 0;
      return `<div class="bar-row"><div class="bar-label" dir="auto">${esc(item.key)}</div><div class="bar-track"><div class="bar-fill" style="width:${(item.orders / max) * 100}%;background:${color}"></div></div><div class="bar-num">${item.orders}</div><div class="bar-money">${esc(formatIqd(item.sales))}<small>${share}%</small></div></div>`;
    })
    .join('');
  return `<section class="panel"><h3>${esc(title)}</h3>${rows || '<p class="empty">No orders.</p>'}</section>`;
}

export function buildOrdersPdfHtml({
  orders,
  summary,
  period,
  filterText,
  sellerColors,
}: OrdersExportInput & { sellerColors: Map<string, string> }): string {
  const colorOf = (key: string) => sellerColors.get(key) ?? BRAND.red;
  // The print window has no address of its own, so the font needs the full URL.
  const fontUrl = `${window.location.origin}/fonts/Rabar_013.ttf`;
  const shiftNames = summary.byShift.map((s) => ({
    ...s,
    key: s.key in SHIFT_LABEL ? SHIFT_LABEL[s.key as keyof typeof SHIFT_LABEL].en : 'Not set',
  }));

  const sellerRows = summary.bySeller
    .map((s) => {
      const share = summary.sales ? (s.sales / summary.sales) * 100 : 0;
      return `<tr><td><span class="dot" style="background:${colorOf(s.key)}"></span><b dir="auto">${esc(s.key)}</b></td><td class="num">${s.orders}</td><td class="num">${esc(formatIqd(s.sales))}</td><td class="num">${esc(formatIqd(s.orders ? s.sales / Math.max(1, s.orders) : 0))}</td><td><div class="share"><div style="width:${share}%;background:${colorOf(s.key)}"></div></div><small>${share.toFixed(1)}%</small></td></tr>`;
    })
    .join('');

  const orderRows = orders
    .map(
      (o) =>
        `<tr class="${countsAsSale(o.status) ? '' : 'void'}"><td class="num">#${o.orderNo}</td><td class="nowrap">${esc(format(new Date(o.createdAt), 'd MMM yy, HH:mm'))}</td><td><span class="dot" style="background:${colorOf(sellerOf(o))}"></span><span dir="auto">${esc(sellerOf(o))}</span></td><td dir="auto">${esc(o.customerName)}</td><td class="nowrap">${esc(o.customerPhone)}</td><td dir="auto">${esc(o.city)}</td><td dir="auto">${esc([o.itemModel, o.itemCategory].filter(Boolean).join(' · '))}</td><td class="num nowrap">${esc(formatIqd(o.totalPrice))}</td><td>${esc(o.platform)}</td><td><span class="pill" style="${STATUS_PAINT[o.status]}">${esc(STATUS_LABEL[o.status])}</span></td></tr>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Social media orders — ${esc(period)}</title>
<style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@font-face{font-family:'Rabar 013';src:url('${fontUrl}') format('truetype');font-display:block;unicode-range:U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200F}
html{color-scheme:light;background:#fff}
body{font-family:'Rabar 013','Segoe UI',Tahoma,Arial,sans-serif;color:#1f2937;background:#fff;font-size:11px;margin:0}
.band{display:flex;align-items:center;gap:16px;background:${BRAND.red};color:#fff;border-radius:12px;padding:16px 20px}
.brand{font-size:22px;font-weight:800}.sub{font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:.8}
.divider{width:1px;height:40px;background:#ffffff55}.title{font-size:19px;font-weight:700}.period{font-size:11px;opacity:.9;margin-top:3px}
.when{margin-left:auto;text-align:right;font-size:10px;opacity:.9}
.filters{margin:12px 2px;color:#6b7280}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px}
.kpi{border:1px solid ${BRAND.redLine};border-radius:10px;padding:10px 12px}
.kpi b{display:block;font-size:18px;font-variant-numeric:tabular-nums}.kpi span{color:#6b7280;font-size:10px}
.kpi.main{background:${BRAND.redTint}}.kpi.main b{color:${BRAND.redDark}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.panel{border:1px solid #eee;border-radius:10px;padding:10px 12px;break-inside:avoid}
.panel h3{margin:0 0 8px;font-size:12px;color:${BRAND.redDark};text-transform:uppercase;letter-spacing:.6px}
.bar-row{display:grid;grid-template-columns:120px 1fr 34px 120px;gap:8px;align-items:center;margin:4px 0}
[dir=auto]{text-align:left}
.bar-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-track{height:8px;background:#f3f4f6;border-radius:6px;overflow:hidden}
.bar-fill{height:100%;border-radius:6px}.bar-num{text-align:right;font-weight:700}.bar-money{text-align:right;font-variant-numeric:tabular-nums}
.bar-money small{color:#9ca3af;margin-left:5px}
table{width:100%;border-collapse:collapse}
th{background:${BRAND.red};color:#fff;text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.5px;padding:7px 8px}
td{padding:6px 8px;border-bottom:1px solid #f0e2e3;vertical-align:top}
td.num{text-align:right;font-variant-numeric:tabular-nums}.nowrap{white-space:nowrap}
tr.void td{color:#9ca3af;text-decoration:line-through}tr.void td .pill{text-decoration:none}
tfoot td{font-weight:800;background:${BRAND.redTint};border-top:2px solid ${BRAND.red}}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.pill{display:inline-block;border-radius:99px;padding:2px 8px;font-weight:700;font-size:9px}
.share{display:inline-block;width:110px;height:8px;background:#f3f4f6;border-radius:6px;overflow:hidden;vertical-align:middle;margin-right:6px}.share div{height:100%}
h2{font-size:14px;margin:14px 2px 8px}
.empty{color:#9ca3af}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #eee;color:#9ca3af;font-size:9px;display:flex;justify-content:space-between}
thead{display:table-header-group}tr{break-inside:avoid}
</style></head><body>
<div class="band"><div>${logoSvgMarkup(40, 10)}</div><div><div class="brand">${esc(BRAND_NAME)}</div><div class="sub">${esc(APP_NAME)}</div></div><div class="divider"></div><div><div class="title">Social media orders</div><div class="period">${esc(period)}</div></div><div class="when">Generated<br><b>${esc(format(new Date(), 'd MMM yyyy, hh:mm a'))}</b></div></div>
<div class="filters">${esc(filterText || 'All sellers · no other filters')}</div>
<div class="kpis">
<div class="kpi"><b>${summary.orders}</b><span>Orders</span></div>
<div class="kpi main"><b>${esc(formatIqd(summary.sales))}</b><span>Sales (cancelled &amp; returned not counted)</span></div>
<div class="kpi"><b>${esc(formatIqd(summary.average))}</b><span>Average order</span></div>
<div class="kpi"><b>${summary.byStatus.delivered}</b><span>Delivered</span></div>
<div class="kpi"><b>${summary.byStatus.cancelled + summary.byStatus.returned}</b><span>Cancelled or returned</span></div>
<div class="kpi"><b>${summary.returningCustomers}</b><span>Customers who ordered again</span></div>
</div>
<section class="panel" style="margin-bottom:12px"><h3>By seller</h3><table><thead><tr><th>Seller</th><th style="text-align:right">Orders</th><th style="text-align:right">Sales</th><th style="text-align:right">Per order</th><th>Share of sales</th></tr></thead><tbody>${sellerRows || '<tr><td colspan="5" class="empty">No orders.</td></tr>'}</tbody></table></section>
<div class="grid">${bars('By platform', summary.byPlatform, summary.sales)}${bars('By city', summary.byCity, summary.sales)}${bars('Top categories', summary.byCategory, summary.sales)}${bars('By shift', shiftNames, summary.sales)}</div>
<h2>Orders (${orders.length})</h2>
<table><thead><tr><th>#</th><th>Date</th><th>Seller</th><th>Customer</th><th>Phone</th><th>City</th><th>Item</th><th style="text-align:right">Price</th><th>Platform</th><th>Status</th></tr></thead>
<tbody>${orderRows || '<tr><td colspan="10" class="empty">No orders match these filters.</td></tr>'}</tbody>
<tfoot><tr><td colspan="7">Total — ${summary.saleOrders} sales of ${summary.orders} orders</td><td class="num nowrap">${esc(formatIqd(summary.sales))}</td><td colspan="2"></td></tr></tfoot></table>
<div class="foot"><span>${logoSvgMarkup(14, 3)} ${esc(APP_NAME)} · Private owner report</span><span>${esc(period)}</span></div>
<script>window.addEventListener('load',()=>(document.fonts?document.fonts.ready:Promise.resolve()).then(()=>setTimeout(()=>window.print(),300)));</script>
</body></html>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
