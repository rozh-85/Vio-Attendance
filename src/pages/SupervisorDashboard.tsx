import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AddEmployeeModal } from '@/components/AddEmployeeModal';
import { DashboardSearch } from '@/components/dashboard/DashboardSearch';
import { SessionsCard } from '@/components/dashboard/SessionsCard';
import { SupervisorField } from '@/components/dashboard/SupervisorField';
import {
  buildSessionRows,
  dashboardStats,
  supervisorNames,
  type SessionRow,
} from '@/components/dashboard/sessionRows';
import {
  ArrowUp,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  Logout,
  Play,
  UserPlus,
  Users,
} from '@/components/icons';
import { useSessions } from '@/hooks/useSessions';
import { useDataService } from '@/services/data/context';
import { isDataError } from '@/services/data';
import { useAuth } from '@/services/auth/context';
import { exportAttendanceToExcel } from '@/services/report/excel';
import { exportSessionAttendanceToExcel } from '@/services/report/sessionTemplateExcel';
import { formatDateValue, todayValue } from '@/utils/time';
import { cn } from '@/utils/cn';
import { paths } from '@/routes';
import type { AttendanceRecord, Employee, NewEmployeeInput } from '@/types';

/** How often the numbers refresh while the page is open, for live check-ins. */
const REFRESH_MS = 30_000;

