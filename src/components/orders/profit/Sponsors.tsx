import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Megaphone, Pencil, Plus, Trash } from '@/components/icons';
import { PLATFORMS } from '@/services/orders/options';
import {
  DEFAULT_USD_RATE,
  sponsorDates,
  sponsorDays,
  sponsorInRange,
  sponsorIqd,
  sponsorPaid,
  westernDigits,
  type Sponsor,
  type SponsorCurrency,
  type SponsorInput,
} from '@/services/orders/profit';
import { cn } from '@/utils/cn';
import { iqd } from './parts';

/** The currency and dollar rate of the last sponsor, so the next starts the same. */
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
  const clean = westernDigits(value).replace(/٫/g, '.').replace(/[^\d.]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

const LENGTHS = [1, 3, 7, 14, 30] as const;

const fieldClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-card px-4 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

/**
 * Add or change one sponsor. Paid in dollars (as Meta and TikTok bill) or in
 * dinars; a date range spreads its cost over the days it ran, so a week-long
 * sponsor counts a seventh on each day.
 */
export function SponsorModal({
  open,
  sponsor,
  models,
  onClose,
  onSave,
}: {
  open: boolean;
  /** The one being changed; none for a new one. */
  sponsor: Sponsor | null;
  /** Model names, offered for "What it promoted". */
  models: string[];
  onClose: () => void;
  onSave: (input: SponsorInput, id?: string) => Promise<void>;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [platform, setPlatform] = useState('Instagram');
  const [currency, setCurrency] = useState<SponsorCurrency>('USD');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState(String(DEFAULT_USD_RATE));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [promoted, setPromoted] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (sponsor) {
      setPlatform(sponsor.platform);
      setCurrency(sponsor.currency);
      setAmount(String(sponsor.amount));
      setRate(String(sponsor.currency === 'USD' ? sponsor.rate : loadDefaults().rate));
      setStartDate(sponsor.startDate);
      setEndDate(sponsor.endDate);
      setPromoted(sponsor.promoted);
      setNote(sponsor.note);
    } else {
      const d = loadDefaults();
      setPlatform(d.platform);
      setCurrency(d.currency);
      setAmount('');
      setRate(String(d.rate));
      setStartDate(today);
      setEndDate(today);
      setPromoted('');
      setNote('');
    }
  }, [open, sponsor, today]);

  const value = parseAmount(amount);
  const rateValue = parseAmount(rate);
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate;
  const days = validDates ? sponsorDays({ startDate, endDate }) : 0;
  const total = sponsorIqd({ amount: value, currency, rate: rateValue });
  const length = validDates ? days : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(value > 0)) return setError('Write how much the sponsor cost.');
    if (currency === 'USD' && !(rateValue > 0)) return setError('Write the dollar rate: how many IQD one dollar was.');
    if (!validDates) {
      return setError(
        startDate && endDate ? 'The last day cannot be before the first day.' : 'Pick the first and last day it ran.',
      );
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          platform,
          startDate,
          endDate,
          amount: value,
          currency,
          rate: currency === 'USD' ? rateValue : 1,
          promoted,
          note,
        },
        sponsor?.id,
      );
      saveDefaults({ currency, rate: currency === 'USD' ? rateValue : loadDefaults().rate, platform });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the sponsor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sponsor ? 'Change sponsor' : 'Add a sponsor'}
      description="A paid post or ad. Its cost is taken off the profit, spread over the days it ran."
      className="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-900">Platform</span>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.filter((p) => p !== 'WhatsApp').map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-sm font-semibold transition',
                  platform === p
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-card text-ink-700 hover:bg-slate-50',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label="Cost">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-ink-400">
                {currency === 'USD' ? '$' : 'IQD'}
              </span>
              <input
                autoFocus
                inputMode="decimal"
                className={cn(fieldClass, 'text-lg font-bold tabular-nums', currency === 'USD' ? 'pl-9' : 'pl-14')}
                placeholder={currency === 'USD' ? '50' : '75,000'}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink-900">Paid in</span>
            <div className="flex h-12 rounded-xl bg-slate-100 p-1">
              {(['USD', 'IQD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn(
                    'rounded-lg px-4 text-sm font-semibold transition',
                    currency === c ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500',
                  )}
                >
                  {c === 'USD' ? 'Dollar $' : 'Dinar'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {currency === 'USD' && (
          <Field label="Dollar rate" hint="How many IQD one dollar was when you paid. Remembered for the next sponsor.">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-ink-400">
                $1 =
              </span>
              <input
                inputMode="numeric"
                className={cn(fieldClass, 'pl-14 pr-14 tabular-nums')}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-ink-400">
                IQD
              </span>
            </div>
          </Field>
        )}

        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day">
              <input
                type="date"
                className={fieldClass}
                value={startDate}
                onChange={(e) => {
                  const next = e.target.value;
                  // Keep the same length when the first day moves.
                  if (validDates && next) setEndDate(format(addDays(parseISO(next), days - 1), 'yyyy-MM-dd'));
                  setStartDate(next);
                }}
              />
            </Field>
            <Field label="Last day">
              <input
                type="date"
                className={fieldClass}
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-500">Ran for</span>
            {LENGTHS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={!startDate}
                onClick={() => setEndDate(format(addDays(parseISO(startDate), n - 1), 'yyyy-MM-dd'))}
                className={cn(
                  'h-7 rounded-full border px-2.5 text-xs font-semibold transition',
                  length === n
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-ink-600 hover:bg-slate-50',
                )}
              >
                {n === 1 ? '1 day' : `${n} days`}
              </button>
            ))}
          </div>
        </div>

        <Field label="What it promoted" hint="Optional — a model, a product or the page.">
          <input
            className={fieldClass}
            list="sponsor-models"
            dir="auto"
            placeholder="e.g. V.502"
            value={promoted}
            onChange={(e) => setPromoted(e.target.value)}
          />
          <datalist id="sponsor-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>

        <Field label="Note">
          <input
            className={fieldClass}
            dir="auto"
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {/* What it comes to, before saving. */}
        <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-violet-700">Taken off the profit</div>
          <div className="mt-1 text-2xl font-bold text-ink-900">
            {iqd(total)} <span className="text-sm font-semibold text-ink-500">IQD</span>
          </div>
          <div className="text-sm text-ink-500">
            {currency === 'USD' && value > 0 && `$${value.toLocaleString('en-US')} × ${iqd(rateValue)} · `}
            {days > 0 && (days === 1 ? 'on one day' : `${iqd(total / days)} IQD a day for ${days} days`)}
          </div>
        </div>

        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={saving}>
            {sponsor ? 'Save changes' : 'Add sponsor'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Every sponsor that ran on at least one day of the period, newest first,
 * with the part of it that the period carries.
 */
export function SponsorsCard({
  sponsors,
  from,
  to,
  total,
  onAdd,
  onEdit,
  onDelete,
}: {
  sponsors: Sponsor[];
  from: string;
  to: string;
  /** Sponsors in the period, in IQD. */
  total: number;
  onAdd: () => void;
  onEdit: (s: Sponsor) => void;
  onDelete: (s: Sponsor) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const inPeriod = useMemo(
    () =>
      sponsors
        .map((s) => ({ s, part: sponsorInRange(s, from, to) }))
        .filter(({ part }) => part.days > 0)
        .sort((a, b) => b.s.startDate.localeCompare(a.s.startDate) || b.s.createdAt.localeCompare(a.s.createdAt)),
    [sponsors, from, to],
  );
  const outside = sponsors.length - inPeriod.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <Megaphone width={20} height={20} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-ink-900">Sponsors</h3>
            <p className="text-sm text-ink-500">
              {inPeriod.length
                ? `${inPeriod.length} in this period · ${iqd(total)} IQD taken off the profit`
                : 'Every paid post or ad, taken off the profit'}
            </p>
          </div>
        </div>
        <Button onClick={onAdd} leftIcon={<Plus width={18} height={18} />}>
          Add sponsor
        </Button>
      </div>

      {inPeriod.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="font-semibold text-ink-700">No sponsors in this period</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Add each sponsored post or ad you paid for. A sponsor over several days is spread across them, so every
            period carries only its own share.
            {outside > 0 && ` ${outside} other ${outside === 1 ? 'sponsor is' : 'sponsors are'} in other periods.`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {inPeriod.map(({ s, part }) => {
            const full = sponsorIqd(s);
            const days = sponsorDays(s);
            const partial = part.days < days;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="h-10 w-1 shrink-0 rounded-full bg-violet-500" />
                <div className="min-w-0 flex-1 basis-52">
                  <div className="flex flex-wrap items-center gap-x-2 font-semibold text-ink-900">
                    {s.platform || 'Platform not set'}
                    {s.promoted && (
                      <span dir="auto" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                        {s.promoted}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ink-500">
                    {sponsorDates(s)} · {days === 1 ? '1 day' : `${days} days`}
                    {s.note && (
                      <span dir="auto" className="text-ink-400">
                        {' '}
                        · {s.note}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-ink-900">{iqd(full)} IQD</div>
                  <div className="text-xs text-ink-500">
                    {s.currency === 'USD' ? `${sponsorPaid(s)} × ${iqd(s.rate)}` : 'Paid in IQD'}
                  </div>
                  {partial && (
                    <div className="text-xs font-semibold text-violet-700">
                      {iqd(part.amount)} in this period · {part.days} of {days} days
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
                    aria-label="Change sponsor"
                    title="Change"
                    onClick={() => onEdit(s)}
                  >
                    <Pencil width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    aria-label="Delete sponsor"
                    title="Delete"
                    disabled={busy === s.id}
                    onClick={async () => {
                      if (!window.confirm(`Delete the ${s.platform || ''} sponsor of ${sponsorDates(s)} (${iqd(full)} IQD)?`)) return;
                      setBusy(s.id);
                      try {
                        await onDelete(s);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    <Trash width={16} height={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
