import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Logout,
  Mail,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash,
  Wrench,
  X,
} from '@/components/icons';
import { CATEGORIES } from '@/services/orders/options';
import {
  OVERDUE_DAYS,
  STATUS_TEXT,
  daysInShop,
  daysText,
  formatPhone,
  groupByCustomer,
  isOverdue,
  normalizePhone,
  repairStatus,
  searchCustomers,
  showDate,
  sortNewest,
  todayKey,
  type RepairCustomer,
} from '@/services/repairs/logic';
import {
  PRINT_SIZES,
  RECEIPT_CSS,
  printRepair,
  readPrintSize,
  receiptHtml,
  savePrintSize,
  type PrintSize,
} from '@/services/repairs/print';
import {
  RepairError,
  getRepairStore,
  loadRepairSession,
  repairErrorMessage,
  saveRepairSession,
} from '@/services/repairs/store';
import type { RepairDraft, RepairSession, RepairTicket } from '@/services/repairs/types';
import { cn } from '@/utils/cn';

/** Vivid red in light and dark mode alike: the "too long in the shop" colour. */
const RED = 'bg-[#DC2626] text-white';

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-card px-4 text-base text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

/** The whole page is Kurdish, right to left. */
function Rtl({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="ckb" className="min-h-full bg-surface text-ink-900">
      {children}
    </div>
  );
}

/**
 * The repair desk (عەتڵ). Its own account — shalaw@vio.com — signs in here,
 * or at /VioAdmin, which sends it on here. It records the faulty items
 * customers bring in, finds a customer again by phone number, marks an item
 * repaired and handed back, prints a small receipt or sticker, and shows in
 * red every item still not repaired two days after it came in.
 */
