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
  photoUrl?: string;
  documents: HrDocument[];
  status?: "active" | "probation" | "inactive";
  birthDate?: string;
  birthPlace?: string;
  gender?: "male" | "female" | "other";
  maritalStatus?: string;
  bloodType?: string;
  address?: string;
  nationalId?: string;
  bankAccount?: string;
  contractEnd?: string;
  skills?: string;
  education?: string;
  educationLevel?: string;
  university?: string;
  specialization?: string;
  graduationYear?: string;
  experience?: string;
  workHours?: string;
  languages?: string;
  computerSkills?: string;
  trainings?: string;
  chronicDisease?: string;
  emergencyRelation?: string;
  emergencyPhone?: string;
  /** What the job involves day to day ("type of work" on the paper HR form). */
  duties?: string;
  /**
   * Absences, late arrivals, early leaves, overtime and deductions as written
   * on the paper HR form. Kept as notes: they change no attendance or payroll.
   */
  attendanceNotes?: string;
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
  /** Days the work schedule has in the month (9:00–16:00 days by default). */
  workDays?: number;
  /** Minutes the work schedule has in the month; the salary is divided by it. */
  workMinutes?: number;
  /** The salary divided by the month's work time. */
  dayRate?: number;
  hourRate?: number;
  minuteRate?: number;
  /** The base salary for the part of the month after the join date. */
  earnedBase?: number;
  /** Approved deductions for late, early leave, absence and the like. */
  timeDeductions?: number;
  /** The approved deductions this payslip includes, frozen with it. */
  deductionIds?: string[];
  approvedAt?: string;
  paidAt?: string;
}

/**
 * Money taken off a salary for time not worked, or for anything else HR types
 * in by hand. Nothing found in the check-ins comes off a salary by itself:
 * a deduction is only counted once somebody approves it.
 */
export type HrDeductionKind =
  | "late"
  | "early"
  | "absent"
  | "unpaid-holiday"
  | "manual";

export interface HrDeduction {
  /**
   * `<kind>-<employeeId>-<date>` for one found in the check-ins, so the same
   * late morning is never offered twice; a random id for one typed in by hand.
   */
  id: string;
  employeeId: string;
  /** The day it is for, YYYY-MM-DD. Its month is the payroll month it hits. */
  date: string;
  kind: HrDeductionKind;
  /** The time missed, in minutes; 0 for a plain amount. */
  minutes: number;
  /** The money taken off. */
  amount: number;
  /** HR's own words, optional — e.g. "late". */
  note: string;
  /** What the check-ins showed, e.g. "In 09:25 · starts 09:00". */
  detail?: string;
  /** "pending" only ever lives in memory: what is saved has been decided. */
  status: HrRequestStatus;
  decidedAt?: string;
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
  deductions: HrDeduction[];
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
    /**
     * Only used when an employee has no work time in a month to divide the
     * salary by; the work day below is what normally sets the rates.
     */
    monthlyHours: number;
    /** The work day for everyone without a shift of their own, "09:00". */
    workStart: string;
    /** "16:00". */
    workEnd: string;
    /** The days of that work day, e.g. ["Sat", "Sun", …, "Thu"]. */
    workDays: string[];
    overtimeMultiplier: number;
    taxPercent: number;
    insurancePercent: number;
    approvalLevels: number;
  };
}
