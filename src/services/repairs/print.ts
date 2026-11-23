import { formatPhone, showDate } from './logic';
import type { RepairTicket } from './types';

/**
 * Small prints for the repair desk — never A4. A receipt for the customer on
 * an 80 mm or 58 mm receipt printer, or a 50 × 30 mm sticker to put on the
 * item itself so it is never mixed up in the shop. Black on white only, so it
 * comes out clean on a thermal printer.
 */
export type PrintSize = '80' | '58' | 'label';

export const PRINT_SIZES: { id: PrintSize; label: string; hint: string }[] = [
  { id: '80', label: '٨٠ ملم', hint: 'پسوولە بۆ کڕیار — پرینتەری پسوولەی ٨٠ ملم' },
  { id: '58', label: '٥٨ ملم', hint: 'پسوولە بۆ کڕیار — پرینتەری بچووکی ٥٨ ملم' },
  { id: 'label', label: 'لیبڵ', hint: 'لیبڵی ٥٠×٣٠ ملم بۆ سەر ئامێرەکە' },
];

const SIZE_KEY = 'vio.repairPrintSize';

export function readPrintSize(): PrintSize {
  try {
    const value = localStorage.getItem(SIZE_KEY);
    return value === '58' || value === 'label' ? value : '80';
  } catch {
    return '80';
  }
}

export function savePrintSize(size: PrintSize): void {
  try {
    localStorage.setItem(SIZE_KEY, size);
  } catch {
    // Storage blocked: the choice lasts for this print only.
  }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c);

/** Every rule is under `.rp`, so the preview on screen and the print match. */
export const RECEIPT_CSS = `
.rp{direction:rtl;font-family:'Rabar 013',Inter,system-ui,sans-serif;color:#000;background:#fff;line-height:1.5;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rp *{box-sizing:border-box;color:#000}
.rp .ltr{direction:ltr;unicode-bidi:isolate;font-family:Inter,Arial,sans-serif}
.rp-80{width:80mm;padding:4mm 4.5mm 6mm;font-size:13px}
.rp-58{width:58mm;padding:3mm 3mm 5mm;font-size:11.5px}
.rp-head{display:flex;align-items:center;justify-content:space-between;gap:2mm;padding-bottom:2mm;border-bottom:2px solid #000}
.rp-brand{font-family:'Arial Black',Inter,Arial,sans-serif;font-weight:900;font-size:1.9em;line-height:1;letter-spacing:-.02em;direction:ltr}
.rp-title{font-weight:700;font-size:1.05em;text-align:left}
.rp-no{margin:3mm 0 2.5mm;text-align:center}
.rp-no small{display:block;font-size:.85em}
.rp-no b{display:block;font-family:Inter,Arial,sans-serif;font-size:2.5em;font-weight:900;line-height:1.05;direction:ltr}
.rp-row{display:flex;justify-content:space-between;align-items:flex-start;gap:3mm;padding:1.2mm 0;border-bottom:1px dotted #000}
.rp-row span:first-child{white-space:nowrap}
.rp-row span:last-child{font-weight:700;text-align:left;overflow-wrap:anywhere}
.rp-note{margin-top:2mm;padding:1.5mm 2mm;border:1px solid #000;border-radius:1.5mm;white-space:pre-wrap;overflow-wrap:anywhere}
.rp-note small{display:block;font-weight:700}
.rp-done{margin-top:2.5mm;padding:1.5mm;border:2px solid #000;text-align:center;font-weight:700}
.rp-foot{margin-top:3mm;padding-top:2mm;border-top:2px dashed #000;text-align:center;font-size:.85em}
.rp-label{width:50mm;height:30mm;padding:1.8mm 2.4mm;font-size:9px;line-height:1.3;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
.rp-label .rp-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #000;padding-bottom:.6mm}
.rp-label .rp-top b{font-family:Inter,Arial,sans-serif;font-size:2.3em;font-weight:900;line-height:1;direction:ltr}
.rp-label .rp-top i{font-style:normal;font-family:'Arial Black',Inter,Arial,sans-serif;font-weight:900;font-size:1.4em;direction:ltr}
.rp-label .rp-name{font-weight:700;font-size:1.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rp-label .rp-line{display:flex;justify-content:space-between;gap:1.5mm;white-space:nowrap;overflow:hidden}
`;