export function RepairPage() {
  const store = getRepairStore();
  const [session, setSession] = useState<RepairSession | null>(loadRepairSession);
  const [checking, setChecking] = useState(() => !!loadRepairSession());
  const [notice, setNotice] = useState<string | null>(null);

  // A saved sign-in may have run out — check it before showing the desk.
  useEffect(() => {
    const saved = loadRepairSession();
    if (!saved) return;
    let active = true;
    store
      .whoAmI(saved.token)
      .then((name) => {
        if (!active) return;
        if (name) {
          setSession({ ...saved, displayName: name });
        } else {
          saveRepairSession(null);
          setSession(null);
          setNotice(repairErrorMessage(new RepairError('SESSION_EXPIRED')));
        }
      })
      // Offline or the database is busy: keep the saved sign-in and try anyway.
      .catch(() => undefined)
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [store]);

  const signedOut = useCallback((message: string | null) => {
    saveRepairSession(null);
    setSession(null);
    setNotice(message);
  }, []);

  if (checking) {
    return (
      <Rtl>
        <div className="py-24 text-center text-ink-400">چاوەڕێ بکە…</div>
      </Rtl>
    );
  }

  if (!session) {
    return (
      <SignIn
        notice={notice}
        onSignedIn={(next) => {
          saveRepairSession(next);
          setNotice(null);
          setSession(next);
        }}
      />
    );
  }

  return (
    <RepairDesk
      session={session}
      onSignOut={() => {
        void store.signOut(session.token).catch(() => undefined);
        signedOut(null);
      }}
      onExpired={() => signedOut(repairErrorMessage(new RepairError('SESSION_EXPIRED')))}
    />
  );
}

// ── Sign in ──────────────────────────────────────────────────────────────────

function SignIn({ notice, onSignedIn }: { notice: string | null; onSignedIn: (s: RepairSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await getRepairStore().signIn(email, password));
    } catch (err) {
      setError(repairErrorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Rtl>
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <Logo size={56} className="rounded-2xl shadow-sm" />
            <h1 className="mt-4 text-2xl font-bold">بەشی عەتڵ</h1>
            <p className="mt-1 text-ink-500">بە ئیمەیڵ و وشەی نهێنی بچۆ ژوورەوە</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-3xl border border-slate-200/80 bg-card p-5 shadow-sm sm:p-6">
            {notice && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">ئیمەیڵ</span>
              <div className="relative" dir="ltr">
                <Mail className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
                <input
                  className={cn(fieldClass, 'ps-11')}
                  type="email"
                  required
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="name@vio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">وشەی نهێنی</span>
              <div className="relative" dir="ltr">
                <Lock className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
                <input
                  className={cn(fieldClass, 'pe-11 ps-11')}
                  type={shown ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShown((s) => !s)}
                  aria-label={shown ? 'شاردنەوەی وشەی نهێنی' : 'پیشاندانی وشەی نهێنی'}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                >
                  {shown ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
                </button>
              </div>
            </label>
            {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            <button
              type="submit"
              disabled={busy || !email.trim() || !password}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Spinner /> : null}
              چوونەژوورەوە
            </button>
          </form>
        </div>
      </div>
    </Rtl>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

// ── The desk ─────────────────────────────────────────────────────────────────

type Tab = 'open' | 'done' | 'all';

interface Flash {
  text: string;
  ticket?: RepairTicket;
  /** The view it belongs to; it goes away once someone moves on. */
  view: string;
}

function RepairDesk({
  session,
  onSignOut,
  onExpired,
}: {
  session: RepairSession;
  onSignOut: () => void;
  onExpired: () => void;
}) {
  const store = getRepairStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [printing, setPrinting] = useState<RepairTicket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const viewKey = params.toString();
  const customerPhone = params.get('c');
  const editId = params.get('edit');
  const isNew = params.has('new');

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof RepairError && err.code === 'SESSION_EXPIRED') onExpired();
      else setError(repairErrorMessage(err));
    },
    [onExpired],
  );

  const load = useCallback(async () => {
    try {
      setTickets(await store.list(session.token));
      setError(null);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [store, session.token, fail]);

  // Read again every minute and whenever the page comes back into view, so a
  // second device's changes — and a new day's red alerts — show up by themselves.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const customers = useMemo(() => groupByCustomer(tickets), [tickets]);
  const overdue = useMemo(
    () => tickets.filter((t) => isOverdue(t)).sort((a, b) => a.broughtOn.localeCompare(b.broughtOn)),
    [tickets],
  );

  // The red count in the browser tab too.
  useEffect(() => {
    const before = document.title;
    document.title = overdue.length ? `(${overdue.length}) عەتڵ — Vio` : 'عەتڵ — Vio';
    return () => {
      document.title = before;
    };
  }, [overdue.length]);

  // Each view starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [customerPhone, editId, isNew]);

  const go = useCallback(
    (next: Record<string, string>, replace = false) => setParams(next, { replace }),
    [setParams],
  );

  /** Back one step: the browser's own back when there is one in this app. */
  const back = useCallback(
    (fallback: Record<string, string>) => {
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else go(fallback, true);
    },
    [navigate, go],
  );

  const upsert = (ticket: RepairTicket) =>
    setTickets((list) => (list.some((t) => t.id === ticket.id) ? list.map((t) => (t.id === ticket.id ? ticket : t)) : [...list, ticket]));

  async function setDelivered(ticket: RepairTicket, delivered: boolean) {
    setBusyId(ticket.id);
    try {
      const next = await store.setDelivered(session.token, ticket.id, delivered);
      upsert(next);
      setFlash(
        delivered
          ? { text: `#${next.ticketNo} — ${next.itemType} چاککرا و درایەوە بە ${next.customerName}.`, ticket: next, view: viewKey }
          : { text: `#${next.ticketNo} گەڕایەوە بۆ «لە چاکردندایە».`, view: viewKey },
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  }

  async function save(draft: RepairDraft) {
    const saved = await store.save(session.token, draft);
    upsert(saved);
    setFlash({
      text: draft.id ? `گۆڕانکارییەکان پاشەکەوت کران — #${saved.ticketNo}.` : `عەتڵەکە پاشەکەوت کرا — ژمارەی پسوولە #${saved.ticketNo}.`,
      ticket: saved,
      view: new URLSearchParams({ c: saved.phone }).toString(),
    });
    go({ c: saved.phone }, true);
  }

  async function remove(ticket: RepairTicket) {
    await store.remove(session.token, ticket.id);
    setTickets((list) => list.filter((t) => t.id !== ticket.id));
    const others = tickets.filter((t) => t.phone === ticket.phone && t.id !== ticket.id);
    const next: Record<string, string> = others.length ? { c: ticket.phone } : {};
    setFlash({ text: `#${ticket.ticketNo} سڕایەوە.`, view: new URLSearchParams(next).toString() });
    go(next, true);
  }

  let body: ReactNode;
  if (isNew || editId) {
    const editing = editId ? tickets.find((t) => t.id === editId) : undefined;
    if (editId && !editing) {
      body = loading ? <Loading /> : <Empty text="ئەم عەتڵە نەدۆزرایەوە." />;
    } else {
      const phone = normalizePhone(params.get('phone') ?? '');
      const known = customers.find((c) => c.phone === phone);
      body = (
        <TicketForm
          key={editId ?? `new-${phone}`}
          editing={editing}
          initialPhone={phone}
          initialName={known?.name ?? ''}
          customers={customers}
          onCancel={() => back(editing ? { c: editing.phone } : phone ? { c: phone } : {})}
          onSave={save}
          onDelete={remove}
        />
      );
    }
  } else if (customerPhone) {
    const customer = customers.find((c) => c.phone === customerPhone);
    body = customer ? (
      <CustomerView
        customer={customer}
        busyId={busyId}
        onBack={() => back({})}
        onAdd={() => go({ new: '1', phone: customer.phone })}
        onEdit={(t) => go({ edit: t.id })}
        onPrint={setPrinting}
        onDelivered={setDelivered}
      />
    ) : loading ? (
      <Loading />
    ) : (
      <Empty text="هیچ عەتڵێک بەم ژمارەیە نییە." />
    );
  } else {
    body = (
      <ListView
        tickets={tickets}
        customers={customers}
        overdue={overdue}
        loading={loading}
        onOpen={(phone) => go({ c: phone })}
        onNew={(phone) => go(phone ? { new: '1', phone } : { new: '1' })}
      />
    );
  }

  return (
    <Rtl>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <button type="button" onClick={() => go({})} className="flex min-w-0 flex-1 items-center gap-3 text-start">
            <Logo size={38} />
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-tight">عەتڵەکان</span>
              <span className="block truncate text-xs text-ink-500">{session.displayName}</span>
            </span>
          </button>
          {overdue.length > 0 && (
            <button
              type="button"
              onClick={() => go({})}
              className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold', RED)}
              aria-label={`${overdue.length} ئامێر دواکەوتووە`}
            >
              <AlertTriangle width={16} height={16} />
              {overdue.length}
            </button>
          )}
          <ThemeToggle variant="icon" />
          <button
            type="button"
            onClick={onSignOut}
            className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-ink-600 hover:bg-slate-100"
          >
            <Logout width={18} height={18} />
            <span className="hidden sm:inline">دەرچوون</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-16 pt-5">
        {error && (
          <div className="flex items-start gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold underline" onClick={() => void load()}>
              دووبارە
            </button>
          </div>
        )}
        {flash?.view === viewKey && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <CheckCircle width={20} height={20} className="shrink-0" />
            <span className="flex-1 text-sm font-semibold">{flash.text}</span>
            {flash.ticket && (
              <button
                type="button"
                onClick={() => setPrinting(flash.ticket ?? null)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-card px-3 text-sm font-semibold text-ink-800 shadow-sm"
              >
                <Printer width={16} height={16} />
                چاپ
              </button>
            )}
            <button type="button" onClick={() => setFlash(null)} aria-label="داخستن" className="shrink-0 text-emerald-700">
              <X width={18} height={18} />
            </button>
          </div>
        )}
        {body}
      </main>

      {printing && <PrintSheet ticket={printing} onClose={() => setPrinting(null)} />}
    </Rtl>
  );
}

function Loading() {
  return <div className="py-16 text-center text-ink-400">چاوەڕێ بکە…</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-ink-500">{text}</div>;
}

// ── List ─────────────────────────────────────────────────────────────────────

function ListView({
  tickets,
  customers,
  overdue,
  loading,
  onOpen,
  onNew,
}: {
  tickets: RepairTicket[];
  customers: RepairCustomer[];
  overdue: RepairTicket[];
  loading: boolean;
  onOpen: (phone: string) => void;
  onNew: (phone?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('open');

  const searching = query.trim().length > 0;
  const found = useMemo(() => (searching ? searchCustomers(customers, query) : []), [customers, query, searching]);
  const typedPhone = normalizePhone(query);
  const fullPhone = /^07\d{9}$/.test(typedPhone) ? typedPhone : '';

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => repairStatus(t) !== 'delivered').length,
      done: tickets.filter((t) => repairStatus(t) === 'delivered').length,
      all: tickets.length,
    }),
    [tickets],
  );

  const shown = useMemo(() => {
    if (tab === 'open') {
      // The ones waiting longest first: they are the ones to deal with.
      return tickets
        .filter((t) => repairStatus(t) !== 'delivered')
        .sort((a, b) => a.broughtOn.localeCompare(b.broughtOn) || a.ticketNo - b.ticketNo);
    }
    if (tab === 'done') {
      return tickets
        .filter((t) => repairStatus(t) === 'delivered')
        .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''));
    }
    return sortNewest(tickets);
  }, [tickets, tab]);

  return (
    <>
      {overdue.length > 0 && !searching && (
        <section className={cn('rounded-2xl p-4 shadow-sm', RED)} role="alert">
          <div className="flex items-center gap-2.5">
            <AlertTriangle width={22} height={22} className="shrink-0" />
            <h2 className="text-base font-bold">
              {overdue.length} ئامێر زیاتر لە {OVERDUE_DAYS} ڕۆژە لێرەیە و هێشتا چاک نەکراوە
            </h2>
          </div>
          <ul className="mt-3 space-y-1.5">
            {overdue.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.phone)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/15 px-3 py-2 text-start text-sm transition hover:bg-white/25"
                >
                  <span className="font-bold" dir="ltr">
                    #{t.ticketNo}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.customerName} · {t.itemType}
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#B91C1C]">
                    {daysText(daysInShop(t))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {overdue.length > 6 && <p className="mt-2 text-sm text-white/85">و {overdue.length - 6} ی تر لە خوارەوە.</p>}
        </section>
      )}

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-400" width={20} height={20} />
          <input
            className={cn(fieldClass, 'h-13 ps-11 pe-10 text-lg shadow-sm')}
            type="search"
            inputMode="tel"
            placeholder="گەڕان بە ژمارەی مۆبایل"
            aria-label="گەڕان بە ژمارەی مۆبایل"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="سڕینەوەی گەڕان"
              className="absolute end-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-slate-100"
            >
              <X width={16} height={16} />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => onNew(fullPhone || undefined)}
          className="flex h-13 shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <Plus width={20} height={20} />
          <span className="hidden sm:inline">عەتڵی نوێ</span>
          <span className="sm:hidden">نوێ</span>
        </button>
      </div>

      {searching ? (
        <section className="space-y-2">
          {found.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-card px-4 py-8 text-center">
              <p className="text-ink-500">هیچ کڕیارێک بەم ژمارەیە نەدۆزرایەوە.</p>
              {fullPhone && (
                <button
                  type="button"
                  onClick={() => onNew(fullPhone)}
                  className="mx-auto mt-4 flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 font-semibold text-white"
                >
                  <Plus width={18} height={18} />
                  عەتڵی نوێ بۆ <span dir="ltr">{formatPhone(fullPhone)}</span>
                </button>
              )}
            </div>
          ) : (
            found.slice(0, 30).map((c) => <CustomerRow key={c.phone} customer={c} onOpen={() => onOpen(c.phone)} />)
          )}
        </section>
      ) : (
        <>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
            {(
              [
                ['open', 'لە دوکانن'],
                ['done', 'دراونەتەوە'],
                ['all', 'هەمووی'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition',
                  tab === id ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {label}
                <span className={cn('rounded-full px-1.5 text-xs', tab === id ? 'bg-slate-100 text-ink-600' : 'text-ink-400')}>
                  {counts[id]}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty
              text={
                tab === 'open'
                  ? 'هیچ ئامێرێک لە دوکان نییە. بۆ زیادکردن «عەتڵی نوێ» دابگرە.'
                  : tab === 'done'
                    ? 'هێشتا هیچ ئامێرێک نەدراوەتەوە.'
                    : 'هێشتا هیچ عەتڵێک تۆمار نەکراوە.'
              }
            />
          ) : (
            <ul className="space-y-2">
              {shown.map((t) => (
                <li key={t.id}>
                  <TicketRow ticket={t} visits={customers.find((c) => c.phone === t.phone)?.tickets.length ?? 1} onOpen={() => onOpen(t.phone)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function StatusChip({ ticket }: { ticket: RepairTicket }) {
  const status = repairStatus(ticket);
  if (isOverdue(ticket)) {
    return <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', RED)}>{daysText(daysInShop(ticket))} — دواکەوتووە</span>;
  }
  const tone = {
    waiting: 'bg-amber-50 text-amber-700',
    ready: 'bg-blue-50 text-blue-700',
    delivered: 'bg-emerald-50 text-emerald-700',
  }[status];
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>
      {status === 'waiting' ? `${STATUS_TEXT.waiting} · ${daysText(daysInShop(ticket))}` : STATUS_TEXT[status]}
    </span>
  );
}

function TicketRow({ ticket, visits, onOpen }: { ticket: RepairTicket; visits: number; onOpen: () => void }) {
  const late = isOverdue(ticket);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm transition hover:shadow-md sm:p-4',
        late ? 'border-[#DC2626] ring-1 ring-[#DC2626]/40' : 'border-slate-200/80',
      )}
    >
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl text-sm font-bold',
          late ? RED : 'bg-slate-100 text-ink-700',
        )}
        dir="ltr"
      >
        #{ticket.ticketNo}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-bold">{ticket.customerName}</span>
          {visits > 1 && <span className="shrink-0 rounded-full bg-violet-50 px-2 text-xs font-semibold text-violet-700">{visits} جار</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink-500">
          {ticket.itemType} · <span dir="ltr">{formatPhone(ticket.phone)}</span>
        </span>
      </span>
      <StatusChip ticket={ticket} />
    </button>
  );
}

function CustomerRow({ customer, onOpen }: { customer: RepairCustomer; onOpen: () => void }) {
  const open = customer.tickets.filter((t) => repairStatus(t) !== 'delivered').length;
  const late = customer.tickets.some((t) => isOverdue(t));
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm transition hover:shadow-md sm:p-4',
        late ? 'border-[#DC2626]' : 'border-slate-200/80',
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-50 text-lg font-bold text-brand-600">
        {customer.name.trim().charAt(0) || '؟'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{customer.name}</span>
        <span className="block text-sm text-ink-500" dir="ltr" style={{ textAlign: 'right' }}>
          {formatPhone(customer.phone)}
        </span>
      </span>
      <span className="shrink-0 text-end text-xs text-ink-500">
        <span className="block font-semibold text-ink-700">{customer.tickets.length} جار هاتووە</span>
        {open > 0 && <span className={cn('block', late ? 'font-bold text-[#DC2626]' : '')}>{open} لە دوکانە</span>}
      </span>
      <ArrowLeft width={18} height={18} className="shrink-0 text-ink-400" />
    </button>
  );
}

// ── One customer ─────────────────────────────────────────────────────────────

function CustomerView({
  customer,
  busyId,
  onBack,
  onAdd,
  onEdit,
  onPrint,
  onDelivered,
}: {
  customer: RepairCustomer;
  busyId: string | null;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (t: RepairTicket) => void;
  onPrint: (t: RepairTicket) => void;
  onDelivered: (t: RepairTicket, delivered: boolean) => void;
}) {
  // Still in the shop first, then the rest newest first.
  const tickets = [...customer.tickets].sort(
    (a, b) =>
      Number(repairStatus(a) === 'delivered') - Number(repairStatus(b) === 'delivered') ||
      b.broughtOn.localeCompare(a.broughtOn) ||
      b.ticketNo - a.ticketNo,
  );

  return (
    <>
      <BackButton onClick={onBack} />
      <section className="rounded-3xl border border-slate-200/80 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-600">
            {customer.name.trim().charAt(0) || '؟'}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{customer.name}</h1>
            <a href={`tel:${customer.phone}`} className="mt-0.5 inline-flex items-center gap-1.5 text-ink-600 hover:text-brand-600">
              <Phone width={15} height={15} />
              <span dir="ltr">{formatPhone(customer.phone)}</span>
            </a>
          </div>
          <span className="shrink-0 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
            {customer.tickets.length} جار هاتووە
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-300 font-semibold text-brand-600 transition hover:bg-brand-50"
        >
          <Plus width={20} height={20} />
          عەتڵێکی تر بۆ ئەم کڕیارە زیاد بکە
        </button>
      </section>

      <ul className="space-y-3">
        {tickets.map((t) => (
          <li key={t.id}>
            <TicketCard
              ticket={t}
              busy={busyId === t.id}
              onEdit={() => onEdit(t)}
              onPrint={() => onPrint(t)}
              onDelivered={(on) => onDelivered(t, on)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-9 items-center gap-1.5 rounded-xl text-sm font-semibold text-ink-600 hover:text-ink-900">
      <ArrowRight width={18} height={18} />
      گەڕانەوە
    </button>
  );
}

function TicketCard({
  ticket,
  busy,
  onEdit,
  onPrint,
  onDelivered,
}: {
  ticket: RepairTicket;
  busy: boolean;
  onEdit: () => void;
  onPrint: () => void;
  onDelivered: (delivered: boolean) => void;
}) {
  const status = repairStatus(ticket);
  const late = isOverdue(ticket);
  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border bg-card shadow-sm',
        late ? 'border-[#DC2626] ring-1 ring-[#DC2626]/40' : 'border-slate-200/80',
      )}
    >
      {late && (
        <div className={cn('flex items-center gap-2 px-4 py-2 text-sm font-bold', RED)}>
          <AlertTriangle width={16} height={16} />
          {daysInShop(ticket)} ڕۆژە لێرەیە و هێشتا چاک نەکراوە
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wrench width={18} height={18} className="shrink-0 text-ink-400" />
              <h2 className="truncate text-lg font-bold">{ticket.itemType}</h2>
            </div>
            <div className="mt-0.5 text-sm text-ink-500">
              پسوولە <span dir="ltr" className="font-semibold text-ink-700">#{ticket.ticketNo}</span>
            </div>
          </div>
          <StatusChip ticket={ticket} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-ink-500">بەرواری هێنان</dt>
            <dd className="mt-0.5 font-semibold" dir="ltr" style={{ textAlign: 'right' }}>
              {showDate(ticket.broughtOn)}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <dt className="text-xs text-ink-500">بەرواری چاکردن</dt>
            <dd className="mt-0.5 font-semibold" dir="ltr" style={{ textAlign: 'right' }}>
              {showDate(ticket.repairedOn)}
            </dd>
          </div>
        </dl>
        {ticket.note && (
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-ink-700">
            <span className="block text-xs text-ink-500">تێبینی</span>
            {ticket.note}
          </p>
        )}

        {status === 'delivered' ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle width={18} height={18} className="shrink-0" />
            <span className="flex-1 font-semibold">
              چاککرا و درایەوە بە کڕیار —{' '}
              <span dir="ltr">{showDate(ticket.deliveredAt?.slice(0, 10) ?? null)}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelivered(false)}
              className="shrink-0 text-xs font-semibold text-emerald-700 underline disabled:opacity-50"
            >
              گەڕاندنەوە
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelivered(true)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Spinner /> : <Check width={20} height={20} />}
            چاککرا و درایەوە بە کڕیار
          </button>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-card text-sm font-semibold text-ink-700 transition hover:bg-slate-50"
          >
            <Printer width={18} height={18} />
            چاپکردن
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-card text-sm font-semibold text-ink-700 transition hover:bg-slate-50"
          >
            <Pencil width={17} height={17} />
            دەستکاری
          </button>
        </div>
      </div>
    </article>
  );
}

// ── The form ─────────────────────────────────────────────────────────────────

const OTHER = '__other__';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">
        {label}
        {required && <span className="ms-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

function TicketForm({
  editing,
  initialPhone,
  initialName,
  customers,
  onCancel,
  onSave,
  onDelete,
}: {
  editing?: RepairTicket;
  initialPhone: string;
  initialName: string;
  customers: RepairCustomer[];
  onCancel: () => void;
  onSave: (draft: RepairDraft) => Promise<void>;
  onDelete: (ticket: RepairTicket) => Promise<void>;
}) {
  const knownItem = (item: string) => (CATEGORIES as readonly string[]).includes(item);
  const [phone, setPhone] = useState(editing ? formatPhone(editing.phone) : initialPhone ? formatPhone(initialPhone) : '');
  const [name, setName] = useState(editing?.customerName ?? initialName);
  const [item, setItem] = useState(editing ? (knownItem(editing.itemType) ? editing.itemType : OTHER) : '');
  const [otherItem, setOtherItem] = useState(editing && !knownItem(editing.itemType) ? editing.itemType : '');
  const [broughtOn, setBroughtOn] = useState(editing?.broughtOn ?? todayKey());
  const [repairedOn, setRepairedOn] = useState(editing?.repairedOn ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const normalized = normalizePhone(phone);
  const returning = customers.find((c) => c.phone === normalized && (!editing || c.tickets.some((t) => t.id !== editing.id)));
  const itemType = item === OTHER ? otherItem.trim() : item;

  // A returning customer's name fills itself in.
  useEffect(() => {
    if (returning && !name.trim()) setName(returning.name);
  }, [returning, name]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (normalized.length < 7) return setError('ژمارەی مۆبایل تەواو نییە.');
    if (!itemType) return setError('جۆری ئایتم هەڵبژێرە.');
    if (repairedOn && repairedOn < broughtOn) return setError('بەرواری چاکردن نابێت پێش بەرواری هێنان بێت.');
    setSaving(true);
    try {
      await onSave({
        id: editing?.id,
        customerName: name,
        phone: normalized,
        itemType,
        broughtOn,
        repairedOn: repairedOn || null,
        note,
      });
    } catch (err) {
      setError(repairErrorMessage(err));
      setSaving(false);
    }
  }

  async function onRemove() {
    if (!editing) return;
    setSaving(true);
    try {
      await onDelete(editing);
    } catch (err) {
      setError(repairErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <>
      <BackButton onClick={onCancel} />
      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-slate-200/80 bg-card p-5 shadow-sm sm:p-6">
        <h1 className="text-xl font-bold">
          {editing ? (
            <>
              دەستکاری عەتڵ <span dir="ltr">#{editing.ticketNo}</span>
            </>
          ) : (
            'عەتڵی نوێ'
          )}
        </h1>

        <Field label="ژمارەی مۆبایل" required>
          <input
            className={cn(fieldClass, 'text-left text-lg tracking-wide')}
            dir="ltr"
            type="tel"
            inputMode="tel"
            required
            autoFocus={!editing && !initialPhone}
            placeholder="0750 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {returning && (
          <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-sm text-violet-700">
            <CheckCircle width={18} height={18} className="shrink-0" />
            <span>
              کڕیاری پێشووە — <b>{returning.name}</b>، {returning.tickets.length} جار هاتووە.
            </span>
          </div>
        )}

        <Field label="ناو" required>
          <input className={fieldClass} required placeholder="ناوی کڕیار" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="جۆری ئایتم" required>
          <select className={cn(fieldClass, 'appearance-auto')} required value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="" disabled>
              هەڵبژێرە…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={OTHER}>شتی تر…</option>
          </select>
        </Field>
        {item === OTHER && (
          <input
            className={fieldClass}
            required
            autoFocus
            placeholder="ناوی ئایتمەکە بنووسە"
            value={otherItem}
            onChange={(e) => setOtherItem(e.target.value)}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="بەرواری هێنان" required>
            <input
              className={cn(fieldClass, 'text-right')}
              type="date"
              required
              max={todayKey()}
              value={broughtOn}
              onChange={(e) => setBroughtOn(e.target.value)}
            />
          </Field>
          <Field label="بەرواری چاکردن" hint="ئەگەر هێشتا چاک نەکراوە، بەتاڵی بهێڵەوە.">
            <div className="flex gap-2">
              <input
                className={cn(fieldClass, 'min-w-0 text-right')}
                type="date"
                min={broughtOn}
                value={repairedOn}
                onChange={(e) => setRepairedOn(e.target.value)}
              />
              {repairedOn ? (
                <button
                  type="button"
                  onClick={() => setRepairedOn('')}
                  className="h-12 shrink-0 rounded-xl border border-slate-200 px-3 text-sm text-ink-600 hover:bg-slate-50"
                >
                  بەتاڵ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRepairedOn(todayKey() < broughtOn ? broughtOn : todayKey())}
                  className="h-12 shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-ink-700 hover:bg-slate-50"
                >
                  ئەمڕۆ
                </button>
              )}
            </div>
          </Field>
        </div>

        <Field label="تێبینی">
          <textarea
            className={cn(fieldClass, 'h-auto min-h-24 py-3')}
            placeholder="چی تێکچووە، چی لەگەڵدایە…"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <button
          type="submit"
          disabled={saving}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-base font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? <Spinner /> : <Check width={20} height={20} />}
          پاشەکەوتکردن
        </button>

        {editing &&
          (confirmDelete ? (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              <span className="flex-1 font-semibold">دڵنیایت لە سڕینەوەی ئەم عەتڵە؟</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onRemove()}
                className="h-9 rounded-lg bg-rose-600 px-3 font-semibold text-white disabled:opacity-60"
              >
                بەڵێ، بیسڕەوە
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-lg px-3 font-semibold">
                نەخێر
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-rose-600 hover:text-rose-700"
            >
              <Trash width={16} height={16} />
              سڕینەوەی ئەم عەتڵە
            </button>
          ))}
      </form>
    </>
  );
}

// ── Print ────────────────────────────────────────────────────────────────────

function PrintSheet({ ticket, onClose }: { ticket: RepairTicket; onClose: () => void }) {
  const [size, setSize] = useState<PrintSize>(readPrintSize);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function print() {
    savePrintSize(size);
    setBusy(true);
    try {
      await printRepair(ticket, size);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="چاپکردن">
      <div className="absolute inset-0 bg-[#0f172a]/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-lg font-bold">
            چاپکردنی <span dir="ltr">#{ticket.ticketNo}</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="داخستن" className="grid size-9 place-items-center rounded-full text-ink-400 hover:bg-slate-100">
            <X width={18} height={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="text-sm font-semibold">قەبارەی چاپ</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PRINT_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSize(s.id)}
                className={cn(
                  'rounded-xl border px-2 py-2.5 text-center transition',
                  size === s.id ? 'border-brand-600 bg-brand-50 text-brand-700 ring-1 ring-brand-600' : 'border-slate-200 text-ink-700 hover:bg-slate-50',
                )}
              >
                <span className="block text-sm font-bold">{s.label}</span>
                <span className="block text-xs opacity-75">{s.hint}</span>
              </button>
            ))}
          </div>

          <style>{RECEIPT_CSS}</style>
          <div className="mt-4 flex justify-center overflow-x-auto rounded-2xl bg-slate-100 p-4">
            <div className="shrink-0 shadow-md" dangerouslySetInnerHTML={{ __html: receiptHtml(ticket, size) }} />
          </div>
          <p className="mt-2 text-center text-xs text-ink-500">
            لە پەنجەرەی چاپدا پرینتەرە بچووکەکە هەڵبژێرە — پێویست بە A4 ناکات.
          </p>
        </div>

        <div className="border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            onClick={() => void print()}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Spinner /> : <Printer width={20} height={20} />}
            چاپکردن
          </button>
        </div>
      </div>
    </div>
  );
}
