import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { UserPlus, Check } from '@/components/icons';
import { useDataService } from '@/services/data/context';
import { isDataError } from '@/services/data';
import type { Student } from '@/types';
import { paths } from '@/routes';

export function RegisterPage() {
  const data = useDataService();
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    college: '',
    department: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await data.registerStudent(form);
      setStudent(created);
    } catch (err) {
      setError(
        isDataError(err)
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (student) {
    return (
      <Screen width="sm">
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Check width={28} height={28} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">You're registered!</h1>
          <p className="mt-1 text-ink-500">
            Save this code — you'll type it to check in and out.
          </p>
          <div className="my-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50 py-6">
            <div className="text-sm font-medium text-brand-700">Your code</div>
            <div className="font-mono text-5xl font-bold tracking-widest text-brand-700">
              {student.code}
            </div>
          </div>
          <p className="text-sm text-ink-500">
            Registered as <strong>{student.fullName}</strong> · {student.phone}
          </p>
          <Link to={paths.recover} className="mt-6 inline-block">
            <Button variant="outline">Recover my code later</Button>
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen width="sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-brand-600 text-white">
          <UserPlus />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Register</h1>
          <p className="text-sm text-ink-500">
            Sign up once to get your attendance code.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <Input
            label="Full name"
            required
            placeholder="e.g. Amina Osei"
            value={form.fullName}
            onChange={(e) => set('fullName')(e.target.value)}
          />
          <Input
            label="Phone number"
            required
            type="tel"
            placeholder="0770 123 4567"
            hint="Must be unique — used to identify you and recover your code."
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
          />
          <Input
            label="College"
            required
            placeholder="e.g. College of Science"
            value={form.college}
            onChange={(e) => set('college')(e.target.value)}
          />
          <Input
            label="Department"
            required
            placeholder="e.g. Computer Science"
            value={form.department}
            onChange={(e) => set('department')(e.target.value)}
          />

          {error && (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            disabled={
              !form.fullName || !form.phone || !form.college || !form.department
            }
          >
            Sign up and get my code
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-ink-500">
        Already registered?{' '}
        <Link to={paths.recover} className="font-semibold text-brand-600 underline">
          Recover your code
        </Link>
      </p>
    </Screen>
  );
}
