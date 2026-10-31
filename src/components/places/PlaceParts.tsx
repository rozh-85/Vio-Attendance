import { useState, type FormEvent, type ReactNode } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CalendarDays, Clock, MapPin, Phone, Search, User } from '@/components/icons';
import { baghdadDay, reminderDay, type Place, type PlaceCall, type PlaceInput } from '@/services/places/types';
import { formatIqd, STATUS_LABEL } from '@/services/orders/options';
import { cn } from '@/utils/cn';

/** Pieces shared by Gashben's own places page and the owner's report, so both look alike. */

export const PLACE_KINDS = ['Hotel', 'School', 'Restaurant', 'Office', 'Clinic', 'Shop', 'Other'];

export function callStatus(place: Place): { tone: 'danger' | 'warning' | 'neutral'; label: string; days: number } {
  const days = differenceInCalendarDays(parseISO(reminderDay(place)), parseISO(baghdadDay()));
  if (days < 0) return { tone: 'danger', label: `Overdue ${-days} ${days === -1 ? 'day' : 'days'}`, days };
  if (days === 0) return { tone: 'warning', label: 'Call today', days };
  return { tone: 'neutral', label: `In ${days} ${days === 1 ? 'day' : 'days'}`, days };
}

export function isDue(place: Place): boolean {
  return reminderDay(place) <= baghdadDay();
}

export function NextCall({ place }: { place: Place }) {
  const status = callStatus(place);
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={status.tone}>{status.label}</Badge>
      <span className="text-xs text-ink-400">
        {reminderDay(place)} · {place.reminder_date ? 'Manual' : 'Auto 30 days'}
      </span>
    </div>
  );
}

const statTones = {
  neutral: 'bg-card border-slate-200 text-ink-900',
  success: 'bg-emerald-50/70 border-emerald-100 text-emerald-700',
  info: 'bg-brand-50/70 border-brand-100 text-brand-700',
  danger: 'bg-rose-50/70 border-rose-100 text-rose-700',
};

