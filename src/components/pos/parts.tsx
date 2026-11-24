import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { latinDigits } from '@/services/repairs/logic';
import { photo } from '@/services/pos/items';
import { num } from '@/services/pos/logic';
import { VIO_MARK } from '@/services/pos/logo';
import type { PosText } from '@/services/pos/i18n';
import type { PosItem, SaleLine } from '@/services/pos/types';
import { cn } from '@/utils/cn';

/** The official Vio® mark. */
export function VioMark({ color = '#fff' }: { color?: string }) {
  return (
    <svg viewBox={`0 0 ${VIO_MARK.width} ${VIO_MARK.height}`} role="img" aria-label="Vio">
      <path fill={color} fillRule="evenodd" d={VIO_MARK.path} />
    </svg>
  );
}

/** A photo with nothing broken to look at when it cannot be loaded. */
export function Photo({ image, alt = '', sizes, eager }: { image: string; alt?: string; sizes?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  if (!image || failed) return null;
  const small = photo(image, 256);
  const large = photo(image, 640);
  return (
    <img
      src={small}
      srcSet={small === large ? undefined : `${small} 256w, ${large} 640w`}
      sizes={sizes}
      width={256}
      height={256}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

/** The photo of a line; an item the owner added keeps its photo with the item. */
export const lineImage = (line: SaleLine, items: PosItem[]): string =>
  line.image || items.find((i) => i.id === line.itemId)?.image || '';

/** Dialog on top of the till: Escape closes it, and the focus stays inside. */
export function PosDialog({ title, hint, children, actions, onClose }: { title: string; hint?: string; children?: ReactNode; actions: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = ref.current;
    box?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key !== 'Tab' || !box) return;
      const all = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select')];
      if (!all.length) return;
      const first = all[0];
      const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, []);

  return (
    <div className="pos-shade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="pos-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
        {children && <div className="pos-dialog-body">{children}</div>}
        <div className="pos-dialog-do">{actions}</div>
      </div>
    </div>
  );
}

/** − 2 + : the number can be typed too. */
export function Stepper({ value, min, max, onChange, t }: { value: number; min: number; max: number; onChange: (n: number) => void; t: PosText }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="pos-step">
      <button type="button" aria-label={t.less} disabled={value <= min} onClick={() => set(value - 1)}>
        −
      </button>
      <input
        aria-label={t.qty}
        inputMode="numeric"
        value={text}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digits = latinDigits(e.target.value).replace(/\D/g, '').slice(0, 3);
          setText(digits);
          if (digits && Number(digits) >= min) set(Number(digits));
        }}
        onBlur={() => setText(String(value))}
      />
      <button type="button" aria-label={t.more} disabled={value >= max} onClick={() => set(value + 1)}>
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
export function IqdInput({ value, onChange, label, max = 1_000_000_000, emptyIsZero, placeholder, className, id, onEnter }: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  max?: number;
  emptyIsZero?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
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
      id={id}
      className={cn('pos-input pos-iqd', className)}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      dir="ltr"
      placeholder={placeholder}
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
