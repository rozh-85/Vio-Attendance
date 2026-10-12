import { format } from 'date-fns';
import { downloadBlob, escapeXml, zipStore } from './excel';
import {
  GENDER_LABEL,
  SHIFT_LABEL,
  STATUS_LABEL,
  purchaseText,
} from '@/services/orders/options';
import { sellerOf, type OrderSummary } from '@/services/orders/report';
import type { SalesOrder } from '@/services/orders/types';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Cell styles, in the order of `cellXfs` below. */
const S = {
  plain: 0,
  title: 1,
  header: 2,
  text: 3,
  money: 4,
  label: 5,
  labelMoney: 6,
  muted: 7,
  number: 8,
  percent: 9,
} as const;

type Cell =
  | { text: string; style?: number }
  | { number: number; style?: number }
  | null;

const text = (value: string, style: number = S.text): Cell => ({ text: value, style });
const num = (value: number, style: number = S.money): Cell => ({ number: value, style });

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function rowXml(rowNumber: number, cells: Cell[], height?: number): string {
  const xmlCells = cells
    .map((cell, i) => {
      if (!cell) return '';
      const ref = `${columnName(i)}${rowNumber}`;
      const style = cell.style ?? S.plain;
      if ('number' in cell) return `<c r="${ref}" s="${style}"><v>${cell.number}</v></c>`;
      if (cell.text === '') return `<c r="${ref}" s="${style}"/>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.text)}</t></is></c>`;
    })
    .join('');
  const ht = height ? ` ht="${height}" customHeight="1"` : '';
  return `<row r="${rowNumber}"${ht}>${xmlCells}</row>`;
}

