import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays, Search, X } from '@/components/icons';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import type { Employee } from '@/types';
import type { SessionRow } from './sessionRows';

type Hit =
  | { kind: 'employee'; id: string; title: string; sub: string; to: string }
  | { kind: 'session'; id: string; title: string; sub: string; to: string };

/**
 * One box for both: an employee opens their report, a session opens itself.
 * Enter goes to the first result.
 */
export function DashboardSearch({ employees, rows }: { employees: Employee[]; rows: SessionRow[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    const people: Hit[] = employees
      .filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.code.toLowerCase().includes(q) ||
          e.position.toLowerCase().includes(q) ||
          (digits.length >= 4 && e.phone.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 5)
      .map((e) => ({
        kind: 'employee',
        id: e.id,
        title: e.fullName,
        sub: [e.code, e.position].filter(Boolean).join(' · '),
        to: `${paths.employees}?employee=${encodeURIComponent(e.id)}`,
      }));
    const sessions: Hit[] = rows
      .filter((r) =>
        [r.session.supervisorName, r.session.title, format(r.day, 'd MMM yyyy EEEE'), r.session.location]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 5)
      .map((r) => ({
        kind: 'session',
        id: r.session.id,
        title: format(r.day, 'd MMM yyyy'),
        sub: `${r.session.supervisorName} · ${r.session.status === 'active' ? 'Active' : 'Closed'}`,
        to: paths.session(r.session.id),
      }));
    return [...people, ...sessions];
  }, [query, employees, rows]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const go = (hit: Hit) => {
    setOpen(false);
    navigate(hit.to);
  };

  return (
    <div ref={boxRef} className="relative w-full sm:w-72 xl:w-80 2xl:w-72 min-[1700px]:w-80">
      <Search
        width={17}
        height={17}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
      />
      <input
        type="search"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 [&::-webkit-search-cancel-button]:hidden"
        placeholder="Search employees, sessions…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (!hits.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => (i + 1) % hits.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => (i - 1 + hits.length) % hits.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(hits[active]);
          }
        }}
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQuery('')}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-slate-100 hover:text-ink-700"
        >
          <X width={15} height={15} />
        </button>
      )}

      {open && query.trim() && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-full min-w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {hits.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-ink-500">Nothing matches “{query.trim()}”.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto p-1.5">
              {hits.map((hit, i) => {
                const first = i === 0 || hits[i - 1].kind !== hit.kind;
                return (
                  <li key={`${hit.kind}-${hit.id}`}>
                    {first && (
                      <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                        {hit.kind === 'employee' ? 'Employees' : 'Sessions'}
                      </div>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                        i === active ? 'bg-slate-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold',
                          hit.kind === 'employee' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-ink-500',
                        )}
                      >
                        {hit.kind === 'employee' ? (
                          hit.title.charAt(0).toUpperCase()
                        ) : (
                          <CalendarDays width={15} height={15} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-900">{hit.title}</span>
                        <span className="block truncate text-xs text-ink-500">{hit.sub}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
