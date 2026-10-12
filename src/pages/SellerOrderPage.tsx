import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Logo } from '@/components/Logo';
import { CalendarDays, Check, CheckCircle, Clock, Eye, FileText, Logout, Pencil, Plus, Search, Trash, X } from '@/components/icons';
import {
  CATEGORIES,
  CITIES,
  GENDER_LABEL,
  MAX_BACKDATE_DAYS,
  PLATFORMS,
  SHIFT_LABEL,
  STATUS_LABEL,
  countsAsSale,
  formatIqd,
  formatIqdShort,
  purchaseFromCount,
  purchaseText,
  purchaseTextKu,
  shiftAt,
} from '@/services/orders/options';
import { OrdersError, getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { NewSalesOrder, OrderShift, OrderStatus, SellerOrder, SellerSession } from '@/services/orders/types';
import { cn } from '@/utils/cn';

const SESSION_KEY = 'vio.sellerSession';
const DRAFT_KEY = 'vio.sellerOrderDraft';

/**
 * The form keeps the price and the times bought as typed text, so "95,000"
 * can show commas and the count can be cleared while typing.
 */
interface Draft extends Omit<NewSalesOrder, 'totalPrice' | 'purchase' | 'purchaseCount' | 'orderDate'> {
  price: string;
  timesBought: string;
  /** `yyyy-MM-dd` of an earlier day for a forgotten order; '' means today. */
  orderDay: string;
}

function emptyDraft(keep?: Pick<Draft, 'platform' | 'shift'>): Draft {
  return {
    customerName: '',
    customerPhone: '',
    secondPhone: '',
    city: '',
    address: '',
    itemModel: '',
    itemCategory: '',
    price: '',
    gender: '',
    platform: keep?.platform ?? '',
    timesBought: '1',
    shift: keep?.shift ?? shiftAt(),
    note: '',
    orderDay: '',
  };
}

function draftFrom(order: SellerOrder): Draft {
  return {
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    secondPhone: order.secondPhone,
    city: order.city,
    address: order.address,
    itemModel: order.itemModel,
    itemCategory: order.itemCategory,
    price: order.totalPrice ? order.totalPrice.toLocaleString('en-US') : '',
    gender: order.gender,
    platform: order.platform,
    timesBought: order.purchaseCount
      ? String(order.purchaseCount)
      : order.purchase === 'first'
        ? '1'
        : order.purchase === 'second'
          ? '2'
          : '',
    shift: order.shift,
    note: order.note,
    orderDay: dayKey(new Date(order.createdAt)) === todayKey() ? '' : dayKey(new Date(order.createdAt)),
  };
}

const timesNumber = (times: string | undefined) => {
  const n = Number((times ?? '').replace(/\D/g, ''));
  return n >= 1 && n <= 1000 ? n : null;
};

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');
const todayKey = () => dayKey(new Date());

/** An order saved on a later day gets the middle of its shift as its time. */
const SHIFT_TIME: Record<OrderShift, [number, number]> = {
  morning: [10, 0],
  afternoon: [14, 30],
  night: [20, 30],
};

function orderDateIso(day: string, shift: Draft['shift']): string {
  if (day === todayKey()) return new Date().toISOString();
  const [y, m, d] = day.split('-').map(Number);
  const [hour, minute] = shift ? SHIFT_TIME[shift] : [12, 0];
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

/**
 * `savedDay` is the day an order being edited already has. A new order for
 * today, or an edit that keeps its day, sends no date and the server keeps it.
 */
function orderFrom(draft: Draft, savedDay?: string): NewSalesOrder {
  const { price, timesBought, orderDay, ...rest } = draft;
  const purchaseCount = timesNumber(timesBought);
  const day = orderDay || todayKey();
  const unchanged = day === (savedDay ?? todayKey());
  return {
    ...rest,
    customerName: rest.customerName.trim(),
    customerPhone: rest.customerPhone.trim(),
    secondPhone: rest.secondPhone.trim(),
    totalPrice: priceNumber(price),
    purchaseCount,
    purchase: purchaseFromCount(purchaseCount),
    orderDate: unchanged ? null : orderDateIso(day, rest.shift),
  };
}

function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the page still works, it just forgets on reload.
  }
}

/** Phones type Arabic-Indic digits too; the order keeps Western ones. */
function westernDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const priceNumber = (price: string) => Number(price.replace(/\D/g, '')) || 0;

const chipClass = (selected: boolean) =>
  cn(
    'min-h-11 rounded-xl border px-3.5 py-2 text-sm font-semibold transition active:scale-[0.98]',
    selected
      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
      : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
  );

const inputClass =
  'h-12 w-full rounded-xl border bg-white px-4 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

const STATUS_TONE: Record<OrderStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  new: 'info',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'warning',
};