function row(label: string, value: string, ltr = false): string {
  return `<div class="rp-row"><span>${label}</span><span${ltr ? ' class="ltr"' : ''}>${escapeHtml(value)}</span></div>`;
}

/** The print itself, as HTML (every value escaped). */
export function receiptHtml(ticket: RepairTicket, size: PrintSize): string {
  const phone = escapeHtml(formatPhone(ticket.phone));
  if (size === 'label') {
    return (
      `<div class="rp rp-label">` +
      `<div class="rp-top"><b>#${ticket.ticketNo}</b><i>Vio</i></div>` +
      `<div class="rp-name">${escapeHtml(ticket.customerName)}</div>` +
      `<div class="rp-line"><span class="ltr">${phone}</span><span>${escapeHtml(ticket.itemType)}</span></div>` +
      `<div class="rp-line"><span>هێنان</span><span class="ltr">${showDate(ticket.broughtOn)}</span></div>` +
      `</div>`
    );
  }
  return (
    `<div class="rp rp-${size}">` +
    `<div class="rp-head"><span class="rp-title">پسوولەی عەتڵ</span><span class="rp-brand">Vio</span></div>` +
    `<div class="rp-no"><small>ژمارەی پسوولە</small><b>#${ticket.ticketNo}</b></div>` +
    row('ناو', ticket.customerName) +
    row('ژمارەی مۆبایل', formatPhone(ticket.phone), true) +
    row('جۆری ئایتم', ticket.itemType) +
    row('بەرواری هێنان', showDate(ticket.broughtOn), true) +
    (ticket.repairedOn ? row('بەرواری چاکردن', showDate(ticket.repairedOn), true) : '') +
    (ticket.note ? `<div class="rp-note"><small>تێبینی</small>${escapeHtml(ticket.note)}</div>` : '') +
    (ticket.deliveredAt ? `<div class="rp-done">✓ چاککرا و درایەوە بە کڕیار</div>` : '') +
    `<div class="rp-foot">تکایە ئەم پسوولەیە بپارێزە بۆ وەرگرتنەوەی ئامێرەکەت<br/>سوپاس بۆ متمانەتان بە Vio</div>` +
    `</div>`
  );
}

const ROOT_ID = 'vio-repair-print';
const STYLE_ID = 'vio-repair-print-style';
const PX_PER_MM = 96 / 25.4;

/**
 * Prints one repair at the chosen size. The print sits in the page itself
 * (out of sight) rather than a pop-up, so it works on phones too. A receipt's
 * page is exactly as tall as the receipt, so a roll printer cuts it right
 * under the last line.
 */
export async function printRepair(ticket: RepairTicket, size: PrintSize): Promise<void> {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = STYLE_ID;
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = receiptHtml(ticket, size);
  // Out of sight on screen, but laid out, so its height can be measured.
  style.textContent = `${RECEIPT_CSS}\n#${ROOT_ID}{position:fixed;top:0;left:-10000px;pointer-events:none}`;
  document.head.appendChild(style);
  document.body.appendChild(root);

  try {
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // Fonts not ready: print with what is there.
  }

  const page =
    size === 'label'
      ? '50mm 30mm'
      : `${size}mm ${Math.ceil((root.firstElementChild as HTMLElement).offsetHeight / PX_PER_MM) + 2}mm`;

  style.textContent += `
@media print{
  @page{size:${page};margin:0}
  html,body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important}
  body>*:not(#${ROOT_ID}){display:none!important}
  #${ROOT_ID}{position:static;left:auto}
}`;

  const cleanUp = () => {
    window.removeEventListener('afterprint', cleanUp);
    root.remove();
    style.remove();
  };
  window.addEventListener('afterprint', cleanUp);
  window.print();
}
