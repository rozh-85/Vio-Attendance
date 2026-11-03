import { format } from 'date-fns';
import { downloadBlob, zipStore } from './excel';
import { MIME_XLSX, S, num, sheetXml, stylesXml, text, type Cell } from './ordersExcel';
import { STATUS_LABEL, countsAsSale } from '@/services/orders/options';
import { orderDay, sellerOf } from '@/services/orders/report';
import {
  costOf,
  sponsorDates,
  sponsorDays,
  sponsorInRange,
  sponsorIqd,
  type ProfitData,
  type ProfitSummary,
} from '@/services/orders/profit';
import type { SalesOrder } from '@/services/orders/types';

export interface ProfitExportInput {
  orders: SalesOrder[];
  data: ProfitData;
  summary: ProfitSummary;
  from: string;
  to: string;
  period: string;
}

type Row = { cells: Cell[]; height?: number };

function summarySheet({ summary: s, period }: ProfitExportInput): string {
  const rows: Row[] = [];
  const add = (cells: Cell[], height?: number) => rows.push({ cells, height });
  add([text('Vio — Profit on social media orders', S.title), text('', S.title), text('', S.title)], 30);
  add([text(`Period: ${period}`, S.muted)]);
  add([text(`Generated ${format(new Date(), 'd MMM yyyy, hh:mm a')}`, S.muted)]);
  add([]);
  add([text('', S.header), text('IQD', S.header), text('Orders', S.header)]);
  add([text('Sales', S.label), num(s.sales, S.labelMoney), num(s.orders, S.number)]);
  if (s.uncostedSales > 0) {
    add([text('  − Sales with no cost yet (left out)', S.text), num(-s.uncostedSales), num(s.uncostedOrders, S.number)]);
  }
  add([text('  − Cost of goods', S.text), num(-s.cogs), num(s.costedOrders, S.number)]);
  add([text('Gross profit', S.label), num(s.gross, S.labelMoney), null]);
  add([text('  − Sponsors', S.text), num(-s.sponsor), num(s.sponsorCount, S.number)]);
  add([text('Net profit', S.label), num(s.net, S.labelMoney), null]);
  add([]);
  add([text('Measure', S.header), text('Value', S.header)]);
  add([text('Gross margin', S.text), s.margin === null ? text('—') : num(s.margin, S.percent)]);
  add([text('Sales for each 1 IQD of sponsor', S.text), s.roas === null ? text('—') : num(Math.round(s.roas * 100) / 100, S.number)]);
  add([text('Profit per order (after sponsors)', S.text), s.profitPerOrder === null ? text('—') : num(Math.round(s.profitPerOrder))]);
  add([]);
  add([
    text('Platform', S.header),
    text('Sales', S.header),
    text('Gross profit', S.header),
    text('Sponsors', S.header),
    text('Net', S.header),
  ]);
  for (const p of s.byPlatform) {
    add([text(p.key || 'Not set'), num(p.sales), num(p.gross), num(Math.round(p.sponsor)), num(Math.round(p.net))]);
  }
  add([]);
  add([
    text(s.trendUnit === 'day' ? 'Day' : 'Month', S.header),
    text('Sales', S.header),
    text('Goods', S.header),
    text('Sponsors', S.header),
    text('Net profit', S.header),
  ]);
  for (const p of s.trend) {
    add([text(p.label), num(p.sales), num(p.cogs), num(Math.round(p.sponsor)), num(Math.round(p.net))]);
  }
  return sheetXml(rows, [40, 16, 16, 16, 16], { merges: ['A1:C1'] });
}

function modelsSheet({ summary, data }: ProfitExportInput): string {
  const header = ['Model', 'Type', 'Sold in period', 'Sold in all', 'Sale price', 'Usual price', 'Cost of one', 'Profit per piece', 'Margin', 'Profit in period'];
  const rows: Row[] = [{ cells: header.map((h) => text(h, S.header)), height: 22 }];
  for (const r of summary.byModel) {
    if (!r.key) continue;
    const unit = r.cost !== null && r.avgPrice ? r.avgPrice - r.cost : null;
    rows.push({
      cells: [
        text(r.label),
        text(r.category),
        num(r.orders, S.number),
        num(r.allOrders, S.number),
        data.models[r.key]?.price != null ? num(data.models[r.key].price as number) : text(''),
        num(Math.round(r.avgPrice)),
        r.cost === null ? text('No cost yet') : num(r.cost),
        unit === null ? text('') : num(Math.round(unit)),
        unit === null || !r.avgPrice ? text('') : num(unit / r.avgPrice, S.percent),
        r.costedOrders ? num(r.profit) : text(''),
      ],
    });
  }
  return sheetXml(rows, [16, 22, 14, 12, 13, 14, 14, 16, 10, 16], { freezeHeader: true, autoFilterColumns: header.length });
}

