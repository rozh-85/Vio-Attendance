import { getSupabaseClient } from "@/lib/supabase";
import type {
  HrDepartment,
  HrEmployeeProfile,
  HrLeaveType,
  HrRule,
  HrShift,
  HrWorkspace,
} from "./types";

export const STORAGE_KEY = "vio.hr.workspace";

export function hrClient() {
  return import.meta.env.VITE_DATA_BACKEND === "supabase"
    ? getSupabaseClient()
    : null;
}

const defaultLeaveTypes: HrLeaveType[] = [
  {
    id: "annual",
    name: "Annual leave",
    unit: "days",
    annualLimit: 12,
    paid: true,
    active: true,
  },
  {
    id: "sick",
    name: "Sick leave",
    unit: "days",
    annualLimit: 30,
    paid: true,
    active: true,
  },
  {
    id: "unpaid",
    name: "Unpaid leave",
    unit: "days",
    annualLimit: 30,
    paid: false,
    active: true,
  },
  {
    id: "maternity",
    name: "Maternity leave",
    unit: "days",
    annualLimit: 90,
    paid: true,
    active: true,
  },
  {
    id: "marriage",
    name: "Marriage leave",
    unit: "days",
    annualLimit: 5,
    paid: true,
    active: true,
  },
  {
    id: "bereavement",
    name: "Bereavement leave",
    unit: "days",
    annualLimit: 5,
    paid: true,
    active: true,
  },
  {
    id: "business-trip",
    name: "Business trip",
    unit: "days",
    annualLimit: 30,
    paid: true,
    active: true,
  },
  {
    id: "emergency",
    name: "Emergency leave",
    unit: "hours",
    annualLimit: 24,
    paid: true,
    active: true,
  },
  {
    id: "study",
    name: "Study leave",
    unit: "days",
    annualLimit: 10,
    paid: false,
    active: true,
  },
];

const defaultRules: HrRule[] = [
  {
    id: "late-grace",
    name: "Late arrival grace period",
    description: "Minutes allowed after shift start before a late mark.",
    kind: "late",
    value: "10",
    enabled: true,
  },
  {
    id: "overtime-approval",
    name: "Overtime requires approval",
    description: "Only approved overtime is added to payroll.",
    kind: "overtime",
    value: "true",
    enabled: true,
  },
  {
    id: "leave-balance",
    name: "Prevent leave over balance",
    description: "Warn the approver when a request exceeds the annual balance.",
    kind: "leave",
    value: "true",
    enabled: true,
  },
  {
    id: "monthly-payroll",
    name: "Monthly payroll calculation",
    description:
      "Calculate base salary plus approved overtime and adjustments.",
    kind: "payroll",
    value: "monthly",
    enabled: true,
  },
  {
    id: "location-check",
    name: "Location required for mobile check-in",
    description:
      "Only accept mobile attendance inside an enabled work location.",
    kind: "attendance",
    value: "false",
    enabled: false,
  },
];

export function createDefaultHrWorkspace(): HrWorkspace {
  const defaultShift: HrShift = {
    id: "standard-shift",
    name: "Standard shift",
    startTime: "08:00",
    endTime: "17:00",
    days: ["Mon", "Tue", "Wed", "Thu", "Sun"],
    graceMinutes: 10,
    overtimeAfterHours: 8,
    active: true,
  };
  return {
    revision: 0,
    departments: [],
    profiles: {},
    shifts: [defaultShift],
    assignments: [],
    leaveTypes: defaultLeaveTypes,
    leaveRequests: [],
    locations: [],
    devices: [],
    rules: defaultRules,
    adjustments: [],
    payrollEntries: [],
    performanceReviews: [],
    overtime: [],
    sectors: [
      "General commerce",
      "Residential projects",
      "Factories",
      "Restaurants",
      "Government institutions",
      "Banks",
    ],
    payrollPeriod: new Date().toISOString().slice(0, 7),
    holidays: [],
    cycles: [],
    leaveBalances: [],
    candidates: [],
    interviewCandidates: [],
    deviceAttendance: [],
    audit: [],
    settings: {
      currency: "IQD",
      monthlyHours: 208,
      overtimeMultiplier: 1.5,
      taxPercent: 0,
      insurancePercent: 0,
      approvalLevels: 1,
    },
  };
}

