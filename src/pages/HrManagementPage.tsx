import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Input } from "@/components/ui/Input";
import {
  CalendarDays,
  ChevronDown,
  Download,
  Pencil,
  Search,
  Upload,
} from "@/components/icons";
import { useDataService } from "@/services/data/context";
import type { AttendanceRecord, Employee, LeaveRecord } from "@/types";
import type {
  HrDepartment,
  HrEmployeeProfile,
  HrLeaveRequest,
  HrLocation,
  HrShift,
  HrWorkspace,
} from "@/services/hr/types";
import {
  createDefaultHrWorkspace,
  createHrId,
  loadHrWorkspace,
  profileFor,
  saveHrWorkspace,
  sortDepartments,
} from "@/services/hr/store";
import {
  attendanceRows,
  approvalChain,
  calculatePayroll,
  csvDownload,
  distanceMeters,
  hierarchyError,
  leaveBalance,
  localDate,
  validateLeave,
  weekdays,
} from "@/services/hr/logic";
import {
  Collection,
  Editor,
  EditorPage,
  Section,
  Status,
  Table,
  type Column,
  type Field,
  type FieldGroup,
  type Values,
  fieldClass,
  options,
} from "@/components/hr/HrUi";
import { HrDocuments } from "@/components/hr/HrDocuments";
import { HrDeviceImport } from "@/components/hr/HrDeviceImport";
import { InterviewTracking } from "@/components/hr/InterviewTracking";
import {
  HR_NAV_GROUPS,
  hrTabLabel,
  isHrTab,
  type HrTab,
} from "@/services/hr/navigation";

type Tab = HrTab;

const date = () => localDate();
const id = (prefix: string) => createHrId(prefix);
/**
 * Whether someone still works here. `inactive` is what every "current staff"
 * filter in the app keys off — attendance rows, payroll and the head counts
 * all skip it — so the label spells out what it means rather than making HR
 * remember that "inactive" is how you say "left".
 */
const statusOptions = [
  { value: "active", label: "Active" },
  { value: "probation", label: "Probation" },
  { value: "inactive", label: "Former — left the company" },
];

/**
 * The status as a dropdown, so HR can move somebody in or out of the company
 * straight from a list instead of opening their whole profile. Saves on pick.
 */
