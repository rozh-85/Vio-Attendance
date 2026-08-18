import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  AttendanceTimeFields,
  attendanceTimesError,
} from './AttendanceTimeFields';
import type { AttendanceEdit, AttendanceRecord, Session, Student } from '@/types';
import {
  formatDateTime,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '@/utils/time';

/**
 * Corrects one student's attendance for one lecture, straight from the student
 * report — so a missed scan can be fixed without opening that session on the
 * dashboard and hunting for the student.
 */
export function EditAttendanceModal({
  student,
  session,
  record,
  saving,
  error,
  onClose,
  onSave,
}: {
  student: Student;
  session: Session;
  record?: AttendanceRecord;
  saving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (edit: AttendanceEdit) => void;
}) {
  // `datetime-local` string values ('' means unset).
  const [checkIn, setCheckIn] = useState(
    toDateTimeLocalValue(record?.checkInAt),
  );
  const [checkOut, setCheckOut] = useState(
    toDateTimeLocalValue(record?.checkOutAt),
  );

  const validationError = attendanceTimesError(checkIn, checkOut);

  /** Fills both fields with the lecture's own window — the common case. */
  function useLectureTimes() {
    setCheckIn(toDateTimeLocalValue(session.startedAt));
    setCheckOut(toDateTimeLocalValue(session.closedAt));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit attendance"
      description={`${student.fullName} — ${session.title || session.lecturerName}`}
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-500">
          Lecture started{' '}
          <span className="font-semibold text-ink-700">
            {formatDateTime(session.startedAt)}
          </span>
          {session.closedAt && (
            <>
              {' '}
              · ended{' '}
              <span className="font-semibold text-ink-700">
                {formatDateTime(session.closedAt)}
              </span>
            </>
          )}
        </div>

        <AttendanceTimeFields
          checkIn={checkIn}
          checkOut={checkOut}
          onCheckInChange={setCheckIn}
          onCheckOutChange={setCheckOut}
        />

        <button
          type="button"
          className="block text-sm font-semibold text-brand-600 hover:text-brand-700"
          onClick={useLectureTimes}
        >
          Use the lecture's times
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
            onClick={() => {
              if (validationError) return;
              onSave({
                checkInAt: fromDateTimeLocalValue(checkIn),
                checkOutAt: fromDateTimeLocalValue(checkOut),
              });
            }}
          >
            Save attendance
          </Button>
        </div>
      </div>
    </Modal>
  );
}