function sponsorsSheet({ data, from, to }: ProfitExportInput): string {
  const header = ['Platform', 'Dates', 'Days', 'Paid', 'Currency', 'Dollar rate', 'IQD', 'In this period (IQD)', 'Promoted', 'Note'];
  const rows: Row[] = [{ cells: header.map((h) => text(h, S.header)), height: 22 }];
  for (const s of data.sponsors) {
    const part = sponsorInRange(s, from, to);
    if (part.days === 0) continue;
    rows.push({
      cells: [
        text(s.platform),
        text(sponsorDates(s)),
        num(sponsorDays(s), S.number),
        num(s.amount, S.number),
        text(s.currency),
        s.currency === 'USD' ? num(s.rate) : text(''),
        num(sponsorIqd(s)),
        num(Math.round(part.amount)),
        text(s.promoted),
        text(s.note),
      ],
    });
  }
  return sheetXml(rows, [12, 24, 7, 10, 9, 11, 13, 18, 16, 30], { freezeHeader: true });
}

function ordersSheet({ orders, data, from, to }: ProfitExportInput): string {
  const header = ['Order #', 'Date', 'Seller', 'Customer', 'Model', 'Pieces', 'Type', 'Platform', 'Status', 'Price', 'Cost', 'Cost from', 'Profit'];
  const rows: Row[] = [{ cells: header.map((h) => text(h, S.header)), height: 22 }];
  const inPeriod = orders
    .filter((o) => {
      const d = orderDay(o);
      return (!from || d >= from) && (!to || d <= to);
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const o of inPeriod) {
    const cost = countsAsSale(o.status) ? costOf(o, data) : null;
    rows.push({
      cells: [
        num(o.orderNo, S.number),
        text(format(new Date(o.createdAt), 'yyyy-MM-dd')),
        text(sellerOf(o)),
        text(o.customerName),
        text(o.itemModel),
        num(o.quantity || 1, S.number),
        text(o.itemCategory),
        text(o.platform),
        text(STATUS_LABEL[o.status]),
        num(o.totalPrice),
        cost ? num(cost.cost) : text(countsAsSale(o.status) ? 'No cost yet' : ''),
        text(cost ? (cost.source === 'order' ? 'This order' : 'Model') : ''),
        cost ? num(o.totalPrice - cost.cost) : text(''),
      ],
    });
  }
  return sheetXml(rows, [9, 12, 16, 22, 14, 8, 18, 12, 11, 13, 13, 11, 13], {
    freezeHeader: true,
    autoFilterColumns: header.length,
  });
}

/** Excel wants the range of each sheet with a filter named in the workbook. */
function filterNames({ summary, orders, from, to }: ProfitExportInput): string {
  const models = summary.byModel.filter((r) => r.key).length;
  const periodOrders = orders.filter((o) => {
    const d = orderDay(o);
    return (!from || d >= from) && (!to || d <= to);
  }).length;
  const names = [
    models
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Model costs'!$A$1:$J$${models + 1}</definedName>`
      : '',
    periodOrders
      ? `<definedName name="_xlnm._FilterDatabase" localSheetId="3" hidden="1">Orders!$A$1:$M$${periodOrders + 1}</definedName>`
      : '',
  ].join('');
  return names ? `<definedNames>${names}</definedNames>` : '';
}

/** Profit summary, the cost list, the sponsors and every order with its profit. */
export function exportProfitExcel(input: ProfitExportInput): void {
  const sheets: [string, string][] = [
    ['Profit', summarySheet(input)],
    ['Model costs', modelsSheet(input)],
    ['Sponsors', sponsorsSheet(input)],
    ['Orders', ordersSheet(input)],
  ];
  const overrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets>${filterNames(input)}</workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(([, xml], i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
  ];
  const bytes = zipStore(parts.map(([path, content]) => ({ path, data: new TextEncoder().encode(content) })));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadBlob(new Blob([buffer], { type: MIME_XLSX }), `social_media_profit_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`);
}
