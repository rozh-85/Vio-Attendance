import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from '@/brand';
import { formatDateTime } from '@/utils/time';

export interface EmployeeHoursPdfRow {
  name: string;
  totalHours: string;
}

/** Opens one print-ready PDF containing every employee and their total hours. */
export function exportEmployeeTotalsPdf(rows: EmployeeHoursPdfRow[]): void {
  const win = window.open('', '_blank');
  if (!win) return;
  const tableRows = rows
    .map(
      (
        row,
        index,
      ) => `<tr style="background:${index % 2 ? '#FBF6F6' : '#FFFFFF'}">
        <td>${escapeHtml(row.name)}</td>
        <td class="hours">${escapeHtml(row.totalHours)}</td>
      </tr>`,
    )
    .join('');

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" /><title>All Employee Hours</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #1F2937; font: 12px 'Segoe UI', Arial, sans-serif; }
  .head { display:flex; align-items:center; gap:14px; border-radius:12px; background:${BRAND.red}; color:white; padding:17px 20px; }
  .brand { font-size:22px; font-weight:800; }
  .title { margin-left:auto; text-align:right; }
  .title b { display:block; font-size:18px; }
  .title span { font-size:10px; opacity:.88; }
  .summary { margin:16px 2px 10px; color:#64748B; }
  table { width:100%; border-collapse:collapse; }
  th { padding:10px 12px; background:${BRAND.red}; color:white; text-align:left; text-transform:uppercase; letter-spacing:.5px; font-size:10px; }
  th:last-child { text-align:right; }
  td { padding:10px 12px; border-bottom:1px solid #F0E2E3; }
  td.hours { text-align:right; color:${BRAND.redDark}; font-weight:700; font-variant-numeric:tabular-nums; }
  tr { page-break-inside:avoid; }
  .foot { display:flex; justify-content:space-between; align-items:center; margin-top:14px; padding-top:8px; border-top:1px solid #EEE; color:#94A3B8; font-size:10px; }
</style></head><body>
  <div class="head">${logoSvgMarkup(42, 9)}<div class="brand">${escapeHtml(BRAND_NAME)}</div><div class="title"><b>All Employee Hours</b><span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span></div></div>
  <div class="summary">${rows.length} employees</div>
  <table><thead><tr><th>Employee</th><th>Total hours</th></tr></thead><tbody>${tableRows}</tbody></table>
  <div class="foot"><span>${escapeHtml(APP_NAME)}</span><span>Employee hours report</span></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)});</script>
</body></html>`);
  win.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
