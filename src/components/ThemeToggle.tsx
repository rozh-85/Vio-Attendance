import { Monitor, Moon, Sun } from './icons';
import { useTheme, type ThemePref } from '@/services/theme';
import { cn } from '@/utils/cn';

const OPTIONS: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'Auto', Icon: Monitor },
];

/**
 * `segmented`: Light / Dark / Auto, for a sidebar or menu.
 * `icon`: one button that flips between light and dark, for a top bar.
 */
export function ThemeToggle({
  variant = 'segmented',
  className,
}: {
  variant?: 'segmented' | 'icon';
  className?: string;
}) {
  const { pref, resolved, setPref } = useTheme();

  if (variant === 'icon') {
    const next = resolved === 'dark' ? 'light' : 'dark';
    const Icon = resolved === 'dark' ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => setPref(next)}
        title={next === 'dark' ? 'Dark mode' : 'Light mode'}
        aria-label={next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode'}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-card text-ink-500 transition hover:bg-slate-50 hover:text-ink-900',
          className,
        )}
      >
        <Icon width={18} height={18} />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1', className)}
    >
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={pref === id}
          onClick={() => setPref(id)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition',
            pref === id ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900',
          )}
        >
          <Icon width={14} height={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
