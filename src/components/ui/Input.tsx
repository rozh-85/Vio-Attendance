import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

const baseField =
  'w-full rounded-xl border bg-white px-4 text-ink-900 placeholder:text-ink-400 ' +
  'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500';

function Label({ label, required }: { label?: string; required?: boolean }) {
  if (!label) return null;
  return (
    <span className="mb-1.5 block text-sm font-semibold text-ink-900">
      {label}
      {required && <span className="ml-0.5 text-rose-500">*</span>}
    </span>
  );
}

function Helper({ hint, error }: { hint?: string; error?: string }) {
  if (error) return <span className="mt-1.5 block text-sm text-rose-600">{error}</span>;
  if (hint) return <span className="mt-1.5 block text-sm text-ink-500">{hint}</span>;
  return null;
}

type InputProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, ...props },
  ref,
) {
  return (
    <label className="block">
      <Label label={label} required={required} />
      <input
        ref={ref}
        className={cn(
          baseField,
          'h-12',
          error ? 'border-rose-400' : 'border-slate-200',
          className,
        )}
        {...props}
      />
      <Helper hint={hint} error={error} />
    </label>
  );
});

type TextareaProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, required, className, ...props }, ref) {
    return (
      <label className="block">
        <Label label={label} required={required} />
        <textarea
          ref={ref}
          className={cn(
            baseField,
            'min-h-24 py-3',
            error ? 'border-rose-400' : 'border-slate-200',
            className,
          )}
          {...props}
        />
        <Helper hint={hint} error={error} />
      </label>
    );
  },
);
