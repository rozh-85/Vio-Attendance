import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import {
  AttendanceTimeFields,
  attendanceTimesError,
} from './AttendanceTimeFields';
import type { SessionAttendee } from '@/types';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/utils/time';

export interface EditAttendeeValues {
  fullName: string;
  phone: string;
  position: string;
  checkInAt: string | null;
  checkOutAt: string | null;
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
  const { employee, record } = attendee;

  const [fullName, setFullName] = useState(employee.fullName);
  const [phone, setPhone] = useState(employee.phone);
  const [position, setPosition] = useState(employee.position);
  // `datetime-local` string values ('' means unset).
  const [checkIn, setCheckIn] = useState(
    toDateTimeLocalValue(record?.checkInAt),
  );
  const [checkOut, setCheckOut] = useState(
    toDateTimeLocalValue(record?.checkOutAt),
  );

  const validationError = useMemo(() => {
    if (!fullName.trim()) return 'Name is required.';
    return attendanceTimesError(checkIn, checkOut);
  }, [fullName, checkIn, checkOut]);

  function handleSave() {
    if (validationError) return;
    onSave({
      fullName: fullName.trim(),
      phone: phone.trim(),
      position: position.trim(),
      checkInAt: fromDateTimeLocalValue(checkIn),
      checkOutAt: fromDateTimeLocalValue(checkOut),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit employee"
      description="Fix the employee's details or correct their attendance manually."
    >
      <div className="space-y-4">
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Input
          label="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="Position"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />

        <AttendanceTimeFields
          checkIn={checkIn}
          checkOut={checkOut}
          onCheckInChange={setCheckIn}
          onCheckOutChange={setCheckOut}
        />

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
