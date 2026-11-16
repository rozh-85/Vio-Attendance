import { useMemo, useState } from "react";
import type { Employee } from "@/types";
import type {
  HrAdjustment,
  HrDeduction,
  HrOvertimeRecord,
  HrPayrollEntry,
  HrWorkspace,
} from "@/services/hr/types";
import { createHrId } from "@/services/hr/store";
import {
  DEDUCTION_LABEL,
  clockRange,
  formatMinutes,
  localDate,
  overtimeNeedsApproval,
  payslipLocked,
  round,
  salaryRates,
  shiftHours,
  weekdays,
  workDayShift,
} from "@/services/hr/logic";
import { buildPayslip, describeDays, fmt, formatHours } from "@/services/hr/payslip";
import { exportPayslipsPdf } from "@/services/report/payslipPdf";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Check, Plus, Printer } from "@/components/icons";
import {
  Collection,
  ConfirmButton,
  Editor,
  Section,
  Status,
  Table,
  options,
  type Column,
  type Field,
  type Values,
} from "./HrUi";

type Commit = (m: (w: HrWorkspace) => HrWorkspace, action: string) => Promise<void>;

/** A compact dropdown for a section header; the form one is full width. */
const filterClass =
  "h-10 max-w-56 rounded-xl border border-slate-200 bg-card px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const LOCKED_NOTE = "This person's payslip for the month is approved. Reopen it in the payroll run to change it.";

