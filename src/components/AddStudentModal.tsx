import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Check } from './icons';
import type { NewStudentInput, Student } from '@/types';

/**
 * Admin-only manual student registration. Replaces the old public /register
 * page — only a signed-in lecturer can add students now. After a successful
 * add it shows the assigned code so the lecturer can hand it to the student.
 */
export function AddStudentModal({
  saving,
  error,
  createdStudent,
  onSave,
  onAddAnother,
  onClose,
}: {
  saving: boolean;
  error?: string | null;
  createdStudent?: Student | null;
  onSave: (values: NewStudentInput) => void;
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [college, setCollege] = useState('');
  const [department, setDepartment] = useState('');

  const validationError = useMemo(() => {
    if (!fullName.trim()) return 'Name is required.';
    if (!phone.trim()) return 'Phone is required.';
    return null;
  }, [fullName, phone]);

  function handleSave() {
    if (validationError) return;
    onSave({
      fullName: fullName.trim(),
      phone: phone.trim(),
      college: college.trim(),
      department: department.trim(),
    });
  }

  function handleAddAnother() {
    setFullName('');
    setPhone('');
    setCollege('');
    setDepartment('');
    onAddAnother();
  }

  // ── Success view ──────────────────────────────────────────────────────────
  if (createdStudent) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Student added"
        description="Give this code to the student — they type it to check in and out."
      >
        <div className="my-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50 py-6 text-center">
          <div className="text-sm font-medium text-brand-700">
            {createdStudent.fullName}
          </div>
          <div className="font-mono text-5xl font-bold tracking-widest text-brand-700">
            {createdStudent.code}
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="outline" fullWidth onClick={handleAddAnother}>
            Add another
          </Button>
          <Button fullWidth leftIcon={<Check width={18} height={18} />} onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  // ── Form view ─────────────────────────────────────────────────────────────
  return (
    <Modal
      open
      onClose={onClose}
      title="Add student"
      description="Register a student manually. They'll get a code to check in and out."
    >
      <div className="space-y-4">
        <Input
          label="Full name"
          required
          autoFocus
          placeholder="Ali Hassan"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Phone"
          required
          type="tel"
          placeholder="+964 750 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="College"
          placeholder="Engineering"
          value={college}
          onChange={(e) => setCollege(e.target.value)}
        />
        <Input
          label="Department"
          placeholder="Computer Science"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
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
            Add student
          </Button>
        </div>
      </div>
    </Modal>
  );
}
