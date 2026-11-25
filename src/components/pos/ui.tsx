import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type SelectHTMLAttributes, type SVGProps } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ChevronDown, X } from '@/components/icons';
import { latinDigits } from '@/services/repairs/logic';
import { photo } from '@/services/pos/items';
import { num } from '@/services/pos/logic';
import { VIO_MARK } from '@/services/pos/logo';
import type { PosText } from '@/services/pos/i18n';
import type { PosItem, SaleLine, SaleStatus } from '@/services/pos/types';
import { cn } from '@/utils/cn';

/** The pieces every POS screen is built from, in the app's own look. */

type Icon = (p: SVGProps<SVGSVGElement>) => ReactElement;

/** A text box. Sixteen pixels on a phone, so iPhone does not zoom in. */
export const field =
  'h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-card px-3.5 text-base text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 disabled:text-ink-400 sm:text-sm';

/** A list to choose from, with the same arrow on every screen and in every browser. */
export function SelectBox({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cn('relative block min-w-0', className)}>
      <select {...rest} className={cn(field, 'cursor-pointer appearance-none truncate pe-9 font-semibold')}>
        {children}
      </select>
      <ChevronDown width={16} height={16} className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
    </span>
  );
}

/** Latin text and figures inside a Kurdish line, in their own direction. */
export const ltrText = '[direction:ltr] [unicode-bidi:isolate]';

