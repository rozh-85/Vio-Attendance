import type { AttendanceRecord, Employee, LeaveRecord } from "@/types";
import type {
  HrDeduction,
  HrDeductionKind,
  HrLeaveRequest,
  HrOvertimeRecord,
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
 * The work day from the payroll settings — 9 to 4 unless HR changes it — as a
 * shift. Everyone without a shift assignment or a work cycle works it, so the
 * attendance register and the salary rates read the same hours.
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
/** The first and last day of a "YYYY-MM" month. */
export function monthBounds(period: string): [string, string] {
  const last = new Date(
    Number(period.slice(0, 4)),
    Number(period.slice(5)),
    0,
  ).getDate();
  return [`${period}-01`, `${period}-${String(last).padStart(2, "0")}`];
}
/** The attendance register for a whole "YYYY-MM" month. */
export function monthRows(
  w: HrWorkspace,
  employees: Employee[],
  records: AttendanceRecord[],
  period: string,
  legacy: LeaveRecord[] = [],
  now = new Date(),
): AttendanceRow[] {
  if (!/^\d{4}-\d{2}$/.test(period)) return [];
  const [from, to] = monthBounds(period);
  return attendanceRows(w, employees, records, from, to, legacy, now);
}
/** The days and minutes someone is scheduled to work between two dates. */
export function workSchedule(
  w: HrWorkspace,
  employeeId: string,
  from: string,
  to: string,
): { days: number; minutes: number } {
  let days = 0;
  let minutes = 0;
  for (const day of dateRange(from, to)) {
    const shift = shiftFor(w, employeeId, day);
    if (!shift) continue;
    days += 1;
    minutes += Math.round(shiftHours(shift) * 60);
  }
  return { days, minutes };
}
export interface SalaryRates {
  workDays: number;
  workMinutes: number;
  perDay: number;
  perHour: number;
  perMinute: number;
}
/**
 * The monthly salary divided by the month's work time — 9 to 4 on the work
 * days unless the person has a shift of their own. This is what a minute
 * late, an hour of overtime or a day away is worth.
 */
export function salaryRates(
  w: HrWorkspace,
  employeeId: string,
  period: string,
  salary = w.profiles[employeeId]?.baseSalary ?? 0,
): SalaryRates {
  const [from, to] = monthBounds(period);
  const { days, minutes } = workSchedule(w, employeeId, from, to);
  return {
    workDays: days,
    workMinutes: minutes,
    perDay: days ? salary / days : 0,
    perHour: minutes ? (salary * 60) / minutes : 0,
    perMinute: minutes ? salary / minutes : 0,
  };
}
export const DEDUCTION_LABEL: Record<HrDeductionKind, string> = {
  late: "Late",
  early: "Left early",
  absent: "Absent",
  "unpaid-holiday": "Unpaid holiday",
  manual: "Deduction",
};
/** "1h 05m", "25 min", "7h". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)}h${rest ? ` ${String(rest).padStart(2, "0")}m` : ""}`;
}
function clock(iso: string): string {
  const d = new Date(iso);
  return clockLabel(`${d.getHours()}:${d.getMinutes()}`);
}
/** True once a payslip is approved or paid: nothing may change what it holds. */
export function payslipLocked(
  w: HrWorkspace,
  employeeId: string,
  period: string,
): boolean {
  return w.payrollEntries.some(
    (p) =>
      p.employeeId === employeeId &&
      p.period === period &&
      p.status !== "draft",
  );
}
/**
 * Every deduction of a payroll month: the ones already decided, and — as
 * "pending" — each late arrival, early leave, absence and unpaid holiday in
 * the check-ins that nobody has decided on yet. Pending ones are worked out
 * here every time and never saved, so nothing comes off a salary until
 * somebody approves it.
 */
export function periodDeductions(
  w: HrWorkspace,
  rows: AttendanceRow[],
  period: string,
): HrDeduction[] {
  if (!/^\d{4}-\d{2}$/.test(period)) return [];
  const [from, to] = monthBounds(period);
  const saved = w.deductions.filter((d) => d.date >= from && d.date <= to);
  const known = new Set(saved.map((d) => d.id));
  const rates = new Map<string, number>();
  const found: HrDeduction[] = [];
  for (const row of rows) {
    if (row.date < from || row.date > to) continue;
    if (!rates.has(row.employeeId))
      rates.set(row.employeeId, salaryRates(w, row.employeeId, period).perMinute);
    const perMinute = rates.get(row.employeeId)!;
    if (perMinute <= 0 || row.scheduledMinutes <= 0) continue;
    const shift = shiftFor(w, row.employeeId, row.date);
    const grace = shift ? graceMinutes(w, shift) : 0;
    const graceNote = grace ? ` · ${grace} min grace` : "";
    const add = (kind: HrDeductionKind, minutes: number, detail: string) => {
      const id = `${kind}-${row.employeeId}-${row.date}`;
      if (minutes <= 0 || known.has(id)) return;
      found.push({
        id,
        employeeId: row.employeeId,
        date: row.date,
        kind,
        minutes,
        amount: round(minutes * perMinute),
        note: "",
        detail,
        status: "pending",
      });
    };
    if (row.status === "Absent")
      add("absent", row.scheduledMinutes, `No check-in · ${clockRange(row.startTime, row.endTime)}`);
    if (row.status === "Holiday") {
      const covering = w.holidays.filter(
        (h) => h.startDate <= row.date && h.endDate >= row.date,
      );
      if (covering.length && !covering.some((h) => h.paid))
        add("unpaid-holiday", row.scheduledMinutes, covering[0].name);
    }
    if (row.late > 0)
      add("late", row.late, `In ${clock(row.checkIn)} · starts ${clockLabel(row.startTime)}${graceNote}`);
    if (row.early > 0)
      add("early", row.early, `Out ${clock(row.checkOut)} · ends ${clockLabel(row.endTime)}${graceNote}`);
  }
  return [...found, ...saved].sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId),
  );
}
/**
 * Overtime the check-ins show that nobody has decided on yet, as "pending".
 * Like the deductions, it is worked out every time and never saved until it
 * is approved or rejected; a day that already has an overtime record —
 * decided, or typed in by hand — is not offered again.
 */
