import { format } from 'date-fns';
import { downloadBlob, zipStore } from './excel';
import { MIME_XLSX, S, columnName, num, sheetXml, stylesXml, text, type Cell } from './ordersExcel';
import { countryName, describeNetwork, mapUrl, type CheckInReview } from '@/services/attendance/geofence';
import type { Session } from '@/types';

const COLUMNS: {
  title: string;
  width: number;
  cell: (r: CheckInReview, session: Session | undefined) => Cell;
}[] = [
  { title: 'Date', width: 12, cell: (r) => text(format(new Date(r.event.at), 'yyyy-MM-dd')) },
  { title: 'Time', width: 9, cell: (r) => text(format(new Date(r.event.at), 'HH:mm')) },
  { title: 'Employee', width: 26, cell: (r) => text(r.employee?.fullName ?? 'Deleted employee') },
  { title: 'Code', width: 8, cell: (r) => text(r.employee?.code ?? '') },
  { title: 'Phone', width: 15, cell: (r) => text(r.employee?.phone ?? '') },
  { title: 'Position', width: 18, cell: (r) => text(r.employee?.position ?? '') },
  { title: 'Session', width: 16, cell: (_r, s) => text(s?.title || s?.supervisorName || 'Another session') },
  {
    title: 'Location',
    width: 16,
    cell: (r) =>
      text(
        !r.zone
          ? 'Not compared'
          : r.zone.kind === 'inside'
            ? 'Inside'
            : r.zone.kind === 'outside'
              ? 'Outside'
              : 'No location shared',
      ),
  },
  { title: 'Work location', width: 18, cell: (r) => text(r.zone && r.zone.kind !== 'no-location' ? r.zone.location.name : '') },
  {
    title: 'Distance (m)',
    width: 13,
    cell: (r) => (r.zone && r.zone.kind !== 'no-location' ? num(Math.round(r.zone.distance), S.number) : text('')),
  },
  { title: 'Latitude', width: 12, cell: (r) => text(typeof r.event.latitude === 'number' ? r.event.latitude.toFixed(6) : '') },
  { title: 'Longitude', width: 12, cell: (r) => text(typeof r.event.longitude === 'number' ? r.event.longitude.toFixed(6) : '') },
  {
    title: 'Accuracy (m)',
    width: 13,
    cell: (r) => (typeof r.event.accuracy === 'number' ? num(Math.round(r.event.accuracy), S.number) : text('')),
  },
  { title: 'Network country', width: 16, cell: (r) => text(r.event.ipCountry ? countryName(r.event.ipCountry) : '') },
  { title: 'IP address', width: 17, cell: (r) => text(r.event.ipAddress ?? '') },
  { title: 'Network flag', width: 24, cell: (r) => text(r.network ? describeNetwork(r.network) : '') },
  { title: 'Map', width: 40, cell: (r) => text(mapUrl(r.event) ?? '') },
];

/** One sheet, a row per check-in, in the order shown on the page. */
export function exportCheckInLocationsExcel(
  reviews: CheckInReview[],
  sessionsById: Map<string, Session>,
  label: string,
): void {
  const rows: { cells: Cell[]; height?: number }[] = [
    { cells: COLUMNS.map((c) => text(c.title, S.header)), height: 22 },
    ...reviews.map((r) => ({ cells: COLUMNS.map((c) => c.cell(r, sessionsById.get(r.event.sessionId))) })),
  ];
  const sheet = sheetXml(rows, COLUMNS.map((c) => c.width), {
    freezeHeader: true,
    autoFilterColumns: COLUMNS.length,
  });
  const parts: [string, string][] = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Check-ins" sheetId="1" r:id="rId1"/></sheets>' +
        (reviews.length
          ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Check-ins'!$A$1:$${columnName(COLUMNS.length - 1)}$${reviews.length + 1}</definedName></definedNames>`
          : '') +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    ['xl/styles.xml', stylesXml()],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  const bytes = zipStore(parts.map(([path, content]) => ({ path, data: new TextEncoder().encode(content) })));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadBlob(
    new Blob([buffer], { type: MIME_XLSX }),
    `check_in_locations_${label}_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`,
  );
}
