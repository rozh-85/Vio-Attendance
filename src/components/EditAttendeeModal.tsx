import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import type { AttendanceStatus, SessionAttendee } from '@/types';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/utils/time';

export interface EditAttendeeValues {
  fullName: string;
  department: string;
  phone: string;
  checkInAt: string | null;
  checkOutAt: string | null;
}

function statusFrom(
  checkIn: string,
  checkOut: string,
): AttendanceStatus {
  if (!checkIn) return 'absent';
  return checkOut ? 'checked-out' : 'checked-in';
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  if (status === 'checked-in') return <Badge tone="success">✓ In</Badge>;
  if (status === 'checked-out') return <Badge tone="info">✓ Out</Badge>;
  return <Badge tone="neutral">Absent</Badge>;
}

export function EditAttendeeModal({
  attendee,
  saving,
  error,
  onClose,
  onSave,
}: {
  attendee: SessionAttendee;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (values: EditAttendeeValues) => void;
}) {
  const { student, record } = attendee;

  const [fullName, setFullName] = useState(student.fullName);
  const [department, setDepartment] = useState(student.department);
  const [phone, setPhone] = useState(student.phone);
  // `datetime-local` string values ('' means unset).
  const [checkIn, setCheckIn] = useState(
    toDateTimeLocalValue(record?.checkInAt),
  );
  const [checkOut, setCheckOut] = useState(
    toDateTimeLocalValue(record?.checkOutAt),
  );

  const status = statusFrom(checkIn, checkOut);

  const validationError = useMemo(() => {
    if (!fullName.trim()) return 'Name is required.';
    if (checkOut && !checkIn) {
      return 'Set a check-in time before a check-out time.';
    }
    if (checkIn && checkOut && new Date(checkOut) < new Date(checkIn)) {
      return 'Check-out cannot be before check-in.';
    }
    return null;
  }, [fullName, checkIn, checkOut]);

  function handleSave() {
    if (validationError) return;
    onSave({
      fullName: fullName.trim(),
      department: department.trim(),
      phone: phone.trim(),
      checkInAt: fromDateTimeLocalValue(checkIn),
      checkOutAt: fromDateTimeLocalValue(checkOut),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit student"
      description="Fix the student's details or correct their attendance manually."
    >
      <div className="space-y-4">
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold text-ink-700">Status</span>
          <StatusBadge status={status} />
        </div>

        <Input
          label="Check-in"
          type="datetime-local"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
        <Input
          label="Check-out"
          type="datetime-local"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />

        <button
          type="button"
          className="text-sm font-semibold text-ink-500 hover:text-ink-700"
          onClick={() => {
            setCheckIn('');
            setCheckOut('');
          }}
        >
          Mark absent (clear times)
        </button>

        {(validationError || error) && (
          <p className="text-sm text-rose-600">{validationError ?? error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            fullWidth
            loading={saving}
            disabled={!!validationError}
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Modal>
  );
}
