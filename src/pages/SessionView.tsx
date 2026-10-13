import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { RotatingQRPanel } from '@/components/RotatingQRPanel';
import { AttendeeTable } from '@/components/AttendeeTable';
import { SharedDevicesCard } from '@/components/SharedDevicesCard';
import { AddEmployeeModal } from '@/components/AddEmployeeModal';
import {
  EditAttendeeModal,
  type EditAttendeeValues,
} from '@/components/EditAttendeeModal';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Clock,
  Download,
  Logout,
  QrIcon,
  Search,
  Stop,
  Trash,
  User,
  UserPlus,
  Users,
  X,
} from '@/components/icons';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { useDataService } from '@/services/data/context';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { isDataError } from '@/services/data';
import { STATUS_LABEL, isExcused, sessionIsOver } from '@/services/attendance/status';
import { exportSessionAttendanceToExcel } from '@/services/report/sessionTemplateExcel';
import { formatDate, formatClock } from '@/utils/time';
import { cn } from '@/utils/cn';
import { paths } from '@/routes';
import type {
  AttendanceStatus,
  NewEmployeeInput,
  SessionAttendee,
  Employee,
  AttendanceMark,
} from '@/types';
import type { ReactNode } from 'react';

type ModalKind = 'check-in' | 'check-out' | null;

interface DeleteEmployeeState {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
}

