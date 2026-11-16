import type { Employee } from "@/types";
import {
  DEDUCTION_LABEL,
  dateRange,
  formatMinutes,
  monthBounds,
  round,
  shiftFor,
} from "./logic";
import type { HrPayrollEntry, HrWorkspace } from "./types";

/** Iraq's week, Saturday first. */
const WEEK = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];

/** ["Sat", "Sun", …, "Thu"] → "Sat–Thu"; days with gaps are listed. */
export function describeDays(days: string[]): string {
  const picked = WEEK.filter((d) => days.includes(d));
  if (picked.length === 0) return "no days";
  if (picked.length === 7) return "every day";
  const at = picked.map((d) => WEEK.indexOf(d));
  const run = at.every((n, i) => i === 0 || n === at[i - 1] + 1);
  return run && picked.length > 2
    ? `${picked[0]}–${picked[picked.length - 1]}`
    : picked.join(", ");
}

export interface PayslipLine {
  label: string;
  detail?: string;
  amount: number;
}

export interface Payslip {
  employeeName: string;
  code: string;
  jobTitle: string;
  department: string;
  bankAccount: string;
  joinDate: string;
  period: string;
  /** "November 2026". */
  periodLabel: string;
  status: HrPayrollEntry["status"];
  approvedAt?: string;
  paidAt?: string;
  currency: string;
  /** "Work day 09:00–16:00 · Sat–Thu". */
  workTime: string;
  workDays: number;
  workHours: number;
  perDay: number;
  perHour: number;
  perMinute: number;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  totalEarnings: number;
  totalDeductions: number;
  net: number;
  /** True when the deductions were more than the pay and the net stopped at 0. */
  floored: boolean;
}

/** Everything one payslip prints, worked out from its payroll row. */
export function buildPayslip(
  w: HrWorkspace,
  employee: Employee | undefined,
  entry: HrPayrollEntry,
): Payslip {
  const profile = w.profiles[entry.employeeId];
  const [from, to] = monthBounds(entry.period);
  const currency = w.settings.currency;

  // Which shifts the month was worked on, for the "work time" line.
  const shifts = new Map<string, string>();
  for (const day of dateRange(from, to)) {
    const shift = shiftFor(w, entry.employeeId, day);
    if (shift && !shifts.has(shift.id))
      shifts.set(
        shift.id,
        shift.name.includes(shift.startTime)
          ? `${shift.name} · ${describeDays(shift.days)}`
          : `${shift.name} ${shift.startTime}–${shift.endTime} · ${describeDays(shift.days)}`,
      );
  }

  const adjustments = w.adjustments.filter(
    (a) => a.employeeId === entry.employeeId && a.date.startsWith(entry.period),
  );
  // Itemise bonuses and penalties when the list still adds up to what the
  // payslip holds; an approved payslip keeps its own total either way.
  const itemise = (
    type: "bonus" | "penalty",
    total: number,
    label: string,
    plural: string,
  ) => {
    const items = adjustments.filter((a) => a.type === type);
    const sum = round(items.reduce((n, a) => n + a.amount, 0));
    if (total <= 0) return [];
    return sum === round(total)
      ? items.map((a) => ({ label, detail: [a.date, a.reason].filter(Boolean).join(" · "), amount: a.amount }))
      : [{ label: plural, amount: total }];
  };

  const earnedBase = entry.earnedBase ?? entry.baseSalary;
  const earnings: PayslipLine[] = [
    {
      label: "Base salary",
      detail:
        earnedBase < entry.baseSalary
          ? `From the join date ${profile?.joinDate ?? ""} · full month ${fmt(entry.baseSalary, currency)}`
          : undefined,
      amount: earnedBase,
    },
  ];
  if (entry.overtimeHours > 0)
    earnings.push({
      label: "Overtime",
      detail: `${entry.overtimeHours}h × ${fmt(entry.overtimeRate, currency)}`,
      amount: round(entry.overtimeHours * entry.overtimeRate),
    });
  earnings.push(...itemise("bonus", entry.bonuses, "Bonus", "Bonuses"));

  const ids = new Set(entry.deductionIds ?? []);
  const timeItems = w.deductions
    .filter((d) =>
      entry.deductionIds
        ? ids.has(d.id)
        : d.employeeId === entry.employeeId &&
          d.status === "approved" &&
          d.date >= from &&
          d.date <= to,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const deductions: PayslipLine[] = timeItems.map((d) => ({
    label: `${DEDUCTION_LABEL[d.kind]}${d.minutes ? ` · ${formatMinutes(d.minutes)}` : ""}`,
    detail: [d.date, d.note || d.detail].filter(Boolean).join(" · "),
    amount: d.amount,
  }));
  // A frozen total that the remaining items no longer add up to.
  const timeTotal = entry.timeDeductions ?? 0;
  const listed = round(timeItems.reduce((n, d) => n + d.amount, 0));
  if (timeTotal > 0 && listed !== round(timeTotal)) {
    deductions.length = 0;
    deductions.push({ label: "Time deductions", amount: timeTotal });
  }
  deductions.push(...itemise("penalty", entry.penalties, "Penalty", "Penalties"));
  if ((entry.unpaidDeduction ?? 0) > 0)
    deductions.push({ label: "Unpaid leave", amount: entry.unpaidDeduction! });
  if ((entry.tax ?? 0) > 0)
    deductions.push({
      label: "Tax",
      detail: `${w.settings.taxPercent}%`,
      amount: entry.tax!,
    });
  if ((entry.insurance ?? 0) > 0)
    deductions.push({
      label: "Insurance",
      detail: `${w.settings.insurancePercent}%`,
      amount: entry.insurance!,
    });

  const totalEarnings = round(earnings.reduce((n, l) => n + l.amount, 0));
  const totalDeductions = round(deductions.reduce((n, l) => n + l.amount, 0));
  const periodDate = new Date(`${entry.period}-01T12:00:00`);
  return {
    employeeName: employee?.fullName ?? "Former employee",
    code: employee?.code ?? "",
    jobTitle: profile?.jobTitle || employee?.position || "",
    department:
      w.departments.find((d) => d.id === profile?.departmentId)?.name ?? "",
    bankAccount: profile?.bankAccount ?? "",
    joinDate: profile?.joinDate ?? "",
    period: entry.period,
    periodLabel: periodDate.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    }),
    status: entry.status,
    approvedAt: entry.approvedAt,
    paidAt: entry.paidAt,
    currency,
    workTime: [...shifts.values()].join(" / ") || "No work time this month",
    workDays: entry.workDays ?? 0,
    workHours: round((entry.workMinutes ?? 0) / 60),
    perDay: entry.dayRate ?? 0,
    perHour: entry.hourRate ?? 0,
    perMinute: entry.minuteRate ?? 0,
    earnings,
    deductions,
    totalEarnings,
    totalDeductions,
    net: entry.netSalary,
    floored: totalEarnings - totalDeductions < 0,
  };
}

/** Whole numbers for big amounts, cents for small rates: "92 IQD", "0.07 USD". */
export function fmt(value: number, currency: string): string {
  const digits = Math.abs(value) < 100 && value % 1 !== 0 ? 2 : 0;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value)} ${currency}`;
}
