import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { StatCard } from '@/components/ui/StatCard';
import { Input } from '@/components/ui/Input';
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
  ArrowRight,
  Download,
  Login,
  Logout,
  QrIcon,
  Stop,
  UserPlus,
} from '@/components/icons';
import { useSessionDetail } from '@/hooks/useSessionDetail';
import { useDataService } from '@/services/data/context';
import { isOwnerUnlocked } from '@/services/auth/ownerGate';
import { isDataError } from '@/services/data';
import { exportSessionAttendanceToExcel } from '@/services/report/sessionTemplateExcel';
import { formatDate, formatClock } from '@/utils/time';
import { paths } from '@/routes';
import type {
  AttendanceStatus,
  NewEmployeeInput,
  SessionAttendee,
  Employee,
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
  } = useSessionDetail(sessionId);

  const [modal, setModal] = useState<ModalKind>(null);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteEmployee, setDeleteEmployee] = useState<DeleteEmployeeState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editAttendee, setEditAttendee] = useState<SessionAttendee | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedEmployee, setAddedEmployee] = useState<Employee | null>(null);
  // Supervisor can switch either QR from the rotating 5s code to one constant
  // code that stays valid for the whole session.
  const [checkInQrConstant, setCheckInQrConstant] = useState(false);
  const [checkOutQrConstant, setCheckOutQrConstant] = useState(false);

  const filteredAttendees = useMemo(() => {
    let result = attendees;

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((attendee) => attendee.status === statusFilter);
    }

    // Filter by search query (name or code)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (attendee) =>
          attendee.employee.fullName.toLowerCase().includes(query) ||
          attendee.employee.code.toLowerCase().includes(query),
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

  return (
    <Screen width="xl">
      <Link
        to={paths.dashboard}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft width={18} height={18} /> Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{session.title}</h1>
            <Badge tone={isActive ? 'success' : 'neutral'}>
              {isActive ? 'Active' : 'Closed'}
            </Badge>
          </div>
          <p className="mt-1 text-ink-500">
            {formatDate(session.startedAt)} · {formatClock(session.startedAt)}
            {session.closedAt && ` – ${formatClock(session.closedAt)}`}
            {session.location && ` · ${session.location}`}
          </p>
          <p className="text-ink-500">{session.supervisorName}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            leftIcon={<Download width={18} height={18} />}
            loading={exporting}
            onClick={onExport}
          >
            Export Excel
          </Button>
          {isActive && (
            <Button
              variant="danger"
              leftIcon={<Stop width={18} height={18} />}
              onClick={() => setConfirmClose(true)}
            >
              Close session
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={stats.registered} label="Registered" />
        <StatCard value={stats.checkedIn} label="Checked in" tone="success" />
        <StatCard value={stats.checkedOut} label="Checked out" tone="info" />
        <StatCard
          value={stats.registered - stats.present}
          label="Not present"
          tone="warning"
        />
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(['all', 'checked-in', 'checked-out', 'absent'] as const).map(
          (filter) => (
            <button
              key={filter}
              type="button"
              className={
                'rounded-full border px-4 py-2 text-sm font-semibold transition ' +
                (statusFilter === filter
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-ink-600 hover:border-slate-300 hover:bg-slate-50')
              }
              onClick={() => setStatusFilter(filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'checked-in'
                ? 'Checked in'
                : filter === 'checked-out'
                ? 'Checked out'
                : 'Absent'}
            </button>
          ),
        )}
      </div>

      {/* QR actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <QrActionButton
          icon={<UserPlus />}
          circleIcon={<UserPlus />}
          title="Add employee"
          subtitle="Register an employee manually"
          onClick={openAddEmployee}
        />
        <QrActionButton
          icon={<Login />}
          title="Check-In QR"
          subtitle={session.checkInOpen ? 'Accepting check-ins' : 'Tap to open'}
          active={session.checkInOpen}
          onClick={openCheckIn}
          disabled={!isActive}
        />
        <QrActionButton
          icon={<Logout />}
          title="Check-Out QR"
          subtitle={session.checkOutOpen ? 'Accepting check-outs' : 'Tap to open'}
          active={session.checkOutOpen}
          onClick={openCheckOut}
          disabled={!isActive}
        />
      </div>

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

      {/* Employees */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold">Employees</h2>
        <div className="mb-4">
          <Input
            type="text"
            placeholder="Search by employee name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <AttendeeTable
          attendees={filteredAttendees}
          sharedDeviceNames={ownerUnlocked ? sharedDeviceNames : undefined}
          onDeleteEmployee={onDeleteEmployeeClick}
          onEditEmployee={onEditEmployeeClick}
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
        <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm text-ink-500">
            {checkInQrConstant
              ? 'One constant code for the whole session.'
              : 'Code changes every few seconds.'}
          </span>
          <Toggle
            checked={checkInQrConstant}
            onChange={setCheckInQrConstant}
            label="Constant QR"
          />
        </div>
        <GateToggle
          label="Accepting check-ins"
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
        <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm text-ink-500">
            {checkOutQrConstant
              ? 'One constant code for the whole session.'
              : 'Code changes every few seconds.'}
          </span>
          <Toggle
            checked={checkOutQrConstant}
            onChange={setCheckOutQrConstant}
            label="Constant QR"
          />
        </div>
        <GateToggle
          label="Accepting check-outs"
          checked={session.checkOutOpen}
          onChange={(v) => update({ checkOutOpen: v })}
        />
      </Modal>

      {/* Confirm close */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Close this session?"
        description="Everyone still checked in will be checked out automatically. This cannot be undone."
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
          saving={savingEdit}
          error={editError}
          onClose={() => setEditAttendee(null)}
          onSave={onSaveEdit}
        />
      )}
    </Screen>
  );
}

function GateToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-ink-500">
        {checked ? 'Scans are being accepted.' : 'Scans are paused.'}
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function QrActionButton({
  icon,
  circleIcon = <QrIcon />,
  title,
  subtitle,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: ReactNode;
  circleIcon?: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'group flex items-center gap-4 rounded-2xl border p-5 text-left transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-md'
          : 'border-slate-200 bg-white hover:border-brand-300 hover:shadow-sm',
      ].join(' ')}
    >
      <span
        className={[
          'grid size-12 shrink-0 place-items-center rounded-xl',
          active ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-600',
        ].join(' ')}
      >
        {circleIcon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-bold">
          {icon}
          {title}
        </span>
        <span
          className={[
            'mt-0.5 block text-sm',
            active ? 'text-white/80' : 'text-ink-500',
          ].join(' ')}
        >
          {subtitle}
        </span>
      </span>
      <ArrowRight
        className={active ? 'text-white/80' : 'text-ink-400'}
        width={18}
        height={18}
      />
    </button>
  );
}
