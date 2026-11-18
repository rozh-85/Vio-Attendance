import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { AuthField, AuthShell, PasswordField } from '@/components/auth/AuthShell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle,
  FileText,
  Home,
  Layers,
  LayoutGrid,
  Lock,
  Login,
  Logout,
  MapPin,
  Monitor,
  Phone,
  Settings,
  User,
  Users,
  Wallet,
  Wifi,
} from '@/components/icons';
import {
  fetchLockdown,
  isOwnerSignedIn,
  setLockdown,
  signInOwnerAccount,
  signOutOwnerAccount,
  verifyOwnerAccount,
  type LockdownScope,
} from '@/services/auth/adminLockdown';
import { paths } from '@/routes';
import { BRAND_NAME } from '@/brand';

/**
 * The master owner account at /owner. It is the one place above both admin
 * areas: it is never put behind the maintenance screen, and signing in here
 * lets this browser pass straight through it everywhere else. From here the
 * owner flips the switch that shows "service is down" to the Vio admin
 * (/VioAdmin) and Rozh admin (/rozhadmin) areas.
 */
export function OwnerControlPage() {
  const [signedIn, setSignedIn] = useState(isOwnerSignedIn);
  return signedIn ? (
    <OwnerPanel onSignOut={() => setSignedIn(false)} />
  ) : (
    <OwnerSignIn onSignedIn={() => setSignedIn(true)} />
  );
}

/* ── Sign in ─────────────────────────────────────────────────────────────── */

function OwnerSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      if (await verifyOwnerAccount(username, password)) {
        signInOwnerAccount();
        onSignedIn();
      } else {
        setError('Wrong username or password.');
        setPassword('');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthShell
      badgeIcon={<Lock width={20} height={20} />}
      badge="Owner only"
      title="Owner"
      accent="control"
      subtitle="Sign in with the owner account to open the control panel."
      footnote="Closing this tab signs the owner out again."
      headline={['Full control,', 'one account']}
      tagline="Above every admin."
      description="Put the admin areas into maintenance in one tap, and keep full access yourself while they wait."
      features={[
        { icon: <Monitor width={24} height={24} />, title: 'Maintenance switch', text: 'Show “service is down” to the admins' },
        { icon: <Lock width={24} height={24} />, title: 'Owner bypass', text: 'Your browser always gets through' },
        { icon: <LayoutGrid width={24} height={24} />, title: 'Every area', text: 'Reach all of the admin pages' },
      ]}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <AuthField
          label="Username"
          icon={<User width={18} height={18} />}
          type="text"
          required
          autoFocus
          autoComplete="username"
          placeholder="owner"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordField
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="h-[3.25rem] shadow-lg shadow-brand-600/20"
          loading={checking}
          disabled={!username.trim() || !password}
        >
          Sign in <ArrowRight width={18} height={18} />
        </Button>
      </form>
    </AuthShell>
  );
}

/* ── Control panel ───────────────────────────────────────────────────────── */

const SCOPE_NOTE: Record<LockdownScope, string> = {
  'all-devices': 'Saved — this applies to every device.',
  'this-device':
    'Saved on this device only. Run supabase/admin-lockdown.sql so it syncs to every device.',
};

