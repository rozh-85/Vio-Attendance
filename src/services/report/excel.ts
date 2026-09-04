import { format } from 'date-fns';
import type { AttendanceRecord, LeaveRecord, Session, Employee } from '@/types';
import { formatClock, formatDateTime } from '@/utils/time';

const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHEET_NAME = 'Employee Attendance';
const COLUMN_COUNT = 9;
const FIRST_EMPLOYEE_ROW = 5;

interface ZipEntry {
  path: string;
  content: string;
}

interface AttendanceDetailRow {
  employeeCode: string;
  employeeName: string;
  sessionName: string;
  dateAndTime: string;
  checkInTime: string;
  checkOutTime: string;
  status: string;
  timePresent: string;
}

interface EmployeeReport {
  employee: Employee;
  sessionsAttended: number;
  totalTimePresent: string;
  detailRows: AttendanceDetailRow[];
  offDaysThisMonth: number;
}

interface AttendanceReport {
  generatedAt: string;
  totalSessions: number;
  totalEmployees: number;
  totalSessionTime: string;
  employees: EmployeeReport[];
}

interface SheetRow {
  values: string[];
  style: number;
  styles?: number[];
  height?: number;
}

export async function exportAttendanceToExcel(
  sessions: Session[],
  employees: Employee[],
  attendance: AttendanceRecord[],
  leaveRecords: LeaveRecord[] = [],
): Promise<void> {
  const report = buildAttendanceReport(sessions, employees, attendance, leaveRecords);
  const file = buildAttendanceReportXlsxBlob(report);
  const stamp = format(new Date(), 'yyyy-MM-dd_HHmm');
  downloadBlob(file, `employee_attendance_${stamp}.xlsx`);
}

export function buildAttendanceReportXlsxBlob(report: AttendanceReport): Blob {
  const lastRow = getLastRow(report);

  return createXlsx([
    { path: '[Content_Types].xml', content: contentTypesXml() },
    { path: '_rels/.rels', content: rootRelsXml() },
    { path: 'docProps/app.xml', content: appXml() },
    { path: 'docProps/core.xml', content: coreXml() },
    { path: 'xl/workbook.xml', content: workbookXml() },
    { path: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml() },
    { path: 'xl/styles.xml', content: stylesXml() },
    { path: 'xl/theme/theme1.xml', content: themeXml() },
    {
      path: 'xl/worksheets/sheet1.xml',
      content: worksheetXml(report, lastRow),
    },
  ]);
}

function buildAttendanceReport(
  sessions: Session[],
  employees: Employee[],
  attendance: AttendanceRecord[],
  leaveRecords: LeaveRecord[] = [],
): AttendanceReport {
  const nowIso = new Date().toISOString();
  const monthKey = nowIso.slice(0, 7);
  const sortedSessions = sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const sortedEmployees = employees
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  const recordsByEmployeeSession = new Map(
    attendance.map((record) => [
      employeeAttendanceKey(record.employeeId, record.sessionId),
      record,
    ]),
  );
  const totalSessionMinutes = sortedSessions.reduce(
    (sum, session) =>
      sum +
      minutesBetween(session.startedAt, effectiveSessionEnd(session, nowIso)),
    0,
  );

  const employeeReports = sortedEmployees.map((employee) => {
    let employeeMinutes = 0;
    let sessionsAttended = 0;
    const detailRows = sortedSessions.map((session) => {
      const record = recordsByEmployeeSession.get(
        employeeAttendanceKey(employee.id, session.id),
      );
      const presentMinutes = attendanceMinutes(record, session, nowIso);
      employeeMinutes += presentMinutes;
      if (record?.checkInAt) sessionsAttended += 1;

      return {
        employeeCode: employee.code,
        employeeName: employee.fullName,
        sessionName: session.title || session.supervisorName,
        dateAndTime: formatDateTime(session.startedAt),
        checkInTime: record?.checkInAt ? formatClock(record.checkInAt) : '—',
        checkOutTime: record?.checkOutAt
          ? formatClock(record.checkOutAt)
          : record?.checkInAt
            ? 'In progress'
            : '—',
        status: record?.checkInAt ? 'Present' : 'Absent',
        timePresent: record?.checkInAt ? formatMinutes(presentMinutes) : '—',
      };
    });

    return {
      employee,
      sessionsAttended,
      totalTimePresent: formatMinutes(employeeMinutes),
      detailRows,
      offDaysThisMonth: leaveRecords
        .filter((record) => record.employeeId === employee.id && record.date.slice(0, 7) === monthKey)
        .reduce((sum, record) => sum + record.days, 0),
    };
  });

  return {
    generatedAt: formatDateTime(nowIso),
    totalSessions: sortedSessions.length,
    totalEmployees: sortedEmployees.length,
    totalSessionTime: formatMinutes(totalSessionMinutes),
    employees: employeeReports,
  };
}

