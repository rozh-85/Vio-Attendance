import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check } from '@/components/icons';
import { parseIqd } from '@/services/orders/profit';
import { cn } from '@/utils/cn';

/**
 * One colour per kind of money, the same on every chart, legend and list of
 * the Profit tab: slate is goods, violet is sponsors, emerald is profit, rose
 * is a loss, amber is sales whose cost is not known yet.
 */
export const MONEY = {
  sales: { bg: 'bg-ink-700', fill: 'fill-ink-700', label: 'Sales' },
  missing: { bg: 'bg-amber-400', fill: 'fill-amber-400', label: 'No cost yet' },
  goods: { bg: 'bg-slate-400', fill: 'fill-slate-400', label: 'Cost of goods' },
  sponsor: { bg: 'bg-violet-500', fill: 'fill-violet-500', label: 'Sponsors' },
  profit: { bg: 'bg-emerald-500', fill: 'fill-emerald-500', label: 'Profit' },
  loss: { bg: 'bg-rose-500', fill: 'fill-rose-500', label: 'Loss' },
} as const;

const MINUS = '−';

/** "1,250,000" */
export const iqd = (value: number) => Math.round(value).toLocaleString('en-US');

/** "+25,000" / "−25,000" — the sign always shown. */
export function signedIqd(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded).toLocaleString('en-US')}`;
}

/** "−1.2M" / "450K" for tight spots, with a real minus sign. */
export function shortIqd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs >= 1_000_000) return `${sign}${+(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${Math.round(abs)}`;
}

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** Profit green, loss red, as text that still says its sign. */
export const signTone = (value: number) =>
  value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-ink-500';

/**
 * An IQD amount typed in place: shows thousands commas, saves on Enter or
 * when it loses focus, and ticks for a moment once saved. Enter also moves
 * on to the next box in the same list, so a column of costs fills quickly.
 */
export function CostInput({
  value,
  onSave,
  placeholder = 'Set cost',
  label,
  className,
  disabled,
}: {
  value: number | null;
  /** null when the box was emptied. Rejecting puts the old value back. */
  onSave: (value: number | null) => Promise<void>;
  placeholder?: string;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? '' : iqd(value));
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const ref = useRef<HTMLInputElement>(null);
  /** Escape leaves the box without saving what was typed. */
  const cancelled = useRef(false);

  // A save elsewhere, or the 30-second refresh, shows here unless typing.
  useEffect(() => {
    if (!focused) setDraft(value === null ? '' : iqd(value));
  }, [value, focused]);

  useEffect(() => {
    if (state !== 'saved') return;
    const timer = window.setTimeout(() => setState('idle'), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function commit() {
    const next = parseIqd(draft);
    if (next === value) {
      setDraft(next === null ? '' : iqd(next));
      return;
    }
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
    } catch {
      setDraft(value === null ? '' : iqd(value));
      setState('error');
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      cancelled.current = true;
      ref.current?.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // The next box in the same list, else just leave this one.
    const list = ref.current?.closest('[data-cost-list]');
    const boxes = list ? [...list.querySelectorAll<HTMLInputElement>('input[data-cost-input]:not(:disabled)')] : [];
    const next = boxes[boxes.indexOf(ref.current as HTMLInputElement) + 1];
    if (next) next.focus();
    else ref.current?.blur();
  }

  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        data-cost-input
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          if (cancelled.current) {
            cancelled.current = false;
            setDraft(value === null ? '' : iqd(value));
            return;
          }
          void commit();
        }}
        onChange={(e) => {
          const n = parseIqd(e.target.value);
          setDraft(n === null ? '' : iqd(n));
          setState('idle');
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'h-10 w-full rounded-xl border bg-card pl-3 pr-12 text-right text-sm font-semibold tabular-nums text-ink-900 transition',
          'placeholder:font-normal placeholder:text-amber-700/80 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          value === null && !draft ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200',
          state === 'error' && 'border-rose-400',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-ink-400">
        {state === 'saving' ? (
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : state === 'saved' ? (
          <Check width={16} height={16} className="text-emerald-600" />
        ) : (
          'IQD'
        )}
      </span>
    </label>
  );
}

/** A small coloured key: swatch and words. */
export function Key({ tone, label }: { tone: keyof typeof MONEY; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
      <span className={cn('size-2.5 rounded-sm', MONEY[tone].bg)} />
      {label ?? MONEY[tone].label}
    </span>
  );
}
