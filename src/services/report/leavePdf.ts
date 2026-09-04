import type { Employee, LeaveRecord } from '@/types';
import { formatDateTime } from '@/utils/time';
import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from '@/brand';

export function exportLeavePdf(
  employee: Employee,
  year: number,
  allowance: number,
  records: LeaveRecord[],
): void {
  const win = window.open('', '_blank');
  if (!win) return;
  const used = records.reduce((sum, record) => sum + record.days, 0);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Leave summary — ${esc(employee.fullName)}</title>
  <style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;font-size:12px}.band{display:flex;align-items:center;gap:16px;background:${BRAND.red};color:#fff;border-radius:12px;padding:18px 22px}.brand{font-size:24px;font-weight:800}.sub{font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:.8}.divider{width:1px;height:42px;background:#ffffff55}.title{font-size:20px;font-weight:700}.period{font-size:11px;opacity:.9;margin-top:3px}.when{margin-left:auto;text-align:right;font-size:10px;opacity:.9}.employee{margin:18px 2px 12px}.employee h2{font-size:18px;margin:0 0 4px}.meta{color:#6b7280}.stats{display:flex;gap:10px;margin-bottom:18px}.stat{flex:1;border:1px solid ${BRAND.redLine};border-radius:10px;padding:11px 14px}.stat b{display:block;font-size:21px}.stat span{color:#6b7280;font-size:10px}.used b{color:${BRAND.redDark}}.remaining b{color:#0c7a43}table{width:100%;border-collapse:collapse}th{background:${BRAND.red};color:#fff;text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.5px;padding:9px 10px}td{padding:9px 10px;border-bottom:1px solid #f0e2e3}td.num{font-variant-numeric:tabular-nums}.foot{margin-top:18px;padding-top:8px;border-top:1px solid #eee;color:#9ca3af;font-size:10px;display:flex;justify-content:space-between}
  </style></head><body><div class="band"><div>${logoSvgMarkup(42,10)}</div><div><div class="brand">${esc(BRAND_NAME)}</div><div class="sub">${esc(APP_NAME)}</div></div><div class="divider"></div><div><div class="title">Leave Summary</div><div class="period">${year}</div></div><div class="when">Generated<br><b>${esc(formatDateTime(new Date().toISOString()))}</b></div></div>
  <div class="employee"><h2>${esc(employee.fullName)} <small>(${esc(employee.code)})</small></h2><div class="meta">${esc([employee.position, employee.phone].filter(Boolean).join(' · '))}</div></div>
  <div class="stats"><div class="stat"><b>${allowance}</b><span>Total leave days</span></div><div class="stat used"><b>${used}</b><span>Used days</span></div><div class="stat remaining"><b>${allowance - used}</b><span>Remaining days</span></div></div>
  <table><thead><tr><th>Date</th><th>Days</th><th>Note</th></tr></thead><tbody>${records.length ? records.map((r) => `<tr><td>${esc(r.date)}</td><td class="num">${r.days}</td><td>${esc(r.note || '—')}</td></tr>`).join('') : '<tr><td colspan="3">No leave recorded for this year.</td></tr>'}</tbody></table>
  <div class="foot"><span>${logoSvgMarkup(15,3)} ${esc(APP_NAME)}</span><span>${esc(employee.fullName)} · ${year}</span></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
  win.document.close();
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
