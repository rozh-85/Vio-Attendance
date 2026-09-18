import type { AttendanceRecord, Employee, LeaveRecord } from "@/types";
import type {
  HrLeaveRequest,
  HrPayrollEntry,
  HrShift,
  HrWorkspace,
} from "./types";

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const round = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const date = new Date(`${from}T12:00:00`);
  while (localDate(date) <= to && out.length < 367) {
    out.push(localDate(date));
    date.setDate(date.getDate() + 1);
  }
  return out;
}
export function shiftHours(shift: HrShift): number {
  const mins = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return ((mins(shift.endTime) - mins(shift.startTime) + 1440) % 1440) / 60;
}
export function shiftFor(
  w: HrWorkspace,
  employeeId: string,
  day: string,
): HrShift | undefined {
  const assignments = w.assignments.filter(
    (a) =>
      a.employeeId === employeeId &&
      a.fromDate <= day &&
      (!a.toDate || a.toDate >= day),
  );
  const assignment = assignments.sort((a, b) =>
    b.fromDate.localeCompare(a.fromDate),
  )[0];
  if (assignment) {
    const shift = w.shifts.find((s) => s.id === assignment.shiftId && s.active);
    return shift?.days.includes(weekdays[new Date(`${day}T12:00:00`).getDay()])
      ? shift
      : undefined;
  }
  const cycle = w.cycles
    .filter((c) => c.employeeIds.includes(employeeId) && c.startDate <= day)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (!cycle) return undefined;
  const days = Math.round(
    (Date.parse(`${day}T12:00:00Z`) -
      Date.parse(`${cycle.startDate}T12:00:00Z`)) /
      86400000,
  );
  return days % (cycle.workDays + cycle.restDays) < cycle.workDays
    ? w.shifts.find((s) => s.id === cycle.shiftId && s.active)
    : undefined;
}
export function approvalChain(w: HrWorkspace, employeeId: string): string[] {
  const seen = new Set([employeeId]);
  const chain: string[] = [];
  let id = employeeId;
  while (chain.length < w.settings.approvalLevels) {
    const profile = w.profiles[id];
    const manager =
      profile?.managerId ||
      w.departments.find((d) => d.id === profile?.departmentId)?.managerId;
    if (!manager || seen.has(manager)) break;
    seen.add(manager);
    chain.push(manager);
    id = manager;
  }
  return chain;
}
export function hierarchyError(
  items: { id: string; parentId: string }[],
): string | null {
  for (const item of items) {
    const seen = new Set([item.id]);
    let parent = item.parentId;
    while (parent) {
      if (seen.has(parent))
        return "The organization hierarchy cannot contain a circular reporting relationship.";
      seen.add(parent);
      parent = items.find((i) => i.id === parent)?.parentId ?? "";
    }
  }
  return null;
}
export function leaveBalance(
  w: HrWorkspace,
  employeeId: string,
  typeId: string,
  year: number,
  legacy: LeaveRecord[] = [],
) {
  const type = w.leaveTypes.find((t) => t.id === typeId);
  const allowance =
    w.leaveBalances.find(
      (b) =>
        b.employeeId === employeeId &&
        b.leaveTypeId === typeId &&
        b.year === year,
    )?.allowance ??
    type?.annualLimit ??
    0;
  const requests = w.leaveRequests.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.leaveTypeId === typeId &&
      r.startDate.startsWith(String(year)),
  );
  const used =
    requests
      .filter((r) => r.status === "approved")
      .reduce((n, r) => n + r.amount, 0) +
    (typeId === "annual"
      ? legacy
          .filter((r) => r.employeeId === employeeId && r.year === year)
          .reduce((n, r) => n + r.days, 0)
      : 0);
  const pending = requests
    .filter((r) => r.status === "pending")
    .reduce((n, r) => n + r.amount, 0);
  return {
    allowance,
    used: round(used),
    pending: round(pending),
    remaining: round(allowance - used),
  };
}
export function validateLeave(
  w: HrWorkspace,
  r: HrLeaveRequest,
  legacy: LeaveRecord[] = [],
): string | null {
  const type = w.leaveTypes.find((t) => t.id === r.leaveTypeId && t.active);
  if (!type) return "Choose an active leave type.";
  if (!r.employeeId || !r.startDate || !r.endDate || r.endDate < r.startDate)
    return "Choose an employee and a valid date range.";
  if (r.startDate.slice(0, 4) !== r.endDate.slice(0, 4))
    return "Split requests across calendar years to preserve annual balances.";
  const days = dateRange(r.startDate, r.endDate).length;
  if (
    !Number.isFinite(r.amount) ||
    r.amount <= 0 ||
    r.amount > days * (type.unit === "hours" ? 24 : 1)
  )
    return "Leave amount must fit within the selected date range.";
  if (!r.reason.trim()) return "Enter a reason for the request.";
  if (
    w.leaveRequests.some(
      (x) =>
        x.id !== r.id &&
        x.employeeId === r.employeeId &&
        x.status !== "rejected" &&
        x.startDate <= r.endDate &&
        x.endDate >= r.startDate,
    )
  )
    return "This employee already has a pending or approved request covering these dates.";
  const balance = leaveBalance(
    { ...w, leaveRequests: w.leaveRequests.filter((x) => x.id !== r.id) },
    r.employeeId,
    r.leaveTypeId,
    Number(r.startDate.slice(0, 4)),
    legacy,
  );
  if (
    w.rules.some((rule) => rule.id === "leave-balance" && rule.enabled) &&
    r.amount > balance.remaining - balance.pending
  )
    return `Only ${round(balance.remaining - balance.pending)} ${type.unit} are available after pending requests.`;
  return null;
}
export interface AttendanceRow {
  employeeId: string;
  date: string;
  shift: string;
  night: boolean;
  checkIn: string;
  checkOut: string;
  hours: number;
  late: number;
  overtime: number;
  status:
    | "Present"
    | "Late"
    | "Absent"
    | "On leave"
    | "Holiday"
    | "Off day"
    | "Scheduled"
    | "Incomplete";
}
export function attendanceRows(
  w: HrWorkspace,
  employees: Employee[],
  records: AttendanceRecord[],
  from: string,
  to: string,
  legacy: LeaveRecord[] = [],
  now = new Date(),
): AttendanceRow[] {
  const all = [
    ...records,
    ...w.deviceAttendance.map((r) => ({
      ...r,
      sessionId: `device-${r.deviceId}`,
    })),
  ];
  return dateRange(from, to).flatMap((day) =>
    employees
      .filter((e) => {
        const p = w.profiles[e.id];
        return p?.status !== "inactive" && (!p?.joinDate || p.joinDate <= day);
      })
      .map((e) => {
        const shift = shiftFor(w, e.id, day);
        const start = new Date(`${day}T${shift?.startTime ?? "00:00"}:00`);
        const end = new Date(`${day}T${shift?.endTime ?? "23:59"}:00`);
        const night = !!shift && shift.endTime < shift.startTime;
        if (night) end.setDate(end.getDate() + 1);
        const entries = all
          .filter((r) => {
            if (r.employeeId !== e.id || !r.checkInAt) return false;
            const at = new Date(r.checkInAt);
            if (night)
              return (
                at.getTime() >= start.getTime() - 4 * 3600000 &&
                at.getTime() < end.getTime()
              );
            const prev = new Date(`${day}T12:00:00`);
            prev.setDate(prev.getDate() - 1);
            const prevShift = shiftFor(w, e.id, localDate(prev));
            if (
              prevShift &&
              prevShift.endTime < prevShift.startTime &&
              at < new Date(`${day}T${prevShift.endTime}:00`)
            )
              return false;
            return localDate(at) === day;
          })
          .sort((a, b) => (a.checkInAt ?? "").localeCompare(b.checkInAt ?? ""));
        // Union intervals so duplicate/manual/device sources cannot inflate hours.
        const intervals = entries
          .filter((r) => r.checkInAt && r.checkOutAt)
          .map((r) => [Date.parse(r.checkInAt!), Date.parse(r.checkOutAt!)])
          .filter(([a, b]) => b >= a)
          .sort((a, b) => a[0] - b[0]);
        let elapsed = 0;
        let cursor = 0;
        for (const [a, b] of intervals) {
          elapsed += Math.max(0, b - Math.max(cursor, a));
          cursor = Math.max(cursor, b);
        }
        const hours = round(elapsed / 3600000);
        const checkIn = entries[0]?.checkInAt ?? "";
        const checkOut = entries.some((r) => !r.checkOutAt)
          ? ""
          : (entries
              .map((r) => r.checkOutAt ?? "")
              .sort()
              .at(-1) ?? "");
        const grace = w.rules.find((r) => r.id === "late-grace" && r.enabled);
        const late =
          shift && checkIn
            ? Math.max(
                0,
                Math.floor((Date.parse(checkIn) - start.getTime()) / 60000) -
                  (grace ? Number(grace.value) : shift.graceMinutes),
              )
            : 0;
        const leave =
          w.leaveRequests.some(
            (r) =>
              r.employeeId === e.id &&
              r.status === "approved" &&
              r.startDate <= day &&
              r.endDate >= day,
          ) || legacy.some((r) => r.employeeId === e.id && r.date === day);
        const holiday = w.holidays.some(
          (h) => h.startDate <= day && h.endDate >= day,
        );
        const status: AttendanceRow["status"] = checkIn
          ? !checkOut
            ? "Incomplete"
            : late > 0
              ? "Late"
              : "Present"
          : leave
            ? "On leave"
            : holiday
              ? "Holiday"
              : !shift
                ? "Off day"
                : end > now
                  ? "Scheduled"
                  : "Absent";
        return {
          employeeId: e.id,
          date: day,
          shift: shift?.name ?? "Unassigned",
          night,
          checkIn,
          checkOut,
          hours,
          late,
          overtime: shift
            ? round(Math.max(0, hours - shift.overtimeAfterHours))
            : 0,
          status,
        };
      }),
  );
}
export function calculatePayroll(
  w: HrWorkspace,
  employees: Employee[],
  period: string,
): HrPayrollEntry[] {
  if (!/^\d{4}-\d{2}$/.test(period) || w.settings.monthlyHours <= 0)
    throw new Error("Choose a payroll month and positive monthly hours.");
  const daysInMonth = new Date(
    Number(period.slice(0, 4)),
    Number(period.slice(5)),
    0,
  ).getDate();
  return employees
    .filter(
      (e) =>
        w.profiles[e.id]?.status !== "inactive" &&
        (!w.profiles[e.id]?.joinDate ||
          w.profiles[e.id].joinDate <= `${period}-${daysInMonth}`),
    )
    .map((e) => {
      const old = w.payrollEntries.find(
        (p) => p.period === period && p.employeeId === e.id,
      );
      if (old && old.status !== "draft") return old;
      const baseSalary = w.profiles[e.id]?.baseSalary ?? 0;
      const adjustments = w.adjustments.filter(
        (a) => a.employeeId === e.id && a.date.startsWith(period),
      );
      const bonuses = round(
        adjustments
          .filter((a) => a.type === "bonus")
          .reduce((n, a) => n + a.amount, 0),
      );
      const penalties = round(
        adjustments
          .filter((a) => a.type === "penalty")
          .reduce((n, a) => n + a.amount, 0),
      );
      const requireApproval = w.rules.some(
        (r) => r.id === "overtime-approval" && r.enabled,
      );
      const overtimeHours = round(
        w.overtime
          .filter(
            (o) =>
              o.employeeId === e.id &&
              o.date.startsWith(period) &&
              (o.status === "approved" ||
                (!requireApproval && o.status === "pending")),
          )
          .reduce((n, o) => n + o.hours, 0),
      );
      const overtimeRate = round(
        (baseSalary / w.settings.monthlyHours) * w.settings.overtimeMultiplier,
      );
      const unpaidDeduction = round(
        w.leaveRequests
          .filter(
            (r) =>
              r.employeeId === e.id &&
              r.status === "approved" &&
              w.leaveTypes.some((t) => t.id === r.leaveTypeId && !t.paid),
          )
          .reduce((sum, r) => {
            const days = dateRange(r.startDate, r.endDate);
            const portion =
              days.filter((d) => d.startsWith(period)).length / days.length;
            const type = w.leaveTypes.find((t) => t.id === r.leaveTypeId)!;
            return (
              sum +
              (r.amount * portion * baseSalary) /
                (type.unit === "hours" ? w.settings.monthlyHours : daysInMonth)
            );
          }, 0),
      );
      const gross = round(
        Math.max(
          0,
          baseSalary + bonuses + overtimeHours * overtimeRate - unpaidDeduction,
        ),
      );
      const tax = round((gross * w.settings.taxPercent) / 100);
      const insurance = round((baseSalary * w.settings.insurancePercent) / 100);
      return {
        id: old?.id ?? `pay-${period}-${e.id}`,
        employeeId: e.id,
        period,
        baseSalary,
        bonuses,
        penalties,
        overtimeHours,
        overtimeRate,
        netSalary: round(gross - penalties - tax - insurance),
        tax,
        insurance,
        unpaidDeduction,
        status: "draft",
      };
    });
}
export function distanceMeters(
  a: number,
  b: number,
  c: number,
  d: number,
): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function csvDownload(
  name: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  const quote = (value: string | number) => {
    const s = String(value);
    return `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  };
  const blob = new Blob(
    [
      "\uFEFF",
      [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
