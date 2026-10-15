import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './ui/Button';
import { AuthField, AuthShell, PasswordField } from './auth/AuthShell';
import { ArrowRight, Lock, Mail, MapPin, Phone, Wallet } from './icons';
import { isOwnerUnlocked, unlockOwner, verifyOwner } from '@/services/auth/ownerGate';

/**
 * Asks for the owner's email and password before revealing its children. See
 * services/auth/ownerGate.ts for what this does and does not protect. One
 * unlock opens every owner page.
 */
export function OwnerGate({
  title = 'Shared phones',
  children,
}: {
  /** The page being unlocked, named above the form. */
  title?: string;
  children: ReactNode;
}) {
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
    <AuthShell
      badgeIcon={<Lock width={20} height={20} />}
      badge={`Private owner area · ${title}`}
      title="Owner"
      accent="access"
      subtitle={`${title} is private. Sign in with the owner account to open it.`}
      footnote="Closing this tab locks the private pages again."
      headline={['Private reports,', 'yours only']}
      tagline="Phones. Places. Sales."
      description="See who shares a phone, who checks in away from work and what the social media team sells — none of it reaches a supervisor."
      features={[
        { icon: <Phone width={24} height={24} />, title: 'Shared phones', text: 'One phone, several names' },
        { icon: <MapPin width={24} height={24} />, title: 'Check-in locations', text: 'Outside the work area, or on a VPN' },
        { icon: <Wallet width={24} height={24} />, title: 'Social media orders', text: 'Sales, sellers and exports' },
      ]}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <AuthField
          label="Email"
          icon={<Mail width={18} height={18} />}
          type="email"
          required
          autoFocus
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="h-[3.25rem] shadow-lg shadow-brand-600/20"
          loading={checking}
          disabled={!email.trim() || !password}
        >
          Open {title} <ArrowRight width={18} height={18} />
        </Button>
      </form>
    </AuthShell>
  );
}
