import { formatDateTime } from '@/utils/time';
import type { Employee } from '@/types';
import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from '@/brand';

export interface EmployeePdfRow {
  session: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: 'Present' | 'Not checked out' | 'Absent' | 'Not registered yet';
  /**
   * The supervisor's mark, e.g. "Off" or "Overtime". On an absent row it is
   * printed instead of "Absent"; on any other row, next to the status.
   */
  mark?: string;
  hours: string;
}

export interface EmployeePdfStats {
  totalSessions: number;
  attended: number;
  /** Sessions the employee attended but never checked out of. */
  notCheckedOut: number;
  /** Missed sessions without a mark to explain them. */
  absent: number;
  /** Missed sessions the supervisor marked off, on leave, not their shift, … */
  excused: number;
  totalHours: string;
  /** The slice of time the report covers, e.g. "August 2026". */
  period: string;
}

/**
 * Opens a print-ready, Vio-branded report for one employee in a new tab and
 * triggers the browser's print dialog so the supervisor can save it as PDF.
 *
 * The Vio logo is drawn inline (see `logoSvgMarkup` in src/brand.ts) rather
 * than linked, so it is guaranteed to be on the page by the time the print
 * dialog opens — and it survives being saved to PDF.
 */
export function exportEmployeePdf(
  employee: Employee,
  stats: EmployeePdfStats,
  rows: EmployeePdfRow[],
): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(buildEmployeePdfHtml(employee, stats, rows));
  win.document.close();
}

const RED = BRAND.red;
const RED_DARK = BRAND.redDark;
const RED_TINT = BRAND.redTint;

/** Green attended, amber attended-but-never-checked-out, red absent. */
const GREEN = '#0C7A43';
const AMBER = '#8A5A00';
const STATUS_PAINT: Record<EmployeePdfRow['status'], string> = {
  Present: `color:${GREEN};background:#E6F7EE;`,
  'Not checked out': `color:${AMBER};background:#FDF1CF;`,
  Absent: `color:${RED_DARK};background:${RED_TINT};`,
  'Not registered yet': 'color:#6B7280;background:#F1F5F9;',
};

/** Violet for the supervisor's marks, apart from every status colour. */
const VIOLET = '#6D28D9';
const MARK_PAINT = `color:${VIOLET};background:#F3EFFE;`;

function badge(text: string, paint: string): string {
  return `<span class="badge" style="${paint}">${esc(text)}</span>`;
}