export function SupervisorDashboard() {
  const navigate = useNavigate();
  const data = useDataService();
  const { authRequired, signOut } = useAuth();
  const { sessions, loading, error: sessionsError, refresh: refreshSessions, createSession } = useSessions();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(true);

  // A session is just a supervisor and the day it covers. The date doubles as
  // the session's title, so there is nothing else to type.
  const [form, setForm] = useState({ supervisorName: '', date: todayValue() });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedEmployee, setAddedEmployee] = useState<Employee | null>(null);

  const loadDetails = useCallback(async () => {
    try {
      const [list, records] = await Promise.all([data.listEmployees(), data.listAttendance()]);
      setEmployees(list);
      setAttendance(records);
    } catch {
      // The sessions still show; the counts fill in on the next refresh.
    } finally {
      setDetailsLoading(false);
    }
  }, [data]);

  useEffect(() => {
    void loadDetails();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshSessions();
      void loadDetails();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadDetails, refreshSessions]);

  const rows = useMemo(() => buildSessionRows(sessions, employees, attendance), [sessions, employees, attendance]);
  const stats = useMemo(() => dashboardStats(sessions, employees, attendance), [sessions, employees, attendance]);
  const names = useMemo(() => supervisorNames(sessions), [sessions]);

  function openAddEmployee() {
    setAddError(null);
    setAddedEmployee(null);
    setShowAdd(true);
  }

  async function onAddEmployee(values: NewEmployeeInput) {
    setAddSaving(true);
    setAddError(null);
    try {
      const created = await data.registerEmployee(values);
      setAddedEmployee(created);
      void loadDetails();
    } catch (err) {
      setAddError(isDataError(err) ? err.message : 'Could not add employee. Please try again.');
    } finally {
      setAddSaving(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const session = await createSession({
        supervisorName: form.supervisorName.trim(),
        title: formatDateValue(form.date),
        location: '',
      });
      navigate(paths.session(session.id));
    } catch (err) {
      setCreateError(isDataError(err) ? err.message : 'Could not start the session. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function onSignOut() {
    await signOut();
    navigate(paths.admin, { replace: true });
  }

  async function onExportAll() {
    setExporting(true);
    try {
      const [allSessions, allEmployees, allAttendance, leaveRecords] = await Promise.all([
        data.listSessions(),
        data.listEmployees(),
        data.listAttendance(),
        data.listLeaveRecords(),
      ]);
      await exportAttendanceToExcel(allSessions, allEmployees, allAttendance, leaveRecords);
    } finally {
      setExporting(false);
    }
  }

  function onExportSession(row: SessionRow) {
    exportSessionAttendanceToExcel(
      row.session,
      employees,
      attendance.filter((r) => r.sessionId === row.session.id),
    );
  }

  const presentPct = stats.employees > 0 ? Math.round((stats.presentToday / stats.employees) * 100) : 0;
  const counting = detailsLoading && employees.length === 0;

  return (
    <AdminLayout>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-brand-600">Vio Attendance</div>
          <h1 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">Supervisor dashboard</h1>
          <p className="mt-1 text-ink-500">
            Manage employee check-ins, start new sessions and view attendance records.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center 2xl:shrink-0 2xl:flex-nowrap">
          <DashboardSearch employees={employees} rows={rows} />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" leftIcon={<UserPlus width={18} height={18} />} onClick={openAddEmployee}>
              Add employee
            </Button>
            <Button
              leftIcon={<Download width={18} height={18} />}
              loading={exporting}
              onClick={onExportAll}
              disabled={sessions.length === 0}
            >
              Export Excel
            </Button>
            {authRequired && (
              <Button
                variant="outline"
                className="col-span-2 sm:col-span-1"
                leftIcon={<Logout width={18} height={18} />}
                onClick={onSignOut}
              >
                Sign out
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Today at a glance ────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 2xl:grid-cols-4">
        <StatTile
          icon={<Users width={22} height={22} />}
          tone="brand"
          label="Total Employees"
          value={counting ? '…' : stats.employees}
          sub={
            stats.newEmployeesThisMonth > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <ArrowUp width={14} height={14} />+{stats.newEmployeesThisMonth} this month
              </span>
            ) : (
              'No new employees this month'
            )
          }
        />
        <StatTile
          icon={<CheckCircle width={22} height={22} />}
          tone="green"
          label="Present Today"
          value={counting ? '…' : stats.presentToday}
          sub={`${presentPct}% attendance`}
        />
        <StatTile
          icon={<Clock width={22} height={22} />}
          tone="amber"
          label="Currently in Session"
          value={counting ? '…' : stats.inSessionNow}
          sub={
            stats.activeSessions > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                {stats.activeSessions === 1 ? '1 active session' : `${stats.activeSessions} active sessions`}
              </span>
            ) : (
              'No active session'
            )
          }
        />
        <StatTile
          icon={<CalendarDays width={22} height={22} />}
          tone="rose"
          label="Total Sessions"
          value={loading ? '…' : stats.sessions}
          sub={`${stats.sessionsThisMonth} this month`}
        />
      </div>

      {/* ── Create new session ───────────────────────────────────────────── */}
      <Card className="mt-4 p-4 sm:mt-6 sm:p-6">
        <form
          onSubmit={onCreate}
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.85fr)_auto]"
        >
          <div className="flex items-center gap-4 lg:col-span-3 2xl:col-span-1 2xl:self-center">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 sm:size-14">
              <CalendarDays width={24} height={24} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ink-900">Create New Session</h2>
              <p className="text-sm text-ink-500">
                Select supervisor and date to start a new attendance session.
              </p>
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink-900">
              Supervisor name<span className="ml-0.5 text-rose-500">*</span>
            </span>
            <SupervisorField
              value={form.supervisorName}
              names={names}
              onChange={(v) => setForm((f) => ({ ...f, supervisorName: v }))}
            />
          </div>
          <div>
            <span className="mb-1.5 flex items-center justify-between text-sm font-semibold text-ink-900">
              <span>
                Date<span className="ml-0.5 text-rose-500">*</span>
              </span>
              {form.date !== todayValue() && (
                <button
                  type="button"
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => setForm((f) => ({ ...f, date: todayValue() }))}
                >
                  Use today
                </button>
              )}
            </span>
            <label className="relative block">
              <CalendarDays
                width={18}
                height={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                type="date"
                required
                aria-label="Date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="h-12 w-full rounded-xl border border-slate-200 bg-card pl-11 pr-3 text-ink-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </label>
          </div>
          <Button
            type="submit"
            className="h-12 lg:px-7"
            leftIcon={<Play width={16} height={16} />}
            loading={creating}
            disabled={!form.supervisorName.trim() || !form.date}
          >
            Start Session
          </Button>
          {createError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 lg:col-span-3 2xl:col-span-4">
              {createError}
            </p>
          )}
        </form>
      </Card>

      {/* ── Sessions ─────────────────────────────────────────────────────── */}
      <div className="mt-4 sm:mt-6">
        {sessionsError && (
          <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{sessionsError}</p>
        )}
        <SessionsCard rows={rows} loading={loading} onExport={onExportSession} />
      </div>

      {showAdd && (
        <AddEmployeeModal
          saving={addSaving}
          error={addError}
          createdEmployee={addedEmployee}
          onSave={onAddEmployee}
          onAddAnother={() => {
            setAddedEmployee(null);
            setAddError(null);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </AdminLayout>
  );
}

const TILE_TONES = {
  brand: 'bg-brand-50 text-brand-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-500',
} as const;

function StatTile({
  icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  tone: keyof typeof TILE_TONES;
  label: string;
  value: number | string;
  sub: ReactNode;
}) {
  return (
    // Phones: the icon sits above the figures, two tiles to a row.
    <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl sm:size-14 sm:rounded-2xl', TILE_TONES[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-500 sm:text-sm">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-ink-900 sm:text-3xl">{value}</div>
        <div className="text-xs text-ink-500 sm:truncate sm:text-sm">{sub}</div>
      </div>
    </Card>
  );
}
