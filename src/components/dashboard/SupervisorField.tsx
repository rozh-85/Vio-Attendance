import { useId, useState } from 'react';
import { ChevronDown, User } from '@/components/icons';
import { cn } from '@/utils/cn';

/**
 * The supervisor's name: typed, or picked from the people who ran sessions
 * before. A plain text field underneath, so a new name is just typed.
 */
export function SupervisorField({
  value,
  onChange,
  names,
}: {
  value: string;
  onChange: (value: string) => void;
  names: string[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const q = value.trim().toLowerCase();
  // The full list when the field holds a name from it, so another can be picked.
  const exact = names.some((n) => n.toLowerCase() === q);
  const shown = (exact || !q ? names : names.filter((n) => n.toLowerCase().includes(q))).slice(0, 8);

  return (
    <div className="relative">
      <User
        width={18}
        height={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
      />
      <input
        className="h-12 w-full rounded-xl border border-slate-200 bg-card pl-11 pr-10 text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        placeholder="Sara Ahmed"
        value={value}
        required
        autoComplete="off"
        role="combobox"
        aria-label="Supervisor name"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show supervisors"
        className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:text-ink-700"
        onMouseDown={(e) => {
          // Keep the focus in the field; the list opens with it.
          e.preventDefault();
          const input = e.currentTarget.parentElement?.querySelector('input');
          if (document.activeElement === input) setOpen((o) => !o);
          else input?.focus();
        }}
      >
        <ChevronDown width={18} height={18} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-raised p-1.5 shadow-xl"
        >
          <li className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
            Recent supervisors
          </li>
          {shown.map((name) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={name.toLowerCase() === q}
                // mousedown, so the pick lands before the field loses focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(name);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink-700 hover:bg-slate-50',
                  name.toLowerCase() === q && 'bg-brand-50 text-brand-700 hover:bg-brand-50',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-ink-500">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
