import { cn } from '@/utils/cn';

/** Shared by the seller's order form and its model picker. */
export const inputClass =
  'h-12 w-full rounded-xl border bg-card px-4 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

/** A label in English with the Kurdish the sellers know from the old form. */
export function Label({ en, ku, required, className }: { en: string; ku: string; required?: boolean; className?: string }) {
  return (
    <span className={cn('mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink-900', className)}>
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

export function FieldError({ message }: { message?: string }) {
  return message ? <span className="mt-1.5 block text-sm text-rose-600">{message}</span> : null;
}
