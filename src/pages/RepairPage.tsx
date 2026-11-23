import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle,
  Eye,
  EyeOff,
  Logout,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Trash,
  X,
} from '@/components/icons';
import { CATEGORIES } from '@/services/orders/options';
import {
  OVERDUE_DAYS,
  STATUS_TEXT,
  daysInShop,
  daysText,
  deliveredDay,
  formatPhone,
  groupByCustomer,
  isOverdue,
  normalizePhone,
  repairStatus,
  searchCustomers,
  showDate,
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

// ── The few styles the whole page is built from ─────────────────────────────

const panel = 'rounded-xl border border-slate-200 bg-card';

const TONES = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-200 bg-card text-ink-800 hover:bg-slate-50',
  ghost: 'text-ink-600 hover:bg-slate-100 hover:text-ink-900',
  green: 'bg-emerald-600 text-white hover:bg-emerald-700',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
} as const;

/** A button of one tone; `size` carries its height and padding (and width). */
function button(tone: keyof typeof TONES, size = 'h-10 px-4'): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    TONES[tone],
    size,
  );
}

const inputBase =
  'w-full rounded-lg border border-slate-300 bg-card px-3 text-[15px] text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';
const input = cn(inputBase, 'h-11');

/** Too long in the shop: the same red in light and dark mode. */
const LATE = '#DC2626';

/** Numbers, phones and dates read left to right inside the Kurdish text. */
function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

/** The whole page is Kurdish, right to left. */
function Rtl({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="ckb" className="min-h-full bg-surface text-ink-900">
      {children}
    </div>
  );
}

function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
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
        <Loading />
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
      <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[22rem]">
          <Logo size={44} className="rounded-xl" />
          <h1 className="mt-5 text-2xl font-bold">بەشی عەتڵ</h1>
          <p className="mt-1 text-ink-500">بۆ بەردەوامبوون بچۆ ژوورەوە.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            {notice && <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{notice}</p>}
            <Field label="ئیمەیڵ">
              <input
                className={cn(input, 'text-left')}
                dir="ltr"
                type="email"
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="وشەی نهێنی">
              <div className="relative" dir="ltr">
                <input
                  className={cn(input, 'pr-11')}
                  type={shown ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShown((s) => !s)}
                  aria-label={shown ? 'شاردنەوەی وشەی نهێنی' : 'پیشاندانی وشەی نهێنی'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                >
                  {shown ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
                </button>
              </div>
            </Field>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={busy} className={button('primary', 'h-11 w-full px-4')}>
              {busy && <Spinner />}
              چوونەژوورەوە
            </button>
          </form>
        </div>
      </div>
    </Rtl>
  );
}

// ── The desk ─────────────────────────────────────────────────────────────────

type Tab = 'open' | 'late' | 'done';

interface Toast {
  text: string;
  action?: { label: string; run: () => void };
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [printing, setPrinting] = useState<RepairTicket | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [deleting, setDeleting] = useState<RepairTicket | null>(null);

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

  // A message at the bottom goes away by itself.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
      setToast(
        delivered
          ? {
              text: `${next.itemType}ی ${next.customerName} درایەوە.`,
              action: { label: 'گەڕاندنەوە', run: () => void setDelivered(next, false) },
            }
          : { text: `#${next.ticketNo} گەڕایەوە بۆ «لە چاکردندایە».` },
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
    setToast({
      text: draft.id ? 'گۆڕانکارییەکان پاشەکەوت کران.' : `پاشەکەوت کرا — پسوولەی #${saved.ticketNo}`,
      action: { label: 'چاپکردن', run: () => setPrinting(saved) },
    });
    go({ c: saved.phone }, true);
  }

