import { formatDateTime } from '@/utils/time';
import type { Session } from '@/types';

export interface LecturePdfRow {
  code: string;
  student: string;
  checkIn: string;
  checkOut: string;
  status: 'Present' | 'Absent';
  hours: string;
}

export interface LecturePdfStats {
  totalStudents: number;
  present: number;
  absent: number;
  totalHours: string;
}

/**
 * Opens a print-ready, Asiacell-branded attendance sheet for a single lecture in
 * a new tab and triggers the print dialog. Shares the exact visual template used
 * by the per-student report (see ./studentPdf).
 */
export function exportLecturePdf(
  session: Session,
  stats: LecturePdfStats,
  rows: LecturePdfRow[],
): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(buildHtml(session, stats, rows));
  win.document.close();
}

const RED = '#C0141B';
const RED_DARK = '#9E1016';
const RED_TINT = '#FCEBEC';

function buildHtml(
  session: Session,
  stats: LecturePdfStats,
  rows: LecturePdfRow[],
): string {
  const title = session.title || session.lecturerName;
  const meta = [session.lecturerName, session.location]
    .filter(Boolean)
    .join(' · ');
  const active = session.status === 'active';
  const statusStyle = active
    ? 'color:#0C7A43;background:#E6F7EE;'
    : 'color:#6B7280;background:#F1F5F9;';

  const tableRows = rows
    .map((row, index) => {
      const statusColor =
        row.status === 'Present'
          ? 'color:#0C7A43;background:#E6F7EE;'
          : `color:${RED_DARK};background:${RED_TINT};`;
      return `<tr style="background:${index % 2 === 0 ? '#FFFFFF' : '#FBF6F6'}">
        <td class="code">${esc(row.code)}</td>
        <td>${esc(row.student)}</td>
        <td class="num">${esc(row.checkIn)}</td>
        <td class="num">${esc(row.checkOut)}</td>
        <td><span class="badge" style="${statusColor}">${esc(row.status)}</span></td>
        <td class="num">${esc(row.hours)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Attendance — ${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1F2937; font-size: 12px; }
  .band { display: flex; align-items: center; gap: 18px; background: ${RED}; color: #fff; border-radius: 12px; padding: 18px 22px; }
  .brand { font-size: 30px; font-weight: 800; font-style: italic; letter-spacing: -1px; white-space: nowrap; }
  .brand sup { font-size: 11px; font-style: normal; margin-left: 1px; }
  .brand-sub { font-size: 9.5px; letter-spacing: 2.5px; text-transform: uppercase; opacity: .85; margin-top: 1px; }
  .divider { width: 1px; height: 44px; background: rgba(255,255,255,.35); }
  .band .title { font-size: 21px; font-weight: 700; letter-spacing: .2px; }
  .band .subtitle { margin-top: 3px; font-size: 11px; opacity: .9; }
  .band .when { margin-left: auto; text-align: right; font-size: 10.5px; opacity: .9; }
  .lecture { display: flex; align-items: center; gap: 10px; margin: 18px 2px 4px; }
  .lecture h2 { font-size: 18px; }
  .pill { border-radius: 999px; padding: 2px 10px; font-size: 10px; font-weight: 700; }
  .meta { color: #6B7280; margin: 0 2px 14px; }
  .stats { display: flex; gap: 10px; margin-bottom: 16px; }
  .stat { flex: 1; border: 1px solid #EADADA; border-radius: 10px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: #6B7280; font-size: 10.5px; }
  .stat.present b { color: #0C7A43; }
  .stat.absent b { color: ${RED_DARK}; }
  .stat.hours b { color: ${RED}; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: ${RED}; color: #fff; text-align: left; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; padding: 9px 10px; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; }
  td { padding: 8px 10px; border-bottom: 1px solid #F0E2E3; }
  td.num { font-variant-numeric: tabular-nums; }
  td.code { font-family: Consolas, monospace; font-weight: 700; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 600; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 16px; display: flex; justify-content: space-between; color: #9CA3AF; font-size: 10px; border-top: 1px solid #EEE; padding-top: 8px; }
</style>
</head>
<body>
  <div class="band">
    <div>
      <div class="brand">Asiacell<sup>®</sup></div>
      <div class="brand-sub">QR Attendance</div>
    </div>
    <div class="divider"></div>
    <div>
      <div class="title">Lecture Attendance Report</div>
    </div>
    <div class="when">Generated<br/><b>${esc(formatDateTime(new Date().toISOString()))}</b></div>
  </div>

  <div class="lecture">
    <h2>${esc(title)}</h2>
    <span class="pill" style="${statusStyle}">${active ? 'Active' : 'Closed'}</span>
  </div>
  <p class="meta">${esc([meta, formatDateTime(session.startedAt)].filter(Boolean).join(' · '))}</p>

  <div class="stats">
    <div class="stat"><b>${stats.totalStudents}</b><span>Total students</span></div>
    <div class="stat present"><b>${stats.present}</b><span>Present</span></div>
    <div class="stat absent"><b>${stats.absent}</b><span>Absent</span></div>
    <div class="stat hours"><b>${esc(stats.totalHours)}</b><span>Total hours</span></div>
  </div>

  <table>
    <thead>
      <tr><th>Code</th><th>Student</th><th>Check-In</th><th>Check-Out</th><th>Status</th><th>Hours</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="foot">
    <span>Asiacell · QR Attendance</span>
    <span>${esc(title)}</span>
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