export function SessionView() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const data = useDataService();
  // The shared-phone findings belong to the owner report; a supervisor opening
  // this session must not see them here either.
  const ownerUnlocked = isOwnerUnlocked();
  const {
    session,
    attendees,
    stats,
    sharedDevices,
    sharedDeviceNames,
    sessionsById,
    loading,
    error,
    update,
    close,
    refresh,
    applyRecord,
  } = useSessionDetail(sessionId);

  const [modal, setModal] = useState<ModalKind>(null);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteEmployee, setDeleteEmployee] = useState<DeleteEmployeeState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editAttendee, setEditAttendee] = useState<SessionAttendee | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedEmployee, setAddedEmployee] = useState<Employee | null>(null);
  // Supervisor can switch either QR from the rotating 5s code to one constant
  // code that stays valid for the whole session.
  const [checkInQrConstant, setCheckInQrConstant] = useState(false);
  const [checkOutQrConstant, setCheckOutQrConstant] = useState(false);

  // The dashboard's QR buttons land here with ?qr=in or ?qr=out: open that QR
  // once the session has loaded, and only while it is still running.
  const [searchParams, setSearchParams] = useSearchParams();
  const qrRequest = searchParams.get('qr');
  useEffect(() => {
    if (!session || (qrRequest !== 'in' && qrRequest !== 'out')) return;
    setSearchParams({}, { replace: true });
    if (session.status !== 'active') return;
    if (qrRequest === 'in') {
      if (!session.checkInOpen) void update({ checkInOpen: true });
      setModal('check-in');
    } else {
      if (!session.checkOutOpen) void update({ checkOutOpen: true });
      setModal('check-out');
    }
  }, [session, qrRequest, setSearchParams, update]);

  const filteredAttendees = useMemo(() => {
    let result = attendees;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((attendee) => attendee.status === statusFilter);
    }

    // Filter by search query (name, code or position)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (attendee) =>
          attendee.employee.fullName.toLowerCase().includes(query) ||
          attendee.employee.code.toLowerCase().includes(query) ||
          attendee.employee.position.toLowerCase().includes(query),
      );
    }

    return result;
  }, [attendees, statusFilter, searchQuery]);

  if (loading) {
    return (
      <Screen width="xl">
        <div className="py-20 text-center text-ink-400">Loading session…</div>
      </Screen>
    );
  }

  if (error || !session) {
    return (
      <Screen width="xl">
        <Card className="p-10 text-center">
          <h1 className="text-xl font-bold">Session not found</h1>
          <p className="mt-2 text-ink-500">{error ?? 'It may have been removed.'}</p>
          <Link to={paths.dashboard} className="mt-4 inline-block">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </Card>
      </Screen>
    );
  }

  const isActive = session.status === 'active';

  async function openCheckIn() {
    if (isActive && !session!.checkInOpen) await update({ checkInOpen: true });
    setModal('check-in');
  }
  async function openCheckOut() {
    if (isActive && !session!.checkOutOpen) await update({ checkOutOpen: true });
    setModal('check-out');
  }

  async function onCloseSession() {
    setClosing(true);
    try {
      await close();
      setConfirmClose(false);
    } finally {
      setClosing(false);
    }
  }

  async function onMarkChange(
    attendee: SessionAttendee,
    mark: AttendanceMark | null,
  ) {
    setMarkError(null);
    try {
      applyRecord(
        await data.setAttendanceMark(session!.id, attendee.employee.id, mark),
      );
    } catch (err) {
      setMarkError(
        isDataError(err)
          ? err.message
          : `Could not save the mark for ${attendee.employee.fullName}. Please try again.`,
      );
    }
  }

  async function onBulkMark(employeeIds: string[], mark: AttendanceMark | null) {
    setMarkError(null);
    const failed: string[] = [];
    for (const employeeId of employeeIds) {
      try {
        applyRecord(await data.setAttendanceMark(session!.id, employeeId, mark));
      } catch (err) {
        // A database that does not know the mark yet fails them all alike.
        if (isDataError(err) && err.code === 'DATABASE_OUTDATED') {
          setMarkError(err.message);
          return;
        }
        failed.push(attendees.find((a) => a.employee.id === employeeId)?.employee.fullName ?? 'an employee');
      }
    }
    if (failed.length > 0) {
      setMarkError(`Could not save the mark for ${failed.join(', ')}. Please try again.`);
    }
  }

  async function onDeleteSession() {
    setDeletingSession(true);
    setDeleteSessionError(null);
    try {
      await data.deleteSession(session!.id);
      navigate(paths.dashboard, { replace: true });
    } catch (err) {
      setDeleteSessionError(
        isDataError(err) ? err.message : 'Could not delete the session. Please try again.',
      );
      setDeletingSession(false);
    }
  }

  async function onExport() {
    const currentSession = session;
    if (!currentSession) return;

    setExporting(true);
    try {
      const [employees, attendance] = await Promise.all([
        data.listEmployees(),
        data.listAttendance(currentSession.id),
      ]);
      exportSessionAttendanceToExcel(currentSession, employees, attendance);
    } finally {
      setExporting(false);
    }
  }

  async function onConfirmDeleteEmployee() {
    if (!deleteEmployee) return;

    setDeleting(true);
    try {
      await data.deleteEmployee(deleteEmployee.employeeId);
      await refresh();
      setDeleteEmployee(null);
    } finally {
      setDeleting(false);
    }
  }

  function onDeleteEmployeeClick(
    employeeId: string,
    employeeCode: string,
    employeeName: string,
  ) {
    setDeleteEmployee({ employeeId, employeeCode, employeeName });
  }

  function onEditEmployeeClick(attendee: SessionAttendee) {
    setEditError(null);
    setEditAttendee(attendee);
  }

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
      await refresh();
      setAddedEmployee(created);
    } catch (err) {
      setAddError(
        isDataError(err) ? err.message : 'Could not add employee. Please try again.',
      );
    } finally {
      setAddSaving(false);
    }
  }

  async function onSaveEdit(values: EditAttendeeValues) {
    if (!editAttendee || !session) return;

    setSavingEdit(true);
    setEditError(null);
    try {
      await data.updateEmployee(editAttendee.employee.id, {
        fullName: values.fullName,
        position: values.position,
        phone: values.phone,
      });
      await data.setAttendance(session.id, editAttendee.employee.id, {
        checkInAt: values.checkInAt,
        checkOutAt: values.checkOutAt,
      });
      await refresh();
      setEditAttendee(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to save changes.',
      );
    } finally {
      setSavingEdit(false);
    }
  }

  const over = sessionIsOver(session);
  const pct = (n: number) => (stats.registered > 0 ? Math.round((n / stats.registered) * 100) : 0);
  const notPresent = stats.registered - stats.present;
  const excused = attendees.filter((a) => isExcused(a.record)).length;
  const filters: { id: AttendanceStatus | 'all'; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: attendees.length },
    // Nobody is still checked in once a session has ended.
    ...(over ? [] : [{ id: 'checked-in' as const, label: STATUS_LABEL['checked-in'], count: stats.checkedIn }]),
    { id: 'checked-out', label: STATUS_LABEL['checked-out'], count: stats.checkedOut },
    ...(stats.notCheckedOut > 0
      ? [{ id: 'not-checked-out' as const, label: 'No check-out', count: stats.notCheckedOut }]
      : []),
    { id: 'absent', label: 'Absent', count: attendees.filter((a) => a.status === 'absent').length },
  ];

  return (
    <div className="min-h-full w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8 2xl:px-10">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to={paths.dashboard}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-slate-50"
        >
          <ArrowLeft width={17} height={17} /> Back to Dashboard
        </Link>
        <div className={cn('grid gap-2 sm:flex', isActive ? 'grid-cols-3' : 'grid-cols-2')}>
          <Button
            variant="outline"
            className="px-3 text-brand-700 sm:px-5"
            leftIcon={<Download width={17} height={17} />}
            loading={exporting}
            onClick={onExport}
          >
            <span className="sm:hidden">Export</span>
            <span className="hidden sm:inline">Export Excel</span>
          </Button>
          {isActive && (
            <Button
              className="px-3 sm:px-5"
              leftIcon={<Stop width={17} height={17} />}
              onClick={() => setConfirmClose(true)}
            >
              <span className="sm:hidden">Close</span>
              <span className="hidden sm:inline">Close Session</span>
            </Button>
          )}
          <Button
            variant="outline"
            className="px-3 sm:px-5"
            leftIcon={<Trash width={17} height={17} />}
            onClick={() => {
              setDeleteSessionError(null);
              setConfirmDeleteSession(true);
            }}
          >
            <span className="sm:hidden">Delete</span>
            <span className="hidden sm:inline">Delete Session</span>
          </Button>
        </div>
      </div>

      {/* ── Title ────────────────────────────────────────────────────────── */}
      <div className="mt-5 flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 sm:size-14">
          <CalendarDays width={24} height={24} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">{session.title}</h1>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-500',
              )}
            >
              <span className={cn('size-1.5 rounded-full', isActive ? 'animate-pulse bg-emerald-500' : 'bg-ink-400')} />
              {isActive ? 'Active' : 'Closed'}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500 sm:text-base">
            {formatDate(session.startedAt)} · {formatClock(session.startedAt)}
            {session.closedAt && ` – ${formatClock(session.closedAt)}`}
            {session.location && ` · ${session.location}`}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500 sm:text-base">
            <User width={15} height={15} className="text-ink-400" />
            {session.supervisorName}
          </p>
        </div>
      </div>

      {/* ── Numbers. Once the session has ended, nobody is still checked in,
          so that card turns into the amber "no check-out" count instead. ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <SessionStat
          icon={<Users width={20} height={20} />}
          tone="slate"
          label="Registered"
          value={stats.registered}
          sub="Total employees"
        />
        {over ? (
          <SessionStat
            icon={<Clock width={20} height={20} />}
            tone="amber"
            label="No check-out"
            value={stats.notCheckedOut}
            sub={`${pct(stats.notCheckedOut)}% of registered`}
            bar={pct(stats.notCheckedOut)}
          />
        ) : (
          <SessionStat
            icon={<CheckCircle width={20} height={20} />}
            tone="green"
            label="Checked in"
            value={stats.checkedIn}
            sub={`${pct(stats.checkedIn)}% still here`}
            bar={pct(stats.checkedIn)}
          />
        )}
        <SessionStat
          icon={<Logout width={20} height={20} />}
          tone="brand"
          label="Checked out"
          value={stats.checkedOut}
          sub={`${pct(stats.checkedOut)}% of registered`}
          bar={pct(stats.checkedOut)}
        />
        <SessionStat
          icon={<User width={20} height={20} />}
          tone="rose"
          label="Not present"
          value={notPresent}
          sub={excused > 0 ? `${pct(notPresent)}% · ${excused} excused` : `${pct(notPresent)}% of registered`}
          bar={pct(notPresent)}
        />
        <AttendanceRing
          present={stats.present}
          registered={stats.registered}
          breakdown={[
            { label: over ? 'no check-out' : 'checked in', count: over ? stats.notCheckedOut : stats.checkedIn, dot: over ? 'bg-amber-500' : 'bg-emerald-500' },
            { label: 'checked out', count: stats.checkedOut, dot: 'bg-brand-600' },
            { label: 'excused', count: excused, dot: 'bg-violet-500' },
            { label: 'absent', count: notPresent - excused, dot: 'bg-ink-400' },
          ]}
        />
      </div>

      {/* ── Filters, search, add ─────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={cn(
                'whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold transition sm:px-4',
                statusFilter === f.id
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">({f.count})</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1 xl:w-80 xl:flex-none">
            <Search
              width={16}
              height={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              type="search"
              placeholder="Search by name, code or position…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
              >
                <X width={14} height={14} />
              </button>
            )}
          </label>
          <Button
            variant="outline"
            className="shrink-0 px-3 sm:px-5"
            leftIcon={<UserPlus width={17} height={17} />}
            onClick={openAddEmployee}
          >
            <span className="hidden sm:inline">Add employee</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* ── QR codes ─────────────────────────────────────────────────────── */}
      <Card className="mt-4 grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
        <QrRow
          title="Check-In QR"
          description="Display this QR code for employees to check in"
          open={session.checkInOpen}
          closed={!isActive}
          onShow={openCheckIn}
        />
        <QrRow
          title="Check-Out QR"
          description="Display this QR code for employees to check out"
          open={session.checkOutOpen}
          closed={!isActive}
          onShow={openCheckOut}
        />
      </Card>

      {/* One phone, several employees — owner's eyes only, like the report it
          belongs to. An ordinary supervisor sees no trace of it. */}
      {ownerUnlocked && (
        <SharedDevicesCard
          groups={sharedDevices}
          sessionsById={sessionsById}
          highlightSessionId={session.id}
          highlightLabel="this session"
        />
      )}

      {/* ── Employees ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {markError && (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{markError}</span>
            <button type="button" className="font-semibold underline" onClick={() => setMarkError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <AttendeeTable
          session={session}
          attendees={filteredAttendees}
          sharedDeviceNames={ownerUnlocked ? sharedDeviceNames : undefined}
          onDeleteEmployee={onDeleteEmployeeClick}
          onEditEmployee={onEditEmployeeClick}
          onMarkChange={onMarkChange}
          onBulkMark={onBulkMark}
          emptyText={
            attendees.length === 0
              ? 'No employees registered yet. Use “Add employee” to register the first one — they get a code to check in and out with.'
              : 'No employees match this filter.'
          }
        />
      </div>

      {/* Add employee (manual, admin-only) */}
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

      {/* Check-in modal */}
      <Modal
        open={modal === 'check-in'}
        onClose={() => setModal(null)}
        title="Check-In QR"
        description="Employees scan, then type their code to check in."
      >
        <RotatingQRPanel
          sessionId={session.id}
          mode="in"
          path={paths.checkIn(session.id)}
          rotating={!checkInQrConstant}
        />
        <SettingRow
          className="mt-5"
          label="Constant QR"
          hint={checkInQrConstant ? 'One constant code for the whole session.' : 'Code changes every few seconds.'}
          checked={checkInQrConstant}
          onChange={setCheckInQrConstant}
        />
        <SettingRow
          className="mt-2"
          label="Accepting check-ins"
          hint={session.checkInOpen ? 'Scans are being accepted.' : 'Scans are paused.'}
          checked={session.checkInOpen}
          onChange={(v) => update({ checkInOpen: v })}
        />
      </Modal>

      {/* Check-out modal */}
      <Modal
        open={modal === 'check-out'}
        onClose={() => setModal(null)}
        title="Check-Out QR"
        description="Employees scan, then type their code to check out."
      >
        <RotatingQRPanel
          sessionId={session.id}
          mode="out"
          path={paths.checkOut(session.id)}
          rotating={!checkOutQrConstant}
        />
        <SettingRow
          className="mt-5"
          label="Constant QR"
          hint={checkOutQrConstant ? 'One constant code for the whole session.' : 'Code changes every few seconds.'}
          checked={checkOutQrConstant}
          onChange={setCheckOutQrConstant}
        />
        <SettingRow
          className="mt-2"
          label="Accepting check-outs"
          hint={session.checkOutOpen ? 'Scans are being accepted.' : 'Scans are paused.'}
          checked={session.checkOutOpen}
          onChange={(v) => update({ checkOutOpen: v })}
        />
      </Modal>

      {/* Confirm close */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Close this session?"
        description="Anyone still checked in is left as “Not checked out” — nobody is checked out automatically, so you can enter the real time yourself. This cannot be undone."
      >
        <div className="flex gap-3">
          <Button
            variant="outline"
            fullWidth
            onClick={() => setConfirmClose(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={closing}
            onClick={onCloseSession}
          >
            Close session
          </Button>
        </div>
      </Modal>

      {/* Confirm delete session */}
      <Modal
        open={confirmDeleteSession}
        onClose={() => !deletingSession && setConfirmDeleteSession(false)}
        title="Delete this session?"
        description="The session is removed for good, together with every check-in and check-out recorded in it. This cannot be undone."
      >
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-ink-700">
          <div className="font-semibold">{session.title || 'Untitled session'}</div>
          <div className="text-ink-500">
            {formatDate(session.startedAt)} · {session.supervisorName}
          </div>
          <div className="text-ink-500">
            {stats.present}{' '}
            {stats.present === 1 ? 'attendance record' : 'attendance records'}{' '}
            will be deleted with it.
          </div>
        </div>
        {deleteSessionError && (
          <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {deleteSessionError}
          </div>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            fullWidth
            disabled={deletingSession}
            onClick={() => setConfirmDeleteSession(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={deletingSession}
            onClick={onDeleteSession}
          >
            Delete session
          </Button>
        </div>
      </Modal>

      {/* Confirm delete employee */}
      <Modal
        open={!!deleteEmployee}
        onClose={() => setDeleteEmployee(null)}
        title="Delete this employee?"
        description="Are you sure you want to delete this employee? This will remove the employee but will not renumber other codes."
      >
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-ink-700">
          <div className="font-semibold">{deleteEmployee?.employeeName}</div>
          <div className="text-ink-500">Code: {deleteEmployee?.employeeCode}</div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            fullWidth
            onClick={() => setDeleteEmployee(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={deleting}
            onClick={onConfirmDeleteEmployee}
          >
            Delete employee
          </Button>
        </div>
      </Modal>

      {/* Edit employee */}
      {editAttendee && (
        <EditAttendeeModal
          attendee={editAttendee}
          sessionClosed={sessionIsOver(session)}
          saving={savingEdit}
          error={editError}
          onClose={() => setEditAttendee(null)}
          onSave={onSaveEdit}
        />
      )}
    </div>
  );
}

/** One switch in a QR window: its name and what it is doing, the switch on the right. */
function SettingRow({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3', className)}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-900">{label}</div>
        <div className="text-xs text-ink-500">{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

const STAT_TONES = {
  slate: { icon: 'bg-slate-100 text-ink-500', bar: 'bg-ink-400' },
  green: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  brand: { icon: 'bg-brand-50 text-brand-600', bar: 'bg-brand-600' },
  rose: { icon: 'bg-rose-50 text-rose-500', bar: 'bg-slate-400' },
  amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
} as const;

function SessionStat({
  icon,
  tone,
  label,
  value,
  sub,
  bar,
}: {
  icon: ReactNode;
  tone: keyof typeof STAT_TONES;
  label: string;
  value: number;
  sub: string;
  /** Percent of the registered employees, shown as a bar under the figure. */
  bar?: number;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl sm:size-11', STAT_TONES[tone].icon)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-ink-500 sm:text-sm">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-ink-900 sm:text-3xl">{value}</div>
        <div className="text-xs text-ink-500">{sub}</div>
        {bar !== undefined && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cn('h-full rounded-full', STAT_TONES[tone].bar)} style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
    </Card>
  );
}

/** Everyone who checked in, against everyone registered, as a ring. */
function AttendanceRing({
  present,
  registered,
  breakdown,
}: {
  present: number;
  registered: number;
  /** Where everyone is; shown beside the ring when the card is a wide strip. */
  breakdown: { label: string; count: number; dot: string }[];
}) {
  const pct = registered > 0 ? Math.round((present / registered) * 100) : 0;
  const r = 42;
  const length = 2 * Math.PI * r;
  return (
    <Card className="col-span-2 flex items-center gap-4 p-4 sm:p-5 lg:col-span-4 xl:col-span-1 xl:flex-col xl:justify-center xl:gap-2">
      <div className="relative size-20 shrink-0 xl:size-24">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-slate-100" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-brand-600 transition-[stroke-dashoffset] duration-700"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - pct / 100)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-lg font-bold tabular-nums text-ink-900 xl:text-xl">
          {pct}%
        </span>
      </div>
      <div className="min-w-0 xl:text-center">
        <div className="font-semibold text-ink-900">Attendance</div>
        <div className="text-sm text-ink-500">
          {present} of {registered} present
        </div>
      </div>
      <ul className="ml-auto hidden flex-wrap justify-end gap-x-5 gap-y-1.5 text-sm text-ink-500 sm:flex xl:hidden">
        {breakdown.map((b) => (
          <li key={b.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('size-2 rounded-full', b.dot)} />
            <b className="font-semibold tabular-nums text-ink-900">{b.count}</b> {b.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function QrRow({
  title,
  description,
  open,
  closed,
  onShow,
}: {
  title: string;
  description: string;
  /** Scans are being accepted. */
  open: boolean;
  /** The session has ended: no QR to show. */
  closed: boolean;
  onShow: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 sm:p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <QrIcon width={22} height={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink-900">{title}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              closed
                ? 'bg-slate-100 text-ink-500'
                : open
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700',
            )}
          >
            {closed ? 'Session closed' : open ? 'Accepting' : 'Paused'}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-ink-500">{description}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 disabled:opacity-40"
        leftIcon={<QrIcon width={15} height={15} />}
        disabled={closed}
        onClick={onShow}
      >
        Show QR
      </Button>
    </div>
  );
}
