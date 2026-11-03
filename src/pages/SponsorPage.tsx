import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays, format, parseISO } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CalendarDays, Check, DollarSign, Megaphone, Tag, Trash } from '@/components/icons';
import { BackLink, LeaveNotice, LoadProblem, iqd } from '@/components/orders/profit/parts';
import { useProfitData } from '@/hooks/useProfitData';
import { PLATFORMS } from '@/services/orders/options';
import {
  DEFAULT_USD_RATE,
  sponsorDates,
  sponsorDays,
  sponsorIqd,
  westernDigits,
  type SponsorCurrency,
  type SponsorInput,
} from '@/services/orders/profit';
import { setProfitNotice } from '@/services/orders/profitMemory';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

/** The currency, rate and platform of the last sponsor saved, so the next starts the same. */
const DEFAULTS_KEY = 'vio.sponsorDefaults';

function loadDefaults(): { currency: SponsorCurrency; rate: number; platform: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null') as {
      currency?: SponsorCurrency;
      rate?: number;
      platform?: string;
    } | null;
    return {
      currency: saved?.currency === 'IQD' ? 'IQD' : 'USD',
      rate: saved?.rate && saved.rate > 0 ? saved.rate : DEFAULT_USD_RATE,
      platform: saved?.platform ?? 'Instagram',
    };
  } catch {
    return { currency: 'USD', rate: DEFAULT_USD_RATE, platform: 'Instagram' };
  }
}

function saveDefaults(value: { currency: SponsorCurrency; rate: number; platform: string }) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(value));
  } catch {
    // Not remembered this time.
  }
}

