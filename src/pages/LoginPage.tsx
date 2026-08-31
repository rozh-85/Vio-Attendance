import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/Logo';
import { Check } from '@/components/icons';
import { useAuth } from '@/services/auth/context';
import { APP_NAME, BRAND_NAME, WORDMARK_SRC } from '@/brand';
import { paths } from '@/routes';

/** Short reasons to be here, shown beside the form on wide screens. */
const HIGHLIGHTS = [
  'Start a session and show a QR code in seconds',
  'Watch your team check in and out, live',
  'Export a session to Excel, or one employee to PDF',
];

/**
 * Split sign-in screen: the brand lockup and the form on the left, and on the
 * right a red panel carrying the same mark blown up as a watermark. The panel
 * is decoration only, so below `lg` it drops away and the form takes the whole
 * width rather than stacking underneath it.
 */
export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as {
    state?: { from?: { pathname?: string } };
  };
  const from = location.state?.from?.pathname ?? paths.dashboard;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form.
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-card lg:p-5">
      <div className="grid flex-1 lg:grid-cols-2 lg:gap-10">
        {/* ── Left: brand lockup, form, footnote ──────────────────────── */}
        <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-8 xl:px-16">
          <div className="flex items-center gap-2.5">
            <Logo size={34} className="rounded-lg" />
            <span className="text-lg font-bold tracking-tight text-ink-900">
              {APP_NAME}
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center py-12">
            <div className="w-full max-w-sm">
              <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                Welcome back
              </h1>
              <p className="mt-2 text-ink-500">
                Sign in to manage sessions and attendance.
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <Input
                  label="Email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@vio.com"
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
                  loading={submitting}
                  disabled={!email.trim() || !password}
                >
                  Sign in
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-ink-400">
                Accounts are created by an administrator.
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-ink-400">
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </p>
        </div>

        {/* ── Right: brand panel. Decorative, hidden on small screens. ─── */}
        <div className="relative hidden overflow-hidden bg-brand-600 lg:block lg:rounded-[32px]">
          {/* The mark again, oversized and barely there — the letters only, so
              no tile edge shows against the panel. */}
          <img
            src={WORDMARK_SRC}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute -bottom-48 -right-40 w-[48rem] max-w-none select-none opacity-[0.14]"
          />
          {/* Soft light, so the flat red has some depth behind the text. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-28 -top-28 size-[24rem] rounded-full bg-white/[0.09] blur-3xl"
          />

          <div className="relative flex h-full flex-col justify-center px-12 py-16 xl:px-16">
            <h2 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-white">
              Attendance, handled.
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/80">
              Everyone checks in from their own phone. You see the room fill up
              in real time, and the paperwork writes itself.
            </p>

            <ul className="mt-10 space-y-4">
              {HIGHLIGHTS.map((line) => (
                <li key={line} className="flex items-start gap-3 text-white/90">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                    <Check width={14} height={14} />
                  </span>
                  <span className="max-w-sm">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
