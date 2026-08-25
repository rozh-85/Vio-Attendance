import { useState, type FormEvent } from 'react';
import { Screen } from '@/components/Screen';
import { Logo } from '@/components/Logo';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDataService } from '@/services/data/context';
import type { Student } from '@/types';

export function RecoverCodePage() {
  const data = useDataService();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Student | null | 'not-found'>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const student = await data.getStudentByPhone(phone.trim());
      setResult(student ?? 'not-found');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen width="sm">
      <Logo size={44} className="mb-5" />
      <h1 className="text-3xl font-bold">Recover your code</h1>
      <p className="mt-1 text-ink-500">
        Enter the phone number you registered with and we'll show your code.
      </p>

      <Card className="mt-6 p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Phone number"
            required
            type="tel"
            autoFocus
            placeholder="+233 24 000 0000"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setResult(null);
            }}
          />
          <Button type="submit" size="lg" fullWidth loading={submitting} disabled={!phone.trim()}>
            Find my code
          </Button>
        </form>

        {result === 'not-found' && (
          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No registration found for that number. Please ask your lecturer to
            register you.
          </div>
        )}

        {result && result !== 'not-found' && (
          <div className="mt-5 rounded-2xl border border-dashed border-brand-200 bg-brand-50 py-6 text-center">
            <div className="text-sm font-medium text-brand-700">
              {result.fullName}
            </div>
            <div className="font-mono text-5xl font-bold tracking-widest text-brand-700">
              {result.code}
            </div>
          </div>
        )}
      </Card>
    </Screen>
  );
}