function worksheetXml(report: AttendanceReport, lastRow: number): string {
  const sheetRows = buildSheetRows(report);

  return xml([
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/><pageSetUpPr/></sheetPr>',
    `<dimension ref="A1:I${lastRow}"/>`,
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${FIRST_EMPLOYEE_ROW - 1}" topLeftCell="A${FIRST_EMPLOYEE_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${FIRST_EMPLOYEE_ROW}" sqref="A${FIRST_EMPLOYEE_ROW}"/></sheetView></sheetViews>`,
    '<sheetFormatPr baseColWidth="8" defaultRowHeight="15"/>',
    '<cols>',
    '<col min="1" max="1" width="28" customWidth="1"/>',
    '<col min="2" max="2" width="10" customWidth="1"/>',
    '<col min="3" max="3" width="28" customWidth="1"/>',
    '<col min="4" max="4" width="24" customWidth="1"/>',
    '<col min="5" max="5" width="14" customWidth="1"/>',
    '<col min="6" max="6" width="14" customWidth="1"/>',
    '<col min="7" max="7" width="12" customWidth="1"/>',
    '<col min="8" max="8" width="15" customWidth="1"/>',
    '<col min="9" max="9" width="19" customWidth="1"/>',
    '</cols>',
    '<sheetData>',
    ...sheetRows.map((row, index) => {
      const rowNumber = index + 1;
      return rowXml(
        rowNumber,
        row.values.map((value, colIndex) =>
          textCell(
            columnName(colIndex),
            rowNumber,
            value,
            row.styles?.[colIndex] ?? row.style,
          ),
        ),
        row.height,
      );
    }),
    '</sheetData>',
    mergeCellsXml(),
    '<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/>',
    '</worksheet>',
  ]);
}

// One flat table: a single header row, then one row per employee per session
// (rows grouped by employee), and a bold Total row closing each employee group.
function buildSheetRows(report: AttendanceReport): SheetRow[] {
  const rows: SheetRow[] = [
    {
      values: fillColumns(['Employee Attendance Report']),
      style: 1,
      height: 34,
    },
    {
      values: fillColumns([
        `Generated ${report.generatedAt}   ·   ${report.totalSessions} sessions   ·   ${report.totalEmployees} employees   ·   Total session time ${report.totalSessionTime}`,
      ]),
      style: 2,
      height: 24,
    },
    { values: fillColumns([]), style: 0 },
    {
      values: fillColumns([
        'Employee Name',
        'Code',
        'Session',
        'Date and Time',
        'Check-In',
        'Check-Out',
        'Status',
        'Hours',
        'Off days this month',
      ]),
      style: 4,
      height: 30,
    },
  ];

  for (const employeeReport of report.employees) {
    employeeReport.detailRows.forEach((detailRow, index) => {
      rows.push({
        values: [
          detailRow.employeeName,
          detailRow.employeeCode,
          detailRow.sessionName,
          detailRow.dateAndTime,
          detailRow.checkInTime,
          detailRow.checkOutTime,
          detailRow.status,
          detailRow.timePresent,
          '',
        ],
        style: index % 2 === 0 ? 6 : 5,
        height: 22,
      });
    });
    rows.push({
      values: fillColumns([
        `${employeeReport.employee.fullName} — Total`,
        employeeReport.employee.code,
        `Attended ${employeeReport.sessionsAttended} / ${report.totalSessions} sessions`,
        '',
        '',
        '',
        '',
        employeeReport.totalTimePresent,
        String(employeeReport.offDaysThisMonth),
      ]),
      style: 8,
      height: 26,
    });
  }

  return rows;
}

function mergeCellsXml(): string {
  const refs = ['A1:I1', 'A2:I2'];
  return `<mergeCells count="${refs.length}">${refs
    .map((ref) => `<mergeCell ref="${ref}"/>`)
    .join('')}</mergeCells>`;
}

function getLastRow(report: AttendanceReport): number {
  return (
    FIRST_EMPLOYEE_ROW -
    1 +
    report.employees.reduce(
      (total, employee) => total + employee.detailRows.length + 1,
      0,
    )
  );
}

function fillColumns(values: string[]): string[] {
  return Array.from({ length: COLUMN_COUNT }, (_, index) => values[index] ?? '');
}

function minutesBetween(startIso?: string, endIso?: string): number {
  if (!startIso || !endIso) return 0;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60)));
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function effectiveSessionEnd(session: Session, nowIso: string): string {
  return session.closedAt ?? nowIso;
}

function attendanceMinutes(
  record: AttendanceRecord | undefined,
  session: Session,
  nowIso: string,
): number {
  if (!record?.checkInAt) return 0;

  const sessionStart = new Date(session.startedAt).getTime();
  const sessionEnd = new Date(effectiveSessionEnd(session, nowIso)).getTime();
  const presentStart = Math.max(new Date(record.checkInAt).getTime(), sessionStart);
  const presentEnd = Math.min(
    new Date(record.checkOutAt ?? effectiveSessionEnd(session, nowIso)).getTime(),
    sessionEnd,
  );

  return Math.max(0, Math.round((presentEnd - presentStart) / (1000 * 60)));
}

function employeeAttendanceKey(employeeId: string, sessionId: string): string {
  return `${employeeId}:${sessionId}`;
}

function columnName(index: number): string {
  return String.fromCharCode(65 + index);
}

