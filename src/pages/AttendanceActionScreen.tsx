import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Book, Check, Login, Logout } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { useDataService } from '@/services/data/context';
import { isDataError } from '@/services/data';
import type { Session } from '@/types';
import { formatClock, formatDate } from '@/utils/time';
import { currentDevice } from '@/utils/device';
import { isQrTokenValid } from '@/utils/qrToken';
import { paths } from '@/routes';

type Mode = 'check-in' | 'check-out';

const copy = {
  'check-in': {
    title: 'Check in',
    subtitle: 'Enter your code to mark your attendance.',
    button: 'Check in',
    icon: <Login />,
    doneVerb: 'checked in',
  },
  'check-out': {
    title: 'Check out',
    subtitle: 'Enter your code to record that you are leaving.',
    button: 'Check out',
    icon: <Logout />,
    doneVerb: 'checked out',
  },
} as const;

export function AttendanceActionScreen({ mode }: { mode: Mode }) {
  const { sessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const data = useDataService();
  const c = copy[mode];

  // Freeze the QR-token check at mount: it proves the employee scanned a *live*
  // code, not an old screenshot someone forwarded to them.
  const [qrOk] = useState(() =>
    isQrTokenValid(
      sessionId,
      mode === 'check-in' ? 'in' : 'out',
      searchParams.get('t'),
    ),
  );

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneAt, setDoneAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    data
      .getSession(sessionId)
      .then((s) => active && setSession(s))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [data, sessionId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Check-in carries the phone's identity so the supervisor can see when one
      // phone checked in several employees. Check-out doesn't need it.
      const record =
        mode === 'check-in'
          ? await data.checkIn(sessionId, code.trim(), currentDevice())
          : await data.checkOut(sessionId, code.trim());
      setDoneAt(
        mode === 'check-in' ? record.checkInAt ?? null : record.checkOutAt ?? null,
      );
    } catch (err) {
      setError(isDataError(err) ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Screen width="sm">
        <div className="py-20 text-center text-ink-400">Loading…</div>
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen width="sm">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-bold">Session not found</h1>
          <p className="mt-2 text-ink-500">
            This link may be invalid or the session was removed.
          </p>
        </Card>
      </Screen>
    );
  }

  if (doneAt) {
    return (
      <Screen width="sm">
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Check width={28} height={28} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">You're {c.doneVerb}!</h1>
          <p className="mt-1 text-ink-500">
            {session.title || session.supervisorName} · {formatClock(doneAt)}
          </p>
        </Card>
      </Screen>
    );
  }

  const gateOpen = mode === 'check-in' ? session.checkInOpen : session.checkOutOpen;

  return (
    <Screen width="sm">
      <Logo size={44} className="mb-5" />
      <h1 className="text-3xl font-bold">{c.title}</h1>
      <p className="mt-1 text-ink-500">{c.subtitle}</p>

      <div className="mt-5 flex gap-3 rounded-2xl bg-brand-50 p-4">
        <Book className="mt-0.5 shrink-0 text-brand-600" />
        <div className="text-sm">
          <div className="font-bold text-ink-900">
            {session.title || 'Session'}
          </div>
          <div className="text-ink-500">
            {formatDate(session.startedAt)} · {formatClock(session.startedAt)}
          </div>
          <div className="text-ink-500">
            {session.location} · {session.supervisorName}
          </div>
        </div>
      </div>

      {session.status === 'closed' ? (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This session has ended.
        </div>
      ) : !gateOpen ? (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {mode === 'check-in' ? 'Check-in' : 'Check-out'} is not open yet. Please
          wait for your supervisor to open it.
        </div>
      ) : !qrOk ? (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This QR code has expired or is invalid. Please scan the live code shown
          on the supervisor's screen — screenshots and forwarded links won't work.
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Your code"
          required
          inputMode="numeric"
          autoFocus
          placeholder="e.g. 001"
          className="text-center font-mono text-lg tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
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
          leftIcon={c.icon}
          loading={submitting}
          disabled={
            !code.trim() || session.status === 'closed' || !gateOpen || !qrOk
          }
        >
          {c.button}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link
          to={paths.recover}
          className="text-sm font-semibold text-ink-500 underline hover:text-ink-700"
        >
          Forgot your code?
        </Link>
      </p>
    </Screen>
  );
}
