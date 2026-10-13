import { cn } from '@/utils/cn';

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Shown beside the switch. */
  label?: string;
  /** For a switch whose name is shown elsewhere. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      aria-label={ariaLabel ?? label}
      className="inline-flex shrink-0 items-center gap-3"
    >
      <span
        className={cn(
          'relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
      {label && (
        <span className="whitespace-nowrap text-left text-sm font-semibold text-ink-700">{label}</span>
      )}
    </button>
  );
}