export function attendanceOvertime(
  w: HrWorkspace,
  rows: AttendanceRow[],
): HrOvertimeRecord[] {
  return rows
    .filter(
      (row) =>
        row.overtime > 0 &&
        !w.overtime.some(
          (o) => o.employeeId === row.employeeId && o.date === row.date,
        ),
    )
    .map((row) => {
      const holiday = w.holidays.find(
        (h) => h.startDate <= row.date && h.endDate >= row.date,
      );
      const worked = `Worked ${clock(row.checkIn)} – ${clock(row.checkOut)} · ${row.hours} hours`;
      return {
        id: `ot-${row.employeeId}-${row.date}`,
        employeeId: row.employeeId,
        date: row.date,
        hours: row.overtime,
        reason: "",
        detail: holiday
          ? `${worked} on a holiday (${holiday.name})`
          : row.scheduledMinutes
            ? `${worked} on a ${round(row.scheduledMinutes / 60)}-hour day`
            : `${worked} on a day off`,
        status: "pending" as const,
      };
    });
}
/** A month's overtime: what is saved, and what the check-ins show waiting. */
export function periodOvertime(
  w: HrWorkspace,
  found: HrOvertimeRecord[],
  period: string,
): HrOvertimeRecord[] {
  return [
    ...found,
    ...w.overtime.filter((o) => o.date.startsWith(period)),
  ].sort(
    (a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId),
  );
}
/** True when overtime only counts once approved (the overtime-approval rule). */
export function overtimeNeedsApproval(w: HrWorkspace): boolean {
  return w.rules.some((r) => r.id === "overtime-approval" && r.enabled);
}
export function calculatePayroll(
  w: HrWorkspace,
  employees: Employee[],
  period: string,
  /** Overtime found in the check-ins; it only counts with approval turned off. */
  foundOvertime: HrOvertimeRecord[] = [],
): HrPayrollEntry[] {
  if (!/^\d{4}-\d{2}$/.test(period))
    throw new Error("Choose a payroll month.");
  if (w.rules.some((r) => r.id === "monthly-payroll" && !r.enabled))
    throw new Error(
      "Monthly payroll is turned off in Rules & settings. Turn it on to calculate salaries.",
    );
  const [from, to] = monthBounds(period);
  return employees
    .filter(
      (e) =>
        w.profiles[e.id]?.status !== "inactive" &&
        (!w.profiles[e.id]?.joinDate || w.profiles[e.id].joinDate <= to),
    )
    .map((e) => {
      const old = w.payrollEntries.find(
        (p) => p.period === period && p.employeeId === e.id,
      );
      if (old && old.status !== "draft") return old;
      const baseSalary = w.profiles[e.id]?.baseSalary ?? 0;
      const rates = salaryRates(w, e.id, period, baseSalary);
      // Someone who joins in the month is paid for the work time after it.
      const joinDate = w.profiles[e.id]?.joinDate ?? "";
      const earnedBase =
        joinDate > from && rates.workMinutes > 0
          ? round(
              (baseSalary * workSchedule(w, e.id, joinDate, to).minutes) /
                rates.workMinutes,
            )
          : baseSalary;
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
      const approvedDeductions = w.deductions.filter(
        (d) =>
          d.employeeId === e.id &&
          d.status === "approved" &&
          d.date >= from &&
          d.date <= to,
      );
      const timeDeductions = round(
        approvedDeductions.reduce((n, d) => n + d.amount, 0),
      );
      const requireApproval = overtimeNeedsApproval(w);
      const paidOvertime = [
        ...w.overtime,
        ...(requireApproval ? [] : foundOvertime),
      ].filter(
        (o) =>
          o.employeeId === e.id &&
          o.date.startsWith(period) &&
          (o.status === "approved" ||
            (!requireApproval && o.status === "pending")),
      );
      const overtimeHours = round(
        paidOvertime.reduce((n, o) => n + o.hours, 0),
      );
      // An hour is the salary over the month's work hours; without any work
      // time to divide by, fall back to the old fixed monthly hours.
      const hourRate =
        rates.perHour || baseSalary / (w.settings.monthlyHours || 208);
      const dayRate =
        rates.perDay ||
        baseSalary / (new Date(`${to}T12:00:00`).getDate() || 30);
      const overtimeRate = round(hourRate * w.settings.overtimeMultiplier);
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
              r.amount * portion * (type.unit === "hours" ? hourRate : dayRate)
            );
          }, 0),
      );
      const gross = round(
        Math.max(
          0,
          earnedBase + bonuses + overtimeHours * overtimeRate - unpaidDeduction,
        ),
      );
      const tax = round((gross * w.settings.taxPercent) / 100);
      const insurance = round((earnedBase * w.settings.insurancePercent) / 100);
      return {
        id: old?.id ?? `pay-${period}-${e.id}`,
        employeeId: e.id,
        period,
        baseSalary,
        bonuses,
        penalties,
        overtimeHours,
        overtimeRate,
        // Deductions never take a salary below nothing.
        netSalary: round(
          Math.max(0, gross - penalties - timeDeductions - tax - insurance),
        ),
        tax,
        insurance,
        unpaidDeduction,
        status: "draft",
        workDays: rates.workDays,
        workMinutes: rates.workMinutes,
        dayRate: round(rates.perDay),
        hourRate: round(rates.perHour),
        minuteRate: round(rates.perMinute),
        earnedBase,
        timeDeductions,
        deductionIds: approvedDeductions.map((d) => d.id),
        overtimeIds: paidOvertime.map((o) => o.id),
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
