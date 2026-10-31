import type { Place, PlaceCall, PlaceOrderLink } from '@/services/places/types';
import { baghdadDay, reminderDay } from '@/services/places/types';
import type { SalesOrder } from '@/services/orders/types';
import { formatIqd, STATUS_LABEL } from '@/services/orders/options';
function esc(value: string): string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/** Opens a printable A4 report of the given places (all, a filtered set, or one) for Save as PDF. */
export function exportGashbenPdf(places: Place[], links: PlaceOrderLink[], orders: SalesOrder[], calls: PlaceCall[] = []): void {
  const today = baghdadDay();
  const ids = new Set(places.map((p) => p.id));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const placeLinks = links.filter((l) => ids.has(l.place_id));
  const ordersOf = (id: string) => placeLinks.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
  const sorted = [...places].sort((a, b) => reminderDay(a).localeCompare(reminderDay(b)));
  const due = places.filter((p) => reminderDay(p) <= today).length;
  const value = places.reduce((sum, p) => sum + ordersOf(p.id).reduce((s, o) => s + o.totalPrice, 0), 0);

  const rows = sorted.map((p) => {
    const list = ordersOf(p.id);
    const late = reminderDay(p) <= today;
    return `<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.kind)}</span></td><td>${esc(p.person_name)}</td><td>${esc(p.phone)}</td><td>${esc(p.city)}</td><td class="${late ? 'due' : ''}">${esc(reminderDay(p))}${late ? ' · due' : ''}<br><span class="muted">${p.reminder_date ? 'Manual' : 'Auto 30 days'}</span></td><td class="num">${list.length}</td><td class="num">${esc(formatIqd(list.reduce((s, o) => s + o.totalPrice, 0)))}</td></tr>`;
  }).join('');
  const orderRows = placeLinks.map((l) => { const o = byId.get(l.order_id); const p = places.find((x) => x.id === l.place_id); return o && p ? `<tr><td>#${o.orderNo}</td><td>${esc(p.name)}</td><td>${esc(o.createdAt.slice(0,10))}</td><td>${esc(o.customerName)}</td><td>${esc([o.itemModel,o.itemCategory].filter(Boolean).join(' · '))}</td><td class="num">${esc(formatIqd(o.totalPrice))}</td><td>${esc(STATUS_LABEL[o.status])}</td></tr>` : ''; }).join('');
  const callRows = calls.filter((c) => ids.has(c.place_id)).sort((a, b) => b.called_at.localeCompare(a.called_at)).map((c) => `<tr><td>${esc(new Date(c.called_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' }))}</td><td>${esc(places.find((p) => p.id === c.place_id)?.name ?? '')}</td><td>${esc(c.note || 'Call completed')}</td></tr>`).join('');
  const title = places.length === 1 ? `Gashben · ${places[0].name}` : 'Gashben places report';

  const win = window.open('', '_blank'); if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0}h1{margin:0 0 4px;color:#841f21;font-size:22px}p{color:#64748b;margin:0}h2{margin:24px 0 8px;font-size:15px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}.stat{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}.stat b{display:block;font-size:20px}.stat span{color:#64748b;font-size:11px}table{border-collapse:collapse;width:100%;font-size:11px}th{background:#f8fafc;text-align:left;color:#64748b;font-size:10px;text-transform:uppercase}th,td{border-bottom:1px solid #e2e8f0;padding:7px;vertical-align:top}.num{text-align:right}.muted{color:#94a3b8;font-size:10px}.due{color:#be123c;font-weight:bold}tr{page-break-inside:avoid}</style></head><body><h1>${esc(title)}</h1><p>Generated ${esc(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' }))}</p><div class="stats"><div class="stat"><b>${places.length}</b><span>Places</span></div><div class="stat"><b>${due}</b><span>Calls due</span></div><div class="stat"><b>${placeLinks.length}</b><span>Linked orders</span></div><div class="stat"><b>${esc(formatIqd(value))}</b><span>Order value</span></div></div><h2>Places</h2><table><thead><tr><th>Place</th><th>Contact</th><th>Phone</th><th>City</th><th>Next call</th><th class="num">Orders</th><th class="num">Total</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No places.</td></tr>'}</tbody></table><h2>Orders by place</h2><table><thead><tr><th>Order</th><th>Place</th><th>Date</th><th>Customer</th><th>Item</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${orderRows || '<tr><td colspan="7">No linked orders.</td></tr>'}</tbody></table><h2>Call history</h2><table><thead><tr><th>When</th><th>Place</th><th>Notes</th></tr></thead><tbody>${callRows || '<tr><td colspan="3">No calls recorded.</td></tr>'}</tbody></table><script>window.onload=()=>window.print();</script></body></html>`); win.document.close();
}