/** The printable document itself, so it can be rendered without printing it. */
export function buildEmployeePdfHtml(
  employee: Employee,
  stats: EmployeePdfStats,
  rows: EmployeePdfRow[],
): string {
  const tableRows = rows
    .map((row, index) => {
      const missing = row.status === 'Not checked out';
      // A mark on a missed session says why they were away, so it replaces
      // "Absent"; on an attended one it is printed beside the status.
      const statusCell =
        row.mark && (row.status === 'Absent' || row.status === 'Not registered yet')
          ? badge(row.mark, MARK_PAINT)
          : badge(row.status, STATUS_PAINT[row.status]) +
            (row.mark ? ` ${badge(row.mark, MARK_PAINT)}` : '');
      return `<tr style="background:${index % 2 === 0 ? '#FFFFFF' : '#FBF6F6'}">
        <td>${esc(row.session)}</td>
        <td>${esc(row.date)}</td>
        <td class="num">${esc(row.checkIn)}</td>
        <td class="num${missing ? ' missing' : ''}">${esc(row.checkOut)}</td>
        <td>${statusCell}</td>
        <td class="num">${esc(row.hours)}</td>
      </tr>`;
    })
    .join('');
  const anyMark = rows.some((row) => row.mark);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Attendance — ${esc(employee.fullName)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1F2937; font-size: 12px; }
  .band { display: flex; align-items: center; gap: 18px; background: ${RED}; color: #fff; border-radius: 12px; padding: 18px 22px; }
  .logo { flex-shrink: 0; line-height: 0; }
  .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; white-space: nowrap; }
  .brand-sub { font-size: 9.5px; letter-spacing: 2.5px; text-transform: uppercase; opacity: .85; margin-top: 2px; }
  .divider { width: 1px; height: 44px; background: rgba(255,255,255,.35); }
  .band .title { font-size: 21px; font-weight: 700; letter-spacing: .2px; }
  .band .period { margin-top: 3px; font-size: 11px; opacity: .9; }
  .band .when { margin-left: auto; text-align: right; font-size: 10.5px; opacity: .9; }
  .employee { display: flex; align-items: baseline; gap: 10px; margin: 18px 2px 4px; }
  .employee h2 { font-size: 18px; }
  .code { font-family: Consolas, monospace; font-weight: 700; background: #F1F5F9; border-radius: 6px; padding: 2px 8px; font-size: 11px; }
  .meta { color: #6B7280; margin: 0 2px 14px; }
  .stats { display: flex; gap: 10px; margin-bottom: 16px; }
  .stat { flex: 1; border: 1px solid ${BRAND.redLine}; border-radius: 10px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: #6B7280; font-size: 10.5px; }
  .stat.attended b { color: ${GREEN}; }
  .stat.missing b { color: ${AMBER}; }
  .stat.missing { border-color: #EBD08A; background: #FFFBF0; }
  .stat.absent b { color: ${RED_DARK}; }
  .stat.excused b { color: ${VIOLET}; }
  .stat.hours b { color: ${RED}; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: ${RED}; color: #fff; text-align: left; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; padding: 9px 10px; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; }
  td { padding: 8px 10px; border-bottom: 1px solid #F0E2E3; }
  td.num { font-variant-numeric: tabular-nums; }
  td.missing { color: ${AMBER}; font-weight: 600; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 600; }
  .key { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 2px 12px; color: #6B7280; font-size: 10px; }
  .key span { display: inline-flex; align-items: center; gap: 6px; }
  .key i { width: 8px; height: 8px; border-radius: 50%; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 16px; display: flex; align-items: center; justify-content: space-between; color: #9CA3AF; font-size: 10px; border-top: 1px solid #EEE; padding-top: 8px; }
  .foot .mark { display: flex; align-items: center; gap: 6px; }
  .foot .mark svg { border: 1px solid #EADADA; border-radius: 4px; }
</style>
</head>
<body>
  <div class="band">
    <div class="logo">${logoSvgMarkup(46, 10)}</div>
    <div>
      <div class="brand">${BRAND_NAME}</div>
      <div class="brand-sub">Attendance</div>
    </div>
    <div class="divider"></div>
    <div>
      <div class="title">Employee Attendance Report</div>
      <div class="period">${esc(stats.period)}</div>
    </div>
    <div class="when">Generated<br/><b>${esc(formatDateTime(new Date().toISOString()))}</b></div>
  </div>

  <div class="employee">
    <h2>${esc(employee.fullName)}</h2>
    <span class="code">${esc(employee.code)}</span>
  </div>
  <p class="meta">${esc([employee.position, employee.phone].filter(Boolean).join(' · '))}</p>

  <div class="stats">
    <div class="stat"><b>${stats.totalSessions}</b><span>Total sessions</span></div>
    <div class="stat attended"><b>${stats.attended}</b><span>Attended</span></div>
    <div class="stat missing"><b>${stats.notCheckedOut}</b><span>Not checked out</span></div>
    <div class="stat absent"><b>${stats.absent}</b><span>Absent</span></div>
    ${stats.excused > 0 ? `<div class="stat excused"><b>${stats.excused}</b><span>Excused</span></div>` : ''}
    <div class="stat hours"><b>${esc(stats.totalHours)}</b><span>Total hours</span></div>
  </div>

  <div class="key">
    <span><i style="background:${GREEN}"></i>Present — checked in and out</span>
    <span><i style="background:${AMBER}"></i>Not checked out — attended, no check-out scanned</span>
    <span><i style="background:${RED_DARK}"></i>Absent</span>
    ${anyMark ? `<span><i style="background:${VIOLET}"></i>Marked by the supervisor — off, not their shift, overtime, hourly or official leave; a marked absence counts as excused</span>` : ''}
  </div>

  <table>
    <thead>
      <tr><th>Session</th><th>Date</th><th>Check-In</th><th>Check-Out</th><th>Status</th><th>Hours</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="foot">
    <span class="mark">${logoSvgMarkup(16, 3)} ${APP_NAME}</span>
    <span>${esc(employee.fullName)} (${esc(employee.code)})</span>
  </div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