  async function remove(ticket: RepairTicket) {
    await store.remove(session.token, ticket.id);
    setTickets((list) => list.filter((t) => t.id !== ticket.id));
    setToast({ text: `#${ticket.ticketNo} سڕایەوە.` });
    const others = tickets.filter((t) => t.phone === ticket.phone && t.id !== ticket.id);
    go(others.length ? { c: ticket.phone } : {}, true);
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
        tab={tab}
        onTab={setTab}
        onOpen={(phone) => go({ c: phone })}
        onNew={(phone) => go({ new: '1', phone })}
        onEdit={(t) => go({ edit: t.id })}
        onDelete={setDeleting}
      />
    );
  }

  return (
    <Rtl>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <button type="button" onClick={() => go({})} className="flex items-center gap-2.5 rounded-lg">
            <Logo size={30} className="rounded-lg" />
            <span className="text-base font-bold">عەتڵ</span>
          </button>
          {overdue.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTab('late');
                go({});
              }}
              title="دواکەوتوو"
              className="ms-1 flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-bold text-white"
              style={{ background: LATE }}
            >
              {overdue.length}
            </button>
          )}
          <div className="flex-1" />
          <span className="hidden text-sm text-ink-500 sm:inline">{session.displayName}</span>
          {!isNew && !editId && (
            <button type="button" onClick={() => go({ new: '1' })} className={cn(button('primary', 'h-9 px-3 sm:px-4'), 'ms-2')}>
              <Plus width={18} height={18} />
              <span>عەتڵی نوێ</span>
            </button>
          )}
          <button type="button" onClick={onSignOut} title="دەرچوون" aria-label="دەرچوون" className={button('ghost', 'h-9 px-2')}>
            <Logout width={19} height={19} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:pt-8">
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold underline" onClick={() => void load()}>
              دووبارە
            </button>
          </div>
        )}
        {body}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg bg-[#1e293b] px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10"
          >
            <CheckCircle width={18} height={18} className="shrink-0 text-emerald-400" />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="shrink-0 font-semibold text-white underline-offset-4 hover:underline"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} aria-label="داخستن" className="shrink-0 text-white/60 hover:text-white">
              <X width={16} height={16} />
            </button>
          </div>
        </div>
      )}

      {printing && <PrintSheet ticket={printing} onClose={() => setPrinting(null)} />}
      {deleting && (
        <ConfirmDelete
          ticket={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await store.remove(session.token, deleting.id);
              setTickets((list) => list.filter((t) => t.id !== deleting.id));
              setToast({ text: `#${deleting.ticketNo} سڕایەوە.` });
            } catch (err) {
              fail(err);
            } finally {
              setDeleting(null);
            }
          }}
        />
      )}
    </Rtl>
  );
}

function Loading() {
  return <div className="py-24 text-center text-ink-400">چاوەڕێ بکە…</div>;
}

function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className={cn(panel, 'px-6 py-14 text-center text-ink-500')}>
      <p>{text}</p>
      {children}
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ms-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-ink-500 hover:text-ink-900">
      <ArrowRight width={17} height={17} />
      گەڕانەوە
    </button>
  );
}

