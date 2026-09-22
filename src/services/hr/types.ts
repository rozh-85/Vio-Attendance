export type HrAdjustmentType = "bonus" | "penalty";
export type HrRequestStatus = "pending" | "approved" | "rejected";

export interface HrDocument {
  id: string;
  title: string;
  type: string;
  url: string;
  uploadedAt: string;
  status: "active" | "expired";
  expiresOn?: string;
  fileName?: string;
}

export interface HrEmployeeProfile {
  employeeId: string;
  departmentId: string;
  managerId: string;
  jobTitle: string;
  employmentType: string;
  joinDate: string;
  email: string;
  emergencyContact: string;
  baseSalary: number;
  cvSummary: string;
  documents: HrDocument[];
  status?: "active" | "probation" | "inactive";
  birthDate?: string;
  address?: string;
  nationalId?: string;
  bankAccount?: string;
  contractEnd?: string;
  skills?: string;
  education?: string;
  experience?: string;
  portalHash?: string;
  portalExpiresAt?: string;
}

export interface HrDepartment {
  id: string;
  name: string;
  managerId: string;
  parentId: string;
  active: boolean;
  sortOrder: number;
}

export interface HrShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: string[];
  graceMinutes: number;
  overtimeAfterHours: number;
  active: boolean;
}

export interface HrShiftAssignment {
  id: string;
  employeeId: string;
  shiftId: string;
  fromDate: string;
  toDate: string;
}

export interface HrLeaveType {
  id: string;
  name: string;
  unit: "days" | "hours";
  annualLimit: number;
  paid: boolean;
  active: boolean;
}

export interface HrLeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  amount: number;
  reason: string;
  status: HrRequestStatus;
  approverId: string;
  createdAt: string;
  approvalChain?: string[];
  approvals?: { approverId: string; actor: string; at: string; note: string }[];
  decisionNote?: string;
}

export interface HrLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
}

export interface HrDevice {
  id: string;
  name: string;
  model: string;
  endpoint: string;
  locationId: string;
  status: "configured" | "offline" | "connected";
  lastSyncAt: string;
}

export interface HrRule {
  id: string;
  name: string;
  description: string;
  kind: "late" | "overtime" | "leave" | "payroll" | "attendance";
  value: string;
  enabled: boolean;
}

export interface HrAdjustment {
  id: string;
  employeeId: string;
  type: HrAdjustmentType;
  reason: string;
  amount: number;
  date: string;
}

export interface HrPayrollEntry {
  id: string;
  employeeId: string;
  period: string;
  baseSalary: number;
  bonuses: number;
  penalties: number;
  overtimeHours: number;
  overtimeRate: number;
  netSalary: number;
  tax?: number;
  insurance?: number;
  unpaidDeduction?: number;
  status: "draft" | "approved" | "paid";
}

export interface HrPerformanceReview {
  id: string;
  employeeId: string;
  period: string;
  rating: number;
  notes: string;
  status: "draft" | "complete";
}

export interface HrOvertimeRecord {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  reason: string;
  status: HrRequestStatus;
}

export type HrInterviewStatus =
  | "Approved"
  | "Interviewed"
  | "Call Not Answered"
  | "Did Not Accept"
  | "Rejected"
  | "Outside Country"
  | "Pending / Call Later";

export interface HrInterviewHistoryEntry {
  id: string;
  date: string;
  event: string;
}

export interface HrInterviewCandidate {
  id: string;
  date: string;
  fullName: string;
  phone: string;
  location: string;
  portfolioUrl: string;
  status: HrInterviewStatus;
  notes: string;
  callAgainDate: string;
  expectedReturnDate: string;
  interviewDate: string;
  history: HrInterviewHistoryEntry[];
}

export interface HrWorkspace {
  revision: number;
  departments: HrDepartment[];
  profiles: Record<string, HrEmployeeProfile>;
  shifts: HrShift[];
  assignments: HrShiftAssignment[];
  leaveTypes: HrLeaveType[];
  leaveRequests: HrLeaveRequest[];
  locations: HrLocation[];
  devices: HrDevice[];
  rules: HrRule[];
  adjustments: HrAdjustment[];
  payrollEntries: HrPayrollEntry[];
  performanceReviews: HrPerformanceReview[];
  overtime: HrOvertimeRecord[];
  sectors: string[];
  payrollPeriod: string;
  holidays: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    paid: boolean;
  }[];
  cycles: {
    id: string;
    name: string;
    startDate: string;
    workDays: number;
    restDays: number;
    shiftId: string;
    employeeIds: string[];
  }[];
  leaveBalances: {
    id: string;
    employeeId: string;
    leaveTypeId: string;
    year: number;
    allowance: number;
  }[];
  candidates: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    position: string;
    stage: string;
    skills: string;
    notes: string;
    cvUrl: string;
    appliedAt: string;
  }[];
  interviewCandidates: HrInterviewCandidate[];
  deviceAttendance: {
    id: string;
    deviceId: string;
    employeeId: string;
    checkInAt: string;
    checkOutAt: string;
  }[];
  audit: { id: string; at: string; actor: string; action: string }[];
  settings: {
    currency: string;
    monthlyHours: number;
    overtimeMultiplier: number;
    taxPercent: number;
    insurancePercent: number;
    approvalLevels: number;
  };
}
