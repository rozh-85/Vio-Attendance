import { APP_NAME, BRAND, BRAND_NAME, logoSvgMarkup } from "@/brand";
import type {
  HrInterviewCandidate,
  HrInterviewStatus,
} from "@/services/hr/types";
import { formatDateTime } from "@/utils/time";

const statusColors: Record<HrInterviewStatus, { background: string; color: string }> = {
  Approved: { background: "#E8F7EF", color: "#087443" },
  Interviewed: { background: "#EAF2FF", color: "#1D5FA7" },
  "Call Not Answered": { background: "#FFF2E5", color: "#A54A00" },
  "Did Not Accept": { background: "#F1F5F9", color: "#526174" },
  Rejected: { background: "#FDEBEC", color: "#B4232E" },
  "Outside Country": { background: "#F3EDFF", color: "#6D3DB8" },
  "Pending / Call Later": { background: "#FFF8DB", color: "#8A6500" },
};

/** Opens a print-ready, landscape candidate table that can be saved as PDF. */
export function exportInterviewTrackingPdf(
  candidates: HrInterviewCandidate[],
  activeFilters: string[] = [],
): void {
  const win = window.open("", "_blank");
  if (!win) return;

  const summary = {
    approved: candidates.filter((item) => item.status === "Approved").length,
    active: candidates.filter((item) =>
      ["Interviewed", "Pending / Call Later"].includes(item.status),
    ).length,
    noAnswer: candidates.filter((item) => item.status === "Call Not Answered")
      .length,
    declined: candidates.filter((item) =>
      ["Rejected", "Did Not Accept"].includes(item.status),
    ).length,
    outside: candidates.filter((item) => item.status === "Outside Country")
      .length,
  };

  const rows = candidates
    .map((candidate, index) => {
      const status = statusColors[candidate.status];
      const followUp = followUpText(candidate);
      const portfolio = safeUrl(candidate.portfolioUrl);
      return `<tr class="${index % 2 ? "alt" : ""}">
        <td class="date">${esc(formatDate(candidate.date))}</td>
        <td class="name">${esc(candidate.fullName)}</td>
        <td class="phone">${esc(candidate.phone)}</td>
        <td>${esc(candidate.location)}</td>
        <td class="portfolio">${
          portfolio
            ? `<a href="${esc(portfolio)}" target="_blank">Open link</a>`
            : '<span class="muted">—</span>'
        }</td>
        <td><span class="badge" style="background:${status.background};color:${status.color}">${esc(candidate.status)}</span></td>
        <td class="follow-up">${followUp ? esc(followUp) : '<span class="muted">—</span>'}</td>
        <td class="notes">${esc(candidate.notes || "—")}</td>
      </tr>`;
    })
    .join("");

  const scope = activeFilters.length
    ? activeFilters.map(esc).join(" &nbsp;•&nbsp; ")
    : "All candidates";

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Interview Tracking Report</title>
<style>
  @page { size: A4 landscape; margin: 9mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #1F2937; font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; }
  .band { display:flex; align-items:center; gap:15px; border-radius:11px; background:${BRAND.red}; color:#fff; padding:14px 18px; }
  .logo { flex-shrink:0; line-height:0; }
  .brand { font-size:22px; font-weight:800; line-height:1; }
  .brand-sub { margin-top:4px; font-size:8px; letter-spacing:2px; text-transform:uppercase; opacity:.82; }
  .divider { width:1px; height:38px; background:rgba(255,255,255,.35); }
  .title { font-size:18px; font-weight:700; }
  .scope { max-width:105mm; margin-top:3px; font-size:9px; opacity:.88; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .generated { margin-left:auto; text-align:right; font-size:8.5px; line-height:1.45; opacity:.9; white-space:nowrap; }
  .summary { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; margin:12px 0; }
  .stat { border:1px solid ${BRAND.redLine}; border-radius:8px; padding:7px 9px; background:#fff; }
  .stat b { display:block; font-size:15px; line-height:1.1; color:#111827; }
  .stat span { display:block; margin-top:3px; color:#6B7280; font-size:8px; }
  table { width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; }
  thead { display:table-header-group; }
  th { background:${BRAND.red}; color:#fff; padding:7px 7px; text-align:left; text-transform:uppercase; letter-spacing:.35px; font-size:8px; }
  th:first-child { border-radius:7px 0 0 0; }
  th:last-child { border-radius:0 7px 0 0; }
  th:nth-child(1) { width:23mm; }
  th:nth-child(2) { width:36mm; }
  th:nth-child(3) { width:29mm; }
  th:nth-child(4) { width:27mm; }
  th:nth-child(5) { width:20mm; }
  th:nth-child(6) { width:35mm; }
  th:nth-child(7) { width:36mm; }
  td { padding:7px; border-bottom:1px solid #F0E2E3; vertical-align:top; line-height:1.35; overflow-wrap:anywhere; }
  tr { page-break-inside:avoid; }
  tr.alt td { background:#FBF7F7; }
  td.date, td.phone { white-space:nowrap; font-variant-numeric:tabular-nums; }
  td.name { font-weight:700; color:#111827; }
  td.portfolio a { color:${BRAND.redDark}; font-weight:700; text-decoration:none; }
  td.follow-up { color:#475569; }
  td.notes { color:#526174; }
  .badge { display:inline-block; max-width:100%; border-radius:999px; padding:3px 7px; font-size:7.5px; font-weight:700; line-height:1.2; }
  .muted { color:#9CA3AF; }
  .empty { padding:25px; text-align:center; color:#6B7280; }
  .foot { display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:7px; border-top:1px solid #E5E7EB; color:#94A3B8; font-size:8px; }
  .foot-brand { display:flex; align-items:center; gap:5px; }
</style></head><body>
  <div class="band">
    <div class="logo">${logoSvgMarkup(40, 9)}</div>
    <div><div class="brand">${esc(BRAND_NAME)}</div><div class="brand-sub">HR Department</div></div>
    <div class="divider"></div>
    <div><div class="title">Interview Tracking Report</div><div class="scope">${scope}</div></div>
    <div class="generated">Generated<br><b>${esc(formatDateTime(new Date().toISOString()))}</b></div>
  </div>
  <div class="summary">
    <div class="stat"><b>${candidates.length}</b><span>Total candidates</span></div>
    <div class="stat"><b>${summary.approved}</b><span>Approved</span></div>
    <div class="stat"><b>${summary.active}</b><span>Pending / interviewed</span></div>
    <div class="stat"><b>${summary.noAnswer}</b><span>No answer</span></div>
    <div class="stat"><b>${summary.declined}</b><span>Rejected / declined</span></div>
    <div class="stat"><b>${summary.outside}</b><span>Outside country</span></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Full name</th><th>Phone number</th><th>Location</th><th>Portfolio</th><th>Status</th><th>Follow-up</th><th>Notes</th></tr></thead>
    <tbody>${rows || '<tr><td class="empty" colspan="8">No candidates match the selected filters.</td></tr>'}</tbody>
  </table>
  <div class="foot"><span class="foot-brand">${logoSvgMarkup(15, 3)} ${esc(APP_NAME)}</span><span>${candidates.length} candidate${candidates.length === 1 ? "" : "s"} · Interview tracking</span></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)});</script>
</body></html>`);
  win.document.close();
}

function followUpText(candidate: HrInterviewCandidate): string {
  if (candidate.status === "Call Not Answered" && candidate.callAgainDate)
    return `Call again: ${formatDate(candidate.callAgainDate)}`;
  if (candidate.status === "Outside Country" && candidate.expectedReturnDate)
    return `Expected return: ${formatDate(candidate.expectedReturnDate)}`;
  if (candidate.status === "Interviewed" && candidate.interviewDate)
    return `Interview: ${formatDate(candidate.interviewDate)}`;
  return "";
}

function formatDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function safeUrl(value: string): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
