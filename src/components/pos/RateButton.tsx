import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/Button';
import { Backspace, ChevronDown, DollarSign, Minus, Plus, X } from '@/components/icons';
import { posErrorMessage, type PosText } from '@/services/pos/i18n';
import { num } from '@/services/pos/logic';
import { cn } from '@/utils/cn';
import { IqdInput, Notice, ltrText, usePanel } from './ui';

/** Dinars for $100: one press moves it this much. */
const STEP = 250;
const MIN = 10_000;
const MAX = 10_000_000;
const WIDE = '(min-width: 768px)';

/** A computer or a tablet: a menu under the button. A phone: a sheet with its own keys. */
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** The dollar today, one rate for every till: in the top bar, and changed from there. */
export function RateButton({ rate, isSet, onSave, t, className }: {
  /** Dinars for $1. */
  rate: number;
  /** Someone has set it; else it is still the built-in one. */
  isSet: boolean;
  onSave: (rate: number) => Promise<void>;
  t: PosText;
  className?: string;
}) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const now = Math.round(rate * 100);
  const close = () => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={wrap} className={cn('relative shrink-0', className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t.dollar}: $100 = ${num(now)} IQD`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border ps-1.5 pe-2.5 text-sm transition sm:gap-2 md:pe-2',
          isSet ? 'border-slate-200 bg-card hover:bg-slate-50' : 'border-amber-300 bg-amber-50 hover:bg-amber-100',
          open && 'border-brand-300 ring-2 ring-brand-500/15',
        )}
      >
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', isSet ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-800')}>
          <DollarSign width={16} height={16} />
        </span>
        <span className={cn('tabular-nums', ltrText)}>
          <span className={cn('max-lg:hidden', isSet ? 'text-ink-500' : 'text-amber-800')}>$100 = </span>
          <b className={cn('font-semibold', isSet ? 'text-ink-900' : 'text-amber-900')}>{num(now)}</b>
          <span className={cn('text-xs font-medium max-sm:hidden', isSet ? 'text-ink-400' : 'text-amber-700')}> IQD</span>
        </span>
        <ChevronDown width={16} height={16} className={cn('shrink-0 text-ink-400 transition max-md:hidden', open && 'rotate-180')} />
      </button>
      {open &&
        (wide ? (
          <RateMenu now={now} onSave={onSave} onClose={close} wrap={wrap} t={t} />
        ) : (
          <RateSheet now={now} onSave={onSave} onClose={close} t={t} />
        ))}
    </div>
  );
}

/** What both ways of changing it share: the new rate, saving it, and what went wrong. */
function useRateForm(now: number, onSave: (rate: number) => Promise<void>, onDone: () => void, t: PosText) {
  const [value, setValue] = useState(now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const good = value >= MIN && value <= MAX;

  async function save() {
    if (!good || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(value / 100);
      onDone();
    } catch (err) {
      setError(posErrorMessage(err, t));
      setBusy(false);
    }
  }

  const change = (n: number) => {
    setValue(Math.max(0, Math.min(MAX * 10, n)));
    setError('');
  };
  return { value, change, busy, error, good, save };
}

/** $1 in dinars, and how far it moved from the rate in use. */
function RateFacts({ value, now, t, className }: { value: number; now: number; t: PosText; className?: string }) {
  const diff = value - now;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-medium text-ink-500', className)}>
      <span className={ltrText}>{t.dollarOne(num(value / 100))}</span>
      {diff !== 0 && value >= MIN ? (
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          {diff > 0 ? '▲' : '▼'} {diff > 0 ? t.rateUp(num(diff)) : t.rateDown(num(-diff))}
        </span>
      ) : (
        <span className="text-ink-400">
          {t.rateNow} <span className={ltrText}>{num(now)}</span>
        </span>
      )}
    </div>
  );
}

const stepButton =
  'grid size-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-card text-ink-600 transition hover:bg-slate-50 hover:text-ink-900 active:scale-95 disabled:opacity-40';

/** On a computer: a menu under the button, the box ready to type in. */
function RateMenu({ now, onSave, onClose, wrap, t }: {
  now: number;
  onSave: (rate: number) => Promise<void>;
  onClose: () => void;
  wrap: RefObject<HTMLDivElement | null>;
  t: PosText;
}) {
  const form = useRateForm(now, onSave, onClose, t);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    box.current?.querySelector('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    // A press anywhere else puts it away.
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setTimeout(() => closeRef.current());
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [wrap]);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={t.dollar}
      className="absolute end-0 top-full z-50 mt-2 w-[22rem] origin-top-right animate-[rate-pop_140ms_ease-out] rounded-2xl border border-slate-200 bg-card p-4 shadow-[0_16px_48px_-12px_rgb(15_23_42/0.28)] rtl:origin-top-left"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <DollarSign width={20} height={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-900">{t.dollar}</h2>
          <p className="truncate text-[13px] text-ink-500">{t.dollarField}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" aria-label={`− ${num(STEP)}`} className={stepButton} disabled={form.value - STEP < MIN} onClick={() => form.change(form.value - STEP)}>
          <Minus width={18} height={18} />
        </button>
        <IqdInput value={form.value} emptyIsZero max={MAX * 10} label={t.dollarField} className="h-12! text-center text-xl! font-bold!" onChange={form.change} onEnter={() => void form.save()} />
        <button type="button" aria-label={`+ ${num(STEP)}`} className={stepButton} disabled={form.value + STEP > MAX} onClick={() => form.change(form.value + STEP)}>
          <Plus width={18} height={18} />
        </button>
      </div>
      <RateFacts value={form.value} now={now} t={t} className="mt-2.5 justify-center" />

      {form.error && (
        <Notice tone="danger" className="mt-3">
          {form.error}
        </Notice>
      )}
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-ink-400">{t.dollarHint}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onClose}>
          {t.cancel}
        </Button>
        <Button disabled={!form.good} loading={form.busy} onClick={() => void form.save()}>
          {t.saveRate}
        </Button>
      </div>
    </div>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const;

/** On a phone: a sheet from the bottom with big keys, so no keyboard covers it. */
function RateSheet({ now, onSave, onClose, t }: { now: number; onSave: (rate: number) => Promise<void>; onClose: () => void; t: PosText }) {
  const form = useRateForm(now, onSave, onClose, t);
  const box = usePanel(onClose);
  // The first key starts a new number; after that, keys add to it.
  const [fresh, setFresh] = useState(true);

  const press = (key: (typeof KEYS)[number]) => {
    if (form.busy) return;
    if (key === 'back') {
      form.change(fresh ? 0 : Math.floor(form.value / 10));
    } else {
      const digits = `${fresh ? '' : form.value || ''}${key}`.replace(/^0+/, '').slice(0, 8);
      form.change(Number(digits || 0));
    }
    setFresh(false);
  };
  const nudge = (by: number) => {
    form.change(Math.max(0, form.value + by));
    setFresh(true);
  };

  // A keyboard, if there is one, types here too.
  const pressRef = useRef(press);
  pressRef.current = press;
  const saveRef = useRef(form.save);
  saveRef.current = form.save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) pressRef.current(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') pressRef.current('back');
      else if (e.key === 'Enter') void saveRef.current();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      <div className="absolute inset-0 animate-[rate-fade_160ms_ease-out] bg-[#0f172a]/45 backdrop-blur-[2px]" onClick={onClose} />
      <section
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t.dollar}
        className="relative w-full animate-[rate-up_220ms_cubic-bezier(0.2,0.9,0.3,1)] rounded-t-[1.75rem] bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5 shadow-2xl outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <header className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <DollarSign width={20} height={20} />
          </span>
          <h2 className="min-w-0 flex-1 text-lg font-bold text-ink-900">{t.dollar}</h2>
          <button type="button" aria-label={t.close} onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-slate-100 hover:text-ink-900">
            <X width={20} height={20} />
          </button>
        </header>

        <div className="mt-3 rounded-2xl bg-slate-50 px-4 pb-3.5 pt-3 text-center">
          <div className="text-[13px] font-semibold text-ink-500">{t.dollarField}</div>
          <div className={cn('mt-1 flex items-baseline justify-center gap-1.5', ltrText)} aria-live="polite">
            <span className={cn('rounded-lg px-1 text-[2.5rem] font-bold leading-tight tabular-nums text-ink-900', fresh && 'bg-brand-100/70', !form.good && form.value > 0 && 'text-rose-600')}>
              {form.value ? num(form.value) : '0'}
              {!fresh && <span className="ms-0.5 inline-block h-8 w-0.5 translate-y-0.5 animate-pulse bg-brand-500 align-middle" />}
            </span>
            <span className="text-sm font-semibold text-ink-400">IQD</span>
          </div>
          <RateFacts value={form.value} now={now} t={t} className="mt-1.5 justify-center" />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2" dir="ltr">
          {[-1000, -STEP, STEP, 1000].map((by) => (
            <button
              key={by}
              type="button"
              onClick={() => nudge(by)}
              disabled={form.value + by < MIN || form.value + by > MAX}
              className="h-10 rounded-xl border border-slate-200 text-sm font-semibold tabular-nums text-ink-700 transition active:scale-95 active:bg-slate-100 disabled:opacity-40"
            >
              {by > 0 ? '+' : '−'}
              {num(Math.abs(by))}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2" dir="ltr">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key === 'back' ? t.deleteDigit : key}
              onClick={() => press(key)}
              className={cn(
                'grid h-14 place-items-center rounded-2xl text-2xl font-semibold tabular-nums transition active:scale-95',
                key === 'back' ? 'text-ink-500 active:bg-slate-100' : 'bg-slate-100 text-ink-900 active:bg-slate-200',
                key === '000' && 'text-xl',
              )}
            >
              {key === 'back' ? <Backspace width={24} height={24} /> : key}
            </button>
          ))}
        </div>

        {form.error && (
          <Notice tone="danger" className="mt-3">
            {form.error}
          </Notice>
        )}
        <Button size="lg" fullWidth className="mt-3" disabled={!form.good} loading={form.busy} onClick={() => void form.save()}>
          {t.saveRate}
        </Button>
      </section>
    </div>
  );
}
