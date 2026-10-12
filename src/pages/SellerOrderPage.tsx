import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/Logo';
import { Check, Logout, Plus } from '@/components/icons';
import {
  CATEGORIES,
  CITIES,
  GENDER_LABEL,
  PLATFORMS,
  PURCHASE_LABEL,
  SHIFT_LABEL,
  formatIqd,
  shiftAt,
} from '@/services/orders/options';
import { OrdersError, getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { NewSalesOrder, SellerSession } from '@/services/orders/types';
import { cn } from '@/utils/cn';

const SESSION_KEY = 'vio.sellerSession';
const DRAFT_KEY = 'vio.sellerOrderDraft';

/** The form keeps the price as typed text so "95,000" can show commas. */
interface Draft extends Omit<NewSalesOrder, 'totalPrice'> {
  price: string;
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
    purchase: 'first',
    shift: keep?.shift ?? shiftAt(),
    note: '',
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

const inputClass =
  'h-12 w-full rounded-xl border bg-white px-4 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/**
 * The page social media sellers use to log an order. It can only add: once
 * saved, an order goes to the owner's report and is never shown here — not
 * to the seller who took it, not to anyone else.
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
    <OrderForm
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

        {notice && (
          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>
        )}

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

type Errors = Partial<Record<'customerName' | 'customerPhone' | 'city' | 'address' | 'item' | 'price' | 'platform', string>>;

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  if (!draft.customerName.trim()) errors.customerName = 'Write the customer’s name.';
  if (draft.customerPhone.replace(/\D/g, '').length < 7) errors.customerPhone = 'Write a full phone number.';
  if (!draft.city.trim()) errors.city = 'Pick the city.';
  if (!draft.address.trim()) errors.address = 'Write the address for delivery.';
  if (!draft.itemModel.trim() && !draft.itemCategory.trim()) errors.item = 'Write the item model or its type.';
  if (priceNumber(draft.price) <= 0) errors.price = 'Write the total price.';
  if (!draft.platform) errors.platform = 'Pick where it was sold.';
  return errors;
}

function OrderForm({
  session,
  onSignOut,
  onExpired,
}: {
  session: SellerSession;
  onSignOut: () => void;
  onExpired: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => loadJson<Draft>(DRAFT_KEY) ?? emptyDraft());
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ orderNo: number; draft: Draft } | null>(null);
  const [otherCity, setOtherCity] = useState(() => !!draft.city && !(CITIES as readonly string[]).includes(draft.city));

  // Keep what is typed, so a reload or a call coming in loses nothing.
  useEffect(() => saveJson(DRAFT_KEY, draft), [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key === 'itemModel' || key === 'itemCategory' ? 'item' : key]: undefined }));
  };

  const price = priceNumber(draft.price);
  const firstName = useMemo(() => session.displayName.split(/\s+/)[0], [session.displayName]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validate(draft);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length) {
      setError('Some details are missing — see the red notes.');
      return;
    }
    setSaving(true);
    try {
      const { price: _typed, ...rest } = draft;
      const order: NewSalesOrder = {
        ...rest,
        customerName: rest.customerName.trim(),
        customerPhone: rest.customerPhone.trim(),
        secondPhone: rest.secondPhone.trim(),
        totalPrice: price,
      };
      const { orderNo } = await getOrdersStore().submitOrder(session.token, order);
      setSaved({ orderNo, draft });
      const next = emptyDraft({ platform: draft.platform, shift: draft.shift });
      setDraft(next);
      setOtherCity(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof OrdersError && err.code === 'SESSION_EXPIRED') onExpired();
      else setError(ordersErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Screen width="sm">
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Check width={32} height={32} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Order saved</h1>
          <p dir="rtl" className="text-ink-400">ئۆردەرەکە تۆمارکرا</p>
          <div className="mt-5 rounded-2xl bg-slate-50 px-5 py-4 text-left">
            <div className="text-xs font-bold uppercase tracking-wide text-ink-400">Order number</div>
            <div className="text-3xl font-bold tabular-nums text-ink-900">#{saved.orderNo}</div>
            <div className="mt-2 text-sm text-ink-600">
              <span dir="auto">{saved.draft.customerName}</span> ·{' '}
              <span dir="auto">{saved.draft.itemModel || saved.draft.itemCategory}</span> ·{' '}
              {formatIqd(priceNumber(saved.draft.price))}
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-500">
            Made a mistake? Tell your manager the order number to fix it.
          </p>
          <Button className="mt-6" size="lg" fullWidth leftIcon={<Plus />} onClick={() => setSaved(null)}>
            Add another order
          </Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen width="md">
      <div className="mb-5 flex items-center gap-3">
        <Logo size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">Hi, {firstName}</div>
          <div className="text-sm text-ink-500">New order · ئۆردەری نوێ</div>
        </div>
        <Button variant="ghost" size="sm" leftIcon={<Logout width={16} height={16} />} onClick={onSignOut}>
          Sign out
        </Button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 pb-28" noValidate>
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
            <div className="flex flex-wrap gap-2">
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
              className={cn(
                inputClass,
                'h-auto min-h-20 py-3',
                errors.address ? 'border-rose-400' : 'border-slate-200',
              )}
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
              className={cn(
                inputClass,
                'text-lg font-bold tabular-nums',
                errors.price ? 'border-rose-400' : 'border-slate-200',
              )}
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
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" className={chipClass(draft.platform === p)} onClick={() => set('platform', p)}>
                  {p}
                </button>
              ))}
            </div>
            <FieldError message={errors.platform} />
          </div>
          <div>
            <Label en="How many times has this customer bought?" ku="جاری چەندەمە کڕین دەکات؟" />
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(PURCHASE_LABEL) as (keyof typeof PURCHASE_LABEL)[]).map((p) => (
                <button key={p} type="button" className={chipClass(draft.purchase === p)} onClick={() => set('purchase', p)}>
                  {PURCHASE_LABEL[p].en}
                  <span dir="rtl" className="block text-xs font-medium opacity-75">
                    {PURCHASE_LABEL[p].ku}
                  </span>
                </button>
              ))}
            </div>
          </div>
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

        {/* Stays in reach of the thumb on a phone, under the last field on a laptop. */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <div className="mx-auto max-w-xl">
            {error && <div className="mb-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
            <Button type="submit" size="lg" fullWidth loading={saving} leftIcon={<Check />}>
              Save order{price > 0 ? ` · ${formatIqd(price)}` : ''}
            </Button>
          </div>
        </div>
      </form>
    </Screen>
  );
}