/** A dot and a word: where the repair is. */
function StatusLabel({ ticket, small = false, end = false }: { ticket: RepairTicket; small?: boolean; end?: boolean }) {
  const status = repairStatus(ticket);
  const late = isOverdue(ticket);
  const dot = { waiting: 'bg-amber-500', ready: 'bg-blue-500', delivered: 'bg-emerald-500' }[status];
  return (
    <span
      className={cn('flex items-center gap-1.5', small ? 'text-xs' : 'text-sm', end && 'justify-end', late ? 'font-semibold' : 'text-ink-600')}
      style={late ? { color: LATE } : undefined}
    >
      <span className={cn('size-2 shrink-0 rounded-full', !late && dot)} style={late ? { background: LATE } : undefined} />
      {late ? 'دواکەوتووە' : STATUS_TEXT[status]}
    </span>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function ListView({
  tickets,
  customers,
  overdue,
  loading,
  tab,
  onTab,
  onOpen,
  onNew,
  onEdit,
  onDelete,
}: {
  tickets: RepairTicket[];
  customers: RepairCustomer[];
  overdue: RepairTicket[];
  loading: boolean;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onOpen: (phone: string) => void;
  onNew: (phone: string) => void;
  onEdit: (ticket: RepairTicket) => void;
  onDelete: (ticket: RepairTicket) => void;
}) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const found = useMemo(() => (searching ? searchCustomers(customers, query) : []), [customers, query, searching]);
  const typedPhone = normalizePhone(query);
  const fullPhone = /^07\d{9}$/.test(typedPhone) ? typedPhone : '';

  const visits = useMemo(() => new Map(customers.map((c) => [c.phone, c.tickets.length])), [customers]);

  const lists = useMemo(() => {
    // Waiting longest first: those are the ones to deal with.
    const open = tickets
      .filter((t) => repairStatus(t) !== 'delivered')
      .sort((a, b) => a.broughtOn.localeCompare(b.broughtOn) || a.ticketNo - b.ticketNo);
    const done = tickets
      .filter((t) => repairStatus(t) === 'delivered')
      .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''));
    return { open, late: overdue, done };
  }, [tickets, overdue]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'open', label: 'لە دوکان' },
    { id: 'late', label: 'دواکەوتوو' },
    { id: 'done', label: 'دراوەتەوە' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">عەتڵەکان</h1>
        <p className="mt-1 text-ink-500">تۆمارکردنی ئامێرە تێکچووەکان، چاکردن و گەڕاندنەوەیان بۆ کڕیار.</p>
      </div>
      {overdue.length > 0 && tab !== 'late' && !searching && (
        <button
          type="button"
          role="alert"
          onClick={() => onTab('late')}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-start transition-colors hover:bg-rose-100"
        >
          <AlertTriangle width={20} height={20} className="shrink-0 text-rose-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-rose-700">{overdue.length} ئامێر دواکەوتووە</span>
            <span className="block text-sm text-ink-600">{OVERDUE_DAYS} ڕۆژ یان زیاترە هاتووە و هێشتا چاک نەکراوە</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-rose-700 underline underline-offset-4">بینین</span>
        </button>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {searching ? (
          <p className="text-sm text-ink-500">
            {found.length ? `${found.length} کڕیار دۆزرایەوە` : 'هیچ کڕیارێک نەدۆزرایەوە'}
          </p>
        ) : (
          <nav className="flex gap-5" aria-label="پاڵاوتن">
            {tabs.map((t) => {
              const count = lists[t.id].length;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-1.5 border-b-2 text-[15px] font-semibold transition-colors',
                    active ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800',
                  )}
                >
                  {t.label}
                  <span
                    className={cn('text-sm', t.id === 'late' && count > 0 ? 'font-bold' : 'font-normal text-ink-400')}
                    style={t.id === 'late' && count > 0 ? { color: LATE } : undefined}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400" width={18} height={18} />
          <input
            className={cn(input, 'pe-9 ps-10')}
            type="text"
            inputMode="tel"
            enterKeyHint="search"
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
              className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-slate-100 hover:text-ink-700"
            >
              <X width={16} height={16} />
            </button>
          )}
        </div>
      </div>

      {searching ? (
        found.length === 0 ? (
          <Empty text="ئەم ژمارەیە پێشتر تۆمار نەکراوە.">
            {fullPhone && (
              <button type="button" onClick={() => onNew(fullPhone)} className={cn(button('primary'), 'mt-4')}>
                <Plus width={18} height={18} />
                عەتڵی نوێ بۆ <Ltr>{formatPhone(fullPhone)}</Ltr>
              </button>
            )}
          </Empty>
        ) : (
          <ul className={cn(panel, 'divide-y divide-slate-100 overflow-hidden')}>
            {found.slice(0, 30).map((c) => (
              <li key={c.phone}>
                <CustomerRow customer={c} onOpen={() => onOpen(c.phone)} />
              </li>
            ))}
          </ul>
        )
      ) : loading ? (
        <Loading />
      ) : lists[tab].length === 0 ? (
        <Empty
          text={
            tab === 'open'
              ? 'هیچ ئامێرێک لە دوکان نییە.'
              : tab === 'late'
                ? 'هیچ ئامێرێک دوانەکەوتووە.'
                : 'هێشتا هیچ ئامێرێک نەدراوەتەوە.'
          }
        />
      ) : (
        <RepairTable tickets={lists[tab]} visits={visits} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
      )}
    </div>
  );
}

/** The list as a table, like the rest of the Vio system: it scrolls sideways on a phone. */
function RepairTable({
  tickets,
  visits,
  onOpen,
  onEdit,
  onDelete,
}: {
  tickets: RepairTicket[];
  visits: Map<string, number>;
  onOpen: (phone: string) => void;
  onEdit: (ticket: RepairTicket) => void;
  onDelete: (ticket: RepairTicket) => void;
}) {
  const th = 'whitespace-nowrap px-3 py-3.5 text-start text-sm font-medium text-ink-500';
  const td = 'whitespace-nowrap px-3 py-4';
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-500">{tickets.length} عەتڵ</p>
      <div className={cn(panel, 'overflow-hidden')}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-[15px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={th}>پسوولە</th>
                <th className={th}>کڕیار</th>
                <th className={th}>ژمارەی مۆبایل</th>
                <th className={th}>جۆری ئایتم</th>
                <th className={th}>بەرواری هێنان</th>
                <th className={th}>بەرواری چاکردن</th>
                <th className={th}>ماوە</th>
                <th className={th}>دۆخ</th>
                <th className="whitespace-nowrap px-3 py-3.5 text-end text-sm font-medium text-ink-500">کردار</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const late = isOverdue(t);
                const delivered = repairStatus(t) === 'delivered';
                const n = visits.get(t.phone) ?? 1;
                return (
                  <tr key={t.id} onClick={() => onOpen(t.phone)} className="cursor-pointer transition-colors hover:bg-slate-50">
                    <td className={cn(td, 'ps-4 font-semibold tabular-nums')}>
                      <Ltr>#{t.ticketNo}</Ltr>
                    </td>
                    <td className={td}>
                      <span className="font-semibold">{t.customerName}</span>
                      {n > 1 && <span className="ms-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-ink-600">{n} جار</span>}
                    </td>
                    <td className={cn(td, 'tabular-nums text-ink-700')}>
                      <Ltr>{formatPhone(t.phone)}</Ltr>
                    </td>
                    <td className={td}>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-ink-800">{t.itemType}</span>
                    </td>
                    <td className={cn(td, 'tabular-nums text-ink-700')}>
                      <Ltr>{showDate(t.broughtOn)}</Ltr>
                    </td>
                    <td className={cn(td, 'tabular-nums text-ink-700')}>
                      <Ltr>{showDate(t.repairedOn)}</Ltr>
                    </td>
                    <td className={cn(td, late ? 'font-bold' : 'text-ink-600')} style={late ? { color: LATE } : undefined}>
                      {delivered ? '—' : daysText(daysInShop(t))}
                    </td>
                    <td className={td}>
                      <StatusLabel ticket={t} />
                    </td>
                    <td className={cn(td, 'py-2.5')}>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(t);
                          }}
                          aria-label={`دەستکاری #${t.ticketNo}`}
                          title="دەستکاری"
                          className="grid size-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil width={17} height={17} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(t);
                          }}
                          aria-label={`سڕینەوەی #${t.ticketNo}`}
                          title="سڕینەوە"
                          className="grid size-9 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash width={17} height={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ConfirmDelete({ ticket, onClose, onConfirm }: { ticket: RepairTicket; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="سڕینەوە">
      <div className="absolute inset-0 bg-[#0f172a]/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-card p-5 shadow-xl sm:rounded-xl">
        <h2 className="text-lg font-bold">سڕینەوەی پسوولەی <Ltr>#{ticket.ticketNo}</Ltr>؟</h2>
        <p className="mt-2 text-ink-600">
          {ticket.itemType}ی {ticket.customerName} بە تەواوی دەسڕێتەوە و ناگەڕێتەوە.
        </p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className={button('secondary', 'h-11 flex-1 px-4')}>
            نەخێر
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm();
            }}
            className={button('danger', 'h-11 flex-1 px-4')}
          >
            {busy && <Spinner />}
            بەڵێ، بیسڕەوە
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerRow({ customer, onOpen }: { customer: RepairCustomer; onOpen: () => void }) {
  const open = customer.tickets.filter((t) => repairStatus(t) !== 'delivered').length;
  const late = customer.tickets.some((t) => isOverdue(t));
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-slate-50">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{customer.name}</span>
        <span className="mt-0.5 block text-sm text-ink-500">
          <Ltr>{formatPhone(customer.phone)}</Ltr>
        </span>
      </span>
      <span className="shrink-0 text-end text-sm">
        <span className="block text-ink-600">{customer.tickets.length} جار هاتووە</span>
        {open > 0 && (
          <span className={cn('block', late ? 'font-semibold' : 'text-ink-500')} style={late ? { color: LATE } : undefined}>
            {open} لە دوکان
          </span>
        )}
      </span>
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
    <div className="mx-auto max-w-2xl">
      <BackLink onClick={onBack} />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{customer.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-600">
            <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-600">
              <Phone width={15} height={15} />
              <Ltr>{formatPhone(customer.phone)}</Ltr>
            </a>
            <span className="text-ink-300">·</span>
            <span>{customer.tickets.length} جار هاتووە</span>
          </div>
        </div>
        <button type="button" onClick={onAdd} className={button('secondary', 'h-10 w-full px-4 sm:w-auto')}>
          <Plus width={18} height={18} />
          عەتڵێکی تر
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            busy={busyId === t.id}
            onEdit={() => onEdit(t)}
            onPrint={() => onPrint(t)}
            onDelivered={(on) => onDelivered(t, on)}
          />
        ))}
      </div>
    </div>
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
  const delivered = repairStatus(ticket) === 'delivered';
  const late = isOverdue(ticket);
  return (
    <article className={cn('overflow-hidden rounded-xl border bg-card', late ? 'border-rose-300' : 'border-slate-200')}>
      {late && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
          <AlertTriangle width={16} height={16} className="shrink-0" />
          {daysInShop(ticket)} ڕۆژە لێرەیە و هێشتا چاک نەکراوە
        </div>
      )}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{ticket.itemType}</h2>
            <div className="mt-1">
              <StatusLabel ticket={ticket} />
            </div>
          </div>
          <span className="shrink-0 text-sm text-ink-400">
            پسوولە <Ltr>#{ticket.ticketNo}</Ltr>
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-500">بەرواری هێنان</dt>
            <dd className="mt-0.5 font-medium">
              <Ltr>{showDate(ticket.broughtOn)}</Ltr>
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">بەرواری چاکردن</dt>
            <dd className="mt-0.5 font-medium">
              <Ltr>{showDate(ticket.repairedOn)}</Ltr>
            </dd>
          </div>
          {delivered && (
            <div>
              <dt className="text-ink-500">دراوەتەوە</dt>
              <dd className="mt-0.5 font-medium">
                <Ltr>{showDate(deliveredDay(ticket))}</Ltr>
              </dd>
            </div>
          )}
        </dl>
        {ticket.note && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            <span className="text-ink-500">تێبینی: </span>
            {ticket.note}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {delivered ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle width={17} height={17} />
              درایەوە بە کڕیار
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelivered(false)}
                className="ms-1 text-ink-500 underline underline-offset-4 hover:text-ink-800 disabled:opacity-50"
              >
                گەڕاندنەوە
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelivered(true)}
              className={button('green', 'h-10 flex-1 px-4 sm:flex-none')}
            >
              {busy ? <Spinner /> : <Check width={18} height={18} />}
              چاککرا و درایەوە
            </button>
          )}
          <div className="ms-auto flex gap-1">
            <button type="button" onClick={onPrint} className={button('ghost', 'h-10 px-3')}>
              <Printer width={17} height={17} />
              چاپ
            </button>
            <button type="button" onClick={onEdit} className={button('ghost', 'h-10 px-3')}>
              <Pencil width={16} height={16} />
              دەستکاری
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── The form ─────────────────────────────────────────────────────────────────