export function PlacesStats({ items }: { items: { label: string; value: number | string; tone?: 'neutral' | 'danger' | 'info' | 'success' }[] }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', items.length > 3 ? 'lg:grid-cols-4' : 'sm:grid-cols-3')}>
      {items.map((item) => (
        <div key={item.label} className={cn('rounded-2xl border p-4 sm:p-5', statTones[item.tone ?? 'neutral'])}>
          <div className="break-words text-xl font-bold tabular-nums sm:text-2xl xl:text-3xl">{item.value}</div>
          <div className="mt-1 text-sm font-medium text-ink-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Search, All/Due filter and Table/Calendar switch, in one row. */
export function PlacesToolbar({
  query,
  onQuery,
  dueOnly,
  onDueOnly,
  dueCount,
  view,
  onView,
  children,
}: {
  query: string;
  onQuery: (q: string) => void;
  dueOnly: boolean;
  onDueOnly: (due: boolean) => void;
  dueCount: number;
  view: 'table' | 'calendar';
  onView: (v: 'table' | 'calendar') => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search places</span>
        <Search width={18} height={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-card pl-10 pr-4 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          placeholder="Search place, contact, phone or city…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={dueOnly ? 'due' : 'all'}
          onChange={(v) => onDueOnly(v === 'due')}
          options={[
            { id: 'all', label: 'All' },
            { id: 'due', label: `Calls due${dueCount ? ` · ${dueCount}` : ''}` },
          ]}
        />
        <Segmented
          value={view}
          onChange={(v) => onView(v as 'table' | 'calendar')}
          options={[
            { id: 'table', label: 'Table' },
            { id: 'calendar', label: 'Calendar' },
          ]}
        />
        {children}
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options }: { value: string; onChange: (id: string) => void; options: { id: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === o.id ? 'bg-card text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The top of a place's profile: who to call, where, and when next. */
export function PlaceProfileHeader({ place, actions }: { place: Place; actions: ReactNode }) {
  const facts = [
    { icon: User, label: 'Contact person', value: place.person_name },
    { icon: Phone, label: 'Phone number', value: <a className="text-brand-700 hover:underline" href={`tel:${place.phone}`}>{place.phone}</a> },
    { icon: MapPin, label: 'City', value: place.city },
    { icon: CalendarDays, label: 'Next call', value: <NextCall place={place} /> },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <Badge tone="info">{place.kind}</Badge>
          <h2 className="mt-2 break-words text-2xl font-bold text-ink-900 sm:text-3xl">{place.name}</h2>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-100 lg:grid-cols-4">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex flex-col gap-2 bg-card p-4 sm:flex-row sm:gap-3 sm:p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon width={17} height={17} />
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
              <dd className="mt-1 break-words font-semibold text-ink-900">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
}

interface OrderRow { id: string; orderNo: number; createdAt: string; customerName: string; itemModel: string; itemCategory: string; totalPrice: number; status: keyof typeof STATUS_LABEL }

export function PlaceOrdersCard({ orders, empty, action }: { orders: OrderRow[]; empty: string; action?: ReactNode }) {
  const total = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-lg font-bold text-ink-900">Orders for this place</h3>
          <p className="text-sm text-ink-500">{orders.length} {orders.length === 1 ? 'order' : 'orders'} · {formatIqd(total)}</p>
        </div>
        {action}
      </div>
      {orders.length ? (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>{['Order', 'Date', 'Customer', 'Item', 'Total', 'Status'].map((h) => <th key={h} className={cn('px-5 py-3 font-semibold', h === 'Total' && 'text-right')}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100">
                    <td className="px-5 py-3.5 font-semibold tabular-nums">#{o.orderNo}</td>
                    <td className="px-5 py-3.5 text-ink-500">{baghdadDay(new Date(o.createdAt))}</td>
                    <td className="px-5 py-3.5" dir="auto">{o.customerName}</td>
                    <td className="px-5 py-3.5" dir="auto">{o.itemModel || o.itemCategory}</td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">{formatIqd(o.totalPrice)}</td>
                    <td className="px-5 py-3.5"><Badge>{STATUS_LABEL[o.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 sm:hidden">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="font-semibold">#{o.orderNo} · <span dir="auto">{o.itemModel || o.itemCategory}</span></div>
                  <div className="text-xs text-ink-500">{baghdadDay(new Date(o.createdAt))} · {STATUS_LABEL[o.status]}</div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{formatIqd(o.totalPrice)}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="border-t border-slate-100 p-5 text-ink-500">{empty}</p>
      )}
    </Card>
  );
}

export function CallHistory({ calls }: { calls: PlaceCall[] }) {
  const sorted = [...calls].sort((a, b) => b.called_at.localeCompare(a.called_at));
  return (
    <Card className="p-5">
      <h3 className="text-lg font-bold text-ink-900">Call history</h3>
      {sorted.length ? (
        <ol className="mt-4 space-y-4 border-l-2 border-slate-100 pl-4">
          {sorted.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-card bg-brand-500" />
              <p className="text-sm font-semibold text-ink-900">{new Date(c.called_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="whitespace-pre-wrap text-sm text-ink-500" dir="auto">{c.note || 'Call completed'}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-ink-500">No calls recorded yet.</p>
      )}
    </Card>
  );
}

/**
 * The reminder choice offered everywhere: leave it automatic (30 days after
 * the latest call or order) or pick the day by hand.
 */
export function ReminderChoice({ value, onChange, label }: { value: string | null; onChange: (date: string | null) => void; label: string }) {
  const [manual, setManual] = useState(!!value);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</span>
      <Segmented
        value={manual ? 'manual' : 'auto'}
        onChange={(v) => { setManual(v === 'manual'); if (v === 'auto') onChange(null); }}
        options={[
          { id: 'auto', label: 'Automatic · 30 days' },
          { id: 'manual', label: 'Pick a date' },
        ]}
      />
      {manual ? (
        <Input className="mt-2" type="date" value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label={label} />
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-500"><Clock width={14} height={14} /> You'll be reminded 30 days after the latest call or order.</p>
      )}
    </div>
  );
}

export function RecordCallCard({ onSave }: { onSave: (note: string, nextDate: string | null) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(note, nextDate); setNote(''); setNextDate(null); setResetKey((k) => k + 1); } finally { setBusy(false); }
  }
  return (
    <Card className="p-5">
      <h3 className="text-lg font-bold text-ink-900">Record a call</h3>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Textarea label="Call notes" placeholder="What did they say?" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <ReminderChoice key={resetKey} label="Next call" value={nextDate} onChange={setNextDate} />
        <Button type="submit" fullWidth loading={busy} leftIcon={<Phone width={16} height={16} />}>Mark as called</Button>
      </form>
    </Card>
  );
}

/** Add or change a place, in a dialog. */
export function PlaceEditorModal({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: Place | null;
  onSave: (input: PlaceInput) => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit place' : 'Add a place'} description="Hotel, school, office… and who to call there." className="max-w-xl">
      {open && <PlaceForm key={initial?.id ?? 'new'} initial={initial ?? undefined} onSave={onSave} onCancel={onClose} />}
    </Modal>
  );
}

function PlaceForm({ initial, onSave, onCancel }: { initial?: Place; onSave: (input: PlaceInput) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PlaceInput>(
    initial
      ? { name: initial.name, person_name: initial.person_name, phone: initial.phone, city: initial.city, kind: initial.kind, reminder_date: initial.reminder_date }
      : { name: '', person_name: '', phone: '', city: '', kind: 'Hotel', reminder_date: null },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (![form.person_name, form.name, form.phone, form.city, form.kind].every((v) => v.trim())) {
      setError('Fill in the person, place name, phone, city and type.');
      return;
    }
    setBusy(true);
    setError('');
    try { await onSave(form); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save place.'); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Place name" required placeholder="e.g. Rotana Hotel" maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Person name" required placeholder="Who to talk to" maxLength={200} value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
        <Input label="Phone number" required type="tel" inputMode="tel" placeholder="07xx xxx xxxx" maxLength={50} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d+\s]/g, '') })} />
        <Input label="City" required maxLength={200} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink-900">Place type<span className="ml-0.5 text-rose-500">*</span></span>
        <div className="flex flex-wrap gap-2">
          {PLACE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={form.kind === kind}
              onClick={() => setForm({ ...form, kind })}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
                form.kind === kind ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-ink-700 hover:bg-slate-50',
              )}
            >
              {kind}
            </button>
          ))}
        </div>
        {!PLACE_KINDS.includes(form.kind) || form.kind === 'Other' ? (
          <Input className="mt-2" placeholder="Type the place type" maxLength={100} value={form.kind === 'Other' ? '' : form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value || 'Other' })} aria-label="Other place type" />
        ) : null}
      </div>
      <ReminderChoice label="Call reminder" value={form.reminder_date} onChange={(reminder_date) => setForm({ ...form, reminder_date })} />
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy}>Save place</Button>
      </div>
    </form>
  );
}