function nameOf(employees: Employee[], id: string): string {
  return employees.find((e) => e.id === id)?.fullName ?? "Former employee";
}
/** "November 2026". */
export function monthLabel(period: string): string {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return new Date(`${period}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}
function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
/** Stored and freshly worked out rows are the same when nothing has moved. */
function same(a: HrPayrollEntry | undefined, b: HrPayrollEntry): boolean {
  if (!a) return false;
  const pick = (e: HrPayrollEntry) =>
    JSON.stringify([e.netSalary, e.baseSalary, e.earnedBase, e.bonuses, e.penalties, e.overtimeHours, e.overtimeRate, e.tax, e.insurance, e.unpaidDeduction, e.timeDeductions, e.minuteRate, e.deductionIds]);
  return pick(a) === pick(b);
}

export function HrPayroll({
  workspace,
  employees,
  period,
  setPeriod,
  payroll,
  payrollError,
  deductions,
  overtime,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  period: string;
  setPeriod: (v: string) => void;
  /** The month worked out now; approved and paid rows are the saved ones. */
  payroll: HrPayrollEntry[];
  payrollError: string;
  /** This month's deductions: decided ones and the check-ins' pending ones. */
  deductions: HrDeduction[];
  /** This month's overtime: saved records and the check-ins' pending ones. */
  overtime: HrOvertimeRecord[];
  commit: Commit;
}) {
  const currency = workspace.settings.currency;
  const money = (n: number) => fmt(n, currency);
  const now = () => new Date().toISOString();
  const locked = (employeeId: string, month = period) =>
    payslipLocked(workspace, employeeId, month);
  const saved = workspace.payrollEntries.filter((p) => p.period === period);
  const savedRow = (employeeId: string) =>
    saved.find((p) => p.employeeId === employeeId);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [approving, setApproving] = useState<HrDeduction | null>(null);
  const [approvingAll, setApprovingAll] = useState<HrDeduction[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [who, setWho] = useState("");
  const [otView, setOtView] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [otWho, setOtWho] = useState("");
  const needsApproval = overtimeNeedsApproval(workspace);
  const otWaitingFor = (employeeId: string) =>
    needsApproval
      ? overtime.filter((o) => o.status === "pending" && o.employeeId === employeeId).length
      : 0;

  const pending = deductions.filter((d) => d.status === "pending");
  const waitingFor = (employeeId: string) =>
    pending.filter((d) => d.employeeId === employeeId).length;
  const shown = deductions.filter(
    (d) => (view === "all" || d.status === view) && (!who || d.employeeId === who),
  );
  const shownPending = shown.filter((d) => d.status === "pending");
  const drafts = payroll.filter((r) => r.status === "draft");
  const approved = payroll.filter((r) => r.status === "approved");
  const unsaved = drafts.some((r) => !same(savedRow(r.employeeId), r));

  /** Saves rows of this month with a new state, leaving every other row. */
  function setState(rows: HrPayrollEntry[], status: HrPayrollEntry["status"], action: string) {
    const at = now();
    const ids = new Set(rows.map((r) => r.employeeId));
    return commit(
      (w) => ({
        ...w,
        payrollPeriod: period,
        payrollEntries: [
          ...w.payrollEntries.filter(
            (e) => !(e.period === period && ids.has(e.employeeId)),
          ),
          ...rows.map((r) => ({
            ...r,
            status,
            approvedAt: status === "draft" ? undefined : (r.approvedAt ?? at),
            paidAt: status === "paid" ? at : undefined,
          })),
        ],
      }),
      action,
    );
  }

  function decide(list: HrDeduction[], status: "approved" | "rejected", note?: string, amount?: number) {
    const at = now();
    const ids = new Set(list.map((d) => d.id));
    const subject = list.length === 1 ? nameOf(employees, list[0].employeeId) : `${list.length} deductions`;
    return commit(
      (w) => ({
        ...w,
        deductions: [
          ...w.deductions.filter((d) => !ids.has(d.id)),
          ...list.map((d) => ({
            ...d,
            status,
            amount: amount ?? d.amount,
            note: note ?? d.note,
            decidedAt: at,
          })),
        ],
      }),
      list.length === 1
        ? `${status === "approved" ? "Approved" : "Dismissed"} ${DEDUCTION_LABEL[list[0].kind].toLowerCase()} deduction of ${money(amount ?? list[0].amount)} for ${subject} (${list[0].date})`
        : `${status === "approved" ? "Approved" : "Dismissed"} ${subject} (${money(list.reduce((n, d) => n + d.amount, 0))})`,
    );
  }

  function printSlips(rows: HrPayrollEntry[]) {
    exportPayslipsPdf(
      rows.map((r) => buildPayslip(workspace, employees.find((e) => e.id === r.employeeId), r)),
    );
  }

  /* ── Payroll run ─────────────────────────────────────────────────── */

  const payrollCols: Column<HrPayrollEntry>[] = [
    {
      title: "Employee",
      render: (r) => <span className="font-semibold">{nameOf(employees, r.employeeId)}</span>,
    },
    {
      title: "Salary",
      render: (r) => (
        <div>
          <div>{money(r.earnedBase ?? r.baseSalary)}</div>
          <div className="text-xs text-ink-500">
            {r.minuteRate ? `${money(r.minuteRate)} a minute` : "No work time"}
            {(r.earnedBase ?? r.baseSalary) < r.baseSalary && " · from join date"}
          </div>
        </div>
      ),
    },
    {
      title: "Overtime",
      render: (r) => {
        const waiting = r.status === "draft" ? otWaitingFor(r.employeeId) : 0;
        return (
          <div>
            <div>{money(round(r.overtimeHours * r.overtimeRate))}</div>
            <div className="text-xs text-ink-500">
              {r.overtimeHours > 0
                ? `${formatHours(r.overtimeHours)} × ${money(r.overtimeRate)}`
                : `${money(r.overtimeRate)} an hour`}
            </div>
            {waiting > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-amber-700 hover:underline"
                onClick={() => {
                  setOtView("pending");
                  setOtWho(r.employeeId);
                  document.getElementById("hr-overtime")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {waiting} waiting for approval
              </button>
            )}
          </div>
        );
      },
    },
    { title: "Bonus", render: (r) => money(r.bonuses) },
    {
      title: "Deductions",
      render: (r) => {
        const total =
          (r.timeDeductions ?? 0) + r.penalties + (r.tax ?? 0) + (r.insurance ?? 0) + (r.unpaidDeduction ?? 0);
        const waiting = r.status === "draft" ? waitingFor(r.employeeId) : 0;
        return (
          <div>
            <div>{money(total)}</div>
            {waiting > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-amber-700 hover:underline"
                onClick={() => {
                  setView("pending");
                  setWho(r.employeeId);
                  document.getElementById("hr-deductions")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {waiting} waiting for approval
              </button>
            )}
          </div>
        );
      },
    },
    {
      title: "Net",
      render: (r) => <span className="font-bold">{money(r.netSalary)}</span>,
    },
    { title: "State", render: (r) => <Status>{r.status}</Status> },
    {
      title: "Actions",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Printer width={14} />}
            onClick={() => printSlips([r])}
          >
            Payslip
          </Button>
          {r.status === "draft" && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Check width={14} />}
              onClick={() => void setState([r], "approved", `Approved the ${monthLabel(period)} payslip for ${nameOf(employees, r.employeeId)}`)}
            >
              Approve
            </Button>
          )}
          {r.status === "approved" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void setState([r], "paid", `Marked the ${monthLabel(period)} payslip for ${nameOf(employees, r.employeeId)} as paid`)}
              >
                Mark paid
              </Button>
              <ConfirmButton
                label="Reopen"
                confirm="Reopen?"
                onConfirm={() => setState([r], "draft", `Reopened the ${monthLabel(period)} payslip for ${nameOf(employees, r.employeeId)}`)}
              />
            </>
          )}
          {r.status === "paid" && (
            <ConfirmButton
              label="Undo paid"
              confirm="Undo paid?"
              onConfirm={() => setState([r], "approved", `Took the paid mark off the ${monthLabel(period)} payslip for ${nameOf(employees, r.employeeId)}`)}
            />
          )}
        </div>
      ),
    },
  ];

  /* ── Deductions ──────────────────────────────────────────────────── */

  const deductionCols: Column<HrDeduction>[] = [
    { title: "Date", render: (d) => <span className="whitespace-nowrap">{shortDate(d.date)}</span> },
    { title: "Employee", render: (d) => nameOf(employees, d.employeeId) },
    {
      title: "What",
      render: (d) => (
        <div>
          <div className="font-semibold">
            {DEDUCTION_LABEL[d.kind]}
            {d.minutes > 0 && ` · ${formatMinutes(d.minutes)}`}
          </div>
          {d.detail && <div className="text-xs text-ink-500">{d.detail}</div>}
        </div>
      ),
    },
    { title: "Amount", render: (d) => <span className="font-semibold">{money(d.amount)}</span> },
    { title: "Note", render: (d) => d.note || <span className="text-ink-400">—</span> },
    {
      title: "Status",
      render: (d) => (
        <Status>{d.status === "pending" ? "pending approval" : d.status === "rejected" ? "dismissed" : "approved"}</Status>
      ),
    },
    {
      title: "Actions",
      render: (d) =>
        locked(d.employeeId, d.date.slice(0, 7)) ? (
          <span title={LOCKED_NOTE}>
            <Status>Payslip approved</Status>
          </span>
        ) : d.status === "pending" ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" leftIcon={<Check width={14} />} onClick={() => setApproving(d)}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void decide([d], "rejected")}>
              Dismiss
            </Button>
          </div>
        ) : d.kind === "manual" ? (
          <ConfirmButton
            label="Delete"
            confirm="Delete?"
            onConfirm={() =>
              commit(
                (w) => ({ ...w, deductions: w.deductions.filter((x) => x.id !== d.id) }),
                `Deleted a ${money(d.amount)} deduction for ${nameOf(employees, d.employeeId)} (${d.date})`,
              )
            }
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void commit(
                (w) => ({ ...w, deductions: w.deductions.filter((x) => x.id !== d.id) }),
                `Undid the ${DEDUCTION_LABEL[d.kind].toLowerCase()} decision for ${nameOf(employees, d.employeeId)} (${d.date})`,
              )
            }
          >
            Undo
          </Button>
        ),
    },
  ];

  const noteField: Field = {
    key: "note",
    label: "Note (optional)",
    placeholder: "e.g. late",
    hint: "Your own words, printed on the payslip.",
  };

  /* ── Bonuses, penalties and overtime ─────────────────────────────── */

  const employeeField: Field = {
    key: "employeeId",
    label: "Employee",
    type: "select",
    options: employees.map((e) => ({ value: e.id, label: e.fullName })),
    required: true,
  };
  const adjustmentFields: Field[] = [
    employeeField,
    { key: "type", label: "Type", type: "select", options: options(["bonus", "penalty"]), required: true },
    { key: "amount", label: "Amount", type: "number", min: 0, required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "reason", label: "Reason (optional)" },
  ];
  const lockCheck = (r: { employeeId: string; date: string }) =>
    locked(r.employeeId, r.date.slice(0, 7)) ? LOCKED_NOTE : null;

  /* ── Settings ────────────────────────────────────────────────────── */

  const s = workspace.settings;
  const workHours = useMemo(() => {
    const [a, b] = [s.workStart, s.workEnd].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
    return round((((b - a + 1440) % 1440) || 0) / 60);
  }, [s.workStart, s.workEnd]);
  const settingsFields: Field[] = [
    { key: "workStart", label: "Work day starts", type: "time", required: true },
    { key: "workEnd", label: "Work day ends", type: "time", required: true },
    {
      key: "workDays",
      label: "Work days",
      type: "multi",
      required: true,
      options: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => ({ value: d, label: d })),
    },
    { key: "currency", label: "Currency", required: true, hint: "Displayed beside every payroll figure." },
    { key: "overtimeMultiplier", label: "Overtime multiplier", type: "number", min: 0, step: 0.1, required: true, hint: "An overtime hour pays the hour rate times this." },
    { key: "taxPercent", label: "Tax %", type: "number", min: 0, max: 100 },
    { key: "insurancePercent", label: "Insurance %", type: "number", min: 0, max: 100 },
    { key: "approvalLevels", label: "Leave approval levels", type: "number", min: 1, max: 10, required: true },
  ];
  const settingCards: [string, string][] = [
    ["Work day", `${clockRange(s.workStart, s.workEnd)} · ${workHours} hours`],
    ["Work days", describeDays(s.workDays)],
    ["Currency", s.currency],
    ["Overtime", `×${s.overtimeMultiplier}`],
    ["Tax", `${s.taxPercent || 0}%`],
    ["Insurance", `${s.insurancePercent || 0}%`],
    ["Leave approval levels", String(s.approvalLevels)],
  ];

  return (
    <div className="space-y-5">
      <Section
        title={`Payroll run · ${monthLabel(period)}`}
        description="Each salary is divided by the person's work time — 9 to 4 on the work days unless they have a shift of their own — to get the rate for a day, an hour and a minute. Approved deductions, overtime, bonuses, penalties, unpaid leave, tax and insurance are then applied. An approved or paid payslip is frozen."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              aria-label="Payroll period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 w-40"
            />
            <Button
              size="sm"
              variant={unsaved ? "primary" : "outline"}
              disabled={!!payrollError}
              onClick={() =>
                void commit(
                  (w) => ({
                    ...w,
                    payrollPeriod: period,
                    payrollEntries: [
                      ...w.payrollEntries.filter((entry) => entry.period !== period),
                      ...payroll,
                    ],
                  }),
                  `Calculated payroll for ${period}`,
                )
              }
            >
              Calculate payroll
            </Button>
            {drafts.length > 0 && (
              <ConfirmButton
                label={`Approve all (${drafts.length})`}
                confirm={`Approve ${drafts.length} payslips?`}
                onConfirm={() => setState(drafts, "approved", `Approved ${drafts.length} payslips for ${monthLabel(period)}`)}
              />
            )}
            {approved.length > 0 && (
              <ConfirmButton
                label={`Mark all paid (${approved.length})`}
                confirm={`Mark ${approved.length} paid?`}
                onConfirm={() => setState(approved, "paid", `Marked ${approved.length} payslips for ${monthLabel(period)} as paid`)}
              />
            )}
            {payroll.length > 0 && (
              <Button size="sm" variant="outline" leftIcon={<Printer width={15} />} onClick={() => printSlips(payroll)}>
                Print all payslips
              </Button>
            )}
          </div>
        }
      >
        {payrollError ? (
          <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {payrollError}
          </p>
        ) : (
          unsaved &&
          saved.length > 0 && (
            <p className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              The figures below have changed since the payroll was last calculated. Press <b>Calculate payroll</b> to save them.
            </p>
          )
        )}
        <Table
          rows={payroll}
          columns={payrollCols}
          empty="Add salary details to employee profiles, then calculate a payroll period."
        />
      </Section>

      <div id="hr-deductions" className="scroll-mt-4">
        <Section
          title={`Deductions · ${monthLabel(period)}`}
          description="Late arrivals, early leaves, absences and unpaid holidays found in the check-ins, each at the person's minute rate. Nothing comes off a salary until you approve it — you can change the amount and add a note such as “late”. A deduction you add by hand counts straight away."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Show deductions"
                className={filterClass}
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                <option value="pending">Waiting for approval ({pending.length})</option>
                <option value="approved">Approved</option>
                <option value="rejected">Dismissed</option>
                <option value="all">All</option>
              </select>
              <select
                aria-label="Deductions for"
                className={filterClass}
                value={who}
                onChange={(e) => setWho(e.target.value)}
              >
                <option value="">Everyone</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
              {shownPending.length > 1 && (
                <Button size="sm" variant="secondary" leftIcon={<Check width={15} />} onClick={() => setApprovingAll(shownPending)}>
                  Approve all ({shownPending.length})
                </Button>
              )}
              <Button size="sm" leftIcon={<Plus width={15} />} onClick={() => setAdding(true)}>
                Add deduction
              </Button>
            </div>
          }
        >
          {shown.length > 0 && (
            <p className="border-b border-slate-100 px-5 py-2.5 text-sm text-ink-500">
              {shown.length} {shown.length === 1 ? "deduction" : "deductions"} ·{" "}
              <b className="text-ink-900">{money(round(shown.reduce((n, d) => n + d.amount, 0)))}</b>
            </p>
          )}
          <Table
            rows={shown}
            columns={deductionCols}
            empty={
              view === "pending"
                ? "Nothing waiting. Late arrivals, early leaves and absences show up here from the check-ins."
                : "No deductions here for this month."
            }
          />
        </Section>
      </div>

      <OvertimeSection
        workspace={workspace}
        employees={employees}
        period={period}
        overtime={overtime}
        view={otView}
        setView={setOtView}
        who={otWho}
        setWho={setOtWho}
        commit={commit}
      />

      <Collection<HrAdjustment>
        title="Adjustments"
        description="One-time bonuses and penalties for a payroll month. The reason is optional."
        rows={workspace.adjustments}
        columns={[
          { title: "Employee", render: (r) => nameOf(employees, r.employeeId) },
          { title: "Type", render: (r) => <Status>{r.type}</Status> },
          { title: "Amount", render: (r) => money(r.amount) },
          { title: "Date", render: (r) => r.date },
          { title: "Reason", render: (r) => r.reason || "—" },
        ]}
        fields={adjustmentFields}
        defaults={{ id: "", employeeId: "", type: "bonus", amount: 0, date: localDate(), reason: "" }}
        canEdit={(r) => !lockCheck(r)}
        validate={lockCheck}
        onSave={async (r) =>
          commit(
            (w) => ({ ...w, adjustments: [...w.adjustments.filter((a) => a.id !== r.id), r] }),
            `Saved ${r.type} adjustment for ${nameOf(employees, r.employeeId)}`,
          )
        }
        onDelete={async (r) =>
          commit(
            (w) => ({ ...w, adjustments: w.adjustments.filter((a) => a.id !== r.id) }),
            `Deleted ${r.type} adjustment for ${nameOf(employees, r.employeeId)}`,
          )
        }
      />

      <Collection
        title="Performance reviews"
        description="Store periodic appraisals with a rating, notes and completion state."
        rows={workspace.performanceReviews}
        columns={[
          { title: "Employee", render: (r) => nameOf(employees, r.employeeId) },
          { title: "Period", render: (r) => r.period },
          { title: "Rating", render: (r) => `${r.rating}/5` },
          { title: "Status", render: (r) => <Status>{r.status}</Status> },
          { title: "Notes", render: (r) => r.notes || "—" },
        ]}
        fields={[
          employeeField,
          { key: "period", label: "Review period", type: "month", required: true },
          { key: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5, step: 0.5, required: true },
          { key: "status", label: "Status", type: "select", options: options(["draft", "complete"]), required: true },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        defaults={{ id: "", employeeId: "", period, rating: 3, notes: "", status: "draft" }}
        onSave={async (r) =>
          commit(
            (w) => ({ ...w, performanceReviews: [...w.performanceReviews.filter((p) => p.id !== r.id), r] }),
            `Saved performance review for ${nameOf(employees, r.employeeId)}`,
          )
        }
      />

      <Section
        title="Work time & payroll settings"
        description="The work day is what every salary is divided by for people without a shift of their own. A change updates draft payslips and waiting deductions; approved payslips keep their figures."
        action={
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            Edit settings
          </Button>
        }
      >
        <div className="grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
          {settingCards.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</div>
              <div className="mt-1 text-lg font-bold">{value}</div>
            </div>
          ))}
        </div>
      </Section>

      {settingsOpen && (
        <Editor
          title="Work time & payroll settings"
          fields={settingsFields}
          initial={workspace.settings as unknown as Values}
          onClose={() => setSettingsOpen(false)}
          onSave={async (v) => {
            if (v.workStart === v.workEnd)
              throw new Error("The work day must end at a different time from when it starts.");
            await commit(
              (w) => ({
                ...w,
                settings: {
                  ...w.settings,
                  workStart: String(v.workStart),
                  workEnd: String(v.workEnd),
                  workDays: weekdays.filter((d) => (v.workDays as string[]).includes(d)),
                  currency: String(v.currency).trim(),
                  overtimeMultiplier: Number(v.overtimeMultiplier),
                  taxPercent: Number(v.taxPercent) || 0,
                  insurancePercent: Number(v.insurancePercent) || 0,
                  approvalLevels: Number(v.approvalLevels),
                },
              }),
              "Updated work time and payroll settings",
            );
          }}
        />
      )}

      {approving && (
        <Editor
          title={`Approve deduction — ${nameOf(employees, approving.employeeId)}`}
          description={`${shortDate(approving.date)} · ${DEDUCTION_LABEL[approving.kind]}${approving.minutes ? ` ${formatMinutes(approving.minutes)}` : ""}${approving.detail ? ` · ${approving.detail}` : ""}`}
          fields={[
            {
              key: "amount",
              label: "Amount to take off",
              type: "number",
              min: 0,
              required: true,
              hint: (v) => {
                const rate = salaryRates(workspace, approving.employeeId, approving.date.slice(0, 7)).perMinute;
                const full = round(approving.minutes * rate);
                return Number(v.amount) === full
                  ? `${formatMinutes(approving.minutes)} × ${money(rate)} a minute. Lower it to take off less.`
                  : `The time is worth ${money(full)} (${formatMinutes(approving.minutes)} × ${money(rate)} a minute).`;
              },
            },
            noteField,
          ]}
          initial={{ amount: approving.amount, note: approving.note }}
          onClose={() => setApproving(null)}
          onSave={async (v) => {
            const amount = Number(v.amount);
            if (!(amount > 0)) throw new Error("Enter an amount above zero, or dismiss the deduction instead.");
            await decide([approving], "approved", String(v.note ?? "").trim(), round(amount));
          }}
        />
      )}

      {approvingAll && (
        <Editor
          title={`Approve ${approvingAll.length} deductions`}
          description={`${money(round(approvingAll.reduce((n, d) => n + d.amount, 0)))} in all${who ? ` for ${nameOf(employees, who)}` : ""}, each at the amount shown. The note goes on every one.`}
          fields={[noteField]}
          initial={{ note: "" }}
          onClose={() => setApprovingAll(null)}
          onSave={async (v) => {
            const note = String(v.note ?? "").trim();
            await decide(approvingAll, "approved", note || undefined);
          }}
        />
      )}

      {adding && (
        <Editor
          title="Add a deduction"
          description="For anything the check-ins do not show. Give the time missed and the amount is worked out at the person's minute rate, or type the amount yourself."
          fields={[
            employeeField,
            { key: "date", label: "Date", type: "date", required: true },
            {
              key: "minutes",
              label: "Time missed, in minutes (optional)",
              type: "number",
              min: 0,
              hint: (v) => {
                if (!v.employeeId || !v.date) return "Choose the employee and the date to see what the time is worth.";
                const rate = salaryRates(workspace, String(v.employeeId), String(v.date).slice(0, 7)).perMinute;
                if (!rate) return "This person has no salary or no work time that month.";
                return Number(v.minutes) > 0
                  ? `${formatMinutes(Number(v.minutes))} × ${money(rate)} a minute = ${money(round(Number(v.minutes) * rate))}`
                  : `${money(rate)} a minute · ${money(rate * 60)} an hour.`;
              },
            },
            {
              key: "amount",
              label: "Amount (optional)",
              type: "number",
              min: 0,
              hint: "Leave it empty to use the time missed.",
            },
            noteField,
          ]}
          initial={{ employeeId: who, date: localDate().startsWith(period) ? localDate() : `${period}-01`, minutes: "", amount: "", note: "" }}
          onClose={() => setAdding(false)}
          onSave={async (v) => {
            const employeeId = String(v.employeeId);
            const day = String(v.date);
            const minutes = Number(v.minutes) || 0;
            const rate = salaryRates(workspace, employeeId, day.slice(0, 7)).perMinute;
            const amount = round(Number(v.amount) || minutes * rate);
            if (!(amount > 0))
              throw new Error("Give the time missed or an amount above zero.");
            if (locked(employeeId, day.slice(0, 7))) throw new Error(LOCKED_NOTE);
            const note = String(v.note ?? "").trim();
            await commit(
              (w) => ({
                ...w,
                deductions: [
                  ...w.deductions,
                  {
                    id: createHrId("deduction"),
                    employeeId,
                    date: day,
                    kind: "manual",
                    minutes,
                    amount,
                    note,
                    status: "approved",
                    decidedAt: now(),
                  },
                ],
              }),
              `Added a ${money(amount)} deduction for ${nameOf(employees, employeeId)} (${day})${note ? `: ${note}` : ""}`,
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * The month's overtime: what the check-ins show past the work day (or on a
 * day off or holiday), each with what it pays. Like the deductions, nothing
 * is paid until somebody approves it — unless the overtime-approval rule is
 * turned off.
 */
function OvertimeSection({
  workspace,
  employees,
  period,
  overtime,
  view,
  setView,
  who,
  setWho,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  period: string;
  overtime: HrOvertimeRecord[];
  view: "pending" | "approved" | "rejected" | "all";
  setView: (v: "pending" | "approved" | "rejected" | "all") => void;
  who: string;
  setWho: (v: string) => void;
  commit: Commit;
}) {
  const currency = workspace.settings.currency;
  const money = (n: number) => fmt(n, currency);
  const needsApproval = overtimeNeedsApproval(workspace);
  const [approving, setApproving] = useState<HrOvertimeRecord | null>(null);
  const [approvingAll, setApprovingAll] = useState<HrOvertimeRecord[] | null>(null);
  const [adding, setAdding] = useState(false);
  const locked = (o: { employeeId: string; date: string }) =>
    payslipLocked(workspace, o.employeeId, o.date.slice(0, 7));
  /** What one overtime hour pays this person that month. */
  const rateFor = (employeeId: string, day: string) => {
    const base = workspace.profiles[employeeId]?.baseSalary ?? 0;
    const perHour =
      salaryRates(workspace, employeeId, day.slice(0, 7), base).perHour ||
      base / (workspace.settings.monthlyHours || 208);
    return round(perHour * workspace.settings.overtimeMultiplier);
  };
  const pending = overtime.filter((o) => o.status === "pending");
  const shown = overtime.filter(
    (o) => (view === "all" || o.status === view) && (!who || o.employeeId === who),
  );
  const shownPending = shown.filter((o) => o.status === "pending");
  const remove = (o: HrOvertimeRecord, action: string) =>
    commit((w) => ({ ...w, overtime: w.overtime.filter((x) => x.id !== o.id) }), action);
  function decide(list: HrOvertimeRecord[], status: "approved" | "rejected", note?: string, hours?: number) {
    const at = new Date().toISOString();
    const ids = new Set(list.map((o) => o.id));
    return commit(
      (w) => ({
        ...w,
        overtime: [
          ...w.overtime.filter((o) => !ids.has(o.id)),
          ...list.map((o) => ({
            ...o,
            status,
            hours: hours ?? o.hours,
            reason: note ?? o.reason,
            decidedAt: at,
          })),
        ],
      }),
      list.length === 1
        ? `${status === "approved" ? "Approved" : "Rejected"} ${formatHours(hours ?? list[0].hours)} overtime for ${nameOf(employees, list[0].employeeId)} (${list[0].date})`
        : `${status === "approved" ? "Approved" : "Rejected"} ${list.length} overtime days (${formatHours(round(list.reduce((n, o) => n + o.hours, 0)))})`,
    );
  }
  const noteField: Field = {
    key: "note",
    label: "Note (optional)",
    placeholder: "e.g. stock count",
    hint: "Your own words, printed on the payslip.",
  };
  const hoursHint = (employeeId: string, day: string) => (v: Values) => {
    if (!employeeId || !day) return "Choose the employee and the date to see what it pays.";
    const rate = rateFor(employeeId, day);
    const hours = Number(v.hours) || 0;
    return hours > 0
      ? `${formatHours(hours)} × ${money(rate)} an hour = ${money(round(hours * rate))}`
      : `${money(rate)} an hour (the hour rate × ${workspace.settings.overtimeMultiplier}).`;
  };

  const columns: Column<HrOvertimeRecord>[] = [
    { title: "Date", render: (o) => <span className="whitespace-nowrap">{shortDate(o.date)}</span> },
    { title: "Employee", render: (o) => nameOf(employees, o.employeeId) },
    {
      title: "Overtime",
      render: (o) => (
        <div>
          <div className="font-semibold">{formatHours(o.hours)}</div>
          {o.detail && <div className="text-xs text-ink-500">{o.detail}</div>}
        </div>
      ),
    },
    {
      title: "Pays",
      render: (o) => {
        const rate = rateFor(o.employeeId, o.date);
        return (
          <div>
            <div className="font-semibold">{money(round(o.hours * rate))}</div>
            <div className="text-xs text-ink-500">{money(rate)} an hour</div>
          </div>
        );
      },
    },
    { title: "Note", render: (o) => o.reason || <span className="text-ink-400">—</span> },
    {
      title: "Status",
      render: (o) => (
        <Status>
          {o.status === "pending"
            ? needsApproval
              ? "pending approval"
              : "paid — approval is off"
            : o.status}
        </Status>
      ),
    },
    {
      title: "Actions",
      render: (o) =>
        locked(o) ? (
          <span title={LOCKED_NOTE}>
            <Status>Payslip approved</Status>
          </span>
        ) : o.status === "pending" ? (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" leftIcon={<Check width={14} />} onClick={() => setApproving(o)}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void decide([o], "rejected")}>
              Reject
            </Button>
          </div>
        ) : o.id.startsWith("ot-") ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void remove(o, `Undid the overtime decision for ${nameOf(employees, o.employeeId)} (${o.date})`)}
          >
            Undo
          </Button>
        ) : (
          <ConfirmButton
            label="Delete"
            confirm="Delete?"
            onConfirm={() => remove(o, `Deleted ${formatHours(o.hours)} overtime for ${nameOf(employees, o.employeeId)} (${o.date})`)}
          />
        ),
    },
  ];

  const shownHours = round(shown.reduce((n, o) => n + o.hours, 0));
  const shownPay = round(shown.reduce((n, o) => n + o.hours * rateFor(o.employeeId, o.date), 0));
  return (
    <div id="hr-overtime" className="scroll-mt-4">
      <Section
        title={`Overtime · ${monthLabel(period)}`}
        description={`Found in the check-ins: time worked past the work day (${clockRange(workspace.settings.workStart, workspace.settings.workEnd)} is ${formatHours(shiftHours(workDayShift(workspace)))}), or every hour worked on a day off or a holiday. Each hour pays the hour rate × ${workspace.settings.overtimeMultiplier}. ${needsApproval ? "Nothing is paid until you approve it — you can change the hours and add a note." : "The approval rule is off, so it is paid straight away."} Overtime you add by hand counts straight away.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Show overtime"
              className={filterClass}
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="pending">Waiting for approval ({pending.length})</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
            <select
              aria-label="Overtime for"
              className={filterClass}
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value="">Everyone</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
            {shownPending.length > 1 && (
              <Button size="sm" variant="secondary" leftIcon={<Check width={15} />} onClick={() => setApprovingAll(shownPending)}>
                Approve all ({shownPending.length})
              </Button>
            )}
            <Button size="sm" leftIcon={<Plus width={15} />} onClick={() => setAdding(true)}>
              Add overtime
            </Button>
          </div>
        }
      >
        {shown.length > 0 && (
          <p className="border-b border-slate-100 px-5 py-2.5 text-sm text-ink-500">
            {shown.length} {shown.length === 1 ? "day" : "days"} · {formatHours(shownHours)} ·{" "}
            <b className="text-ink-900">{money(shownPay)}</b>
          </p>
        )}
        <Table
          rows={shown}
          columns={columns}
          empty={
            view === "pending"
              ? "Nothing waiting. Time worked past the work day shows up here from the check-ins."
              : "No overtime here for this month."
          }
        />
      </Section>

      {approving && (
        <Editor
          title={`Approve overtime — ${nameOf(employees, approving.employeeId)}`}
          description={`${shortDate(approving.date)}${approving.detail ? ` · ${approving.detail}` : ""}`}
          fields={[
            {
              key: "hours",
              label: "Overtime hours to pay",
              type: "number",
              min: 0,
              required: true,
              hint: hoursHint(approving.employeeId, approving.date),
            },
            noteField,
          ]}
          initial={{ hours: approving.hours, note: approving.reason }}
          onClose={() => setApproving(null)}
          onSave={async (v) => {
            const hours = Number(v.hours);
            if (!(hours > 0)) throw new Error("Enter hours above zero, or reject the overtime instead.");
            await decide([approving], "approved", String(v.note ?? "").trim(), round(hours));
          }}
        />
      )}

      {approvingAll && (
        <Editor
          title={`Approve ${approvingAll.length} overtime days`}
          description={`${formatHours(round(approvingAll.reduce((n, o) => n + o.hours, 0)))} · ${money(round(approvingAll.reduce((n, o) => n + o.hours * rateFor(o.employeeId, o.date), 0)))} in all${who ? ` for ${nameOf(employees, who)}` : ""}, each with the hours shown. The note goes on every one.`}
          fields={[noteField]}
          initial={{ note: "" }}
          onClose={() => setApprovingAll(null)}
          onSave={async (v) => {
            const note = String(v.note ?? "").trim();
            await decide(approvingAll, "approved", note || undefined);
          }}
        />
      )}

      {adding && (
        <Editor
          title="Add overtime"
          description="For overtime the check-ins do not show. It counts straight away."
          fields={[
            {
              key: "employeeId",
              label: "Employee",
              type: "select",
              options: employees.map((e) => ({ value: e.id, label: e.fullName })),
              required: true,
            },
            { key: "date", label: "Date", type: "date", required: true },
            {
              key: "hours",
              label: "Hours",
              type: "number",
              min: 0,
              required: true,
              hint: (v) => hoursHint(String(v.employeeId ?? ""), String(v.date ?? ""))(v),
            },
            noteField,
          ]}
          initial={{ employeeId: who, date: localDate().startsWith(period) ? localDate() : `${period}-01`, hours: "", note: "" }}
          onClose={() => setAdding(false)}
          onSave={async (v) => {
            const employeeId = String(v.employeeId);
            const day = String(v.date);
            const hours = round(Number(v.hours));
            if (!(hours > 0)) throw new Error("Enter hours above zero.");
            if (locked({ employeeId, date: day })) throw new Error(LOCKED_NOTE);
            const note = String(v.note ?? "").trim();
            await commit(
              (w) => ({
                ...w,
                overtime: [
                  ...w.overtime,
                  {
                    id: createHrId("overtime"),
                    employeeId,
                    date: day,
                    hours,
                    reason: note,
                    status: "approved",
                    decidedAt: new Date().toISOString(),
                  },
                ],
              }),
              `Added ${formatHours(hours)} overtime for ${nameOf(employees, employeeId)} (${day})${note ? `: ${note}` : ""}`,
            );
          }}
        />
      )}
    </div>
  );
}
