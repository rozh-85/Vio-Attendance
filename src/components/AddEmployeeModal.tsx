import { useMemo, useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Check } from './icons';
import type { NewEmployeeInput, Employee } from '@/types';

/**
 * Admin-only manual employee registration. Only a signed-in supervisor can add
 * employees. After a successful add it shows the assigned code so the
 * supervisor can hand it to the employee.
 *
 * Three fields only: full name, phone number and position.
 */
export function AddEmployeeModal({
  saving,
  error,
  createdEmployee,
  onSave,
  onAddAnother,
  onClose,
}: {
  saving: boolean;
  error?: string | null;
  createdEmployee?: Employee | null;
  onSave: (values: NewEmployeeInput) => void;
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');

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
      position: position.trim(),
    });
  }

  function handleAddAnother() {
    setFullName('');
    setPhone('');
    setPosition('');
    onAddAnother();
  }

  // ── Success view ──────────────────────────────────────────────────────────
  if (createdEmployee) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Employee added"
        description="Give this code to the employee — they type it to check in and out."
      >
        <div className="my-2 rounded-2xl border border-dashed border-brand-200 bg-brand-50 py-6 text-center">
          <div className="text-sm font-medium text-brand-700">
            {createdEmployee.fullName}
          </div>
          <div className="font-mono text-5xl font-bold tracking-widest text-brand-700">
            {createdEmployee.code}
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
      title="Add employee"
      description="Register an employee manually. They'll get a code to check in and out."
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
          label="Phone number"
          required
          type="tel"
          placeholder="+964 750 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="Position"
          placeholder="Field Technician"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
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
            Add employee
          </Button>
        </div>
      </div>
    </Modal>
  );
}
