import type { AttendanceRecord, Employee, LeaveRecord } from "@/types";
import type { HrLeaveRequest, HrShift, HrWorkspace } from "./types";

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
/** "09:00" → "9 AM", "16:30" → "4:30 PM": times people read, not 24-hour ones. */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
/** "9 AM – 4 PM". */
export function clockRange(start: string, end: string): string {
  return `${clockLabel(start)} – ${clockLabel(end)}`;
}
export const WORK_DAY_ID = "work-day";
/**
 * The work day from the work time settings — 9 to 4 unless HR changes it — as
 * a shift. Everyone without a shift assignment or a work cycle works it, so the
 * attendance register reads the same hours.
 */
export function workDayShift(w: HrWorkspace): HrShift {
  const startTime = w.settings.workStart || "09:00";
  const endTime = w.settings.workEnd || "16:00";
  const shift: HrShift = {
    id: WORK_DAY_ID,
    name: `Work day ${clockRange(startTime, endTime)}`,
    startTime,
    endTime,
    days: w.settings.workDays ?? [],
    graceMinutes: 0,
    overtimeAfterHours: 0,
    active: true,
  };
  shift.overtimeAfterHours = shiftHours(shift);
  return shift;
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
  if (!cycle) {
    const workDay = workDayShift(w);
    return workDay.days.includes(weekdays[new Date(`${day}T12:00:00`).getDay()])
      ? workDay
      : undefined;
  }
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
/**
 * Overtime in a day's worked hours: everything past the shift's overtime
 * point (7 hours on the 9-to-4 day), or every hour on a day off or a holiday.
 * Less than the grace minutes is let go, like a few minutes late is.
 */
function overtimeIn(
  w: HrWorkspace,
  shift: HrShift | undefined,
  holiday: boolean,
  hours: number,
): number {
  if (hours <= 0) return 0;
  const extra = !shift || holiday ? hours : hours - shift.overtimeAfterHours;
  const grace = graceMinutes(w, shift ?? workDayShift(w));
  return extra * 60 >= Math.max(1, grace) ? round(extra) : 0;
}
/** Minutes late (or early) that are let go: the late-grace rule, or the shift's own. */
export function graceMinutes(w: HrWorkspace, shift: HrShift): number {
  const rule = w.rules.find((r) => r.id === "late-grace" && r.enabled);
  return rule ? Number(rule.value) || 0 : shift.graceMinutes;
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
  /** Minutes left before the shift ended, after the grace minutes. */
  early: number;
  /** How long the shift that day is, in minutes; 0 on a day off. */
  scheduledMinutes: number;
  /** The shift's own times that day, "09:00" / "16:00"; "" on a day off. */
  startTime: string;
  endTime: string;
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
        const grace = shift ? graceMinutes(w, shift) : 0;
        const late =
          shift && checkIn
            ? Math.max(
                0,
                Math.floor((Date.parse(checkIn) - start.getTime()) / 60000) -
                  grace,
              )
            : 0;
        const early =
          shift && checkIn && checkOut
            ? Math.max(
                0,
                Math.floor((end.getTime() - Date.parse(checkOut)) / 60000) -
                  grace,
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
          shift: shift?.name ?? "—",
          night,
          checkIn,
          checkOut,
          hours,
          late,
          early,
          scheduledMinutes: shift ? Math.round(shiftHours(shift) * 60) : 0,
          startTime: shift?.startTime ?? "",
          endTime: shift?.endTime ?? "",
          overtime: overtimeIn(w, shift, holiday, hours),
          status,
        };
      }),
  );
}
/** "1h 05m", "25 min", "7h". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)}h${rest ? ` ${String(rest).padStart(2, "0")}m` : ""}`;
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