/** A label in English with the Kurdish the sellers know from the old form. */
function Label({ en, ku, required }: { en: string; ku: string; required?: boolean }) {
  return (
    <span className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink-900">
      <span>
        {en}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      <span dir="rtl" className="font-medium text-ink-400">
        {ku}
      </span>
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1.5 block text-sm text-rose-600">{message}</span> : null;
}

function Section({ step, title, ku, children }: { step: number; title: string; ku: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {step}
        </span>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-lg font-bold text-ink-900">{title}</h2>
          <span dir="rtl" className="text-sm text-ink-400">
            {ku}
          </span>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/**
 * The page social media sellers use to log orders. A seller sees only their
 * own orders of the last 24 hours, to fix or delete one while it is still new
 * — never anyone else's. Everything else is in the owner's report.
 */
export function SellerOrderPage() {
  const store = getOrdersStore();
  const [session, setSession] = useState<SellerSession | null>(() => loadJson<SellerSession>(SESSION_KEY));
  const [checking, setChecking] = useState(() => !!loadJson<SellerSession>(SESSION_KEY));
  const [notice, setNotice] = useState<string | null>(null);

  // A saved sign-in may have been ended by the owner (new password, account
  // turned off) — check it before showing the form.
  useEffect(() => {
    const saved = loadJson<SellerSession>(SESSION_KEY);
    if (!saved) return;
    let active = true;
    store
      .whoAmI(saved.token)
      .then((name) => {
        if (!active) return;
        if (name) {
          const next = { ...saved, displayName: name };
          saveJson(SESSION_KEY, next);
          setSession(next);
        } else {
          saveJson(SESSION_KEY, null);
          setSession(null);
          setNotice('You were signed out. Please sign in again.');
        }
      })
      .catch((err) => active && setNotice(ordersErrorMessage(err)))
      .finally(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [store]);

  function signedOut(message: string | null) {
    saveJson(SESSION_KEY, null);
    setSession(null);
    setNotice(message);
  }

  if (checking) {
    return (
      <Screen width="sm">
        <div className="py-20 text-center text-ink-400">Loading…</div>
      </Screen>
    );
  }

  if (!session) {
    return (
      <SignIn
        notice={notice}
        onSignedIn={(next) => {
          saveJson(SESSION_KEY, next);
          setNotice(null);
          setSession(next);
        }}
      />
    );
  }

  return (
    <SellerWorkspace
      session={session}
      onSignOut={() => {
        void store.signOut(session.token).catch(() => undefined);
        signedOut(null);
      }}
      onExpired={() => signedOut('You were signed out. Please sign in again — your order is kept.')}
    />
  );
}

function SignIn({ notice, onSignedIn }: { notice: string | null; onSignedIn: (s: SellerSession) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await getOrdersStore().signIn(username, password));
    } catch (err) {
      setError(ordersErrorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen width="sm">
      <Card className="p-8">
        <Logo size={48} className="mx-auto" />
        <h1 className="mt-5 text-center text-2xl font-bold">Orders</h1>
        <p dir="rtl" className="text-center text-ink-400">
          تۆمارکردنی ئۆردەر
        </p>
        <p className="mt-2 text-center text-ink-500">Sign in with the account your manager gave you.</p>

        {notice && <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Input
            label="Username"
            required
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!username.trim() || !password}>
            Sign in
          </Button>
        </form>
      </Card>
    </Screen>
  );
}

type View = { kind: 'new' } | { kind: 'mine' } | { kind: 'edit'; order: SellerOrder };

/** A short message at the top of the page after a save, edit or delete. */
interface Flash {
  tone: 'success' | 'info';
  text: string;
  order?: SellerOrder;
}

function SellerWorkspace({
  session,
  onSignOut,
  onExpired,
}: {
  session: SellerSession;
  onSignOut: () => void;
  onExpired: () => void;
}) {
  const [view, setView] = useState<View>({ kind: 'new' });
  const [mine, setMine] = useState<SellerOrder[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [formKey, setFormKey] = useState(0);

  const handleError = useCallback(
    (err: unknown): string | null => {
      if (err instanceof OrdersError && err.code === 'SESSION_EXPIRED') {
        onExpired();
        return null;
      }
      return ordersErrorMessage(err);
    },
    [onExpired],
  );

  const loadMine = useCallback(async () => {
    try {
      const orders = await getOrdersStore().listMyOrders(session.token);
      setMine(orders);
      setMineError(null);
      return orders;
    } catch (err) {
      setMineError(handleError(err));
      return [];
    } finally {
      setLoadingMine(false);
    }
  }, [session.token, handleError]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const today = useMemo(() => {
    const day = todayKey();
    const list = mine.filter((o) => dayKey(new Date(o.enteredAt)) === day);
    return { orders: list.length, sales: list.reduce((sum, o) => sum + o.totalPrice, 0) };
  }, [mine]);

  // Every order of the seller's own, old sheet included. Sales leave out
  // cancelled and returned orders, the same as the owner's report.
  const allTime = useMemo(
    () => ({
      orders: mine.length,
      sales: mine.filter((o) => countsAsSale(o.status)).reduce((sum, o) => sum + o.totalPrice, 0),
    }),
    [mine],
  );

  const firstName = session.displayName.split(/\s+/)[0] || session.displayName;

  /** Empties the new-order form, date and platform included, after asking if anything was typed. */
  const clearForm = () => {
    const saved = loadJson<Draft>(DRAFT_KEY);
    const typed =
      !!saved &&
      (
        ['customerName', 'customerPhone', 'secondPhone', 'city', 'address', 'itemModel', 'itemCategory', 'price', 'note'] as const
      ).some((key) => String(saved[key] ?? '').trim() !== '');
    if (typed && !window.confirm('Clear everything typed in this order and start again?')) return;
    saveJson(DRAFT_KEY, emptyDraft());
    setFormKey((k) => k + 1);
    setFlash(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const go = (next: View) => {
    setView(next);
    if (next.kind !== 'mine') setFlash(null);
    window.scrollTo({ top: 0 });
  };

  async function saveNew(order: NewSalesOrder): Promise<string | null> {
    try {
      const { orderNo } = await getOrdersStore().submitOrder(session.token, order);
      // The next order starts empty, keeping where it was sold and the shift.
      saveJson(DRAFT_KEY, emptyDraft({ platform: order.platform, shift: order.shift }));
      const orders = await loadMine();
      setFlash({
        tone: 'success',
        text: order.orderDate
          ? `Order #${orderNo} saved for ${format(new Date(order.orderDate), 'd MMMM')}`
          : `Order #${orderNo} saved`,
        order: orders.find((o) => o.orderNo === orderNo),
      });
      setFormKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return null;
    } catch (err) {
      return handleError(err);
    }
  }

  async function saveEdit(id: string, orderNo: number, order: NewSalesOrder): Promise<string | null> {
    try {
      await getOrdersStore().updateMyOrder(session.token, id, order);
      await loadMine();
      setView({ kind: 'mine' });
      setFlash({ tone: 'success', text: `Order #${orderNo} updated` });
      window.scrollTo({ top: 0 });
      return null;
    } catch (err) {
      return handleError(err);
    }
  }

  async function remove(order: SellerOrder) {
    if (
      !window.confirm(
        `Delete order #${order.orderNo} for ${order.customerName}? It is removed for good — your manager will not see it.`,
      )
    ) {
      return;
    }
    try {
      await getOrdersStore().deleteMyOrder(session.token, order.id);
      await loadMine();
      setFlash({ tone: 'info', text: `Order #${order.orderNo} deleted` });
      if (view.kind === 'edit') setView({ kind: 'mine' });
    } catch (err) {
      const message = handleError(err);
      if (message) setFlash({ tone: 'info', text: message });
      void loadMine();
    }
  }

  const navItems = [
    { kind: 'new' as const, label: 'New order', ku: 'ئۆردەری نوێ', icon: Plus },
    { kind: 'mine' as const, label: 'My orders', ku: 'ئۆردەرەکانم', icon: FileText, count: mine.length },
  ];
  const activeNav = view.kind === 'edit' ? 'mine' : view.kind;

  const title =
    view.kind === 'new'
      ? { en: 'New order', ku: 'ئۆردەری نوێ', sub: 'Fill in the order as the customer gave it.' }
      : view.kind === 'mine'
        ? {
            en: 'My orders',
            ku: 'ئۆردەرەکانم',
            sub: 'All your orders. You can fix or delete one for 24 hours after saving it, while it is still new.',
          }
        : { en: `Edit order #${view.order.orderNo}`, ku: 'دەستکاریکردن', sub: 'Change what was wrong, then save.' };

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* ── Sidebar (laptop) ─────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-card px-5 py-6 lg:flex">
        <div className="flex items-center gap-2.5 px-1">
          <Logo size={36} />
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink-900">Vio Orders</div>
            <div className="text-xs text-ink-400">Social media sales</div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-600 text-lg font-bold text-white">
            {firstName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate font-bold text-ink-900">{session.displayName}</div>
            <div className="text-xs text-ink-400">Seller</div>
          </div>
        </div>

        <nav className="mt-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => go({ kind: item.kind })}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
                  active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-700 hover:bg-slate-100 hover:text-ink-900',
                )}
              >
                <Icon width={18} height={18} className="shrink-0" />
                <span className="flex-1">
                  {item.label}
                  <span dir="rtl" className={cn('block text-xs font-medium', active ? 'text-white/75' : 'text-ink-400')}>
                    {item.ku}
                  </span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs tabular-nums',
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-ink-500',
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="bg-brand-600 px-4 py-3 text-white">
            <div className="text-xs font-bold uppercase tracking-wide text-white/75">All my orders</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">{allTime.orders.toLocaleString('en-US')}</span>
              <span className="text-sm text-white/80">{allTime.orders === 1 ? 'order' : 'orders'}</span>
            </div>
            <div className="truncate text-sm font-semibold tabular-nums text-white/90" title={formatIqd(allTime.sales)}>
              {formatIqd(allTime.sales)}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400">Saved today</div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xl font-bold tabular-nums text-ink-900">{today.orders}</div>
                <div className="text-xs text-ink-500">{today.orders === 1 ? 'order' : 'orders'}</div>
              </div>
              <div>
                <div className="truncate text-base font-bold tabular-nums text-brand-700" title={formatIqd(today.sales)}>
                  {today.sales.toLocaleString('en-US')}
                </div>
                <div className="text-xs text-ink-500">IQD</div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-auto flex gap-2 text-xs leading-5 text-ink-400">
          <Clock width={14} height={14} className="mt-0.5 shrink-0" />
          You can fix or delete an order for 24 hours, while it is still new.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-500 transition hover:bg-slate-100 hover:text-ink-900"
        >
          <Logout width={18} height={18} /> Sign out
        </button>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ── Top bar (phone and tablet) ─────────────────────────────────── */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <Logo size={34} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-bold text-ink-900">Hi, {firstName}</div>
              <div className="truncate text-xs text-ink-500">
                <b className="text-ink-900">{allTime.orders.toLocaleString('en-US')}</b>{' '}
                {allTime.orders === 1 ? 'order' : 'orders'} in total · {today.orders} today
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="grid size-10 place-items-center rounded-xl text-ink-500 hover:bg-slate-100"
            >
              <Logout width={20} height={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 px-4 pb-3">
            {navItems.map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => go({ kind: item.kind })}
                className={cn(
                  'rounded-xl py-2 text-sm font-semibold transition',
                  activeNav === item.kind ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-700',
                )}
              >
                {item.label}
                {item.count ? ` (${item.count})` : ''}
              </button>
            ))}
          </div>
        </header>

        <main
          className={cn(
            'mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-10',
            view.kind === 'mine' ? 'max-w-[100rem]' : 'max-w-6xl',
          )}
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-bold text-ink-900 sm:text-3xl">
                {title.en}
                <span dir="rtl" className="text-lg font-semibold text-ink-400">
                  {title.ku}
                </span>
              </h1>
              <p className="mt-1 text-ink-500">{title.sub}</p>
            </div>
            {view.kind === 'mine' && (
              <Button leftIcon={<Plus />} onClick={() => go({ kind: 'new' })}>
                New order
              </Button>
            )}
            {view.kind === 'new' && (
              <Button variant="outline" size="sm" leftIcon={<X width={16} height={16} />} onClick={clearForm}>
                Clear form
                <span className="text-slate-300">·</span>
                <span dir="rtl" className="font-medium text-ink-400">
                  پاککردنەوە
                </span>
              </Button>
            )}
          </div>

          {flash && (
            <div
              className={cn(
                'mb-6 flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4',
                flash.tone === 'success'
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-ink-700',
              )}
            >
              <CheckCircle width={22} height={22} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{flash.text}</div>
                {flash.order && (
                  <div className="truncate text-sm opacity-80">
                    <span dir="auto">{flash.order.customerName}</span> ·{' '}
                    <span dir="auto">{flash.order.itemModel || flash.order.itemCategory}</span> ·{' '}
                    {formatIqd(flash.order.totalPrice)}
                  </div>
                )}
              </div>
              {flash.order && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Pencil width={15} height={15} />}
                  onClick={() => flash.order && go({ kind: 'edit', order: flash.order })}
                >
                  Fix it
                </Button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFlash(null)}
                className="grid size-8 place-items-center rounded-lg opacity-60 hover:opacity-100"
              >
                <X width={16} height={16} />
              </button>
            </div>
          )}

          {view.kind === 'new' && (
            <OrderForm key={`new-${formKey}`} mode="new" sellerName={session.displayName} onSubmit={saveNew} />
          )}
          {view.kind === 'edit' && (
            <OrderForm
              key={`edit-${view.order.id}`}
              mode="edit"
              sellerName={session.displayName}
              initial={view.order}
              onSubmit={(order) => saveEdit(view.order.id, view.order.orderNo, order)}
              onCancel={() => go({ kind: 'mine' })}
              onDelete={() => void remove(view.order)}
            />
          )}
          {view.kind === 'mine' && mineError && (
            <div className="mb-6 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-800">{mineError}</div>
          )}
          {view.kind === 'mine' && !mineError && (
            <MyOrders
              orders={mine}
              loading={loadingMine}
              onEdit={(order) => go({ kind: 'edit', order })}
              onDelete={(order) => void remove(order)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/** A small figure above the My orders table. */
function MiniStat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 truncate text-xl font-bold tabular-nums text-ink-900 sm:text-2xl">
        {value}
        {unit && <span className="ml-1 hidden text-xs font-semibold text-ink-400 sm:inline">{unit}</span>}
      </div>
    </div>
  );
}

const MY_RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '7 days' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All' },
] as const;
type MyRange = (typeof MY_RANGES)[number]['id'];

const MY_PAGE = 20;

/** Why the seller cannot change an order, for the lock's tooltip. */
function lockReason(o: SellerOrder): string {
  if (o.status !== 'new') return `${STATUS_LABEL[o.status]} by your manager — ask them to change it.`;
  if (o.source === 'import') return 'From the old order sheet — ask your manager to change it.';
  return 'Saved over 24 hours ago — ask your manager to change it.';
}

/**
 * Every order of the seller's own, as a table they can narrow by period or
 * search. On a phone it keeps order, customer, price and the buttons; the
 * other columns join in as the screen gets wider.
 */
function MyOrders({
  orders,
  loading,
  onEdit,
  onDelete,
}: {
  orders: SellerOrder[];
  loading: boolean;
  onEdit: (order: SellerOrder) => void;
  onDelete: (order: SellerOrder) => void;
}) {
  const [range, setRange] = useState<MyRange>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const shown = useMemo(() => {
    const today = todayKey();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const month = today.slice(0, 7);
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return orders.filter((o) => {
      const day = dayKey(new Date(o.createdAt));
      if (range === 'today' && day !== today) return false;
      if (range === 'week' && new Date(o.createdAt).getTime() < weekAgo) return false;
      if (range === 'month' && !day.startsWith(month)) return false;
      if (!q) return true;
      if (q.startsWith('#') && qDigits) return String(o.orderNo) === qDigits;
      const hay = [o.customerName, o.city, o.address, o.itemModel, o.itemCategory, o.platform, o.note]
        .join(' ')
        .toLowerCase();
      const phoneHit =
        qDigits.length >= 4 &&
        (o.customerPhone.replace(/\D/g, '').includes(qDigits) || o.secondPhone.replace(/\D/g, '').includes(qDigits));
      return hay.includes(q) || phoneHit;
    });
  }, [orders, range, query]);

  const pages = Math.max(1, Math.ceil(shown.length / MY_PAGE));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);

  if (loading) return <p className="py-10 text-center text-ink-400">Loading…</p>;

  if (orders.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <FileText width={26} height={26} />
        </div>
        <h2 className="mt-4 text-lg font-bold">No orders yet</h2>
        <p className="mt-1 text-ink-500">Every order you save shows here.</p>
      </Card>
    );
  }

  const total = shown.reduce((sum, o) => sum + o.totalPrice, 0);
  const fixable = shown.filter((o) => o.canChange).length;
  const rows = shown.slice(page * MY_PAGE, page * MY_PAGE + MY_PAGE);
  const cell = 'px-2 py-3 sm:px-4';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 md:w-auto">
          {MY_RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRange(r.id);
                setPage(0);
              }}
              className={cn(
                'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition',
                range === r.id ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1">
          <Search
            width={16}
            height={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className={cn(inputClass, 'h-11 border-slate-200 pl-10 text-sm')}
            placeholder="Search customer, phone, item or #order…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Orders" value={String(shown.length)} />
        <MiniStat
          label="Total"
          unit="IQD"
          value={
            <>
              <span className="sm:hidden">{formatIqdShort(total)}</span>
              <span className="hidden sm:inline">{total.toLocaleString('en-US')}</span>
            </>
          }
        />
        <MiniStat label="Can fix" value={String(fixable)} />
      </div>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-500">No orders match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className={cell}>Order</th>
                  <th className={cell}>Customer</th>
                  <th className={cn(cell, 'hidden md:table-cell')}>Delivery</th>
                  <th className={cn(cell, 'hidden xl:table-cell')}>Item</th>
                  <th className={cn(cell, 'hidden 2xl:table-cell')}>Sold on</th>
                  <th className={cn(cell, 'text-right')}>
                    Price<span className="hidden sm:inline"> · status</span>
                  </th>
                  <th className={cn(cell, 'w-12 text-right')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const later = o.source === 'app' && dayKey(new Date(o.createdAt)) !== dayKey(new Date(o.enteredAt));
                  return (
                    <tr key={o.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                      <td className={cn(cell, 'sm:whitespace-nowrap')}>
                        <div className="font-mono font-bold text-ink-900">#{o.orderNo}</div>
                        <div className="whitespace-nowrap text-xs text-ink-500">
                          {format(new Date(o.createdAt), 'd MMM yy')}
                        </div>
                        <div className="text-xs text-ink-400">{format(new Date(o.createdAt), 'hh:mm a')}</div>
                        {(later || o.editedAt || o.source === 'import') && (
                          <div className="mt-1 flex flex-col items-start gap-1 sm:whitespace-nowrap">
                            {o.source === 'import' && (
                              <span title="Brought in from the old Google order sheet">
                                <Badge>Old sheet</Badge>
                              </span>
                            )}
                            {later && (
                              <span title={`Saved ${format(new Date(o.enteredAt), 'd MMM, hh:mm a')}`}>
                                <Badge tone="warning">Added later</Badge>
                              </span>
                            )}
                            {o.editedAt && <Badge tone="note">Edited</Badge>}
                          </div>
                        )}
                      </td>
                      <td className={cn(cell, 'min-w-0')}>
                        <div dir="auto" className="max-w-[7.5rem] truncate text-left font-semibold text-ink-900 sm:max-w-[14rem]">
                          {o.customerName}
                        </div>
                        <div className="font-mono text-xs text-ink-500">{o.customerPhone}</div>
                        {o.secondPhone && <div className="font-mono text-xs text-ink-400">{o.secondPhone}</div>}
                        <div dir="auto" className="text-left text-xs text-ink-400 md:hidden">
                          {o.city}
                        </div>
                      </td>
                      <td className={cn(cell, 'hidden md:table-cell')}>
                        <div dir="auto" className="text-left font-medium text-ink-900">
                          {o.city}
                        </div>
                        <div dir="auto" className="max-w-[10rem] truncate text-left text-xs text-ink-500" title={o.address}>
                          {o.address || '—'}
                        </div>
                        <div className="max-w-[10rem] truncate font-mono text-xs text-ink-400 xl:hidden" title={o.itemModel}>
                          {o.itemModel}
                        </div>
                      </td>
                      <td className={cn(cell, 'hidden xl:table-cell')}>
                        <div className="max-w-[10rem] truncate font-mono text-xs font-semibold text-ink-900" title={o.itemModel}>
                          {o.itemModel || '—'}
                        </div>
                        <div dir="auto" className="max-w-[10rem] truncate text-left text-xs text-ink-500" title={o.itemCategory}>
                          {o.itemCategory}
                        </div>
                      </td>
                      <td className={cn(cell, 'hidden whitespace-nowrap 2xl:table-cell')}>
                        <div className="font-medium text-ink-900">{o.platform || '—'}</div>
                        <div className="text-xs text-ink-500">
                          {[o.shift && SHIFT_LABEL[o.shift].en, purchaseText(o.purchaseCount, o.purchase)]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td className={cn(cell, 'whitespace-nowrap text-right')}>
                        <div className="font-bold tabular-nums text-brand-700">{o.totalPrice.toLocaleString('en-US')}</div>
                        <div className="text-xs text-ink-400">
                          IQD<span className="hidden sm:inline 2xl:hidden">{o.platform ? ` · ${o.platform}` : ''}</span>
                        </div>
                        <div className="mt-1">
                          <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        </div>
                      </td>
                      <td className={cn(cell, 'whitespace-nowrap text-right')}>
                        {o.canChange ? (
                          <div className="inline-flex flex-col gap-1">
                            <button
                              type="button"
                              title="Edit order"
                              aria-label={`Edit order ${o.orderNo}`}
                              onClick={() => onEdit(o)}
                              className="grid size-9 place-items-center rounded-xl border border-slate-200 text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                            >
                              <Pencil width={16} height={16} />
                            </button>
                            <button
                              type="button"
                              title="Delete order"
                              aria-label={`Delete order ${o.orderNo}`}
                              onClick={() => onDelete(o)}
                              className="grid size-9 place-items-center rounded-xl border border-slate-200 text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                            >
                              <Trash width={16} height={16} />
                            </button>
                          </div>
                        ) : (
                          <span
                            className="inline-grid size-9 place-items-center rounded-xl text-ink-400"
                            title={lockReason(o)}
                            aria-label={lockReason(o)}
                          >
                            <Clock width={16} height={16} />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-brand-50/50 px-4 py-3 text-sm">
          <span className="font-bold text-ink-700">
            {shown.length} {shown.length === 1 ? 'order' : 'orders'}
            <span className="ml-2 font-bold tabular-nums text-brand-700">{formatIqd(total)}</span>
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-500">
                Page {page + 1} of {pages}
              </span>
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </Card>

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-400">
        <Clock width={14} height={14} className="mt-0.5 shrink-0" />
        You can edit or delete an order for 24 hours after you save it, while it is New. Older orders, orders from
        the old sheet and orders your manager has marked are locked.
      </p>
    </div>
  );
}

type Errors = Partial<
  Record<'customerName' | 'customerPhone' | 'city' | 'address' | 'item' | 'price' | 'platform' | 'orderDay', string>
>;

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!draft.customerName.trim()) errors.customerName = 'Write the customer’s name.';
  if (draft.customerPhone.replace(/\D/g, '').length < 7) errors.customerPhone = 'Write a full phone number.';
  if (!draft.city.trim()) errors.city = 'Pick the city.';
  if (!draft.address.trim()) errors.address = 'Write the address for delivery.';
  if (!draft.itemModel.trim() && !draft.itemCategory.trim()) errors.item = 'Write the item model or its type.';
  if (priceNumber(draft.price) <= 0) errors.price = 'Write the total price.';
  if (!draft.platform) errors.platform = 'Pick where it was sold.';
  if (draft.orderDay) {
    const earliest = dayKey(subDays(new Date(), MAX_BACKDATE_DAYS));
    if (draft.orderDay > todayKey() || draft.orderDay < earliest) {
      errors.orderDay = `Pick a day in the last ${MAX_BACKDATE_DAYS} days.`;
    }
  }
  return errors;
}

/**
 * Today by default. Yesterday, or any day in the last 90, for an order the
 * seller forgot to save — it then counts on that day in the owner's report.
 */
function OrderDatePicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (day: string) => void;
  error?: string;
}) {
  const today = todayKey();
  const yesterday = dayKey(subDays(new Date(), 1));
  const earliest = dayKey(subDays(new Date(), MAX_BACKDATE_DAYS));
  const day = value || today;
  const [other, setOther] = useState(day !== today && day !== yesterday);
  const choice = other ? 'other' : day === yesterday ? 'yesterday' : 'today';
  const options = [
    { id: 'today', en: 'Today', ku: 'ئەمڕۆ' },
    { id: 'yesterday', en: 'Yesterday', ku: 'دوێنێ' },
    { id: 'other', en: 'Other', ku: 'ڕۆژێکی تر' },
  ] as const;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <CalendarDays width={22} height={22} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="text-lg font-bold text-ink-900">Order date</h2>
              <span dir="rtl" className="text-sm text-ink-400">
                بەرواری ئۆردەر
              </span>
            </div>
            <div className="text-sm text-ink-500">{format(parseISO(day), 'EEEE, d MMMM yyyy')}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:w-[22rem] md:shrink-0">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={chipClass(choice === o.id)}
              onClick={() => {
                if (o.id === 'other') {
                  setOther(true);
                  return;
                }
                setOther(false);
                onChange(o.id === 'today' ? '' : yesterday);
              }}
            >
              {o.en}
              <span dir="rtl" className="block text-xs font-medium opacity-75">
                {o.ku}
              </span>
            </button>
          ))}
        </div>
      </div>
      {other && (
        <div className="mt-4 md:ml-14">
          <input
            type="date"
            className={cn(inputClass, 'md:max-w-xs', error ? 'border-rose-400' : 'border-slate-200')}
            min={earliest}
            max={today}
            value={day}
            onChange={(e) => onChange(!e.target.value || e.target.value === today ? '' : e.target.value)}
          />
          <span className="mt-1.5 block text-sm text-ink-500">Any day in the last {MAX_BACKDATE_DAYS} days.</span>
        </div>
      )}
      {day !== today && !error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 md:ml-14">
          <Clock width={16} height={16} className="mt-0.5 shrink-0" />
          <span>
            Saved now, but counted on <b>{format(parseISO(day), 'd MMMM')}</b> in the report.
          </span>
        </p>
      )}
      <FieldError message={error} />
    </Card>
  );
}

/** The required details, in form order, for the summary's checklist. */
const CHECKS: { key: keyof Errors; label: string }[] = [
  { key: 'customerName', label: 'Customer name' },
  { key: 'customerPhone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'address', label: 'Address' },
  { key: 'item', label: 'Item' },
  { key: 'price', label: 'Price' },
  { key: 'platform', label: 'Sold on' },
];

function OrderForm({
  mode,
  sellerName,
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  mode: 'new' | 'edit';
  sellerName: string;
  initial?: SellerOrder;
  /** Resolves to an error message, or null when saved. */
  onSubmit: (order: NewSalesOrder) => Promise<string | null>;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initial ? draftFrom(initial) : (loadJson<Draft>(DRAFT_KEY) ?? emptyDraft()),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherCity, setOtherCity] = useState(() => !!draft.city && !(CITIES as readonly string[]).includes(draft.city));
  const [reviewing, setReviewing] = useState(false);

  // The review sheet covers the page: hold the page still behind it, and let
  // Escape close it.
  useEffect(() => {
    if (!reviewing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReviewing(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [reviewing]);

  // A new order keeps what is typed, so a reload or a call coming in loses nothing.
  useEffect(() => {
    if (mode === 'new') saveJson(DRAFT_KEY, draft);
  }, [draft, mode]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key === 'itemModel' || key === 'itemCategory' ? 'item' : key]: undefined }));
  };

  const price = priceNumber(draft.price);
  const missing = validate(draft);
  const done = CHECKS.filter((c) => !missing[c.key]).length;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const found = validate(draft);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) {
      setError('Some details are missing — see the red notes.');
      return;
    }
    setSaving(true);
    const message = await onSubmit(orderFrom(draft, initial ? dayKey(new Date(initial.createdAt)) : undefined));
    setSaving(false);
    if (message) setError(message);
  }

  const saveLabel = mode === 'new' ? 'Save order' : 'Save changes';
  const summaryTitle = mode === 'new' ? 'Order summary' : `Order #${initial?.orderNo}`;

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4 pb-28 xl:pb-0">
        <OrderDatePicker value={draft.orderDay ?? ''} onChange={(day) => set('orderDay', day)} error={errors.orderDay} />

        <Section step={1} title="Customer" ku="کڕیار">
          <label className="block">
            <Label en="Customer name" ku="ناوی کڕیار" required />
            <input
              className={cn(inputClass, errors.customerName ? 'border-rose-400' : 'border-slate-200')}
              dir="auto"
              value={draft.customerName}
              onChange={(e) => set('customerName', e.target.value)}
            />
            <FieldError message={errors.customerName} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label en="Phone" ku="ژمارەی کڕیار" required />
              <input
                className={cn(inputClass, 'font-mono', errors.customerPhone ? 'border-rose-400' : 'border-slate-200')}
                inputMode="tel"
                placeholder="07xx xxx xxxx"
                value={draft.customerPhone}
                onChange={(e) => set('customerPhone', westernDigits(e.target.value))}
              />
              <FieldError message={errors.customerPhone} />
            </label>
            <label className="block">
              <Label en="Second phone" ku="ژمارەی دووەم" />
              <input
                className={cn(inputClass, 'border-slate-200 font-mono')}
                inputMode="tel"
                value={draft.secondPhone}
                onChange={(e) => set('secondPhone', westernDigits(e.target.value))}
              />
            </label>
          </div>
          <div>
            <Label en="Gender" ku="ڕەگەز" />
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={chipClass(draft.gender === g)}
                  onClick={() => set('gender', draft.gender === g ? '' : g)}
                >
                  {GENDER_LABEL[g].en} · {GENDER_LABEL[g].ku}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section step={2} title="Delivery" ku="گەیاندن">
          <div>
            <Label en="City" ku="شار" required />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-6">
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  dir="rtl"
                  className={chipClass(!otherCity && draft.city === city)}
                  onClick={() => {
                    setOtherCity(false);
                    set('city', city);
                  }}
                >
                  {city}
                </button>
              ))}
              <button
                type="button"
                className={chipClass(otherCity)}
                onClick={() => {
                  setOtherCity(true);
                  set('city', '');
                }}
              >
                Other · تر
              </button>
            </div>
            {otherCity && (
              <input
                className={cn(inputClass, 'mt-2 border-slate-200')}
                dir="auto"
                autoFocus
                placeholder="City name"
                value={draft.city}
                onChange={(e) => set('city', e.target.value)}
              />
            )}
            <FieldError message={errors.city} />
          </div>
          <label className="block">
            <Label en="Full address" ku="ناونیشانی تەواوەتی" required />
            <textarea
              className={cn(inputClass, 'h-auto min-h-20 py-3', errors.address ? 'border-rose-400' : 'border-slate-200')}
              dir="auto"
              value={draft.address}
              onChange={(e) => set('address', e.target.value)}
            />
            <FieldError message={errors.address} />
          </label>
        </Section>

        <Section step={3} title="Item" ku="ئایتم">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <Label en="Item model" ku="جۆری ئایتم" />
              <input
                className={cn(inputClass, 'font-mono', errors.item ? 'border-rose-400' : 'border-slate-200')}
                placeholder="e.g. V.502"
                autoCapitalize="characters"
                value={draft.itemModel}
                onChange={(e) => set('itemModel', e.target.value)}
              />
            </label>
            <label className="block">
              <Label en="Item type" ku="کەتەگۆری ئایتم" />
              <input
                className={cn(inputClass, errors.item ? 'border-rose-400' : 'border-slate-200')}
                dir="auto"
                list="order-categories"
                placeholder="سەماوەر، هیتەر…"
                value={draft.itemCategory}
                onChange={(e) => set('itemCategory', e.target.value)}
              />
              <datalist id="order-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
          <FieldError message={errors.item} />
          <label className="block">
            <Label en="Total price (IQD)" ku="نرخی گشتی" required />
            <input
              className={cn(inputClass, 'text-lg font-bold tabular-nums', errors.price ? 'border-rose-400' : 'border-slate-200')}
              inputMode="numeric"
              placeholder="95,000"
              value={draft.price}
              onChange={(e) => {
                const n = priceNumber(westernDigits(e.target.value));
                set('price', n ? n.toLocaleString('en-US') : '');
              }}
            />
            <FieldError message={errors.price} />
          </label>
          {price > 0 && price < 1000 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>
                Did you mean <b>{formatIqd(price * 1000)}</b>?
              </span>
              <button
                type="button"
                className="rounded-lg bg-white px-3 py-1.5 font-semibold text-amber-800 shadow-sm"
                onClick={() => set('price', (price * 1000).toLocaleString('en-US'))}
              >
                Use {(price * 1000).toLocaleString('en-US')}
              </button>
            </div>
          )}
        </Section>

        <Section step={4} title="Sale" ku="فرۆشتن">
          <div>
            <Label en="Sold on" ku="لە کام پلاتفۆرم فرۆشرا" required />
            <div className="grid grid-cols-3 gap-2 2xl:grid-cols-6">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" className={chipClass(draft.platform === p)} onClick={() => set('platform', p)}>
                  {p}
                </button>
              ))}
            </div>
            <FieldError message={errors.platform} />
          </div>
          <label className="block">
            <Label en="How many times has this customer bought?" ku="جاری چەندەمە کڕین دەکات؟" />
            <div className="flex items-center gap-3">
              <div className="w-28 shrink-0">
                <input
                  className={cn(inputClass, 'border-slate-200 text-center text-lg font-bold tabular-nums')}
                  inputMode="numeric"
                  placeholder="1"
                  value={draft.timesBought ?? ''}
                  onChange={(e) => {
                    const digits = westernDigits(e.target.value).replace(/\D/g, '').slice(0, 4);
                    set('timesBought', digits.replace(/^0+/, ''));
                  }}
                />
              </div>
              {timesNumber(draft.timesBought) && (
                <span className="text-sm text-ink-500">
                  {purchaseText(timesNumber(draft.timesBought), '')} ·{' '}
                  <span dir="rtl">{purchaseTextKu(timesNumber(draft.timesBought) ?? 1)}</span>
                </span>
              )}
            </div>
            <span className="mt-1.5 block text-sm text-ink-500">Type 1 for a new customer.</span>
          </label>
          <div>
            <Label en="Shift" ku="لە چ کاتێکدا ئەم ئۆردەرە کراوە؟" />
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((s) => (
                <button key={s} type="button" className={chipClass(draft.shift === s)} onClick={() => set('shift', s)}>
                  {SHIFT_LABEL[s].en}
                  <span className="block text-xs font-medium opacity-75">
                    <span dir="rtl">{SHIFT_LABEL[s].ku}</span> {SHIFT_LABEL[s].hours}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <Label en="Note" ku="تێبینی" />
            <textarea
              className={cn(inputClass, 'h-auto min-h-20 border-slate-200 py-3')}
              dir="auto"
              value={draft.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </label>
        </Section>

        {mode === 'edit' && onDelete && (
          <Card className="flex flex-wrap items-center gap-3 border-rose-100 p-5">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink-900">Delete this order</div>
              <div className="text-sm text-ink-500">Only if it should not have been saved at all.</div>
            </div>
            <Button type="button" variant="ghost" className="text-rose-600 hover:bg-rose-50" leftIcon={<Trash width={16} height={16} />} onClick={onDelete}>
              Delete order
            </Button>
          </Card>
        )}
      </div>

      {/* ── Live summary (wide screens) ───────────────────────────────────── */}
      <aside className="hidden self-stretch xl:block">
        <div className="sticky top-10 space-y-4">
          <OrderSummary
            draft={draft}
            title={summaryTitle}
            sellerName={sellerName}
            missing={missing}
          />
          {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <Button type="submit" size="lg" fullWidth loading={saving} leftIcon={<Check />}>
            {saveLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" fullWidth onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </aside>

      {/* ── Save bar (phone, tablet and laptop) ────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-72 xl:hidden">
        <div className="mx-auto max-w-3xl">
          {error && <div className="mb-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" size="lg" className="px-4" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <button
              type="button"
              onClick={() => setReviewing(true)}
              className="flex h-14 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              <Eye width={18} height={18} />
              Review
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  done === CHECKS.length ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-500',
                )}
              >
                {done}/{CHECKS.length}
              </span>
            </button>
            <Button type="submit" size="lg" fullWidth loading={saving} leftIcon={<Check />}>
              {saveLabel}
              {price > 0 && !onCancel ? ` · ${formatIqd(price)}` : ''}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Review sheet (phone, tablet and laptop) ────────────────────────── */}
      {reviewing && (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Review the order">
          <div className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm" onClick={() => setReviewing(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-[sheet-up_0.22s_ease-out] flex-col rounded-t-3xl bg-card shadow-2xl lg:left-72">
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
            <div className="flex items-center gap-3 px-5 pb-2 pt-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-ink-900">
                  Review the order
                  <span dir="rtl" className="text-sm font-medium text-ink-400">
                    پێداچوونەوە
                  </span>
                </h2>
                <p className="text-sm text-ink-500">Check everything before you save.</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setReviewing(false)}
                className="grid size-10 place-items-center rounded-full text-ink-400 hover:bg-slate-100 hover:text-ink-700"
              >
                <X width={18} height={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              <OrderSummary draft={draft} title={summaryTitle} sellerName={sellerName} missing={missing} full />
            </div>
            <div className="mx-auto flex w-full max-w-3xl gap-2 border-t border-slate-100 px-4 py-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="whitespace-nowrap px-4"
                leftIcon={<Pencil width={16} height={16} />}
                onClick={() => setReviewing(false)}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="lg"
                fullWidth
                loading={saving}
                leftIcon={<Check />}
                onClick={() => {
                  setReviewing(false);
                  void submit();
                }}
              >
                {saveLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

/**
 * What the order will be saved as. The side panel shows it short; the review
 * sheet (`full`) shows every detail, long address and note included.
 */
function OrderSummary({
  draft,
  title,
  sellerName,
  missing,
  full = false,
}: {
  draft: Draft;
  title: string;
  sellerName: string;
  missing: Errors;
  full?: boolean;
}) {
  const price = priceNumber(draft.price);
  const done = CHECKS.filter((c) => !missing[c.key]).length;
  const later = !!draft.orderDay && draft.orderDay !== todayKey();
  const times = timesNumber(draft.timesBought);

  return (
    <Card className="overflow-hidden">
      <div className="bg-brand-600 px-5 py-4 text-white">
        <div className="text-xs font-bold uppercase tracking-wide text-white/70">{title}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">
          {price ? price.toLocaleString('en-US') : '0'}
          <span className="ml-1 text-sm font-semibold text-white/70">IQD</span>
        </div>
      </div>
      <dl className="space-y-3 px-5 py-4 text-sm">
        <SummaryRow
          full={full}
          label="Date"
          value={later ? format(parseISO(draft.orderDay), 'EEE, d MMM yyyy') : 'Today'}
          sub={later ? 'Added later' : undefined}
        />
        <SummaryRow
          full={full}
          label="Customer"
          value={draft.customerName}
          sub={[draft.customerPhone, full && draft.secondPhone].filter(Boolean).join(' · ')}
        />
        {full && <SummaryRow full label="Gender" value={draft.gender ? GENDER_LABEL[draft.gender].en : ''} />}
        <SummaryRow full={full} label="Deliver to" value={draft.city} sub={draft.address} />
        <SummaryRow full={full} label="Item" value={[draft.itemModel, draft.itemCategory].filter(Boolean).join(' · ')} />
        <SummaryRow
          full={full}
          label="Sold on"
          value={draft.platform}
          sub={[draft.shift && SHIFT_LABEL[draft.shift].en, purchaseText(times, '')].filter(Boolean).join(' · ')}
        />
        {full && draft.note.trim() && <SummaryRow full label="Note" value={draft.note.trim()} />}
        <SummaryRow full={full} label="Seller" value={sellerName} />
      </dl>
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-500">
          <span>Required details</span>
          <span className="tabular-nums">
            {done} / {CHECKS.length}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(done / CHECKS.length) * 100}%` }}
          />
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {CHECKS.map((c) => {
            const ok = !missing[c.key];
            return (
              <li
                key={c.key}
                className={cn('flex items-center gap-1.5', ok ? 'text-emerald-700' : full ? 'text-rose-600' : 'text-ink-400')}
              >
                {ok ? (
                  <Check width={13} height={13} />
                ) : (
                  <span className="inline-block size-[13px] rounded-full border border-current" />
                )}
                {c.label}
              </li>
            );
          })}
        </ul>
        {full && done < CHECKS.length && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
            Fill in the red ones before saving.
          </p>
        )}
      </div>
    </Card>
  );
}

function SummaryRow({ label, value, sub, full }: { label: string; value: string; sub?: string; full?: boolean }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-ink-400">{label}</dt>
      <dd className="min-w-0">
        <div
          dir="auto"
          className={cn(
            'text-left font-semibold',
            full ? 'whitespace-pre-line break-words' : 'truncate',
            value ? 'text-ink-900' : 'text-slate-300',
          )}
        >
          {value || '—'}
        </div>
        {sub && (
          <div dir="auto" className={cn('text-left text-xs text-ink-500', full ? 'break-words' : 'truncate')}>
            {sub}
          </div>
        )}
      </dd>
    </div>
  );
}
