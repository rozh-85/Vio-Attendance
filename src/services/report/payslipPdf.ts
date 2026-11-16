import { formatDateTime } from '@/utils/time';
import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from '@/brand';
import { fmt, type Payslip, type PayslipLine } from '@/services/hr/payslip';

/**
 * Opens print-ready payslips in a new tab — one per page — and starts the
 * browser's print dialog so they can be printed or saved as PDF.
 */
export function exportPayslipsPdf(slips: Payslip[]): void {
  if (slips.length === 0) return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(buildPayslipsHtml(slips));
  win.document.close();
}

const RED = BRAND.red;
const GREEN = '#0C7A43';
const AMBER = '#8A5A00';

const STATE: Record<Payslip['status'], { text: string; paint: string }> = {
  draft: { text: 'Draft — not approved yet', paint: `color:${AMBER};background:#FDF1CF;` },
  approved: { text: 'Approved', paint: `color:${GREEN};background:#E6F7EE;` },
  paid: { text: 'Paid', paint: `color:${GREEN};background:#E6F7EE;` },
};

function lines(rows: PayslipLine[], currency: string, empty: string): string {
  if (rows.length === 0) return `<tr><td colspan="2" class="none">${esc(empty)}</td></tr>`;
  return rows
    .map(
      (row) => `<tr><td>${esc(row.label)}${row.detail ? `<div class="detail">${esc(row.detail)}</div>` : ''}</td><td class="num">${esc(fmt(row.amount, currency))}</td></tr>`,
    )
    .join('');
}

function slipHtml(slip: Payslip): string {
  const c = slip.currency;
  const state = STATE[slip.status];
  const when =
    slip.status === 'paid' && slip.paidAt
      ? ` · ${formatDateTime(slip.paidAt)}`
      : slip.status === 'approved' && slip.approvedAt
        ? ` · ${formatDateTime(slip.approvedAt)}`
        : '';
  const facts = [
    ['Job title', slip.jobTitle],
    ['Department', slip.department],
    ['Join date', slip.joinDate],
    ['Bank account', slip.bankAccount],
  ]
    .map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v || '—')}</b></div>`)
    .join('');
  return `<section class="slip">
  <div class="band">
    <div class="logo">${logoSvgMarkup(46, 10)}</div>
    <div><div class="brand">${BRAND_NAME}</div><div class="brand-sub">Payroll</div></div>
    <div class="divider"></div>
    <div><div class="title">Payslip</div><div class="period">${esc(slip.periodLabel)}</div></div>
    <div class="when">Generated<br/><b>${esc(formatDateTime(new Date().toISOString()))}</b></div>
  </div>

  <div class="who">
    <div>
      <h2>${esc(slip.employeeName)}${slip.code ? ` <span class="code">${esc(slip.code)}</span>` : ''}</h2>
    </div>
    <span class="state" style="${state.paint}">${esc(state.text + when)}</span>
  </div>
  <div class="facts">${facts}</div>

  <div class="time">
    <div class="time-head"><span>Work time</span><b>${esc(slip.workTime)}</b><em>${slip.dayHours ? `${slip.workDays} days × ${slip.dayHours} hours = ` : `${slip.workDays} days · `}${slip.workHours} hours this month</em></div>
    <div class="rates">
      <div><b>${esc(fmt(slip.perDay, c))}</b><span>a day</span></div>
      <div><b>${esc(fmt(slip.perHour, c))}</b><span>an hour</span></div>
      <div><b>${esc(fmt(slip.perMinute, c))}</b><span>a minute</span></div>
    </div>
  </div>

  <table>
    <thead><tr><th>Earnings</th><th class="num">Amount</th></tr></thead>
    <tbody>${lines(slip.earnings, c, 'No earnings this month.')}</tbody>
    <tfoot><tr><td>Total earnings</td><td class="num">${esc(fmt(slip.totalEarnings, c))}</td></tr></tfoot>
  </table>

  <table>
    <thead><tr><th>Deductions</th><th class="num">Amount</th></tr></thead>
    <tbody>${lines(slip.deductions, c, 'No deductions this month.')}</tbody>
    <tfoot><tr><td>Total deductions</td><td class="num">${esc(fmt(slip.totalDeductions, c))}</td></tr></tfoot>
  </table>

  <div class="net"><span>Net pay</span><b>${esc(fmt(slip.net, c))}</b></div>
  ${slip.floored ? '<p class="floor">The deductions are more than the earnings, so the net pay stops at zero.</p>' : ''}
  <p class="rule">Deductions for late arrival, early leave and absence are worked out from the check-ins at the rates above, and are only taken once approved.</p>

  <div class="signs">
    <div><i></i><span>Prepared by (HR)</span></div>
    <div><i></i><span>Received by (employee)</span></div>
  </div>

  <div class="foot">
    <span class="mark">${logoSvgMarkup(16, 3)} ${APP_NAME}</span>
    <span>${esc(slip.employeeName)} · ${esc(slip.periodLabel)}</span>
  </div>