function StatusSelect({
  employee,
  workspace,
  onChange,
}: {
  employee: Employee;
  workspace: HrWorkspace;
  onChange: (employee: Employee, status: string) => void | Promise<void>;
}) {
  const status = profileFor(workspace, employee.id).status ?? "active";
  const tone =
    status === "inactive"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "probation"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <select
      aria-label={`Employment status for ${employee.fullName}`}
      className={`h-9 rounded-lg border px-2 text-xs font-semibold outline-none transition-colors focus:ring-2 focus:ring-brand-100 ${tone}`}
      value={status}
      onChange={(event) => void onChange(employee, event.target.value)}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
const employmentOptions = options([
  "Full time",
  "Part time",
  "Contractor",
  "Intern",
  "Temporary",
]);
const requestOptions = options(["pending", "approved", "rejected"]);
const stageOptions = options([
  "New",
  "Screening",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
]);
const leaveUnitOptions = options(["days", "hours"]);
const adjustmentOptions = options(["bonus", "penalty"]);

function profileValues(p: HrEmployeeProfile): Values {
  return { ...p, documents: p.documents.map((d) => d.title).join(", ") };
}
function employeeName(employees: Employee[], idValue?: string): string {
  return employees.find((e) => e.id === idValue)?.fullName ?? "Unassigned";
}
function money(value: number, currency = "IQD"): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
}
function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function HrModuleSelector({
  active,
  onChange,
  pendingCount,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  pendingCount: number;
}) {
  return (
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 lg:hidden">
        <label htmlFor="hr-module" className="mb-2 block text-xs font-bold uppercase tracking-wider text-ink-400">
          HR module
        </label>
        <div className="relative">
          <select
            id="hr-module"
            value={active}
            onChange={(event) => onChange(event.target.value as Tab)}
            className={`${fieldClass} appearance-none pr-10 font-semibold`}
          >
            {HR_NAV_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                    {item.id === "leave" && pendingCount > 0
                      ? ` (${pendingCount} pending)`
                      : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown
            width={17}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
        </div>
      </div>
  );
}

export function HrManagementPage() {
  const data = useDataService();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workspace, setWorkspace] = useState<HrWorkspace>(() =>
    createDefaultHrWorkspace(),
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [legacyLeave, setLegacyLeave] = useState<LeaveRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const requestedTab = searchParams.get("tab");
  const tab: Tab = isHrTab(requestedTab) ? requestedTab : "overview";
  // The employee profile editor is a full page rather than a dialog — nearly
  // forty fields do not fit in one. It hangs off `?edit=<employeeId>` so the
  // browser's Back button closes it and a reload keeps you where you were.
  const editingEmployeeId = searchParams.get("edit");
  const profileEditor =
    employees.find((employee) => employee.id === editingEmployeeId) ?? null;
  const [period, setPeriod] = useState(workspace.payrollPeriod);
  const [attendanceFrom, setAttendanceFrom] = useState(date());
  const [attendanceTo, setAttendanceTo] = useState(date());
  const [employeeQuery, setEmployeeQuery] = useState("");

  function setTab(next: Tab) {
    setSearchParams({ tab: next });
  }
  function openProfileEditor(employee: Employee) {
    setSearchParams({ tab, edit: employee.id });
  }
  function closeProfileEditor() {
    setSearchParams({ tab });
  }

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [w, people, leave, records] = await Promise.all([
        loadHrWorkspace(),
        data.listEmployees(),
        data.listLeaveRecords(undefined, new Date().getFullYear()),
        data.listAttendance(),
      ]);
      setWorkspace(w);
      setEmployees(people);
      setLegacyLeave(leave);
      setAttendance(records);
      setPeriod(w.payrollPeriod);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load HR workspace.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [data]);
  /**
   * Applies a change and saves it, re-throwing if it never reached storage.
   * Use this where the caller navigates away on success; everywhere else
   * {@link commit} swallows the failure into the page banner.
   */
  async function commitOrThrow(
    mutator: (w: HrWorkspace) => HrWorkspace,
    action: string,
  ): Promise<void> {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const next = mutator({
        ...workspace,
        audit: [
          ...workspace.audit,
          {
            id: id("audit"),
            at: new Date().toISOString(),
            actor: "Supervisor",
            action,
          },
        ],
      });
      const saved = await saveHrWorkspace(next);
      setWorkspace(saved);
      setNotice("Saved.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save HR data.";
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }
  async function commit(
    mutator: (w: HrWorkspace) => HrWorkspace,
    action: string,
  ): Promise<void> {
    try {
      await commitOrThrow(mutator, action);
    } catch {
      // Already reported in the page banner by commitOrThrow.
    }
  }
  /** One-pick status change from a list. Stays on the page, banner reports it. */
  async function setEmployeeStatus(employee: Employee, status: string) {
    const current = profileFor(workspace, employee.id);
    await commit(
      (w) => ({
        ...w,
        profiles: {
          ...w.profiles,
          [employee.id]: {
            ...current,
            employeeId: employee.id,
            status: status as HrEmployeeProfile["status"],
          },
        },
      }),
      `Set ${employee.fullName} to ${status}`,
    );
  }
  async function saveProfile(employee: Employee, values: Values) {
    const current = profileFor(workspace, employee.id);
    await commitOrThrow(
      (w) => ({
        ...w,
        profiles: {
          ...w.profiles,
          [employee.id]: {
            ...current,
            ...values,
            employeeId: employee.id,
            baseSalary: Number(values.baseSalary) || 0,
            documents: current.documents,
          },
        },
      }),
      `Updated employee profile for ${employee.fullName}`,
    );
    closeProfileEditor();
  }
  const activeEmployees = employees.filter(
    (e) => workspace.profiles[e.id]?.status !== "inactive",
  );
  const pendingRequests = workspace.leaveRequests.filter(
    (r) => r.status === "pending",
  );
  const currentRows = useMemo(
    () =>
      attendanceRows(
        workspace,
        employees,
        attendance,
        attendanceFrom,
        attendanceTo,
        legacyLeave,
      ),
    [
      workspace,
      employees,
      attendance,
      attendanceFrom,
      attendanceTo,
      legacyLeave,
    ],
  );
  const totals = useMemo(
    () => ({
      hours: currentRows.reduce((n, r) => n + r.hours, 0),
      overtime: currentRows.reduce((n, r) => n + r.overtime, 0),
      late: currentRows.filter((r) => r.status === "Late").length,
      absent: currentRows.filter((r) => r.status === "Absent").length,
    }),
    [currentRows],
  );
  const payroll = useMemo(() => {
    try {
      return calculatePayroll(workspace, employees, period);
    } catch {
      return [];
    }
  }, [workspace, employees, period]);
  // The profile form is laid out down the page in these sections. Grouping is
  // the whole point of moving it out of a dialog: forty fields in one flat
  // grid is a wall, five named blocks is a form.
  const profileFieldGroups: FieldGroup[] = [
    {
      title: "Role & employment",
      description: "Where this person sits in the company and what they are paid.",
      fields: [
        { key: "jobTitle", label: "Job title", required: true },
        {
          key: "status",
          label: "Employment status",
          type: "select",
          options: statusOptions,
          required: true,
        },
        {
          key: "employmentType",
          label: "Employment type",
          type: "select",
          options: employmentOptions,
          required: true,
        },
        {
          key: "departmentId",
          label: "Department",
          type: "select",
          options: workspace.departments.map((d) => ({
            value: d.id,
            label: d.name,
          })),
        },
        {
          key: "managerId",
          label: "Reports to",
          type: "select",
          options: employees
            .filter((e) => e.id !== profileEditor?.id)
            .map((e) => ({ value: e.id, label: e.fullName })),
        },
        { key: "joinDate", label: "Join date", type: "date", required: true },
        { key: "contractEnd", label: "Contract end", type: "date" },
        { key: "workHours", label: "Work hours" },
        {
          key: "baseSalary",
          label: "Base monthly salary",
          type: "number",
          min: 0,
          required: true,
        },
        { key: "email", label: "Work email", type: "email" },
        { key: "bankAccount", label: "Bank account / IBAN" },
      ],
    },
    {
      title: "Personal",
      description: "Identity and contact details kept on the HR record.",
      fields: [
        { key: "birthDate", label: "Birth date", type: "date" },
        { key: "birthPlace", label: "Birth place" },
        {
          key: "gender",
          label: "Gender",
          type: "select",
          options: options(["male", "female", "other"]),
        },
        { key: "maritalStatus", label: "Marital status" },
        { key: "bloodType", label: "Blood type" },
        { key: "nationalId", label: "National ID" },
        { key: "photoUrl", label: "Personal photo URL", type: "url" },
        { key: "address", label: "Address", type: "textarea" },
      ],
    },
    {
      title: "Emergency & health",
      description: "Who to call, and anything a first responder should know.",
      fields: [
        { key: "emergencyContact", label: "Emergency contact" },
        { key: "emergencyRelation", label: "Emergency contact relation" },
        { key: "emergencyPhone", label: "Emergency contact phone" },
        { key: "chronicDisease", label: "Chronic disease" },
      ],
    },
    {
      title: "Education & skills",
      description: "Qualifications and experience, searchable from the directory.",
      fields: [
        { key: "educationLevel", label: "Education level" },
        { key: "university", label: "University / institute" },
        { key: "specialization", label: "Specialization" },
        { key: "graduationYear", label: "Graduation year" },
        { key: "education", label: "Education", type: "textarea" },
        {
          key: "skills",
          label: "Skills",
          type: "textarea",
          hint: "Comma-separated skills for the employee directory.",
        },
        { key: "experience", label: "Experience", type: "textarea" },
        { key: "languages", label: "Languages", type: "textarea" },
        { key: "computerSkills", label: "Computer skills", type: "textarea" },
        { key: "trainings", label: "Courses / training", type: "textarea" },
      ],
    },
    {
      title: "Summary",
      fields: [
        {
          key: "cvSummary",
          label: "CV summary",
          type: "textarea",
          hint: "Keep a short, searchable summary here. Upload a CV link in Documents below.",
        },
      ],
    },
  ];
  const departmentColumns: Column<HrDepartment>[] = [
    {
      title: "Department",
      render: (r) => <span className="font-semibold">{r.name}</span>,
    },
    { title: "Manager", render: (r) => employeeName(employees, r.managerId) },
    {
      title: "Parent",
      render: (r) =>
        workspace.departments.find((d) => d.id === r.parentId)?.name ??
        "Top level",
    },
    {
      title: "State",
      render: (r) => <Status>{r.active ? "active" : "inactive"}</Status>,
    },
  ];
  const shiftColumns: Column<HrShift>[] = [
    {
      title: "Shift",
      render: (r) => <span className="font-semibold">{r.name}</span>,
    },
    {
      title: "Window",
      render: (r) =>
        `${r.startTime} – ${r.endTime}${r.endTime < r.startTime ? " · overnight" : ""}`,
    },
    { title: "Days", render: (r) => r.days.join(", ") },
    {
      title: "Rules",
      render: (r) =>
        `${r.graceMinutes}m grace · OT after ${r.overtimeAfterHours}h`,
    },
  ];

  if (loading)
    return (
      <AdminLayout>
        <div className="py-20 text-center text-ink-400">
          Loading HR workspace…
        </div>
      </AdminLayout>
    );
  if (error && !workspace)
    return (
      <AdminLayout>
        <Card className="p-8 text-center text-rose-600">{error}</Card>
      </AdminLayout>
    );

  // Editing a profile takes over the whole page — no module selector, no tab
  // content behind it.
  if (profileEditor)
    return (
      <AdminLayout>
        <EditorPage
          key={profileEditor.id}
          eyebrow="Employee profile"
          title={profileEditor.fullName}
          description={`${profileEditor.code} · ${profileEditor.phone} — the complete HR record. Name, phone and position stay on the employee report.`}
          backLabel={`Back to ${hrTabLabel(tab).toLowerCase()}`}
          groups={profileFieldGroups}
          initial={profileValues(profileFor(workspace, profileEditor.id))}
          onClose={closeProfileEditor}
          onSave={async (values) => saveProfile(profileEditor, values)}
        />
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-brand-600">
            Vio HR Department
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">HR Management</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
            Manage people, attendance, leave, payroll, recruitment, and HR
            operations from one organized workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadJson(`vio-hr-backup-${date()}.json`, workspace)
            }
          >
            <Download width={16} /> Backup
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={saving}
            onClick={() => void reload()}
          >
            Refresh
          </Button>
        </div>
      </header>
      <HrModuleSelector
        active={tab}
        onChange={setTab}
        pendingCount={pendingRequests.length}
      />
      <main className="min-w-0">
          {(notice || error) && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${
                error
                  ? "border-rose-100 bg-rose-50 text-rose-700"
                  : "border-emerald-100 bg-emerald-50 text-emerald-700"
              }`}
            >
              {error || notice}
            </div>
          )}

      {tab === "overview" && (
        <Overview
          employees={employees}
          workspace={workspace}
          activeEmployees={activeEmployees}
          pendingRequests={pendingRequests}
          totals={totals}
          onTab={setTab}
        />
      )}
      {tab === "people" && (
        <div className="space-y-5">
          <People
            employees={employees}
            workspace={workspace}
            query={employeeQuery}
            setQuery={setEmployeeQuery}
            onEdit={openProfileEditor}
            onStatusChange={setEmployeeStatus}
          />
          <HrDocuments
            workspace={workspace}
            employees={employees}
            commit={commit}
          />
        </div>
      )}
      {tab === "employee-details" && (
        <EmployeeDetails
          employees={employees}
          workspace={workspace}
          attendance={attendance}
          query={employeeQuery}
          setQuery={setEmployeeQuery}
          onEdit={openProfileEditor}
          onStatusChange={setEmployeeStatus}
        />
      )}
      {tab === "organization" && (
        <Organization
          workspace={workspace}
          employees={employees}
          commit={commit}
          departmentColumns={departmentColumns}
        />
      )}
      {tab === "time" && (
        <Time
          workspace={workspace}
          employees={employees}
          rows={currentRows}
          from={attendanceFrom}
          to={attendanceTo}
          setFrom={setAttendanceFrom}
          setTo={setAttendanceTo}
          shiftColumns={shiftColumns}
          commit={commit}
        />
      )}
      {tab === "leave" && (
        <Leave
          workspace={workspace}
          employees={employees}
          legacyLeave={legacyLeave}
          commit={commit}
        />
      )}
      {tab === "payroll" && (
        <Payroll
          workspace={workspace}
          employees={employees}
          period={period}
          setPeriod={setPeriod}
          payroll={payroll}
          commit={commit}
        />
      )}
      {tab === "hiring" && <Hiring workspace={workspace} commit={commit} />}
      {tab === "interviews" && (
        <InterviewTracking workspace={workspace} commit={commit} />
      )}
      {tab === "locations" && (
        <div className="space-y-5">
          <Locations workspace={workspace} commit={commit} />
          <HrDeviceImport
            workspace={workspace}
            employees={employees}
            commit={commit}
          />
        </div>
      )}
      {tab === "rules" && <Rules workspace={workspace} commit={commit} />}
      {tab === "reports" && (
        <Reports
          workspace={workspace}
          employees={employees}
          rows={currentRows}
          payroll={payroll}
          commit={commit}
        />
      )}
      </main>
    </AdminLayout>
  );
}

function Overview({
  employees,
  workspace,
  activeEmployees,
  pendingRequests,
  totals,
  onTab,
}: {
  employees: Employee[];
  workspace: HrWorkspace;
  activeEmployees: Employee[];
  pendingRequests: HrLeaveRequest[];
  totals: { hours: number; overtime: number; late: number; absent: number };
  onTab: (t: Tab) => void;
}) {
  const departmentCounts = workspace.departments
    .map((d) => ({
      ...d,
      count: employees.filter(
        (e) =>
          workspace.profiles[e.id]?.departmentId === d.id &&
          workspace.profiles[e.id]?.status !== "inactive",
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          value={activeEmployees.length}
          label="Active employees"
          tone="info"
        />
        <StatCard
          value={workspace.departments.length}
          label="Departments"
          tone="success"
        />
        <StatCard
          value={pendingRequests.length}
          label="Pending leave"
          tone="warning"
        />
        <StatCard
          value={money(
            workspace.payrollEntries
              .filter((p) => p.period === workspace.payrollPeriod)
              .reduce((n, p) => n + p.netSalary, 0),
            workspace.settings.currency,
          )}
          label="Payroll draft"
          tone="info"
        />
        <StatCard
          value={`${totals.hours}h`}
          label="Attendance hours"
          tone="success"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="HR coverage"
          description="The workspace is ready for the complete people workflow. Add the records that match your company policy."
        >
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {[
              [
                "People profiles",
                "Personal, contract, salary, bank and emergency details",
                "people",
              ],
              [
                "Employee details",
                "Current and former employees with today’s clocked status",
                "employee-details",
              ],
              [
                "Time policies",
                "Day and overnight shifts, grace and overtime rules",
                "time",
              ],
              [
                "Leave approvals",
                "Typed leave, balances, holidays and approval chain",
                "leave",
              ],
              [
                "Payroll",
                "Adjustments, tax, insurance, unpaid leave and payroll drafts",
                "payroll",
              ],
              [
                "Recruitment",
                "Candidates, stages, skills and CV links",
                "hiring",
              ],
              [
                "Interview tracking",
                "Contact outcomes, follow-up dates and candidate history",
                "interviews",
              ],
              [
                "Location controls",
                "Geofenced sites and ZK iFace / device attendance",
                "locations",
              ],
            ].map(([title, text, target]) => (
              <button
                key={title}
                type="button"
                className="rounded-2xl border border-slate-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50"
                onClick={() => onTab(target as Tab)}
              >
                <div className="font-semibold">{title}</div>
                <div className="mt-1 text-sm leading-relaxed text-ink-500">
                  {text}
                </div>
              </button>
            ))}
          </div>
        </Section>
        <Section
          title="Department distribution"
          description="Active employees by department"
        >
          <div className="p-5">
            {departmentCounts.length === 0 ? (
              <p className="text-sm text-ink-500">
                No departments yet. Create the organization structure to assign
                people.
              </p>
            ) : (
              <div className="space-y-4">
                {departmentCounts.map((d) => (
                  <div key={d.id}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-semibold">{d.name}</span>
                      <span className="text-ink-500">{d.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{
                          width: `${Math.min(100, activeEmployees.length ? (d.count / activeEmployees.length) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function People({
  employees,
  workspace,
  query,
  setQuery,
  onStatusChange,
  onEdit,
}: {
  employees: Employee[];
  workspace: HrWorkspace;
  query: string;
  setQuery: (v: string) => void;
  onEdit: (e: Employee) => void;
  onStatusChange: (e: Employee, status: string) => void | Promise<void>;
}) {
  const rows = employees.filter((e) =>
    `${e.fullName} ${e.phone} ${e.code} ${e.position} ${profileFor(workspace, e.id).email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <Section
        title="Employee directory"
        description="Search every employee, then open the complete profile to maintain employment, personal, compensation and document details."
        action={
          <span className="text-sm text-ink-500">
            {employees.length} people
          </span>
        }
      >
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <Search width={17} className="text-ink-400" />
            <input
              className={fieldClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, phone, title or email…"
              aria-label="Search employee directory"
            />
          </div>
        </div>
        <Table
          rows={rows}
          empty="No employees found. Add the first employee from the Dashboard."
          columns={[
            {
              title: "Employee",
              render: (e) => (
                <div>
                  <div className="font-semibold">{e.fullName}</div>
                  <div className="mt-0.5 font-mono text-xs text-ink-400">
                    {e.code} · {e.phone}
                  </div>
                </div>
              ),
            },
            {
              title: "Role / department",
              render: (e) => (
                <div>
                  <div>
                    {profileFor(workspace, e.id).jobTitle ||
                      e.position ||
                      "No title"}
                  </div>
                  <div className="text-xs text-ink-500">
                    {workspace.departments.find(
                      (d) => d.id === profileFor(workspace, e.id).departmentId,
                    )?.name ?? "Unassigned"}
                  </div>
                </div>
              ),
            },
            {
              title: "Employment",
              render: (e) => (
                <StatusSelect
                  employee={e}
                  workspace={workspace}
                  onChange={onStatusChange}
                />
              ),
            },
            {
              title: "Salary",
              render: (e) =>
                money(
                  profileFor(workspace, e.id).baseSalary,
                  workspace.settings.currency,
                ),
            },
            {
              title: "Documents",
              render: (e) => (
                <span className="text-ink-500">
                  {profileFor(workspace, e.id).documents.length} files
                </span>
              ),
            },
            {
              title: "Actions",
              render: (e) => (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<Pencil width={14} />}
                  onClick={() => onEdit(e)}
                >
                  Open profile
                </Button>
              ),
            },
          ]}
        />
      </Section>
      <Card className="p-5">
        <h2 className="font-bold">Profile checklist</h2>
        <p className="mt-1 text-sm text-ink-500">
          Complete these fields for each person to keep payroll and reporting
          accurate.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            [
              "Identity",
              "Name, phone and attendance code",
              employees.filter((e) => e.fullName && e.phone).length,
            ],
            [
              "Employment",
              "Status, join date, department and manager",
              employees.filter(
                (e) =>
                  profileFor(workspace, e.id).joinDate &&
                  profileFor(workspace, e.id).jobTitle,
              ).length,
            ],
            [
              "Payroll / compliance",
              "Salary, bank account and documents",
              employees.filter(
                (e) =>
                  profileFor(workspace, e.id).baseSalary > 0 &&
                  profileFor(workspace, e.id).bankAccount,
              ).length,
            ],
          ].map(([title, text, count]) => (
            <div className="rounded-xl bg-slate-50 p-4" key={title as string}>
              <div className="font-semibold">{title}</div>
              <div className="mt-1 text-sm text-ink-500">{text}</div>
              <div className="mt-3 text-xl font-bold text-brand-600">
                {count}{" "}
                <span className="text-xs font-medium text-ink-400">
                  of {employees.length}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

type EmployeeDetailsView = "current" | "former" | "all";

function formatEmployeeDate(value?: string): string {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatEmployeeTime(value?: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
}

function EmployeeDetails({
  employees,
  workspace,
  attendance,
  query,
  setQuery,
  onEdit,
  onStatusChange,
}: {
  employees: Employee[];
  workspace: HrWorkspace;
  attendance: AttendanceRecord[];
  query: string;
  setQuery: (v: string) => void;
  onEdit: (e: Employee) => void;
  onStatusChange: (e: Employee, status: string) => void | Promise<void>;
}) {
  const [view, setView] = useState<EmployeeDetailsView>("current");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const today = localDate();
  const records = [
    ...attendance,
    ...workspace.deviceAttendance.map((record) => ({
      id: record.id,
      sessionId: `device-${record.deviceId}`,
      employeeId: record.employeeId,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
    })),
  ];
  const attendanceFor = (employeeId: string) => {
    const todayRecords = records
      .filter(
        (record) =>
          record.employeeId === employeeId &&
          !!record.checkInAt &&
          localDate(new Date(record.checkInAt)) === today,
      )
      .sort((a, b) =>
        (b.checkInAt ?? "").localeCompare(a.checkInAt ?? ""),
      );
    const latest = todayRecords[0];
    if (!latest?.checkInAt) {
      return { state: "Not clocked" as const, checkInAt: "", checkOutAt: "" };
    }
    return {
      state: latest.checkOutAt ? ("Clocked out" as const) : ("Clocked in" as const),
      checkInAt: latest.checkInAt,
      checkOutAt: latest.checkOutAt ?? "",
    };
  };
  const currentCount = employees.filter(
    (employee) => profileFor(workspace, employee.id).status !== "inactive",
  ).length;
  const formerCount = employees.length - currentCount;
  const clockedInCount = employees.filter(
    (employee) => attendanceFor(employee.id).state === "Clocked in",
  ).length;
  const visibleEmployees = employees
    .filter((employee) => {
      const isFormer = profileFor(workspace, employee.id).status === "inactive";
      return view === "all" || (view === "former" ? isFormer : !isFormer);
    })
    .filter((employee) => {
      const profile = profileFor(workspace, employee.id);
      return `${employee.fullName} ${employee.code} ${employee.phone} ${employee.position} ${profile.jobTitle} ${profile.email}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });

  const info = (label: string, value?: string | number) => (
    <div key={label}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium text-ink-800">
        {value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard value={currentCount} label="Current employees" tone="info" />
        <StatCard value={clockedInCount} label="Clocked in today" tone="success" />
        <StatCard value={formerCount} label="Former employees" tone="warning" />
        <StatCard value={employees.length} label="All employee records" tone="neutral" />
      </div>
      <Section
        title="Employee details"
        description="A live workforce register with today’s clocked status. Open a row to review the complete HR form, or edit it from the profile editor."
        action={
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {([
              ["current", `Current · ${currentCount}`],
              ["former", `Former · ${formerCount}`],
              ["all", `All · ${employees.length}`],
            ] as [EmployeeDetailsView, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setView(value);
                  setExpandedId(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  view === value
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <Search width={17} className="text-ink-400" />
            <input
              className={fieldClass}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, code, phone, title or email…"
              aria-label="Search employee details"
            />
          </div>
          <span className="text-sm text-ink-500">
            Showing {visibleEmployees.length} of {employees.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                {[
                  "Employee",
                  "Role / department",
                  "Contact",
                  "Joined",
                  "Employment",
                  "Clocked today",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-ink-500">
                    {view === "former"
                      ? "No former employees match this search."
                      : "No employee records match this search."}
                  </td>
                </tr>
              ) : (
                visibleEmployees.map((employee) => {
                  const profile = profileFor(workspace, employee.id);
                  const department = workspace.departments.find(
                    (item) => item.id === profile.departmentId,
                  )?.name;
                  const clock = attendanceFor(employee.id);
                  const expanded = expandedId === employee.id;
                  return (
                    <Fragment key={employee.id}>
                      <tr
                        className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-3.5 align-middle">
                          <div className="font-semibold text-ink-900">{employee.fullName}</div>
                          <div className="mt-0.5 font-mono text-xs text-ink-400">
                            {employee.code} · {employee.phone}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <div>{profile.jobTitle || employee.position || "No title"}</div>
                          <div className="text-xs text-ink-500">{department ?? "Unassigned"}</div>
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <div>{profile.email || "No email"}</div>
                          <div className="text-xs text-ink-500">{profile.emergencyContact || "No emergency contact"}</div>
                        </td>
                        <td className="px-5 py-3.5 align-middle whitespace-nowrap">
                          {formatEmployeeDate(profile.joinDate)}
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <StatusSelect
                            employee={employee}
                            workspace={workspace}
                            onChange={onStatusChange}
                          />
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex flex-col items-start gap-1">
                            <Status>{clock.state}</Status>
                            <span className="text-xs text-ink-500">
                              {clock.checkInAt
                                ? `${formatEmployeeTime(clock.checkInAt)}${clock.checkOutAt ? ` – ${formatEmployeeTime(clock.checkOutAt)}` : ""}`
                                : "No record today"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 align-middle">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedId(expanded ? null : employee.id)}
                            >
                              {expanded ? "Hide details" : "View details"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<Pencil width={14} />}
                              onClick={() => onEdit(employee)}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${employee.id}-details`} className="border-t border-slate-100 bg-slate-50/70">
                          <td colSpan={7} className="px-5 py-5">
                            <div className="grid gap-5 lg:grid-cols-4">
                              <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700">Personal</h3>
                                <div className="mt-3 grid gap-3">{
                                  [
                                    info("Full name", employee.fullName),
                                    info("Phone", employee.phone),
                                    info("Birth date", formatEmployeeDate(profile.birthDate)),
                                    info("Birth place", profile.birthPlace),
                                    info("Gender", profile.gender),
                                    info("Marital status", profile.maritalStatus),
                                    info("Blood type", profile.bloodType),
                                    info("Address", profile.address),
                                  ]
                                }</div>
                              </div>
                              <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700">Education & skills</h3>
                                <div className="mt-3 grid gap-3">{
                                  [
                                    info("Education level", profile.educationLevel || profile.education),
                                    info("University / institute", profile.university),
                                    info("Specialization", profile.specialization),
                                    info("Graduation year", profile.graduationYear),
                                    info("Skills", profile.skills),
                                    info("Experience", profile.experience),
                                    info("Languages", profile.languages),
                                    info("Computer skills", profile.computerSkills),
                                    info("Courses / training", profile.trainings),
                                  ]
                                }</div>
                              </div>
                              <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700">Work record</h3>
                                <div className="mt-3 grid gap-3">{
                                  [
                                    info("Job title", profile.jobTitle || employee.position),
                                    info("Employment type", profile.employmentType),
                                    info("Join date", formatEmployeeDate(profile.joinDate)),
                                    info("Contract end", formatEmployeeDate(profile.contractEnd)),
                                    info("Work hours", profile.workHours),
                                    info("Monthly salary", profile.baseSalary ? money(profile.baseSalary, workspace.settings.currency) : "—"),
                                    info("National ID", profile.nationalId),
                                    info("Bank account", profile.bankAccount),
                                  ]
                                }</div>
                              </div>
                              <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700">Emergency & documents</h3>
                                <div className="mt-3 grid gap-3">{
                                  [
                                    info("Emergency contact", profile.emergencyContact),
                                    info("Relation", profile.emergencyRelation),
                                    info("Emergency phone", profile.emergencyPhone),
                                    info("Chronic disease", profile.chronicDisease),
                                    info("Personal photo", profile.photoUrl ? "Attached" : "Not attached"),
                                    info(
                                      "Documents",
                                      profile.documents.length
                                        ? profile.documents.map((document) => document.title).join(", ")
                                        : "No documents",
                                    ),
                                    info("CV summary", profile.cvSummary),
                                    info("Last clock-in", clock.checkInAt ? formatEmployeeTime(clock.checkInAt) : "—"),
                                    info("Last clock-out", clock.checkOutAt ? formatEmployeeTime(clock.checkOutAt) : "—"),
                                  ]
                                }</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Organization({
  workspace,
  employees,
  commit,
  departmentColumns,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
  departmentColumns: Column<HrDepartment>[];
}) {
  const deptFields: Field[] = [
    { key: "name", label: "Department name", required: true },
    {
      key: "managerId",
      label: "Manager",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
    },
    {
      key: "parentId",
      label: "Parent department",
      type: "select",
      options: workspace.departments.map((d) => ({
        value: d.id,
        label: d.name,
      })),
    },
    { key: "sortOrder", label: "Display order", type: "number", min: 0 },
    { key: "active", label: "Active", type: "checkbox" },
  ];
  const sectorFields: Field[] = [
    { key: "name", label: "Sector / business unit", required: true },
  ];
  const cycleFields: Field[] = [
    { key: "name", label: "Cycle name", required: true },
    { key: "startDate", label: "Cycle starts", type: "date", required: true },
    {
      key: "workDays",
      label: "Consecutive work days",
      type: "number",
      min: 1,
      required: true,
    },
    {
      key: "restDays",
      label: "Rest days",
      type: "number",
      min: 0,
      required: true,
    },
    {
      key: "shiftId",
      label: "Shift",
      type: "select",
      options: workspace.shifts.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      key: "employeeIds",
      label: "Employees on cycle",
      type: "multi",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
    },
  ];
  return (
    <div className="space-y-5">
      <Collection
        title="Departments"
        description="Build a manager-led hierarchy. Circular parent relationships are rejected."
        rows={sortDepartments(workspace.departments)}
        columns={departmentColumns}
        fields={deptFields}
        defaults={{
          id: "",
          name: "",
          managerId: "",
          parentId: "",
          active: true,
          sortOrder: workspace.departments.length,
        }}
        validate={(r) =>
          r.parentId === r.id
            ? "A department cannot be its own parent."
            : hierarchyError([
                ...workspace.departments.filter((d) => d.id !== r.id),
                r,
              ])
        }
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              departments: [...w.departments.filter((d) => d.id !== r.id), r],
            }),
            `Saved department ${r.name}`,
          )
        }
      />
      <Collection
        title="Business sectors"
        description="Keep the six business sectors from the HR brief and add more as your organization grows."
        rows={workspace.sectors.map((name, i) => ({ id: `sector-${i}`, name }))}
        columns={[
          {
            title: "Sector",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
        ]}
        fields={sectorFields}
        defaults={{ id: "", name: "" }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              sectors: [
                ...w.sectors.filter((s) => s !== r.name),
                String(r.name),
              ],
            }),
            `Saved sector ${r.name}`,
          )
        }
        canEdit={() => true}
      />
      <Collection
        title="Work cycles"
        description="Configure on / off patterns for rotating crews and site teams."
        rows={workspace.cycles}
        columns={[
          {
            title: "Cycle",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
          {
            title: "Pattern",
            render: (r) => `${r.workDays} work / ${r.restDays} rest`,
          },
          {
            title: "Shift",
            render: (r) =>
              workspace.shifts.find((s) => s.id === r.shiftId)?.name ??
              "Unassigned",
          },
          { title: "People", render: (r) => r.employeeIds.length },
        ]}
        fields={cycleFields}
        defaults={{
          id: "",
          name: "",
          startDate: date(),
          workDays: 7,
          restDays: 7,
          shiftId: workspace.shifts[0]?.id ?? "",
          employeeIds: [],
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              cycles: [...w.cycles.filter((c) => c.id !== r.id), r],
            }),
            `Saved work cycle ${r.name}`,
          )
        }
      />
    </div>
  );
}

function Time({
  workspace,
  employees,
  rows,
  from,
  to,
  setFrom,
  setTo,
  shiftColumns,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  rows: ReturnType<typeof attendanceRows>;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  shiftColumns: Column<HrShift>[];
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const shiftFields: Field[] = [
    { key: "name", label: "Shift name", required: true },
    { key: "startTime", label: "Start time", type: "time", required: true },
    { key: "endTime", label: "End time", type: "time", required: true },
    {
      key: "days",
      label: "Scheduled days",
      type: "multi",
      options: weekdays.map((d) => ({ value: d, label: d })),
    },
    { key: "graceMinutes", label: "Grace minutes", type: "number", min: 0 },
    {
      key: "overtimeAfterHours",
      label: "Overtime after hours",
      type: "number",
      min: 0,
    },
    { key: "active", label: "Active", type: "checkbox" },
  ];
  const assignmentFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    {
      key: "shiftId",
      label: "Shift",
      type: "select",
      options: workspace.shifts.map((s) => ({ value: s.id, label: s.name })),
      required: true,
    },
    { key: "fromDate", label: "From date", type: "date", required: true },
    { key: "toDate", label: "To date", type: "date" },
  ];
  const holidayFields: Field[] = [
    { key: "name", label: "Holiday name", required: true },
    { key: "startDate", label: "From", type: "date", required: true },
    { key: "endDate", label: "To", type: "date", required: true },
    { key: "paid", label: "Paid holiday", type: "checkbox" },
  ];
  const recordColumns: Column<ReturnType<typeof attendanceRows>[number]>[] = [
    { title: "Date", render: (r) => r.date },
    { title: "Employee", render: (r) => employeeName(employees, r.employeeId) },
    {
      title: "Shift",
      render: (r) => (
        <span>
          {r.shift}
          {r.night && (
            <span className="ml-1 text-xs text-brand-600">night</span>
          )}
        </span>
      ),
    },
    {
      title: "In / out",
      render: (r) =>
        `${r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} / ${r.checkOut ? new Date(r.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}`,
    },
    { title: "Hours", render: (r) => r.hours },
    { title: "Status", render: (r) => <Status>{r.status}</Status> },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          value={
            rows.filter((r) => r.status === "Present" || r.status === "Late")
              .length
          }
          label="Present records"
          tone="success"
        />
        <StatCard
          value={rows.filter((r) => r.status === "Absent").length}
          label="Absent records"
          tone="warning"
        />
        <StatCard
          value={`${rows.reduce((n, r) => n + r.late, 0)}m`}
          label="Late minutes"
          tone="warning"
        />
        <StatCard
          value={`${rows.reduce((n, r) => n + r.overtime, 0)}h`}
          label="Overtime"
          tone="info"
        />
      </div>
      <Section
        title="Attendance register"
        description="Daily register with scheduled shifts, night work, holidays, leave, late minutes and overtime. Duplicate intervals are unioned before hours are calculated."
        action={
          <div className="flex gap-2">
            <Input
              aria-label="Attendance from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 w-36"
            />
            <Input
              aria-label="Attendance to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 w-36"
            />
          </div>
        }
      >
        <Table
          rows={rows}
          columns={recordColumns}
          empty="No attendance rows for this range."
        />
      </Section>
      <Collection
        title="Shift templates"
        description="Create day, evening and overnight shifts. Overnight shifts can cross midnight and remain attached to the correct workday."
        rows={workspace.shifts}
        columns={shiftColumns}
        fields={shiftFields}
        defaults={{
          id: "",
          name: "",
          startTime: "08:00",
          endTime: "17:00",
          days: ["Sun", "Mon", "Tue", "Wed", "Thu"],
          graceMinutes: 10,
          overtimeAfterHours: 8,
          active: true,
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              shifts: [...w.shifts.filter((s) => s.id !== r.id), r],
            }),
            `Saved shift ${r.name}`,
          )
        }
      />
      <Collection
        title="Shift assignments"
        description="Assign a template to each employee for a dated period; work cycles can be used for repeating crews."
        rows={workspace.assignments}
        columns={[
          {
            title: "Employee",
            render: (r) => employeeName(employees, r.employeeId),
          },
          {
            title: "Shift",
            render: (r) =>
              workspace.shifts.find((s) => s.id === r.shiftId)?.name ??
              "Missing",
          },
          {
            title: "Effective",
            render: (r) => `${r.fromDate} → ${r.toDate || "ongoing"}`,
          },
        ]}
        fields={assignmentFields}
        defaults={{
          id: "",
          employeeId: "",
          shiftId: workspace.shifts[0]?.id ?? "",
          fromDate: date(),
          toDate: "",
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              assignments: [...w.assignments.filter((a) => a.id !== r.id), r],
            }),
            `Assigned shift to ${employeeName(employees, r.employeeId)}`,
          )
        }
      />
      <Collection
        title="Holidays"
        description="Mark paid holidays so attendance and payroll reports can explain non-working days."
        rows={workspace.holidays}
        columns={[
          {
            title: "Holiday",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
          { title: "Dates", render: (r) => `${r.startDate} → ${r.endDate}` },
          {
            title: "Pay",
            render: (r) => <Status>{r.paid ? "paid" : "unpaid"}</Status>,
          },
        ]}
        fields={holidayFields}
        defaults={{
          id: "",
          name: "",
          startDate: date(),
          endDate: date(),
          paid: true,
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              holidays: [...w.holidays.filter((h) => h.id !== r.id), r],
            }),
            `Saved holiday ${r.name}`,
          )
        }
      />
    </div>
  );
}

function Leave({
  workspace,
  employees,
  legacyLeave,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  legacyLeave: LeaveRecord[];
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const leaveFields: Field[] = [
    { key: "name", label: "Leave type", required: true },
    {
      key: "unit",
      label: "Unit",
      type: "select",
      options: leaveUnitOptions,
      required: true,
    },
    {
      key: "annualLimit",
      label: "Default annual allowance",
      type: "number",
      min: 0,
      required: true,
    },
    { key: "paid", label: "Paid leave", type: "checkbox" },
    { key: "active", label: "Active", type: "checkbox" },
  ];
  const requestFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    {
      key: "leaveTypeId",
      label: "Leave type",
      type: "select",
      options: workspace.leaveTypes
        .filter((t) => t.active)
        .map((t) => ({ value: t.id, label: `${t.name} · ${t.unit}` })),
      required: true,
    },
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "endDate", label: "End date", type: "date", required: true },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      min: 0.5,
      required: true,
      hint: "Days or hours depending on the leave type.",
    },
    { key: "reason", label: "Reason", type: "textarea", required: true },
  ];
  const balanceFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    {
      key: "leaveTypeId",
      label: "Leave type",
      type: "select",
      options: workspace.leaveTypes.map((t) => ({
        value: t.id,
        label: t.name,
      })),
      required: true,
    },
    {
      key: "year",
      label: "Year",
      type: "number",
      min: 2000,
      max: 2100,
      required: true,
    },
    {
      key: "allowance",
      label: "Allowance",
      type: "number",
      min: 0,
      required: true,
    },
  ];
  async function approve(request: HrLeaveRequest) {
    const chain = request.approvalChain ?? [];
    const approvals = [
      ...(request.approvals ?? []),
      {
        approverId: chain[request.approvals?.length ?? 0] ?? "supervisor",
        actor: "Supervisor",
        at: new Date().toISOString(),
        note: "Approved in HR workspace",
      },
    ];
    const complete = approvals.length >= Math.max(1, chain.length);
    await commit(
      (w) => ({
        ...w,
        leaveRequests: w.leaveRequests.map((x) =>
          x.id === request.id
            ? { ...x, status: complete ? "approved" : "pending", approvals }
            : x,
        ),
      }),
      `${complete ? "Approved" : "Advanced"} leave for ${employeeName(employees, request.employeeId)}`,
    );
  }
  async function reject(request: HrLeaveRequest) {
    await commit(
      (w) => ({
        ...w,
        leaveRequests: w.leaveRequests.map((x) =>
          x.id === request.id
            ? {
                ...x,
                status: "rejected",
                decisionNote: "Rejected by Supervisor",
              }
            : x,
        ),
      }),
      `Rejected leave for ${employeeName(employees, request.employeeId)}`,
    );
  }
  const requestCols: Column<HrLeaveRequest>[] = [
    {
      title: "Employee",
      render: (r) => (
        <div>
          <div className="font-semibold">
            {employeeName(employees, r.employeeId)}
          </div>
          <div className="text-xs text-ink-500">
            {workspace.leaveTypes.find((t) => t.id === r.leaveTypeId)?.name}
          </div>
        </div>
      ),
    },
    { title: "Dates", render: (r) => `${r.startDate} → ${r.endDate}` },
    {
      title: "Amount",
      render: (r) =>
        `${r.amount} ${workspace.leaveTypes.find((t) => t.id === r.leaveTypeId)?.unit ?? ""}`,
    },
    {
      title: "Reason",
      render: (r) => (
        <span className="max-w-xs truncate text-ink-500">{r.reason}</span>
      ),
    },
    { title: "Status", render: (r) => <Status>{r.status}</Status> },
    {
      title: "Approval",
      render: (r) =>
        r.status === "pending" ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => void approve(r)}>
              Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => void reject(r)}>
              Reject
            </Button>
          </div>
        ) : (
          <span className="text-xs text-ink-500">
            {r.approvals?.length ?? 0} step(s)
          </span>
        ),
    },
  ];
  const requestDefaults: HrLeaveRequest = {
    id: "",
    employeeId: "",
    leaveTypeId: workspace.leaveTypes[0]?.id ?? "",
    startDate: date(),
    endDate: date(),
    amount: 1,
    reason: "",
    status: "pending",
    approverId: "",
    createdAt: new Date().toISOString(),
    approvalChain: [],
  };
  return (
    <div className="space-y-5">
      <Section
        title="Leave requests"
        description="Requests validate date ranges, overlap, annual balances and the configured approval chain. Approvals are timestamped in the audit trail."
        action={
          <Button
            size="sm"
            leftIcon={<CalendarDays width={16} />}
            onClick={() => setRequestOpen(true)}
          >
            New request
          </Button>
        }
      >
        <Table
          rows={workspace.leaveRequests
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
          columns={requestCols}
          empty="No leave requests yet."
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Collection
          title="Leave types"
          description="Annual, sick, unpaid, maternity, marriage, bereavement, business trip, emergency and study leave are preloaded."
          rows={workspace.leaveTypes}
          columns={[
            {
              title: "Type",
              render: (r) => <span className="font-semibold">{r.name}</span>,
            },
            { title: "Allowance", render: (r) => `${r.annualLimit} ${r.unit}` },
            {
              title: "Pay",
              render: (r) => <Status>{r.paid ? "paid" : "unpaid"}</Status>,
            },
            {
              title: "State",
              render: (r) => (
                <Status>{r.active ? "active" : "inactive"}</Status>
              ),
            },
          ]}
          fields={leaveFields}
          defaults={{
            id: "",
            name: "",
            unit: "days",
            annualLimit: 12,
            paid: true,
            active: true,
          }}
          onSave={async (r) =>
            commit(
              (w) => ({
                ...w,
                leaveTypes: [...w.leaveTypes.filter((t) => t.id !== r.id), r],
              }),
              `Saved leave type ${r.name}`,
            )
          }
        />
        <Collection
          title="Leave balances"
          description="Override the default allowance for a person and year; approved requests and legacy annual leave are included in balance calculations."
          rows={workspace.leaveBalances}
          columns={[
            {
              title: "Employee",
              render: (r) => employeeName(employees, r.employeeId),
            },
            {
              title: "Leave",
              render: (r) =>
                workspace.leaveTypes.find((t) => t.id === r.leaveTypeId)
                  ?.name ?? "Missing",
            },
            { title: "Year", render: (r) => r.year },
            {
              title: "Allowance / used",
              render: (r) => {
                const b = leaveBalance(
                  workspace,
                  r.employeeId,
                  r.leaveTypeId,
                  r.year,
                  legacyLeave,
                );
                return `${r.allowance} / ${b.used} · ${b.remaining} left`;
              },
            },
          ]}
          fields={balanceFields}
          defaults={{
            id: "",
            employeeId: "",
            leaveTypeId: workspace.leaveTypes[0]?.id ?? "",
            year: new Date().getFullYear(),
            allowance: 12,
          }}
          onSave={async (r) =>
            commit(
              (w) => ({
                ...w,
                leaveBalances: [
                  ...w.leaveBalances.filter(
                    (b) =>
                      b.id !== r.id &&
                      !(
                        b.employeeId === r.employeeId &&
                        b.leaveTypeId === r.leaveTypeId &&
                        b.year === r.year
                      ),
                  ),
                  r,
                ],
              }),
              `Saved leave balance for ${employeeName(employees, r.employeeId)}`,
            )
          }
        />
      </div>
      {requestOpen && (
        <Editor
          title="Add leave request"
          fields={requestFields}
          initial={requestDefaults as unknown as Values}
          onClose={() => setRequestOpen(false)}
          onSave={async (v) => {
            const employeeId = String(v.employeeId ?? "");
            const request: HrLeaveRequest = {
              ...requestDefaults,
              ...v,
              id: id("leave"),
              amount: Number(v.amount),
              approvalChain: approvalChain(workspace, employeeId),
              status: "pending" as const,
            };
            const validation = validateLeave(workspace, request, legacyLeave);
            if (validation) throw new Error(validation);
            await commit(
              (w) => ({ ...w, leaveRequests: [...w.leaveRequests, request] }),
              `Created leave request for ${employeeName(employees, request.employeeId)}`,
            );
          }}
        />
      )}
    </div>
  );
}

function Payroll({
  workspace,
  employees,
  period,
  setPeriod,
  payroll,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  period: string;
  setPeriod: (v: string) => void;
  payroll: HrWorkspace["payrollEntries"];
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const adjustmentFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    {
      key: "type",
      label: "Type",
      type: "select",
      options: adjustmentOptions,
      required: true,
    },
    { key: "amount", label: "Amount", type: "number", min: 0, required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "reason", label: "Reason", required: true },
  ];
  const overtimeFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "hours", label: "Hours", type: "number", min: 0, required: true },
    { key: "reason", label: "Reason", required: true },
    {
      key: "status",
      label: "Approval",
      type: "select",
      options: requestOptions,
      required: true,
    },
  ];
  const reviewFields: Field[] = [
    {
      key: "employeeId",
      label: "Employee",
      type: "select",
      options: employees.map((e) => ({ value: e.id, label: e.fullName })),
      required: true,
    },
    { key: "period", label: "Review period", type: "month", required: true },
    {
      key: "rating",
      label: "Rating (1–5)",
      type: "number",
      min: 1,
      max: 5,
      step: 0.5,
      required: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: options(["draft", "complete"]),
      required: true,
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  const settingsFields: Field[] = [
    {
      key: "currency",
      label: "Currency",
      required: true,
      hint: "Displayed beside every payroll figure.",
    },
    {
      key: "monthlyHours",
      label: "Monthly work hours",
      type: "number",
      min: 1,
      required: true,
    },
    {
      key: "overtimeMultiplier",
      label: "Overtime multiplier",
      type: "number",
      min: 0,
      step: 0.1,
      required: true,
    },
    { key: "taxPercent", label: "Tax %", type: "number", min: 0, max: 100 },
    {
      key: "insurancePercent",
      label: "Insurance %",
      type: "number",
      min: 0,
      max: 100,
    },
    {
      key: "approvalLevels",
      label: "Leave approval levels",
      type: "number",
      min: 1,
      max: 10,
      required: true,
    },
  ];
  const payrollCols: Column<HrWorkspace["payrollEntries"][number]>[] = [
    { title: "Employee", render: (r) => employeeName(employees, r.employeeId) },
    {
      title: "Base",
      render: (r) => money(r.baseSalary, workspace.settings.currency),
    },
    {
      title: "Bonus / penalty",
      render: (r) => (
        <span>
          {money(r.bonuses, workspace.settings.currency)} /{" "}
          {money(r.penalties, workspace.settings.currency)}
        </span>
      ),
    },
    {
      title: "OT",
      render: (r) =>
        `${r.overtimeHours}h × ${money(r.overtimeRate, workspace.settings.currency)}`,
    },
    {
      title: "Deductions",
      render: (r) =>
        money(
          (r.tax ?? 0) + (r.insurance ?? 0) + (r.unpaidDeduction ?? 0),
          workspace.settings.currency,
        ),
    },
    {
      title: "Net",
      render: (r) => (
        <span className="font-bold">
          {money(r.netSalary, workspace.settings.currency)}
        </span>
      ),
    },
    { title: "State", render: (r) => <Status>{r.status}</Status> },
  ];
  return (
    <div className="space-y-5">
      <Section
        title="Payroll run"
        description="Calculate draft payroll from salary, approved overtime, bonuses, penalties, unpaid leave, tax and insurance. Locked approved or paid rows are preserved."
        action={
          <div className="flex gap-2">
            <Input
              type="month"
              aria-label="Payroll period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 w-36"
            />
            <Button
              size="sm"
              onClick={() =>
                void commit(
                  (w) => ({
                    ...w,
                    payrollPeriod: period,
                    payrollEntries: [
                      ...w.payrollEntries.filter(
                        (entry) => entry.period !== period,
                      ),
                      ...payroll,
                    ],
                  }),
                  `Calculated payroll for ${period}`,
                )
              }
            >
              Calculate payroll
            </Button>
          </div>
        }
      >
        <Table
          rows={payroll}
          columns={payrollCols}
          empty="Add salary details to employee profiles, then calculate a payroll period."
        />
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Collection
          title="Adjustments"
          description="One-time rewards and penalties feed into the selected payroll month."
          rows={workspace.adjustments}
          columns={[
            {
              title: "Employee",
              render: (r) => employeeName(employees, r.employeeId),
            },
            { title: "Type", render: (r) => <Status>{r.type}</Status> },
            {
              title: "Amount",
              render: (r) => money(r.amount, workspace.settings.currency),
            },
            { title: "Date", render: (r) => r.date },
            { title: "Reason", render: (r) => r.reason },
          ]}
          fields={adjustmentFields}
          defaults={{
            id: "",
            employeeId: "",
            type: "bonus",
            amount: 0,
            date: date(),
            reason: "",
          }}
          onSave={async (r) =>
            commit(
              (w) => ({
                ...w,
                adjustments: [...w.adjustments.filter((a) => a.id !== r.id), r],
              }),
              `Saved ${r.type} adjustment`,
            )
          }
        />
        <Collection
          title="Overtime approvals"
          description="Only approved overtime enters payroll when the approval rule is enabled."
          rows={workspace.overtime}
          columns={[
            {
              title: "Employee",
              render: (r) => employeeName(employees, r.employeeId),
            },
            { title: "Date", render: (r) => r.date },
            { title: "Hours", render: (r) => r.hours },
            { title: "Reason", render: (r) => r.reason },
            { title: "Status", render: (r) => <Status>{r.status}</Status> },
          ]}
          fields={overtimeFields}
          defaults={{
            id: "",
            employeeId: "",
            date: date(),
            hours: 1,
            reason: "",
            status: "pending",
          }}
          onSave={async (r) =>
            commit(
              (w) => ({
                ...w,
                overtime: [...w.overtime.filter((o) => o.id !== r.id), r],
              }),
              `Saved overtime for ${employeeName(employees, r.employeeId)}`,
            )
          }
        />
      </div>
      <Collection
        title="Performance reviews"
        description="Store periodic appraisals with a rating, notes and completion state."
        rows={workspace.performanceReviews}
        columns={[
          {
            title: "Employee",
            render: (r) => employeeName(employees, r.employeeId),
          },
          { title: "Period", render: (r) => r.period },
          { title: "Rating", render: (r) => `${r.rating}/5` },
          { title: "Status", render: (r) => <Status>{r.status}</Status> },
          { title: "Notes", render: (r) => r.notes || "—" },
        ]}
        fields={reviewFields}
        defaults={{
          id: "",
          employeeId: "",
          period,
          rating: 3,
          notes: "",
          status: "draft",
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              performanceReviews: [
                ...w.performanceReviews.filter((p) => p.id !== r.id),
                r,
              ],
            }),
            `Saved performance review for ${employeeName(employees, r.employeeId)}`,
          )
        }
      />
      <Section
        title="Payroll rules"
        description="These settings are applied by the calculation engine and are kept in the HR workspace backup."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSettingsOpen(true)}
          >
            Edit settings
          </Button>
        }
      >
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Currency
            </div>
            <div className="mt-1 text-lg font-bold">
              {workspace.settings.currency}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Monthly hours
            </div>
            <div className="mt-1 text-lg font-bold">
              {workspace.settings.monthlyHours}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Overtime multiplier
            </div>
            <div className="mt-1 text-lg font-bold">
              ×{workspace.settings.overtimeMultiplier}
            </div>
          </div>
        </div>
        {settingsOpen && (
          <Editor
            title="Payroll and approval settings"
            fields={settingsFields}
            initial={workspace.settings as unknown as Values}
            onClose={() => setSettingsOpen(false)}
            onSave={async (v) =>
              commit(
                (w) => ({
                  ...w,
                  settings: {
                    ...w.settings,
                    ...v,
                    monthlyHours: Number(v.monthlyHours),
                    overtimeMultiplier: Number(v.overtimeMultiplier),
                    taxPercent: Number(v.taxPercent) || 0,
                    insurancePercent: Number(v.insurancePercent) || 0,
                    approvalLevels: Number(v.approvalLevels),
                  },
                }),
                "Updated payroll and approval settings",
              )
            }
          />
        )}
      </Section>
    </div>
  );
}

function Hiring({
  workspace,
  commit,
}: {
  workspace: HrWorkspace;
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const fields: Field[] = [
    { key: "fullName", label: "Candidate name", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "position", label: "Position", required: true },
    {
      key: "stage",
      label: "Stage",
      type: "select",
      options: stageOptions,
      required: true,
    },
    { key: "skills", label: "Skills", type: "textarea" },
    {
      key: "cvUrl",
      label: "CV / portfolio URL",
      type: "url",
      hint: "Upload the CV to your document store, then paste its private link.",
    },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  return (
    <div className="space-y-5">
      <Collection
        title="Candidates"
        description="Track applicants from intake through offer and hiring. Candidate notes and CV links stay inside the HR workspace."
        rows={workspace.candidates}
        columns={[
          {
            title: "Candidate",
            render: (r) => (
              <div>
                <div className="font-semibold">{r.fullName}</div>
                <div className="text-xs text-ink-500">
                  {r.email} · {r.phone}
                </div>
              </div>
            ),
          },
          { title: "Position", render: (r) => r.position },
          { title: "Stage", render: (r) => <Status>{r.stage}</Status> },
          {
            title: "Skills",
            render: (r) => (
              <span className="max-w-xs truncate text-ink-500">
                {r.skills || "—"}
              </span>
            ),
          },
          {
            title: "CV",
            render: (r) =>
              r.cvUrl ? (
                <a
                  className="font-semibold text-brand-600 underline"
                  href={r.cvUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open CV
                </a>
              ) : (
                <span className="text-ink-400">Missing</span>
              ),
          },
        ]}
        fields={fields}
        defaults={{
          id: "",
          fullName: "",
          email: "",
          phone: "",
          position: "",
          stage: "New",
          skills: "",
          notes: "",
          cvUrl: "",
          appliedAt: new Date().toISOString(),
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              candidates: [...w.candidates.filter((c) => c.id !== r.id), r],
            }),
            `Saved candidate ${r.fullName}`,
          )
        }
      />
    </div>
  );
}

function Locations({
  workspace,
  commit,
}: {
  workspace: HrWorkspace;
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const locationFields: Field[] = [
    { key: "name", label: "Location name", required: true },
    {
      key: "latitude",
      label: "Latitude",
      type: "number",
      min: -90,
      max: 90,
      required: true,
    },
    {
      key: "longitude",
      label: "Longitude",
      type: "number",
      min: -180,
      max: 180,
      required: true,
    },
    {
      key: "radiusMeters",
      label: "Allowed radius (meters)",
      type: "number",
      min: 10,
      required: true,
    },
    { key: "active", label: "Active", type: "checkbox" },
  ];
  const deviceFields: Field[] = [
    { key: "name", label: "Device name", required: true },
    {
      key: "model",
      label: "Model",
      required: true,
      hint: "Use “ZK iFace 1000” for the supplied ZK face device.",
    },
    { key: "endpoint", label: "Endpoint / IP address", required: true },
    {
      key: "locationId",
      label: "Location",
      type: "select",
      options: workspace.locations.map((l) => ({ value: l.id, label: l.name })),
      required: true,
    },
    {
      key: "status",
      label: "Connection state",
      type: "select",
      options: options(["configured", "connected", "offline"]),
      required: true,
    },
  ];
  const deviceRows = workspace.devices;
  return (
    <div className="space-y-5">
      <Section
        title="Location policy"
        description="Mobile check-in can require an enabled location. Enter coordinates from your site map and validate a device position before accepting attendance."
        action={
          <span className="text-sm text-ink-500">
            {workspace.locations.filter((l) => l.active).length} active sites
          </span>
        }
      >
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold">Geofence</div>
            <p className="mt-1 text-sm text-ink-500">
              Distance checks use the Haversine formula and the radius on each
              location.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold">ZK iFace 1000</div>
            <p className="mt-1 text-sm text-ink-500">
              Configure the device endpoint, then import its attendance events
              into the HR register.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold">Privacy</div>
            <p className="mt-1 text-sm text-ink-500">
              Face-device imports are stored as attendance timestamps and device
              IDs, never face images.
            </p>
          </div>
        </div>
      </Section>
      <Collection
        title="Work locations"
        description="Use a tight radius for office entrances and a larger radius for field sites."
        rows={workspace.locations}
        columns={[
          {
            title: "Location",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
          {
            title: "Coordinates",
            render: (r) =>
              `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`,
          },
          { title: "Radius", render: (r) => `${r.radiusMeters}m` },
          {
            title: "State",
            render: (r) => <Status>{r.active ? "active" : "inactive"}</Status>,
          },
        ]}
        fields={locationFields}
        defaults={{
          id: "",
          name: "",
          latitude: 0,
          longitude: 0,
          radiusMeters: 100,
          active: true,
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              locations: [...w.locations.filter((l) => l.id !== r.id), r],
            }),
            `Saved location ${r.name}`,
          )
        }
      />
      <Collection
        title="Attendance devices"
        description="Connect ZK iFace 1000 or another attendance terminal. The browser cannot open private LAN endpoints from a hosted site, so use an HTTPS gateway or scheduled importer for production sync."
        rows={deviceRows}
        columns={[
          {
            title: "Device",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
          { title: "Model", render: (r) => r.model },
          { title: "Endpoint", render: (r) => r.endpoint },
          {
            title: "Location",
            render: (r) =>
              workspace.locations.find((l) => l.id === r.locationId)?.name ??
              "Unassigned",
          },
          { title: "Status", render: (r) => <Status>{r.status}</Status> },
          {
            title: "Last sync",
            render: (r) =>
              r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : "Never",
          },
        ]}
        fields={deviceFields}
        defaults={{
          id: "",
          name: "",
          model: "ZK iFace 1000",
          endpoint: "https://",
          locationId: workspace.locations[0]?.id ?? "",
          status: "configured",
          lastSyncAt: "",
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              devices: [
                ...w.devices.filter((d) => d.id !== r.id),
                {
                  ...r,
                  lastSyncAt:
                    r.status === "connected"
                      ? new Date().toISOString()
                      : r.lastSyncAt,
                },
              ],
            }),
            `Saved attendance device ${r.name}`,
          )
        }
      />
      <Section
        title="Test a geofence"
        description="Use a GPS coordinate from a phone or device to confirm which location accepts it."
      >
        <GeofenceTester locations={workspace.locations} />
      </Section>
    </div>
  );
}
function GeofenceTester({ locations }: { locations: HrLocation[] }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const results = locations
    .filter(
      (l) =>
        l.active &&
        lat &&
        lng &&
        distanceMeters(Number(lat), Number(lng), l.latitude, l.longitude) <=
          l.radiusMeters,
    )
    .map((l) => l.name);
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-3">
      <Input
        label="Latitude"
        type="number"
        value={lat}
        onChange={(e) => setLat(e.target.value)}
      />
      <Input
        label="Longitude"
        type="number"
        value={lng}
        onChange={(e) => setLng(e.target.value)}
      />
      <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <div className="font-semibold">Result</div>
        <div className="mt-2 text-ink-500">
          {!lat || !lng
            ? "Enter coordinates."
            : results.length
              ? `Inside: ${results.join(", ")}`
              : "Outside all active locations."}
        </div>
      </div>
    </div>
  );
}

function Rules({
  workspace,
  commit,
}: {
  workspace: HrWorkspace;
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const fields: Field[] = [
    { key: "name", label: "Rule name", required: true },
    {
      key: "kind",
      label: "Category",
      type: "select",
      options: options(["late", "overtime", "leave", "payroll", "attendance"]),
      required: true,
    },
    { key: "value", label: "Value", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "enabled", label: "Enabled", type: "checkbox" },
  ];
  return (
    <div className="space-y-5">
      <Collection
        title="HR rules"
        description="Rules control late grace, overtime approval, leave balance warnings, payroll periods and mobile location requirements. Every change is audited."
        rows={workspace.rules}
        columns={[
          {
            title: "Rule",
            render: (r) => (
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-ink-500">{r.description}</div>
              </div>
            ),
          },
          { title: "Category", render: (r) => <Status>{r.kind}</Status> },
          { title: "Value", render: (r) => r.value },
          {
            title: "State",
            render: (r) => <Status>{r.enabled ? "active" : "inactive"}</Status>,
          },
        ]}
        fields={fields}
        defaults={{
          id: "",
          name: "",
          description: "",
          kind: "attendance",
          value: "",
          enabled: true,
        }}
        onSave={async (r) =>
          commit(
            (w) => ({
              ...w,
              rules: [...w.rules.filter((x) => x.id !== r.id), r],
            }),
            `Saved HR rule ${r.name}`,
          )
        }
      />
      <Section
        title="Policy notes"
        description="Keep your local labor policy close to the configuration so approvers understand the reason behind each rule."
      >
        <div className="grid gap-3 p-5 text-sm text-ink-500 sm:grid-cols-2">
          <p className="rounded-xl bg-slate-50 p-4">
            Leave is checked against the employee's annual balance, overlap and
            approval status before it can be approved.
          </p>
          <p className="rounded-xl bg-slate-50 p-4">
            Payroll preserves approved and paid rows so a recalculation cannot
            silently change a completed payroll.
          </p>
          <p className="rounded-xl bg-slate-50 p-4">
            Device attendance is append-only and includes source device IDs for
            reconciliation.
          </p>
          <p className="rounded-xl bg-slate-50 p-4">
            Use the backup button before making a large policy change.
          </p>
        </div>
      </Section>
    </div>
  );
}

function Reports({
  workspace,
  employees,
  rows,
  payroll,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  rows: ReturnType<typeof attendanceRows>;
  payroll: HrWorkspace["payrollEntries"];
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const exportAttendance = () =>
    csvDownload(
      `attendance-${date()}.csv`,
      [
        "Date",
        "Employee",
        "Shift",
        "Status",
        "Check in",
        "Check out",
        "Hours",
        "Late minutes",
        "Overtime hours",
      ],
      rows.map((r) => [
        r.date,
        employeeName(employees, r.employeeId),
        r.shift,
        r.status,
        r.checkIn,
        r.checkOut,
        r.hours,
        r.late,
        r.overtime,
      ]),
    );
  const exportPayroll = () =>
    csvDownload(
      `payroll-${workspace.payrollPeriod}.csv`,
      [
        "Employee",
        "Period",
        "Base",
        "Bonus",
        "Penalty",
        "Overtime hours",
        "Tax",
        "Insurance",
        "Unpaid deduction",
        "Net",
        "Status",
      ],
      payroll.map((r) => [
        employeeName(employees, r.employeeId),
        r.period,
        r.baseSalary,
        r.bonuses,
        r.penalties,
        r.overtimeHours,
        r.tax ?? 0,
        r.insurance ?? 0,
        r.unpaidDeduction ?? 0,
        r.netSalary,
        r.status,
      ]),
    );
  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as HrWorkspace;
        if (!parsed.departments || !parsed.profiles || !parsed.settings)
          throw new Error("This file is not a Vio HR backup.");
        void commit(
          (w) => ({
            ...parsed,
            audit: [...parsed.audit, ...w.audit.slice(-1)],
          }),
          `Imported HR backup ${file.name}`,
        );
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : "Invalid backup file.",
        );
      }
    };
    reader.readAsText(file);
  };
  return (
    <div className="space-y-5">
      <Section
        title="Export reports"
        description="CSV files are UTF-8 with formula-injection protection so they open safely in Excel or Google Sheets."
      >
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Button leftIcon={<Download width={17} />} onClick={exportAttendance}>
            Attendance CSV
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download width={17} />}
            onClick={exportPayroll}
          >
            Payroll CSV
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-ink-700 hover:bg-slate-50">
            <Upload width={17} /> Import HR backup
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importBackup(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </Section>
      <Section
        title="Audit log"
        description="Every HR write records the actor, time and action. Keep this log with your payroll and compliance records."
      >
        <Table
          rows={workspace.audit.slice().reverse()}
          columns={[
            { title: "Time", render: (r) => new Date(r.at).toLocaleString() },
            { title: "Actor", render: (r) => r.actor },
            { title: "Action", render: (r) => r.action },
          ]}
          empty="No changes have been recorded yet."
        />
      </Section>
      <Section
        title="Data governance"
        description="A backup is a portable JSON copy of the HR workspace. Supabase deployments also use revision checks to prevent one browser from overwriting another browser's changes."
      >
        <div className="grid gap-3 p-5 text-sm text-ink-500 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold text-ink-900">Source history</div>
            <p className="mt-1">
              Attendance records remain in the Vio attendance service and are
              merged with HR device imports.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold text-ink-900">Documents</div>
            <p className="mt-1">
              Store private document links in profiles; browser data is local
              when Supabase credentials are absent.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="font-semibold text-ink-900">Retention</div>
            <p className="mt-1">
              Decide retention periods for CVs, contracts, payroll and
              face-terminal exports with your organization policy.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