function sheetXml(
  rows: { cells: Cell[]; height?: number }[],
  widths: number[],
  options: { freezeHeader?: boolean; autoFilterColumns?: number; merges?: string[] } = {},
): string {
  const pane = options.freezeHeader
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    : '';
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const data = rows.map((r, i) => rowXml(i + 1, r.cells, r.height)).join('');
  const filter =
    options.autoFilterColumns && rows.length > 1
      ? `<autoFilter ref="A1:${columnName(options.autoFilterColumns - 1)}${rows.length}"/>`
      : '';
  const merges = options.merges?.length
    ? `<mergeCells count="${options.merges.length}">${options.merges
        .map((m) => `<mergeCell ref="${m}"/>`)
        .join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData>${filter}${merges}</worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts>
<fonts count="5">
<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF841F21"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFA5292B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBF3F3"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFEDC5C6"/></left><right style="thin"><color rgb="FFEDC5C6"/></right><top style="thin"><color rgb="FFEDC5C6"/></top><bottom style="thin"><color rgb="FFEDC5C6"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export interface OrdersExportInput {
  orders: SalesOrder[];
  summary: OrderSummary;
  period: string;
  /** e.g. "Sellers: Dilnya, Gashbin · Platform: Instagram". */
  filterText: string;
}

function summarySheet({ summary, period, filterText }: OrdersExportInput): string {
  const rows: { cells: Cell[]; height?: number }[] = [];
  const add = (cells: Cell[], height?: number) => rows.push({ cells, height });
  const blank = () => add([]);
  const merges: string[] = ['A1:D1'];

  add([text('Vio — Social media orders', S.title), text('', S.title), text('', S.title), text('', S.title)], 30);
  add([text(`Period: ${period}`, S.muted)]);
  add([text(filterText || 'All sellers, no other filters', S.muted)]);
  add([text(`Generated ${format(new Date(), 'd MMM yyyy, hh:mm a')}`, S.muted)]);
  blank();

  add([text('Measure', S.header), text('Value', S.header)]);
  const measures: [string, number, number][] = [
    ['Orders', summary.orders, S.number],
    ['Sales (IQD) — cancelled and returned not counted', summary.sales, S.money],
    ['Average order (IQD)', Math.round(summary.average), S.money],
    ['New', summary.byStatus.new, S.number],
    ['Delivered', summary.byStatus.delivered, S.number],
    ['Cancelled', summary.byStatus.cancelled, S.number],
    ['Returned', summary.byStatus.returned, S.number],
    ['Customers (by phone)', summary.customers, S.number],
    ['Customers who ordered more than once', summary.returningCustomers, S.number],
  ];
  for (const [label, value, style] of measures) add([text(label, S.label), num(value, style)]);

  const table = (title: string, items: OrderSummary['bySeller'], limit = Infinity) => {
    blank();
    add([text(title, S.header), text('Orders', S.header), text('Sales (IQD)', S.header), text('Share of sales', S.header)]);
    for (const item of items.slice(0, limit)) {
      add([
        text(item.key),
        num(item.orders, S.number),
        num(item.sales),
        num(summary.sales ? item.sales / summary.sales : 0, S.percent),
      ]);
    }
  };
  table('Seller', summary.bySeller);
  table('Platform', summary.byPlatform);
  table('City', summary.byCity);
  table('Category', summary.byCategory, 20);
  table(
    'Shift',
    summary.byShift.map((s) => ({
      ...s,
      key: s.key in SHIFT_LABEL ? SHIFT_LABEL[s.key as keyof typeof SHIFT_LABEL].en : 'Not set',
    })),
  );

  blank();
  add([
    text(summary.trendUnit === 'day' ? 'Day' : 'Month', S.header),
    text('Orders', S.header),
    text('Sales (IQD)', S.header),
  ]);
  for (const point of summary.trend) {
    add([text(point.label), num(point.orders, S.number), num(point.sales)]);
  }

  return sheetXml(rows, [46, 14, 18, 16], { merges });
}

const ORDER_COLUMNS: { title: string; width: number; cell: (o: SalesOrder) => Cell }[] = [
  { title: 'Order #', width: 9, cell: (o) => num(o.orderNo, S.number) },
  { title: 'Date', width: 12, cell: (o) => text(format(new Date(o.createdAt), 'yyyy-MM-dd')) },
  { title: 'Time', width: 9, cell: (o) => text(format(new Date(o.createdAt), 'HH:mm')) },
  { title: 'Seller', width: 16, cell: (o) => text(sellerOf(o)) },
  { title: 'Customer', width: 22, cell: (o) => text(o.customerName) },
  { title: 'Phone', width: 15, cell: (o) => text(o.customerPhone) },
  { title: 'Second phone', width: 15, cell: (o) => text(o.secondPhone) },
  { title: 'City', width: 12, cell: (o) => text(o.city) },
  { title: 'Address', width: 32, cell: (o) => text(o.address) },
  { title: 'Item model', width: 14, cell: (o) => text(o.itemModel) },
  { title: 'Category', width: 20, cell: (o) => text(o.itemCategory) },
  { title: 'Price (IQD)', width: 14, cell: (o) => num(o.totalPrice) },
  { title: 'Platform', width: 12, cell: (o) => text(o.platform) },
  { title: 'Times bought', width: 13, cell: (o) => (o.purchaseCount ? num(o.purchaseCount, S.number) : text(purchaseText(null, o.purchase))) },
  { title: 'Shift', width: 11, cell: (o) => text(o.shift ? SHIFT_LABEL[o.shift].en : '') },
  { title: 'Gender', width: 9, cell: (o) => text(o.gender ? GENDER_LABEL[o.gender].en : '') },
  { title: 'Status', width: 11, cell: (o) => text(STATUS_LABEL[o.status]) },
  { title: 'Note', width: 30, cell: (o) => text(o.note) },
];

function ordersSheet({ orders }: OrdersExportInput): string {
  const rows: { cells: Cell[]; height?: number }[] = [
    { cells: ORDER_COLUMNS.map((c) => text(c.title, S.header)), height: 22 },
    ...orders.map((o) => ({ cells: ORDER_COLUMNS.map((c) => c.cell(o)) })),
  ];
  return sheetXml(
    rows,
    ORDER_COLUMNS.map((c) => c.width),
    { freezeHeader: true, autoFilterColumns: ORDER_COLUMNS.length },
  );
}

export function exportOrdersExcel(input: OrdersExportInput): void {
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Orders" sheetId="2" r:id="rId2"/></sheets>' +
        (input.orders.length
          ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">Orders!$A$1:$${columnName(ORDER_COLUMNS.length - 1)}$${input.orders.length + 1}</definedName></definedNames>`
          : '') +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    ['xl/styles.xml', stylesXml()],
    ['xl/worksheets/sheet1.xml', summarySheet(input)],
    ['xl/worksheets/sheet2.xml', ordersSheet(input)],
  ];
  const bytes = zipStore(parts.map(([path, content]) => ({ path, data: new TextEncoder().encode(content) })));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadBlob(
    new Blob([buffer], { type: MIME_XLSX }),
    `social_media_orders_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`,
  );
}