</section>`;
}

/** The printable document itself, so it can be rendered without printing it. */
export function buildPayslipsHtml(slips: Payslip[]): string {
  const title = slips.length === 1 ? `Payslip — ${slips[0].employeeName} — ${slips[0].periodLabel}` : `Payslips — ${slips[0]?.periodLabel ?? ''}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1F2937; font-size: 12px; }
  .slip { page-break-after: always; }
  .slip:last-child { page-break-after: auto; }
  .band { display: flex; align-items: center; gap: 18px; background: ${RED}; color: #fff; border-radius: 12px; padding: 18px 22px; }
  .logo { flex-shrink: 0; line-height: 0; }
  .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .brand-sub { font-size: 9.5px; letter-spacing: 2.5px; text-transform: uppercase; opacity: .85; margin-top: 2px; }
  .divider { width: 1px; height: 44px; background: rgba(255,255,255,.35); }
  .band .title { font-size: 21px; font-weight: 700; }
  .band .period { margin-top: 3px; font-size: 11px; opacity: .9; }
  .band .when { margin-left: auto; text-align: right; font-size: 10.5px; opacity: .9; }
  .who { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 18px 2px 10px; }
  .who h2 { font-size: 18px; }
  .code { font-family: Consolas, monospace; font-weight: 700; background: #F1F5F9; border-radius: 6px; padding: 2px 8px; font-size: 11px; vertical-align: middle; }
  .state { border-radius: 999px; padding: 4px 12px; font-size: 10.5px; font-weight: 700; white-space: nowrap; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 0 2px 14px; }
  .facts span { display: block; color: #6B7280; font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; }
  .facts b { display: block; margin-top: 2px; font-weight: 600; word-break: break-word; }
  .time { border: 1px solid ${BRAND.redLine}; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .time-head span { display: block; color: #6B7280; font-size: 9.5px; text-transform: uppercase; letter-spacing: .6px; }
  .time-head b { display: block; margin-top: 2px; font-size: 13px; }
  .time-head em { display: block; margin-top: 2px; color: #6B7280; font-style: normal; font-size: 10.5px; }
  .rates { display: flex; gap: 18px; text-align: right; }
  .rates b { display: block; font-size: 14px; color: ${RED}; font-variant-numeric: tabular-nums; }
  .rates span { color: #6B7280; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  thead th { background: ${RED}; color: #fff; text-align: left; font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; padding: 8px 10px; }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; }
  td { padding: 7px 10px; border-bottom: 1px solid #F0E2E3; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .detail { color: #6B7280; font-size: 10.5px; margin-top: 1px; }
  .none { color: #9CA3AF; }
  tfoot td { font-weight: 700; border-bottom: 0; border-top: 2px solid ${BRAND.redLine}; }
  tr { page-break-inside: avoid; }
  .net { display: flex; align-items: center; justify-content: space-between; background: ${BRAND.redTint}; border: 1px solid ${BRAND.redLine}; border-radius: 10px; padding: 14px 16px; }
  .net span { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
  .net b { font-size: 22px; color: ${BRAND.redDark}; font-variant-numeric: tabular-nums; }
  .floor { margin-top: 8px; color: ${AMBER}; font-weight: 600; font-size: 10.5px; }
  .rule { margin-top: 10px; color: #6B7280; font-size: 10px; }
  .signs { display: flex; gap: 40px; margin-top: 42px; }
  .signs div { flex: 1; }
  .signs i { display: block; border-bottom: 1px solid #9CA3AF; height: 28px; }
  .signs span { display: block; margin-top: 5px; color: #6B7280; font-size: 10px; }
  .foot { margin-top: 22px; display: flex; align-items: center; justify-content: space-between; color: #9CA3AF; font-size: 10px; border-top: 1px solid #EEE; padding-top: 8px; }
  .foot .mark { display: flex; align-items: center; gap: 6px; }
</style>
</head>
<body>
${slips.map(slipHtml).join('\n')}
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