function OwnerPanel({ onSignOut }: { onSignOut: () => void }) {
  const [locked, setLocked] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchLockdown()
      .then((v) => active && setLocked(v))
      .catch(() => active && setLocked(false));
    return () => {
      active = false;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setLocked(next); // optimistic
    try {
      const scope = await setLockdown(next);
      setNote(SCOPE_NOTE[scope]);
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    signOutOwnerAccount();
    onSignOut();
  }

  const on = locked === true;

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-slate-200/80 bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <Logo size={34} className="rounded-lg" />
          <div className="flex-1">
            <p className="text-sm font-bold tracking-tight text-ink-900">Owner control</p>
            <p className="text-xs text-ink-400">Above the Vio admin and Rozh admin areas</p>
          </div>
          <ThemeToggle variant="icon" />
          <Button variant="outline" size="sm" leftIcon={<Logout width={16} height={16} />} onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        {/* The switch. */}
        <Card className="overflow-hidden">
          <div
            className={
              'flex flex-col gap-4 p-6 sm:flex-row sm:items-center ' +
              (on ? 'bg-amber-50' : '')
            }
          >
            <span
              className={
                'grid size-12 shrink-0 place-items-center rounded-2xl ' +
                (on ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-ink-500')
              }
            >
              {on ? <Wifi width={24} height={24} /> : <Monitor width={24} height={24} />}
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-ink-900">Admin maintenance screen</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                {locked === null
                  ? 'Checking the current state…'
                  : on
                    ? 'ON — the admins see “service is down”. You still have full access.'
                    : 'OFF — the admin areas work normally.'}
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <span
                className={
                  'rounded-full px-3 py-1 text-xs font-bold ' +
                  (on ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-ink-600')
                }
              >
                {locked === null ? '…' : on ? 'ON' : 'OFF'}
              </span>
              <Toggle
                checked={on}
                onChange={(next) => void toggle(next)}
                ariaLabel="Admin maintenance screen"
              />
            </div>
          </div>

          <div className="border-t border-slate-200/80 px-6 py-4 text-sm text-ink-600">
            <p>
              When this is on, <b className="text-ink-900">only the two admin views</b>{' '}
              change: <b className="text-ink-900">/VioAdmin</b> (Vio admin) and{' '}
              <b className="text-ink-900">/rozhadmin</b> (Rozh admin) show a realistic
              “service is down” page to everyone except this owner browser — so the next
              time those admins open them, that is what they get. Everything else keeps
              working normally: <b className="text-ink-900">employee check-in and
              check-out</b>, attendance and sessions, and your own access are all
              untouched.
            </p>
            {busy && <p className="mt-2 text-xs text-ink-400">Saving…</p>}
            {!busy && note && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle width={14} height={14} /> {note}
              </p>
            )}
          </div>
        </Card>

        {/* Full access: every area, one tap away. */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-500">
            <LayoutGrid width={16} height={16} /> Open any area
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <AreaLink to={paths.admin} icon={<Login width={20} height={20} />} label="Admin sign-in" sub="/VioAdmin" />
            <AreaLink to={paths.home} icon={<Home width={20} height={20} />} label="Home" sub="All squares" />
            <AreaLink to={paths.dashboard} icon={<CalendarDays width={20} height={20} />} label="Attendance" sub="Sessions" />
            <AreaLink to={paths.employees} icon={<Users width={20} height={20} />} label="Employees" sub="Report" />
            <AreaLink to={paths.leave} icon={<FileText width={20} height={20} />} label="Leave" sub="Requests" />
            <AreaLink to={paths.catalog} icon={<Layers width={20} height={20} />} label="Catalog" sub="Products" />
            <AreaLink to={paths.hr} icon={<Briefcase width={20} height={20} />} label="HR" sub="People" />
            <AreaLink to={paths.checkInLocations} icon={<MapPin width={20} height={20} />} label="Locations" sub="Check-ins" />
            <AreaLink to={paths.devices} icon={<Phone width={20} height={20} />} label="Shared phones" sub="/rozhadmin" />
            <AreaLink to={paths.socialOrders} icon={<Wallet width={20} height={20} />} label="Social orders" sub="Sellers" />
            <AreaLink to={paths.profit} icon={<Settings width={20} height={20} />} label="Profit" sub="Costs & sponsors" />
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Your browser is never shown the maintenance screen. The data pages still ask
            for your supervisor sign-in at the admin sign-in link above.
          </p>
        </section>

        <p className="pt-2 text-center text-xs text-ink-400">
          © {new Date().getFullYear()} {BRAND_NAME}. Owner control.
        </p>
      </main>
    </div>
  );
}

function AreaLink({
  to,
  icon,
  label,
  sub,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-card p-3.5 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-ink-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink-900">{label}</span>
        <span className="block truncate text-xs text-ink-400">{sub}</span>
      </span>
    </Link>
  );
}