function mergeWorkspace(
  input: Partial<HrWorkspace> | null | undefined,
): HrWorkspace {
  const defaults = createDefaultHrWorkspace();
  return {
    ...defaults,
    ...input,
    settings: { ...defaults.settings, ...input?.settings },
    departments: input?.departments ?? defaults.departments,
    profiles: input?.profiles ?? defaults.profiles,
    shifts: input?.shifts?.length ? input.shifts : defaults.shifts,
    assignments: input?.assignments ?? defaults.assignments,
    leaveTypes: input?.leaveTypes?.length
      ? input.leaveTypes
      : defaults.leaveTypes,
    leaveRequests: input?.leaveRequests ?? defaults.leaveRequests,
    locations: input?.locations ?? defaults.locations,
    devices: input?.devices ?? defaults.devices,
    rules: input?.rules?.length ? input.rules : defaults.rules,
    adjustments: input?.adjustments ?? defaults.adjustments,
    payrollEntries: input?.payrollEntries ?? defaults.payrollEntries,
    performanceReviews:
      input?.performanceReviews ?? defaults.performanceReviews,
    overtime: input?.overtime ?? defaults.overtime,
    sectors: input?.sectors?.length ? input.sectors : defaults.sectors,
    payrollPeriod: input?.payrollPeriod ?? defaults.payrollPeriod,
    holidays: input?.holidays ?? defaults.holidays,
    cycles: input?.cycles ?? defaults.cycles,
    leaveBalances: input?.leaveBalances ?? defaults.leaveBalances,
    candidates: input?.candidates ?? defaults.candidates,
    interviewCandidates:
      input?.interviewCandidates ?? defaults.interviewCandidates,
    deviceAttendance: input?.deviceAttendance ?? defaults.deviceAttendance,
    audit: input?.audit ?? defaults.audit,
  };
}

export async function loadHrWorkspace(): Promise<HrWorkspace> {
  const client = hrClient();
  if (!client) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return mergeWorkspace(
        raw ? (JSON.parse(raw) as Partial<HrWorkspace>) : null,
      );
    } catch {
      throw new Error(
        "Saved HR data could not be read. Restore a valid browser backup before saving changes.",
      );
    }
  }
  const result = await client
    .from("vio_hr_workspace")
    .select("document, revision")
    .eq("id", "default")
    .maybeSingle();
  if (result.error)
    throw new Error(
      `HR database unavailable. Apply supabase/hr.sql, then retry. ${result.error.message}`,
    );
  return mergeWorkspace({
    ...(result.data?.document ?? {}),
    revision: result.data?.revision ?? 0,
  });
}

export async function saveHrWorkspace(
  workspace: HrWorkspace,
): Promise<HrWorkspace> {
  const next = mergeWorkspace(workspace);
  const client = hrClient();
  if (!client) {
    const current = await loadHrWorkspace();
    if (current.revision !== workspace.revision)
      throw new Error(
        "HR data changed in another tab. Refresh before saving again.",
      );
    next.revision += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
  const result = await client.rpc("save_hr_workspace", {
    p_document: next,
    p_revision: workspace.revision,
  });
  if (result.error) throw new Error(result.error.message);
  return { ...next, revision: Number(result.data) };
}

export function profileFor(
  workspace: HrWorkspace,
  employeeId: string,
): HrEmployeeProfile {
  return (
    workspace.profiles[employeeId] ?? {
      employeeId,
      departmentId: "",
      managerId: "",
      jobTitle: "",
      employmentType: "Full time",
      joinDate: "",
      email: "",
      emergencyContact: "",
      baseSalary: 0,
      cvSummary: "",
      documents: [],
    }
  );
}

export function createHrId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function sortDepartments(departments: HrDepartment[]): HrDepartment[] {
  return departments.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}
