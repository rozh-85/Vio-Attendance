import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Check, ChevronDown, Search } from '@/components/icons';
import { cn } from '@/utils/cn';

export interface MultiSelectOption {
  value: string;
  label: string;
}

const PANEL_WIDTH = 288;

/**
 * A filter button that opens a list of tick boxes. Nothing ticked means
 * every value; the button shows what is ticked, e.g. "Platform · Instagram +1".
 */
export function MultiSelect({
  label,
  options,
  selected,
  counts,
  onChange,
  searchable = false,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  /** Orders behind each value, with the other filters applied. */
  counts?: Map<string, number>;
  onChange: (values: string[]) => void;
  /** A search box at the top, for long lists like cities. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggleOpen() {
    // A button near the right edge opens its list leftwards, so it stays on screen.
    if (!open && ref.current) {
      const box = ref.current.getBoundingClientRect();
      setAlignRight(box.left + PANEL_WIDTH > window.innerWidth - 8);
    }
    setQuery('');
    setOpen((o) => !o);
  }

  const chosen = options.filter((o) => selected.includes(o.value));
  const summary =
    chosen.length === 0 ? null : chosen.length === 1 ? chosen[0].label : `${chosen[0].label} +${chosen.length - 1}`;
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'inline-flex h-9 max-w-[17rem] items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition',
          summary
            ? 'border-brand-600 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white text-ink-700 hover:border-slate-300 hover:bg-slate-50',
          open && !summary && 'border-slate-300 bg-slate-50',
        )}
      >
        <span className="shrink-0">{label}</span>
        {summary && (
          <>
            <span className="opacity-40">·</span>
            <span dir="auto" className="truncate">
              {summary}
            </span>
          </>
        )}
        <ChevronDown width={15} height={15} className={cn('shrink-0 opacity-60 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className={cn(
            'absolute top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-card p-2 shadow-xl',
            alignRight ? 'right-0' : 'left-0',
          )}
        >
          {searchable && (
            <label className="relative mb-2 block">
              <Search
                width={15}
                height={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                autoFocus
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder={`Find a ${label.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {shown.map((o) => {
              const on = selected.includes(o.value);
              const count = counts?.get(o.value) ?? 0;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50',
                    on && 'bg-brand-50/60 hover:bg-brand-50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md border transition',
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white',
                    )}
                  >
                    {on && <Check width={13} height={13} />}
                  </span>
                  <span
                    dir="auto"
                    className={cn(
                      'min-w-0 flex-1 truncate text-left font-medium',
                      count || on ? 'text-ink-900' : 'text-ink-400',
                    )}
                  >
                    {o.label}
                  </span>
                  {counts && <span className="text-xs tabular-nums text-ink-400">{count}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="px-3 py-4 text-sm text-ink-400">Nothing matches.</p>}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 px-1 pt-2">
            <button
              type="button"
              disabled={!selected.length}
              onClick={() => onChange([])}
              className="rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-500 transition hover:text-ink-900 disabled:opacity-40"
            >
              Clear
            </button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
