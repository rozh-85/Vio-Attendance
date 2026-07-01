import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { StatCard } from '@/components/ui/StatCard';
import { QRPanel } from '@/components/QRPanel';
import { AttendeeTable } from '@/components/AttendeeTable';
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
import { exportLectureAttendanceToExcel } from '@/services/report/lectureTemplateExcel';
import { absoluteUrl } from '@/utils/url';
import { formatDate, formatClock } from '@/utils/time';
import { paths } from '@/routes';
import type { ReactNode } from 'react';

type ModalKind = 'register' | 'check-in' | 'check-out' | null;

export function SessionView() {
  const { sessionId = '' } = useParams();
  const data = useDataService();
  const { session, attendees, stats, loading, error, update, close } =
    useSessionDetail(sessionId);

  const [modal, setModal] = useState<ModalKind>(null);
  const [closing, setClosing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

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
      const [students, attendance] = await Promise.all([
        data.listStudents(),
        data.listAttendance(currentSession.id),
      ]);
      exportLectureAttendanceToExcel(currentSession, students, attendance);
    } finally {
      setExporting(false);
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
            {session.closedAt && ` – ${formatClock(session.closedAt)}`} ·{' '}
            {session.location}
          </p>
          <p className="text-ink-500">{session.lecturerName}</p>
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

      {/* QR actions */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <QrActionButton
          icon={<UserPlus />}
          title="Registration QR"
          subtitle="New students scan to sign up"
          onClick={() => setModal('register')}
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

      {/* Students */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Students</h2>
        <AttendeeTable attendees={attendees} />
      </div>

      {/* Registration modal */}
      <Modal
        open={modal === 'register'}
        onClose={() => setModal(null)}
        title="Registration QR"
        description="Students scan this to register and receive their code."
      >
        <QRPanel
          url={absoluteUrl(paths.register)}
          caption="Point your phone camera here to sign up."
        />
      </Modal>

      {/* Check-in modal */}
      <Modal
        open={modal === 'check-in'}
        onClose={() => setModal(null)}
        title="Check-In QR"
        description="Students scan, then type their code to check in."
      >
        <QRPanel url={absoluteUrl(paths.checkIn(session.id))} />
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
        description="Students scan, then type their code to check out."
      >
        <QRPanel url={absoluteUrl(paths.checkOut(session.id))} />
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
  title,
  subtitle,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: ReactNode;
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
        <QrIcon />
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
