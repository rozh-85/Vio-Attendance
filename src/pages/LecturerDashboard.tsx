import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ArrowRight, Download, Logout, Plus, UserPlus } from '@/components/icons';
import { useSessions } from '@/hooks/useSessions';
import { useDataService } from '@/services/data/context';
import { useAuth } from '@/services/auth/context';
import { exportAttendanceToExcel } from '@/services/report/excel';
import { formatDateTime } from '@/utils/time';
import { paths } from '@/routes';

export function LecturerDashboard() {
  const navigate = useNavigate();
  const data = useDataService();
  const { authRequired, signOut } = useAuth();
  const { sessions, loading, createSession } = useSessions();

  const [form, setForm] = useState({ lecturerName: '', title: '', location: '' });
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const session = await createSession(form);
      navigate(paths.session(session.id));
    } finally {
      setCreating(false);
    }
  }

  async function onSignOut() {
    await signOut();
    navigate(paths.login, { replace: true });
  }

  async function onExportAll() {
    setExporting(true);
    try {
      const [allSessions, students, attendance] = await Promise.all([
        data.listSessions(),
        data.listStudents(),
        data.listAttendance(),
      ]);
      await exportAttendanceToExcel(allSessions, students, attendance);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen width="lg">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-bold uppercase tracking-wide text-brand-600">
            QR Attendance
          </div>
          <h1 className="text-3xl font-bold">Lecturer dashboard</h1>
          <p className="mt-1 text-ink-500">
            Start a session, then show QR codes for students to register and
            check in.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={paths.register}>
            <Button variant="outline" leftIcon={<UserPlus width={18} height={18} />}>
              Registration link
            </Button>
          </Link>
          <Button
            variant="secondary"
            leftIcon={<Download width={18} height={18} />}
            loading={exporting}
            onClick={onExportAll}
            disabled={sessions.length === 0}
          >
            Export Excel
          </Button>
          {authRequired && (
            <Button
              variant="ghost"
              leftIcon={<Logout width={18} height={18} />}
              onClick={onSignOut}
            >
              Sign out
            </Button>
          )}
        </div>
      </header>

      <Card className="p-6">
        <h2 className="text-lg font-bold">New session</h2>
        <form
          onSubmit={onCreate}
          className="mt-4 grid gap-4 sm:grid-cols-3"
        >
          <Input
            label="Lecturer name"
            required
            placeholder="Dr. Abena Twum"
            value={form.lecturerName}
            onChange={(e) => set('lecturerName')(e.target.value)}
          />
          <Input
            label="Lecture title"
            required
            placeholder="CSC 302 — Design Patterns"
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
          />
          <Input
            label="Location"
            required
            placeholder="ICT Block, Lab 3"
            value={form.location}
            onChange={(e) => set('location')(e.target.value)}
          />
          <div className="sm:col-span-3">
            <Button
              type="submit"
              leftIcon={<Plus width={18} height={18} />}
              loading={creating}
              disabled={!form.lecturerName || !form.title || !form.location}
            >
              Start session
            </Button>
          </div>
        </form>
      </Card>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Sessions</h2>
        {loading ? (
          <div className="py-10 text-center text-ink-400">Loading…</div>
        ) : sessions.length === 0 ? (
          <Card className="p-10 text-center text-ink-500">
            No sessions yet. Start one above to begin taking attendance.
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Link key={session.id} to={paths.session(session.id)}>
                <Card className="flex items-center justify-between gap-4 p-5 transition-colors hover:border-brand-200 hover:bg-brand-50/40">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">
                        {session.title}
                      </span>
                      <Badge tone={session.status === 'active' ? 'success' : 'neutral'}>
                        {session.status === 'active' ? 'Active' : 'Closed'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-ink-500">
                      {session.lecturerName} · {session.location} ·{' '}
                      {formatDateTime(session.startedAt)}
                    </div>
                  </div>
                  <ArrowRight className="shrink-0 text-ink-400" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Screen>
  );
}