/** Typed money: digits and one decimal point, in any digits. */
function parseAmount(value: string): number {
  const n = Number(westernDigits(value).replace(/٫/g, '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const LENGTHS = [1, 3, 7, 14, 30] as const;
const SPONSOR_PLATFORMS = PLATFORMS.filter((p) => p !== 'WhatsApp');

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-card px-4 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

interface Form {
  platform: string;
  currency: SponsorCurrency;
  amount: string;
  rate: string;
  startDate: string;
  endDate: string;
  promoted: string;
  note: string;
}

function Section({ step, icon, title, children }: { step: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-700">{icon}</span>
        <h2 className="text-lg font-bold text-ink-900">{title}</h2>
        <span className="ml-auto text-xs font-bold uppercase tracking-wide text-ink-300">Step {step}</span>
      </div>
      {children}
    </Card>
  );
}

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink-900">
      {children}
      {hint && <span className="text-xs font-normal text-ink-400">{hint}</span>}
    </span>
  );
}

/** One square per day the sponsor ran, so its spread is plain to see. */
function DayStrip({ start, days }: { start: string; days: number }) {
  if (days < 1) return null;
  if (days > 62) return <p className="text-sm text-ink-500">{days} days.</p>;
  const first = parseISO(start);
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: days }, (_, i) => {
        const d = addDays(first, i);
        const newMonth = i === 0 || d.getDate() === 1;
        return (
          <span
            key={i}
            title={format(d, 'EEE d MMM')}
            className="grid h-9 w-8 place-items-center rounded-lg bg-[#7c3aed] text-[11px] font-bold leading-none text-white"
          >
            <span className="text-center">
              {newMonth && <span className="block text-[8px] font-semibold uppercase opacity-80">{format(d, 'MMM')}</span>}
              {format(d, 'd')}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Add or change one sponsor on its own page: where it ran, what it cost (in
 * dollars at a rate, or dinars), the days it ran and what it promoted. The
 * summary on the side shows what it takes off the profit as you type.
 */
export function SponsorPage() {
  const { sponsorId = 'new' } = useParams();
  const isNew = sponsorId === 'new';
  const navigate = useNavigate();
  const { orders, profit, error, loading, reload, update } = useProfitData();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const existing = !isNew && profit ? profit.sponsors.find((x) => x.id === sponsorId) ?? null : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sponsorId]);

  // Fill the form once, when the data is in; later refreshes leave it alone.
  useEffect(() => {
    if (form || !profit) return;
    let start: Form;
    if (existing) {
      start = {
        platform: existing.platform,
        currency: existing.currency,
        amount: String(existing.amount),
        rate: String(existing.currency === 'USD' ? existing.rate : loadDefaults().rate),
        startDate: existing.startDate,
        endDate: existing.endDate,
        promoted: existing.promoted,
        note: existing.note,
      };
    } else if (isNew) {
      const d = loadDefaults();
      start = { platform: d.platform, currency: d.currency, amount: '', rate: String(d.rate), startDate: today, endDate: today, promoted: '', note: '' };
    } else {
      return;
    }
    setForm(start);
    setInitial(start);
  }, [form, profit, existing, isNew, today]);

  const models = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders ?? []) if (o.itemModel.trim()) counts.set(o.itemModel.trim(), (counts.get(o.itemModel.trim()) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }, [orders]);

  const dirty = !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const goBack = () => {
    if (dirty) {
      setLeaving(true);
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(paths.profit);
  };

  if (error || loading || !profit || !form) {
    return (
      <AdminLayout>
        <BackLink label="Back to profit" onClick={() => navigate(paths.profit)} />
        <div className="mt-6">
          {error ? (
            <LoadProblem error={error} onRetry={() => void reload()} />
          ) : !loading && profit && !existing && !isNew ? (
            <p className="py-16 text-center text-ink-500">This sponsor was not found. It may have been deleted.</p>
          ) : (
            <p className="py-16 text-center text-ink-400">Loading…</p>
          )}
        </div>
      </AdminLayout>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setLeaving(false);
    setProblem(null);
  };

  const amount = parseAmount(form.amount);
  const rate = parseAmount(form.rate);
  const validDates =
    /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(form.endDate) && form.endDate >= form.startDate;
  const days = validDates ? sponsorDays(form) : 0;
  const total = sponsorIqd({ amount, currency: form.currency, rate });
  const platforms = [...new Set([...SPONSOR_PLATFORMS, form.platform].filter(Boolean))];

  async function save(): Promise<void> {
    if (!form) return;
    if (!(amount > 0)) return void setProblem('Write how much the sponsor cost.');
    if (form.currency === 'USD' && !(rate > 0)) return void setProblem('Write the dollar rate: how many IQD one dollar was.');
    if (!validDates) {
      return void setProblem(
        form.startDate && form.endDate ? 'The last day cannot be before the first day.' : 'Pick the first and last day it ran.',
      );
    }
    setSaving(true);
    setProblem(null);
    const input: SponsorInput = {
      platform: form.platform,
      startDate: form.startDate,
      endDate: form.endDate,
      amount,
      currency: form.currency,
      rate: form.currency === 'USD' ? rate : 1,
      promoted: form.promoted,
      note: form.note,
    };
    try {
      const saved = await getProfitStore().saveSponsor(input, existing?.id);
      update((d) => ({ ...d, sponsors: [saved, ...d.sponsors.filter((x) => x.id !== saved.id)] }));
      saveDefaults({ currency: form.currency, rate: form.currency === 'USD' ? rate : loadDefaults().rate, platform: form.platform });
      setProfitNotice(`${existing ? 'Sponsor saved' : 'Sponsor added'} · ${iqd(total)} IQD over ${days === 1 ? '1 day' : `${days} days`}`);
      navigate(paths.profit);
    } catch (err) {
      setProblem(profitErrorMessage(err));
      setLeaving(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    try {
      await getProfitStore().deleteSponsor(existing.id);
      update((d) => ({ ...d, sponsors: d.sponsors.filter((x) => x.id !== existing.id) }));
      setProfitNotice('Sponsor deleted');
      navigate(paths.profit);
    } catch (err) {
      setProblem(profitErrorMessage(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const deleteCard = (className: string) =>
    existing && (
      <Card className={cn('border-rose-100 p-4', className)}>
        {confirmDelete ? (
          <div>
            <div className="text-sm font-bold text-ink-900">Delete this sponsor for good?</div>
            <div className="text-sm text-ink-500">{iqd(sponsorIqd(existing))} IQD comes back into the profit.</div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button size="sm" variant="danger" loading={deleting} leftIcon={<Trash width={15} height={15} />} onClick={() => void remove()}>
                Yes, delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-bold text-ink-900">Delete this sponsor</div>
              <div className="text-ink-500">It stops counting against the profit.</div>
            </div>
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" leftIcon={<Trash width={16} height={16} />} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </div>
        )}
      </Card>
    );

  return (
    <AdminLayout>
      <div ref={topRef} className="scroll-mt-20">
        <BackLink label="Back to profit" onClick={goBack} />

        {leaving && dirty && (
          <div className="mt-4">
            <LeaveNotice text="This sponsor is not saved" saving={saving} onSave={() => void save()} onLeave={() => navigate(paths.profit)} onStay={() => setLeaving(false)} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-ink-900">{existing ? 'Sponsor' : 'Add a sponsor'}</h1>
          {existing && <Badge tone="note">{sponsorDates(existing)}</Badge>}
          {dirty && <Badge tone="warning">Not saved</Badge>}
        </div>
        <p className="mt-1 text-ink-500">A paid post or ad. Its cost is taken off the profit, shared over the days it ran.</p>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="space-y-4 pb-24 xl:pb-0">
          <Section step={1} icon={<Megaphone width={18} height={18} />} title="Where it ran">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {platforms.map((p) => {
                const on = form.platform === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('platform', p)}
                    aria-pressed={on}
                    className={cn(
                      'relative flex h-14 items-center justify-center rounded-2xl border-2 px-3 text-sm font-bold transition',
                      on ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 bg-card text-ink-700 hover:border-slate-300',
                    )}
                  >
                    {p}
                    {on && (
                      <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-[#7c3aed] text-white">
                        <Check width={10} height={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section step={2} icon={<DollarSign width={18} height={18} />} title="What it cost">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <Label>Amount paid</Label>
                <span className="relative block">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-ink-400">
                    {form.currency === 'USD' ? '$' : 'IQD'}
                  </span>
                  <input
                    autoFocus={isNew}
                    inputMode="decimal"
                    className={cn(fieldClass, 'text-xl font-bold tabular-nums', form.currency === 'USD' ? 'pl-9' : 'pl-14')}
                    placeholder={form.currency === 'USD' ? '50' : '75,000'}
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                  />
                </span>
              </label>
              <div>
                <Label>Paid in</Label>
                <div className="flex h-12 rounded-xl bg-slate-100 p-1">
                  {(['USD', 'IQD'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('currency', c)}
                      className={cn(
                        'flex-1 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition',
                        form.currency === c ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500',
                      )}
                    >
                      {c === 'USD' ? '$ Dollar' : 'IQD Dinar'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {form.currency === 'USD' && (
              <label className="mt-4 block">
                <Label hint="Remembered for the next sponsor">Dollar rate</Label>
                <span className="relative block sm:max-w-xs">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-ink-400">$1 =</span>
                  <input
                    inputMode="numeric"
                    className={cn(fieldClass, 'pl-14 pr-14 tabular-nums')}
                    value={form.rate}
                    onChange={(e) => set('rate', e.target.value)}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-ink-400">IQD</span>
                </span>
              </label>
            )}
          </Section>

          <Section step={3} icon={<CalendarDays width={18} height={18} />} title="When it ran">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <Label>First day</Label>
                <input
                  type="date"
                  className={fieldClass}
                  value={form.startDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    // Moving the first day keeps the same number of days.
                    if (validDates && next) set('endDate', format(addDays(parseISO(next), days - 1), 'yyyy-MM-dd'));
                    set('startDate', next);
                  }}
                />
              </label>
              <label className="block">
                <Label>Last day</Label>
                <input type="date" className={fieldClass} min={form.startDate} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm text-ink-500">Ran for</span>
              {LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={!form.startDate}
                  onClick={() => set('endDate', format(addDays(parseISO(form.startDate), n - 1), 'yyyy-MM-dd'))}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-semibold transition',
                    days === n ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-ink-600 hover:bg-slate-50',
                  )}
                >
                  {n === 1 ? '1 day' : `${n} days`}
                </button>
              ))}
            </div>
            {days > 0 && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
                  {days === 1 ? 'One day' : `${days} days`} · {iqd(total / days)} IQD each day
                </div>
                <DayStrip start={form.startDate} days={days} />
              </div>
            )}
          </Section>

          <Section step={4} icon={<Tag width={18} height={18} />} title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <Label hint="Optional">What it promoted</Label>
                <input
                  className={fieldClass}
                  list="sponsor-models"
                  dir="auto"
                  placeholder="e.g. V.502"
                  value={form.promoted}
                  onChange={(e) => set('promoted', e.target.value)}
                />
                <datalist id="sponsor-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <Label hint="Optional">Note</Label>
                <input className={fieldClass} dir="auto" placeholder="e.g. Winter heater post" value={form.note} onChange={(e) => set('note', e.target.value)} />
              </label>
            </div>
          </Section>

          {deleteCard('xl:hidden')}
        </div>

        {/* The summary leads on phones; on wide screens it stays beside the form. */}
        <aside className="order-first self-stretch xl:order-none">
          <div className="space-y-4 xl:sticky xl:top-6">
            <Card className="overflow-hidden">
              <div className="bg-linear-to-br from-[#7c3aed] to-[#5b21b6] px-5 py-5 text-white">
                <div className="text-xs font-bold uppercase tracking-wide text-white/70">Taken off the profit</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">{iqd(total)}</span>
                  <span className="text-sm font-semibold text-white/70">IQD</span>
                </div>
                <div className="mt-1 text-sm text-white/80">
                  {form.currency === 'USD' && amount > 0 ? `$${amount.toLocaleString('en-US')} × ${iqd(rate)}` : 'Paid in dinars'}
                </div>
              </div>
              <dl className="divide-y divide-slate-100 px-5 text-sm">
                {[
                  ['Platform', form.platform || '—'],
                  ['Days', days ? (days === 1 ? '1 day' : `${days} days`) : '—'],
                  ['Each day', days && total ? `${iqd(total / days)} IQD` : '—'],
                  ['Dates', validDates ? sponsorDates(form) : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 py-3">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right font-semibold text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <div className="hidden space-y-2 xl:block">
              {problem && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{problem}</div>}
              <Button type="submit" size="lg" fullWidth loading={saving} disabled={!dirty && !isNew} leftIcon={<Check />}>
                {existing ? (dirty ? 'Save changes' : 'No changes yet') : 'Add sponsor'}
              </Button>
              <Button type="button" variant="ghost" fullWidth onClick={goBack}>
                {dirty ? 'Cancel' : 'Back to profit'}
              </Button>
            </div>

            {deleteCard('hidden xl:block')}
          </div>
        </aside>

        {/* Save bar on phones, tablets and laptops; wide screens use the side panel. */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-card/95 px-4 py-3 backdrop-blur xl:hidden">
          <div className="mx-auto max-w-3xl">
            {problem && <div className="mb-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{problem}</div>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" className="px-4" onClick={goBack}>
                Back
              </Button>
              <Button type="submit" size="lg" fullWidth loading={saving} disabled={!dirty && !isNew} leftIcon={<Check />}>
                {existing ? (dirty ? `Save · ${iqd(total)} IQD` : 'No changes yet') : `Add sponsor · ${iqd(total)} IQD`}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
