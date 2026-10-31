import type { Place, PlaceOrderLink } from '@/services/places/types';
import type { SalesOrder } from '@/services/orders/types';
import { formatIqd, STATUS_LABEL } from '@/services/orders/options';
function esc(value: string): string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
export function exportGashbenPdf(places: Place[], links: PlaceOrderLink[], orders: SalesOrder[]): void {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const rows = places.map((p) => {
    const placeOrders = links.filter((l) => l.place_id === p.id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
    return `<tr><td>${esc(p.name)}</td><td>${esc(p.kind)}</td><td>${esc(p.person_name)}</td><td>${esc(p.phone)}</td><td>${esc(p.city)}</td><td>${p.reminder_date ? esc(p.reminder_date) : 'Automatic · 30 days'}</td><td>${placeOrders.length}</td><td>${esc(formatIqd(placeOrders.reduce((sum,o)=>sum+o.totalPrice,0)))}</td></tr>`;
  }).join('');
  const orderRows = links.map((l) => { const o = byId.get(l.order_id); const p = places.find((x) => x.id === l.place_id); return o && p ? `<tr><td>#${o.orderNo}</td><td>${esc(p.name)}</td><td>${esc(o.createdAt.slice(0,10))}</td><td>${esc(o.customerName)}</td><td>${esc([o.itemModel,o.itemCategory].filter(Boolean).join(' · '))}</td><td>${esc(formatIqd(o.totalPrice))}</td><td>${esc(STATUS_LABEL[o.status])}</td></tr>` : ''; }).join('');
  const win = window.open('', '_blank'); if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gashben places report</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033}h1{margin:0 0 4px;color:#841f21}p{color:#64748b}h2{margin-top:28px}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#f8fafc;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase}th,td{border-bottom:1px solid #e2e8f0;padding:7px} .num{text-align:right}</style></head><body><h1>Gashben places report</h1><p>${places.length} places · ${links.length} linked orders · generated ${new Date().toLocaleString('en-GB')}</p><h2>Places</h2><table><thead><tr><th>Place</th><th>Type</th><th>Contact</th><th>Phone</th><th>City</th><th>Next call</th><th>Orders</th><th>Total</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No places.</td></tr>'}</tbody></table><h2>Orders by place</h2><table><thead><tr><th>Order</th><th>Place</th><th>Date</th><th>Customer</th><th>Item</th><th>Total</th><th>Status</th></tr></thead><tbody>${orderRows || '<tr><td colspan="7">No linked orders.</td></tr>'}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`); win.document.close();
}