const OTHER = '__other__';

function Field({
  label,
  required,
  hint,
  aside,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  /** A small link at the end of the label row. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink-800">
          {label}
          {required && <span className="ms-0.5 text-rose-500">*</span>}
        </span>
        {children}
        {hint && <span className="mt-1.5 block text-sm text-ink-500">{hint}</span>}
      </label>
      {/* Outside the label, so tapping the label never presses it. */}
      {aside && <span className="absolute end-0 top-0">{aside}</span>}
    </div>
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

  const today = todayKey();

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink onClick={onCancel} />
      <h1 className="mt-3 text-2xl font-bold">
        {editing ? (
          <>
            دەستکاری پسوولەی <Ltr>#{editing.ticketNo}</Ltr>
          </>
        ) : (
          'عەتڵی نوێ'
        )}
      </h1>

      <form onSubmit={onSubmit} className={cn(panel, 'mt-5 space-y-5 p-4 sm:p-6')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="ژمارەی مۆبایل"
            required
            hint={
              returning ? (
                <span className="text-emerald-700">
                  کڕیاری پێشووە — {returning.tickets.length} جار هاتووە
                </span>
              ) : undefined
            }
          >
            <input
              className={cn(input, 'text-left tracking-wide')}
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
          <Field label="ناو" required>
            <input className={input} required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>

        <Field label="جۆری ئایتم" required>
          <select className={input} required value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="" disabled>
              هەڵبژێرە
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={OTHER}>شتی تر…</option>
          </select>
          {item === OTHER && (
            <input
              className={cn(input, 'mt-2')}
              required
              autoFocus
              placeholder="ناوی ئایتمەکە"
              value={otherItem}
              onChange={(e) => setOtherItem(e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="بەرواری هێنان" required>
            <input className={input} type="date" required max={today} value={broughtOn} onChange={(e) => setBroughtOn(e.target.value)} />
          </Field>
          <Field
            label="بەرواری چاکردن"
            hint={repairedOn ? undefined : 'بەتاڵ بێت تا چاک دەکرێت.'}
            aside={
              <button
                type="button"
                onClick={() => setRepairedOn(repairedOn ? '' : today < broughtOn ? broughtOn : today)}
                className="text-sm leading-5 text-brand-600 hover:underline"
              >
                {repairedOn ? 'لابردن' : 'ئەمڕۆ'}
              </button>
            }
          >
            <input className={input} type="date" min={broughtOn} value={repairedOn} onChange={(e) => setRepairedOn(e.target.value)} />
          </Field>
        </div>

        <Field label="تێبینی">
          <textarea
            className={cn(inputBase, 'min-h-24 py-2.5 leading-relaxed')}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          {editing &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-rose-700">بیسڕیتەوە؟</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void onRemove()}
                  className={button('danger', 'h-9 px-3')}
                >
                  بەڵێ
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={button('ghost', 'h-9 px-3')}>
                  نەخێر
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 self-start text-sm text-rose-600 hover:text-rose-700 sm:self-auto"
              >
                <Trash width={15} height={15} />
                سڕینەوە
              </button>
            ))}
          <div className="flex gap-2 sm:ms-auto">
            <button type="button" onClick={onCancel} className={button('secondary', 'h-11 flex-1 px-4 sm:flex-none')}>
              پاشگەزبوونەوە
            </button>
            <button type="submit" disabled={saving} className={button('primary', 'h-11 flex-[2] px-4 sm:flex-none sm:px-6')}>
              {saving && <Spinner />}
              پاشەکەوتکردن
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Print ────────────────────────────────────────────────────────────────────

function PrintSheet({ ticket, onClose }: { ticket: RepairTicket; onClose: () => void }) {
  const [size, setSize] = useState<PrintSize>(readPrintSize);
  const [busy, setBusy] = useState(false);
  const chosen = PRINT_SIZES.find((s) => s.id === size) ?? PRINT_SIZES[0];

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
      <div className="absolute inset-0 bg-[#0f172a]/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold">
            چاپکردنی پسوولەی <Ltr>#{ticket.ticketNo}</Ltr>
          </h2>
          <button type="button" onClick={onClose} aria-label="داخستن" className={button('ghost', 'h-9 px-2')}>
            <X width={18} height={18} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pb-2">
          <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1">
            {PRINT_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSize(s.id)}
                aria-pressed={size === s.id}
                className={cn(
                  'h-9 rounded-md text-sm font-semibold transition-colors',
                  size === s.id ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-500">{chosen.hint}</p>

          <style>{RECEIPT_CSS}</style>
          <div className="mt-3 flex justify-center overflow-x-auto rounded-lg bg-slate-100 px-4 py-5">
            <div className="shrink-0 shadow-sm ring-1 ring-black/5" dangerouslySetInnerHTML={{ __html: receiptHtml(ticket, size) }} />
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5 pt-3">
          <button type="button" onClick={onClose} className={button('secondary', 'h-11 flex-1 px-4')}>
            داخستن
          </button>
          <button type="button" onClick={() => void print()} disabled={busy} className={button('primary', 'h-11 flex-[2] px-4')}>
            {busy ? <Spinner /> : <Printer width={18} height={18} />}
            چاپکردن
          </button>
        </div>
      </div>
    </div>
  );
}
