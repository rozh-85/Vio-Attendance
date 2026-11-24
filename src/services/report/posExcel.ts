import { format } from 'date-fns';
import { categoryName } from '@/services/pos/items';
import { lineGross, lineTotal, netTotal, piecesOf, returnedQty, saleLabel, saleStatus } from '@/services/pos/logic';
import { describeDays, type Report } from '@/services/pos/report';
import type { Sale } from '@/services/pos/types';
import { downloadBlob, zipStore } from './excel';
import { MIME_XLSX, S, num, sheetXml, stylesXml, text, type Cell } from './ordersExcel';

type Rows = { cells: Cell[]; height?: number }[];

const head = (titles: string[]) => ({ cells: titles.map((t) => text(t, S.header)), height: 22 });

function summarySheet(report: Report, filters: string): string {
  const rows: Rows = [];
  const add = (cells: Cell[], height?: number) => rows.push({ cells, height });
  add([text('Vio — POS report', S.title), text('', S.title), text('', S.title), text('', S.title)], 30);
  add([text(`Period: ${describeDays(report.days)}`, S.muted)]);
  add([text(filters || 'All items and categories', S.muted)]);
  add([text(`Generated ${format(new Date(), 'd MMM yyyy, HH:mm')}`, S.muted)]);
  add([]);
  add([text('Measure', S.header), text('Value', S.header)]);
  const measures: [string, number, number][] = [
    ['Net sales (IQD)', report.net, S.money],
    ['Net sales in dollars, each sale at its own rate', Math.round(report.netUsd * 100) / 100, S.money],
    ['Invoices', report.invoices, S.number],
    ['Customers (by mobile)', report.customers, S.number],
    ['Items sold', report.sold, S.number],
    ['Sales before discounts (IQD)', report.gross, S.money],
    ['Discounts (IQD)', report.discount, S.money],
    ['Raised above the list price (IQD)', report.raised, S.money],
    ['Items returned', report.returned, S.number],
    ['Money given back (IQD)', report.refunded, S.money],
  ];
  for (const [label, value, style] of measures) add([text(label, S.label), num(value, style)]);
  add([]);
  add(['Time', 'Invoices', 'Items sold', 'Net (IQD)'].map((t) => text(t, S.header)));
  for (const t of report.times)
    if (t.invoices || t.net) add([text(t.label), num(t.invoices, S.number), num(t.sold, S.number), num(t.net)]);
  return sheetXml(rows, [46, 18, 14, 18], { merges: ['A1:D1'] });
}

function itemsSheet(report: Report): string {
  const rows: Rows = [head(['Model', 'Item', 'Colour', 'Category', 'Sold', 'Returned', 'Discount (IQD)', 'Net (IQD)', 'Share'])];
  for (const r of report.items)
    rows.push({
      cells: [
        text(r.code),
        text(r.name),
        text(r.color),
        text(categoryName(r.category)),
        num(r.sold, S.number),
        num(r.returned, S.number),
        num(r.discount),
        num(r.net),
        num(r.share, S.percent),
      ],
    });
  return sheetXml(rows, [18, 28, 12, 22, 8, 10, 15, 16, 9], { freezeHeader: true, autoFilterColumns: 9 });
}

const STATUS = { sold: 'Sold', part: 'Part returned', returned: 'Returned', deleted: 'Deleted' } as const;

function invoicesSheet(sales: Sale[]): string {
  const rows: Rows = [
    head(['Invoice', 'Date', 'Time', 'Customer', 'Mobile', 'Address', 'Pieces', 'Before discount', 'Discount', 'Total', 'Returned', 'Net (IQD)', 'Dollar rate', 'Status', 'Note']),
  ];
  for (const s of sales)
    rows.push({
      cells: [
        text(saleLabel(s)),
        text(format(new Date(s.soldAt), 'yyyy-MM-dd')),
        text(format(new Date(s.soldAt), 'HH:mm')),
        text(s.customerName),
        text(s.customerPhone),
        text(s.customerAddress),
        num(piecesOf(s.lines), S.number),
        num(s.subtotal),
        num(s.discount),
        num(s.total),
        num(s.refunded),
        num(netTotal(s)),
        num(s.rate),
        text(STATUS[saleStatus(s)]),
        text([s.note, s.deleteReason].filter(Boolean).join(' · ')),
      ],
    });
  return sheetXml(rows, [10, 12, 8, 22, 15, 26, 8, 15, 12, 14, 12, 14, 12, 14, 30], { freezeHeader: true, autoFilterColumns: 15 });
}

function linesSheet(sales: Sale[]): string {
  const rows: Rows = [
    head(['Invoice', 'Date', 'Customer', 'Mobile', 'Model', 'Item', 'Colour', 'Pieces', 'Returned', 'List price', 'Sold at', 'Before discount', 'Discount', 'Amount (IQD)', 'Dollars']),
  ];
  for (const s of sales)
    for (const l of s.lines)
      rows.push({
        cells: [
          text(saleLabel(s)),
          text(format(new Date(s.soldAt), 'yyyy-MM-dd')),
          text(s.customerName),
          text(s.customerPhone),
          text(l.code),
          text(l.name),
          text(l.color),
          num(l.qty, S.number),
          num(returnedQty(s, l.id), S.number),
          num(l.list),
          num(l.price),
          num(lineGross(l)),
          num(l.discount),
          num(lineTotal(l)),
          num(l.usd),
        ],
      });
  return sheetXml(rows, [10, 12, 22, 15, 18, 26, 12, 8, 10, 13, 13, 15, 12, 15, 10], { freezeHeader: true, autoFilterColumns: 15 });
}

/** The report as a workbook: the figures, the items, the invoices and every line of them. */
export function exportPosExcel(report: Report, sales: Sale[], filters: string): void {
  const sheets = [
    { name: 'Summary', xml: summarySheet(report, filters) },
    { name: 'Items', xml: itemsSheet(report) },
    { name: 'Invoices', xml: invoicesSheet(sales) },
    { name: 'Lines', xml: linesSheet(sales) },
  ];
  const main = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${main}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${main}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${main}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${main}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, s.xml]),
  ];
  const bytes = zipStore(parts.map(([path, content]) => ({ path, data: new TextEncoder().encode(content) })));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadBlob(new Blob([buffer], { type: MIME_XLSX }), `vio_pos_report_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
}
