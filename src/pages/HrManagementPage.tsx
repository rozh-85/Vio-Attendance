import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { Input } from "@/components/ui/Input";
import {
  Building,
  CalendarDays,
  Clock,
  Download,
  FileText,
  MapPin,
  Pencil,
  Search,
  Settings,
  Upload,
  Users,
  Wallet,
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
  Section,
  Status,
  Table,
  type Column,
  type Field,
  type Values,
  fieldClass,
  options,
} from "@/components/hr/HrUi";
import { HrDocuments } from "@/components/hr/HrDocuments";
import { HrDeviceImport } from "@/components/hr/HrDeviceImport";

type Tab =
  | "overview"
  | "people"
  | "organization"
  | "time"
  | "leave"
  | "payroll"
  | "hiring"
  | "locations"
  | "rules"
  | "reports";
const tabItems: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Overview", icon: Users },
  { id: "people", label: "People & profiles", icon: Users },
  { id: "organization", label: "Organization", icon: Building },
  { id: "time", label: "Time & attendance", icon: Clock },
  { id: "leave", label: "Leave & holidays", icon: CalendarDays },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "hiring", label: "Recruitment", icon: FileText },
  { id: "locations", label: "Locations & devices", icon: MapPin },
  { id: "rules", label: "Rules & settings", icon: Settings },
  { id: "reports", label: "Reports & audit", icon: Download },
];

const date = () => localDate();
const id = (prefix: string) => createHrId(prefix);
const statusOptions = options(["active", "probation", "inactive"]);
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

export function HrManagementPage() {
  const data = useDataService();
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
  const [tab, setTab] = useState<Tab>("overview");
  const [profileEditor, setProfileEditor] = useState<Employee | null>(null);
  const [period, setPeriod] = useState(workspace.payrollPeriod);
  const [attendanceFrom, setAttendanceFrom] = useState(date());
  const [attendanceTo, setAttendanceTo] = useState(date());
  const [employeeQuery, setEmployeeQuery] = useState("");

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
  async function commit(
    mutator: (w: HrWorkspace) => HrWorkspace,
    action: string,
  ) {
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
      setError(err instanceof Error ? err.message : "Could not save HR data.");
    } finally {
      setSaving(false);
    }
  }
  async function saveProfile(employee: Employee, values: Values) {
    const current = profileFor(workspace, employee.id);
    await commit(
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
    setProfileEditor(null);
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
  const profileFields: Field[] = [
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
    { key: "birthDate", label: "Birth date", type: "date" },
    { key: "email", label: "Work email", type: "email" },
    { key: "emergencyContact", label: "Emergency contact" },
    { key: "nationalId", label: "National ID" },
    { key: "bankAccount", label: "Bank account / IBAN" },
    { key: "address", label: "Address", type: "textarea" },
    {
      key: "baseSalary",
      label: "Base monthly salary",
      type: "number",
      min: 0,
      required: true,
    },
    {
      key: "skills",
      label: "Skills",
      type: "textarea",
      hint: "Comma-separated skills for the employee directory.",
    },
    { key: "education", label: "Education", type: "textarea" },
    { key: "experience", label: "Experience", type: "textarea" },
    {
      key: "cvSummary",
      label: "CV summary",
      type: "textarea",
      hint: "Keep a short, searchable summary here. Upload a CV link in Documents below.",
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

  return (
    <AdminLayout>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-bold uppercase tracking-wide text-brand-600">
            Vio HR
          </div>
          <h1 className="text-3xl font-bold">Human resources workspace</h1>
          <p className="mt-1 max-w-3xl text-ink-500">
            One place for your employee directory, contracts, attendance,
            shifts, leave, payroll, documents, recruitment, locations, and audit
            history.
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
      <div className="mb-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
        <nav className="flex min-w-max gap-1">
          {tabItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === item.id ? "bg-brand-600 text-white shadow-sm" : "text-ink-500 hover:bg-slate-100 hover:text-ink-900"}`}
            >
              <item.icon width={16} height={16} />
              {item.label}
              {item.id === "leave" && pendingRequests.length > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 text-xs">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      {(notice || error) && (
        <div
          className={`mb-5 rounded-xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
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
            onEdit={setProfileEditor}
          />
          <HrDocuments
            workspace={workspace}
            employees={employees}
            commit={commit}
          />
        </div>
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
      {profileEditor && (
        <Editor
          title={`Employee profile · ${profileEditor.fullName}`}
          description="Maintain the complete HR record. Attendance identity fields remain in the employee report."
          fields={profileFields}
          initial={profileValues(profileFor(workspace, profileEditor.id))}
          onClose={() => setProfileEditor(null)}
          onSave={async (values) => saveProfile(profileEditor, values)}
        />
      )}
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
  onEdit,
}: {
  employees: Employee[];
  workspace: HrWorkspace;
  query: string;
  setQuery: (v: string) => void;
  onEdit: (e: Employee) => void;
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
                <Status>
                  {profileFor(workspace, e.id).status ?? "active"}
                </Status>
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
