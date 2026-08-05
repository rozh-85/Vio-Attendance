import { useState, type FormEvent, type ReactNode } from 'react';
import { Screen } from './Screen';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Phone } from './icons';
import { isOwnerUnlocked, unlockOwner, verifyOwner } from '@/services/auth/ownerGate';

/**
 * Asks for the owner's email and password before revealing its children. See
 * services/auth/ownerGate.ts for what this does and does not protect.
 */
export function OwnerGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(isOwnerUnlocked);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (unlocked) return <>{children}</>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      if (await verifyOwner(email, password)) {
        unlockOwner();
        setUnlocked(true);
      } else {
        setError('Wrong email or password.');
        setPassword('');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen width="sm">
      <Card className="p-8">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Phone width={26} height={26} />
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold">Shared phones</h1>
        <p className="mt-1 text-center text-ink-500">
          This report is private. Sign in to open it.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            loading={checking}
            disabled={!email.trim() || !password}
          >
            Open report
          </Button>
        </form>
      </Card>
    </Screen>
  );
}