function rowXml(rowNumber: number, cells: string[], height?: number): string {
  const heightAttrs =
    height === undefined ? '' : ` ht="${height}" customHeight="1"`;
  return `<row r="${rowNumber}"${heightAttrs}>${cells.join('')}</row>`;
}

function textCell(
  col: string,
  row: number,
  value: string,
  styleIndex: number,
): string {
  if (value === '') return `<c r="${col}${row}" s="${styleIndex}" t="n"></c>`;

  const escaped = escapeXml(value);
  return `<c r="${col}${row}" s="${styleIndex}" t="inlineStr"><is><t>${escaped}</t></is></c>`;
}

function workbookXml(): string {
  return xml([
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<workbookPr/><workbookProtection/>',
    '<bookViews><workbookView visibility="visible" minimized="0" showHorizontalScroll="1" showVerticalScroll="1" showSheetTabs="1" tabRatio="600" firstSheet="0" activeTab="0" autoFilterDateGrouping="1"/></bookViews>',
    `<sheets><sheet name="${SHEET_NAME}" sheetId="1" state="visible" r:id="rId1"/></sheets>`,
    '<calcPr calcId="124519" fullCalcOnLoad="1"/>',
    '</workbook>',
  ]);
}

function stylesXml(): string {
  return xml([
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="6">',
    '<font><sz val="12"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="12"/><color rgb="FF841F21"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="12"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>',
    '</fonts>',
    '<fills count="7">',
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFA5292B"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFBF3F3"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFA5292B"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF6E3E3"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
    '</fills>',
    '<borders count="2">',
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left style="thin"><color rgb="FFEDC5C6"/></left><right style="thin"><color rgb="FFEDC5C6"/></right><top style="thin"><color rgb="FFEDC5C6"/></top><bottom style="thin"><color rgb="FFEDC5C6"/></bottom><diagonal/></border>',
    '</borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="10">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '</cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '<dxfs count="0"/>',
    '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleMedium9"/>',
    '</styleSheet>',
  ]);
}

function themeXml(): string {
  return xml([
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">',
    '<a:themeElements>',
    '<a:clrScheme name="Office">',
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>',
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>',
    '<a:dk2><a:srgbClr val="1F497D"/></a:dk2>',
    '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>',
    '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>',
    '<a:accent2><a:srgbClr val="C0504D"/></a:accent2>',
    '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>',
    '<a:accent4><a:srgbClr val="8064A2"/></a:accent4>',
    '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>',
    '<a:accent6><a:srgbClr val="F79646"/></a:accent6>',
    '<a:hlink><a:srgbClr val="0000FF"/></a:hlink>',
    '<a:folHlink><a:srgbClr val="800080"/></a:folHlink>',
    '</a:clrScheme>',
    '<a:fontScheme name="Office">',
    '<a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>',
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>',
    '</a:fontScheme>',
    '<a:fmtScheme name="Office">',
    '<a:fillStyleLst>',
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>',
    '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>',
    '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>',
    '</a:fillStyleLst>',
    '<a:lnStyleLst>',
    '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>',
    '<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>',
    '<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>',
    '</a:lnStyleLst>',
    '<a:effectStyleLst>',
    '<a:effectStyle><a:effectLst/></a:effectStyle>',
    '<a:effectStyle><a:effectLst/></a:effectStyle>',
    '<a:effectStyle><a:effectLst/></a:effectStyle>',
    '</a:effectStyleLst>',
    '<a:bgFillStyleLst>',
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>',
    '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill>',
    '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>',
    '</a:bgFillStyleLst>',
    '</a:fmtScheme>',
    '</a:themeElements>',
    '<a:objectDefaults/>',
    '<a:extraClrSchemeLst/>',
    '</a:theme>',
  ]);
}

function contentTypesXml(): string {
  return xml([
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '</Types>',
  ]);
}

function rootRelsXml(): string {
  return xml([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
    '</Relationships>',
  ]);
}

function workbookRelsXml(): string {
  return xml([
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    '</Relationships>',
  ]);
}

function appXml(): string {
  return xml([
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    '<Application>Vio Attendance</Application>',
    '</Properties>',
  ]);
}

function coreXml(): string {
  const created = new Date().toISOString();
  return xml([
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '<dc:creator>Vio Attendance</dc:creator>',
    '<dc:title>Employee Attendance Report</dc:title>',
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>`,
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>`,
    '</cp:coreProperties>',
  ]);
}

function createXlsx(entries: ZipEntry[]): Blob {
  const bytes = zipStore(
    entries.map((entry) => ({
      path: entry.path,
      data: new TextEncoder().encode(entry.content),
    })),
  );
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: MIME_XLSX });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function zipStore(entries: { path: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;
  const timestamp = dosTimestamp(new Date());

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, timestamp.time, true);
    view.setUint16(12, timestamp.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, timestamp.time, true);
    centralView.setUint16(14, timestamp.date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralDirectory.push(central);

    offset += local.length + entry.data.length;
  }

  const centralStart = offset;
  const centralSize = centralDirectory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);

  return concatBytes([...chunks, ...centralDirectory, end]);
}

function dosTimestamp(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function xml(parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${parts.join(
    '',
  )}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