/** The official Vio® mark on its red tile. */
export function VioTile({ className }: { className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-xl bg-[#A5292B]', className)}>
      <svg viewBox={`0 0 ${VIO_MARK.width} ${VIO_MARK.height}`} className="w-[66%]" role="img" aria-label="Vio">
        <path fill="#fff" fillRule="evenodd" d={VIO_MARK.path} />
      </svg>
    </span>
  );
}

/** A product photo on its light ground, with nothing broken to look at when it cannot be loaded. */
export function Photo({ image, sizes = '64px', eager, className, pad = 'p-1.5' }: { image: string; sizes?: string; eager?: boolean; className?: string; pad?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const small = photo(image, 256);
  const large = photo(image, 640);
  return (
    <span className={cn('block shrink-0 overflow-hidden bg-[#f3f5f8]', pad, className)}>
      {image && !failed && (
        <img
          src={small}
          srcSet={small === large ? undefined : `${small} 256w, ${large} 640w`}
          sizes={sizes}
          width={256}
          height={256}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="size-full object-contain"
        />
      )}
    </span>
  );
}

/** The photo of a line; an item the owner added keeps its photo with the item. */
export const lineImage = (line: SaleLine, items: PosItem[]): string =>
  line.image || items.find((i) => i.id === line.itemId)?.image || '';

/** A quiet track with the chosen step lifted out of it. */
export function Segmented<T extends string>({ value, options, onChange, label, className, small, phone }: {
  value: T | null;
  options: { id: T; label: ReactNode }[];
  onChange: (id: T) => void;
  label: string;
  className?: string;
  small?: boolean;
  /** On a phone the steps stand in this many columns, all in sight. */
  phone?: 2 | 3 | 4;
}) {
  const track = useRef<HTMLDivElement>(null);
  // On a phone the track slides; the chosen step stays in sight.
  useEffect(() => {
    const el = track.current;
    const on = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && on && el.scrollWidth > el.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);
  return (
    <div ref={track} className={cn('min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      <div role="group" aria-label={label} className={cn('flex w-max min-w-full gap-0.5 rounded-xl bg-slate-100 p-1', phone && 'max-sm:grid max-sm:w-full', phone === 2 && 'max-sm:grid-cols-2', phone === 3 && 'max-sm:grid-cols-3', phone === 4 && 'max-sm:grid-cols-4')}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-lg font-semibold transition',
              small ? 'h-8 px-2.5 text-[13px]' : phone ? 'h-9 px-1 text-[13px] sm:px-3.5 sm:text-sm' : 'h-9 px-3.5 text-sm',
              value === o.id ? 'bg-raised text-ink-900 shadow-sm ring-1 ring-slate-200/80' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ICON_TONES = {
  grey: 'hover:bg-slate-100 hover:text-ink-900',
  blue: 'hover:bg-blue-50 hover:text-blue-600',
  amber: 'hover:bg-amber-50 hover:text-amber-700',
  green: 'hover:bg-emerald-50 hover:text-emerald-700',
  red: 'hover:bg-brand-50 hover:text-brand-700',
} as const;

/** A grey icon that takes its colour under the pointer. */
export function IconButton({ icon: I, label, tone = 'grey', onClick, disabled, className }: { icon: Icon; label: string; tone?: keyof typeof ICON_TONES; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg text-ink-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:cursor-not-allowed disabled:opacity-40',
        ICON_TONES[tone],
        className,
      )}
    >
      <I width={18} height={18} />
    </button>
  );
}

/** One summary card: a name, its icon, the number, and a line under it. */
export function SummaryCard({ label, icon: I, value, unit, note, accent, className }: { label: string; icon: Icon; value: string; unit?: string; note?: string; accent?: boolean; className?: string }) {
  return (
    <Card className={cn('min-w-0 p-3.5 sm:p-4 2xl:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-ink-500">{label}</span>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl sm:size-9', accent ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-ink-500')}>
          <I width={18} height={18} />
        </span>
      </div>
      <div className={cn('mt-1.5 flex items-baseline gap-x-1 whitespace-nowrap text-lg font-bold tabular-nums sm:mt-2 sm:gap-x-1.5 sm:text-2xl', accent ? 'text-brand-700' : 'text-ink-900')}>
        <span className={ltrText}>{value}</span>
        {unit && <span className="text-[11px] font-semibold text-ink-400 max-[22.5rem]:hidden sm:text-sm">{unit}</span>}
      </div>
      {note && <div className="mt-1 truncate text-[13px] text-ink-500 sm:text-sm">{note}</div>}
    </Card>
  );
}

const STATUS_TONE: Record<SaleStatus, 'success' | 'warning' | 'danger'> = { sold: 'success', part: 'warning', returned: 'danger', deleted: 'danger' };

export function StatusBadge({ status, t }: { status: SaleStatus; t: PosText }) {
  return <Badge tone={STATUS_TONE[status]} className="whitespace-nowrap">{t.statusName[status]}</Badge>;
}

/** − 2 + : the number can be typed too. */
export function Stepper({ value, min, max, onChange, t, disabled, wide }: { value: number; min: number; max: number; onChange: (n: number) => void; t: PosText; disabled?: boolean; /** Fills its column. */ wide?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  const step = cn('grid h-full shrink-0 place-items-center text-lg text-ink-500 transition hover:bg-slate-100 hover:text-ink-900 disabled:text-ink-300 disabled:hover:bg-transparent', wide ? 'w-8' : 'w-9');
  return (
    <div className={cn('flex h-10 overflow-hidden rounded-xl border border-slate-200 bg-card [direction:ltr] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30', wide ? 'w-full' : 'w-max')}>
      <button type="button" className={step} aria-label={t.less} disabled={disabled || value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <input
        aria-label={t.qty}
        inputMode="numeric"
        disabled={disabled}
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digits = latinDigits(e.target.value).replace(/\D/g, '').slice(0, 3);
          setText(digits);
          if (digits && Number(digits) >= min) set(Number(digits));
        }}
        onBlur={() => setText(String(value))}
        className={cn('h-full bg-transparent text-center text-base font-semibold tabular-nums text-ink-900 focus:outline-none sm:text-sm', wide ? 'w-0 min-w-0 flex-1' : 'w-9')}
      />
      <button type="button" className={step} aria-label={t.more} disabled={disabled || value >= max} onClick={() => set(value + 1)}>
        +
      </button>
    </div>
  );
}

const grouped = (digits: string): string => (digits ? Number(digits).toLocaleString('en-US') : '');

/**
 * A dinar amount: 75000 becomes 75,000 while it is typed, and the cursor stays
 * where it was. Kurdish digits are read too. What is left empty counts as 0
 * when `emptyIsZero`, else the amount before is put back.
 */
export function IqdInput({ value, onChange, label, max = 1_000_000_000, emptyIsZero, placeholder, className, disabled, onEnter }: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  max?: number;
  emptyIsZero?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const digitsBefore = useRef<number | null>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const shown = typing ? text : value || !emptyIsZero ? num(value) : '';

  useLayoutEffect(() => {
    const el = ref.current;
    if (digitsBefore.current === null || !el || document.activeElement !== el) return;
    let at = 0;
    for (let seen = 0; at < el.value.length && seen < digitsBefore.current; at++) if (/\d/.test(el.value[at])) seen++;
    el.setSelectionRange(at, at);
    digitsBefore.current = null;
  });

  return (
    <input
      ref={ref}
      className={cn(field, 'font-semibold tabular-nums [direction:ltr]', className)}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      disabled={disabled}
      value={shown}
      onFocus={(e) => {
        setText(value || !emptyIsZero ? num(value) : '');
        setTyping(true);
        const el = e.target;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => {
        const raw = latinDigits(e.target.value);
        const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
        digitsBefore.current = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D/g, '').length;
        setText(grouped(digits));
        if (digits) onChange(Math.min(max, Number(digits)));
        else if (emptyIsZero) onChange(0);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
      }}
      onBlur={() => setTyping(false)}
    />
  );
}

/** A name over its box, and what is wrong under it. */
export function Labelled({ label, error, children, className, group }: { label: string; error?: string; children: ReactNode; className?: string; /** Not one control, so not a label. */ group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cn('block min-w-0', className)}>
      <span className="mb-1.5 block truncate text-[13px] font-semibold text-ink-600">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-[13px] font-medium text-rose-600">{error}</span>}
    </Tag>
  );
}

/** Keeps Tab inside an open panel, closes it with Escape, and gives the focus back after. */
export function usePanel(onClose: () => void) {
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key !== 'Tab' || !box.current) return;
      const all = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), textarea, select')].filter((el) => el.offsetParent !== null);
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  return box;
}

/** A panel from the side of the same page; the whole screen on a phone. */
export function Drawer({ title, sub, label, onClose, closeLabel, children, footer }: { title: ReactNode; sub?: ReactNode; label: string; onClose: () => void; closeLabel: string; children: ReactNode; footer?: ReactNode }) {
  const box = usePanel(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]" onClick={onClose} />
      <section ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label} className="relative flex h-full w-full flex-col bg-card shadow-2xl outline-none sm:w-[35rem] sm:max-w-[94vw] sm:rounded-s-3xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-bold text-ink-900">{title}</div>
            {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
          </div>
          <button type="button" aria-label={closeLabel} title={closeLabel} onClick={onClose} className="-me-1.5 grid size-10 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:bg-slate-100 hover:text-ink-900">
            <X width={20} height={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <footer className="shrink-0 border-t border-slate-200 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:rounded-es-3xl sm:px-6">{footer}</footer>}
      </section>
    </div>
  );
}

/** A small dialog over the page. */
export function PosDialog({ title, hint, children, actions, onClose }: { title: string; hint?: string; children?: ReactNode; actions: ReactNode; onClose: () => void }) {
  const box = usePanel(onClose);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input')?.focus();
  }, [box]);
  return (
    <div className="fixed inset-0 z-[60] grid items-end justify-items-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-[2px]" onClick={onClose} />
      <section ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-6">
        <h2 className="text-xl font-bold text-ink-900">{title}</h2>
        {hint && <p className="mt-1.5 text-sm text-ink-500">{hint}</p>}
        {children && <div className="mt-5">{children}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-1">{actions}</div>
      </section>
    </div>
  );
}

/** A message inside a panel. */
export function Notice({ tone, children, className }: { tone: 'danger' | 'success' | 'warning'; children: ReactNode; className?: string }) {
  const tones = {
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm font-medium', tones[tone], className)}>
      {children}
    </div>
  );
}
