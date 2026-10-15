import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { AuthField, AuthShell, PasswordField } from '@/components/auth/AuthShell';
import { ArrowRight, FileText, Mail, QrIcon, Users } from '@/components/icons';
import { useAuth } from '@/services/auth/context';
import { paths } from '@/routes';

function rememberedChoice(): boolean {
  try {
    return localStorage.getItem('vio.rememberMe') !== '0';
  } catch {
    return true;
  }
}

/** The supervisor sign-in, at the unlisted /VioAdmin address. */
export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as {
    state?: { from?: { pathname?: string } };
  };
  const from = location.state?.from?.pathname ?? paths.dashboard;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberedChoice);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form.
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      badgeIcon={<Users width={20} height={20} />}
      badge="Sign in to your account"
      title="Welcome"
      accent="back"
      subtitle="Sign in to manage sessions and attendance."
      footnote="Accounts are created by an administrator."
      headline={['Attendance,', 'handled']}
      tagline="Simple. Secure. Real-time."
      description="Everyone checks in from their own phone. You see the room fill up in real time, and the paperwork writes itself."
      features={[
        { icon: <QrIcon width={24} height={24} />, title: 'Start a session', text: 'Show a QR code in seconds' },
        { icon: <Users width={24} height={24} />, title: 'Live check-in', text: 'Watch your team arrive' },
        { icon: <FileText width={24} height={24} />, title: 'Export reports', text: 'To Excel or PDF with one click' },
      ]}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <AuthField
          label="Email"
          icon={<Mail width={18} height={18} />}
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@vio.com"
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

        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              className="size-[18px] cursor-pointer rounded accent-brand-600"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => setShowHelp((s) => !s)}
            aria-expanded={showHelp}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Forgot password?
          </button>
        </div>

        {showHelp && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-ink-600">
            Passwords are set by your administrator. Ask them to give you a new one
            {email.trim() ? (
              <>
                {' '}
                for <b className="text-ink-900">{email.trim()}</b>
              </>
            ) : null}
            .
          </div>
        )}

        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="h-[3.25rem] shadow-lg shadow-brand-600/20"
          loading={submitting}
          disabled={!email.trim() || !password}
        >
          Sign in <ArrowRight width={18} height={18} />
        </Button>
      </form>
    </AuthShell>
  );
}
