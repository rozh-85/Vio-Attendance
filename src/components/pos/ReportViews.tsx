import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { ChevronDown, ChevronUp } from '@/components/icons';
import { categoryName } from '@/services/pos/items';
import { num, showDay } from '@/services/pos/logic';
import type { ItemRow, Report } from '@/services/pos/report';
import type { PosItem } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { Photo } from './ui';

const th = 'whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold text-ink-500 first:pl-5 last:pr-5';
const td = 'px-3 py-3 align-middle first:pl-5 last:pr-5';

type SortKey = 'code' | 'sold' | 'returned' | 'discount' | 'net';

/** Which items were sold, how many, and the money they brought in. */
export function ItemsCard({ report, items, onPick }: { report: Report; items: PosItem[]; onPick: (itemId: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: 'net', up: false });
  const rows = useMemo(() => {
    const by = (a: ItemRow, b: ItemRow) => (sort.key === 'code' ? a.code.localeCompare(b.code, 'en', { numeric: true }) : a[sort.key] - b[sort.key]);
    return [...report.items].sort((a, b) => (sort.up ? by(a, b) : by(b, a)));
  }, [report.items, sort]);
  const most = Math.max(1, ...report.items.map((r) => r.net));
  const image = (r: ItemRow) => r.image || items.find((i) => i.id === r.itemId)?.image || '';
  const name = (r: ItemRow) => [r.name, r.color].filter(Boolean).join(' · ');
  const share = (r: ItemRow) => `${(r.share * 100).toFixed(r.share > 0 && r.share < 0.1 ? 1 : 0)}%`;

  const head = (key: SortKey, label: string, right = true) => {
    const on = sort.key === key;
    const Arrow = on && sort.up ? ChevronUp : ChevronDown;
    return (
      <th className={cn(th, right && 'text-right!')} aria-sort={on ? (sort.up ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => setSort((s) => ({ key, up: s.key === key ? !s.up : key === 'code' }))} className={cn('inline-flex items-center gap-1 transition hover:text-ink-900', on && 'text-ink-900')}>
          {label}
          <Arrow width={14} height={14} className={on ? '' : 'opacity-30'} />
        </button>
      </th>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h3 className="font-bold text-ink-900">Items sold</h3>
        <span className="text-sm text-ink-500">{rows.length} {rows.length === 1 ? 'item' : 'items'}, press one to see only it</span>
      </div>

      <table className="hidden w-full border-t border-slate-100 lg:table">
        <thead className="border-b border-slate-200 bg-slate-50/70">
          <tr>
            {head('code', 'Item', false)}
            <th className={cn(th, 'hidden xl:table-cell')}>Category</th>
            {head('sold', 'Sold')}
            {head('returned', 'Returned')}
            {head('discount', 'Discount')}
            {head('net', 'Net IQD')}
            <th className={cn(th, 'w-[22%]')}>Share of sales</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key} onClick={() => onPick(r.itemId)} className="cursor-pointer transition hover:bg-slate-50">
              <td className={td}>
                <div className="flex items-center gap-3">
                  <Photo image={image(r)} sizes="48px" className="size-12 rounded-xl" />
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900">{r.code}</div>
                    <div className="text-[13px] text-ink-500">{name(r)}</div>
                  </div>
                </div>
              </td>
              <td className={cn(td, 'hidden text-sm text-ink-600 xl:table-cell')}>{categoryName(r.category)}</td>
              <td className={cn(td, 'text-right font-semibold tabular-nums text-ink-900')}>{num(r.sold)}</td>
              <td className={cn(td, 'text-right tabular-nums', r.returned ? 'font-semibold text-amber-700' : 'text-ink-400')}>{r.returned ? num(r.returned) : '—'}</td>
              <td className={cn(td, 'text-right tabular-nums', r.discount ? 'text-brand-700' : 'text-ink-400')}>{r.discount ? num(r.discount) : '—'}</td>
              <td className={cn(td, 'whitespace-nowrap text-right font-bold tabular-nums text-ink-900')}>{num(r.net)}</td>
              <td className={td}>
                <div className="flex items-center gap-3">
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, (r.net / most) * 100)}%` }} />
                  </span>
                  <span className="w-12 text-right text-[13px] font-semibold tabular-nums text-ink-600">{share(r)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50/70 font-bold text-ink-900">
          <tr>
            <td className={td}>Total</td>
            <td className="hidden xl:table-cell" />
            <td className={cn(td, 'text-right tabular-nums')}>{num(report.sold)}</td>
            <td className={cn(td, 'text-right tabular-nums')}>{report.returned ? num(report.returned) : '—'}</td>
            <td className={cn(td, 'text-right tabular-nums')}>{report.discount ? num(report.discount) : '—'}</td>
            <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>{num(report.net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <ul className="divide-y divide-slate-100 border-t border-slate-100 lg:hidden">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onPick(r.itemId)} className="w-full px-4 py-3.5 text-left">
              <span className="flex items-center gap-3">
                <Photo image={image(r)} sizes="52px" className="size-13 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-900">{r.code}</span>
                  <span className="block truncate text-[13px] text-ink-500">{name(r)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold tabular-nums text-ink-900">{num(r.net)}</span>
                  <span className="block text-[13px] text-ink-500">{num(r.sold)} sold{r.returned ? ` · ${num(r.returned)} back` : ''}</span>
                </span>
              </span>
              <span className="mt-2.5 flex items-center gap-3">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, (r.net / most) * 100)}%` }} />
                </span>
                <span className="text-xs font-semibold tabular-nums text-ink-500">{share(r)}</span>
                {r.discount > 0 && <span className="text-xs font-medium tabular-nums text-brand-700">−{num(r.discount)}</span>}
              </span>
            </button>
          </li>
        ))}
        <li className="flex items-center justify-between bg-slate-50/70 px-4 py-3.5 font-bold text-ink-900">
          <span>Total · {num(report.sold)} sold</span>
          <span className="tabular-nums">{num(report.net)}</span>
        </li>
      </ul>
    </Card>
  );
}

/** A round number at or above the highest column. */
function niceTop(max: number): number {
  if (max <= 0) return 0;
  const unit = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 4, 5, 8, 10].map((m) => m * unit).find((n) => n >= max) ?? 10 * unit;
}

const short = (n: number): string => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(Math.round(n)));

/** Net sales by hour, day or month: one series of columns, and the same in a table. */
export function TimeCard({ report }: { report: Report }) {
  const [active, setActive] = useState<number | null>(null);
  const { times, unit } = report;
  const top = niceTop(Math.max(0, ...times.map((x) => x.net)));
  const every = Math.max(1, Math.ceil(times.length / 8));
  const filled = times.filter((x) => x.invoices || x.net);
  const best = filled.reduce((b, x) => (x.net > b.net ? x : b), filled[0]);
  const over = active !== null ? times[active] : null;
  const label = (x: (typeof times)[number]) => (unit === 'day' ? showDay(x.key) : x.label);
  const unitName = unit === 'hour' ? 'Hour' : unit === 'day' ? 'Day' : 'Month';

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[1.25fr_1fr]">
      <Card className="flex min-w-0 flex-col p-5 xl:h-[25.5rem]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-bold text-ink-900">Net sales by {unit}</h3>
          {best && (
            <span className="text-sm text-ink-500">
              Best {unit} <b className="font-semibold text-ink-900">{label(best)}</b> · {num(best.net)} IQD
            </span>
          )}
        </div>
        <div className="mt-8 flex h-64 xl:h-auto xl:min-h-0 xl:flex-1">
          <div className="relative w-12 shrink-0 text-xs tabular-nums text-ink-400">
            {[1, 0.5, 0].map((p) => (
              <span key={p} className="absolute -translate-y-1/2" style={{ top: `${(1 - p) * 100}%` }}>
                {short(top * p)}
              </span>
            ))}
          </div>
          <div className="relative flex min-w-0 flex-1" onMouseLeave={() => setActive(null)}>
            <span className="absolute inset-x-0 top-0 h-px bg-slate-100" />
            <span className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
            <span className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
            {times.map((x, i) => (
              <button
                key={x.key}
                type="button"
                aria-label={`${label(x)}: ${num(x.net)} IQD, ${x.invoices} invoices`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                className="relative min-w-0 flex-1 self-stretch outline-none"
              >
                <span
                  className={cn('absolute bottom-0 left-1/2 w-[min(30px,calc(100%-4px))] -translate-x-1/2 rounded-t-[4px] bg-brand-600 transition-opacity', active !== null && active !== i && 'opacity-35')}
                  style={{ height: top > 0 && x.net > 0 ? `max(${(x.net / top) * 100}%, 2px)` : 0 }}
                />
              </button>
            ))}
            {over && active !== null && (
              <div
                className="pointer-events-none absolute -top-3 z-10 w-44 -translate-y-full rounded-xl border border-slate-200 bg-raised p-3 text-left text-[13px] shadow-lg"
                style={{ left: `clamp(0px, calc(${((active + 0.5) / times.length) * 100}% - 5.5rem), calc(100% - 11rem))` }}
              >
                <div className="font-bold text-ink-900">{label(over)}</div>
                <div className="mt-1 flex justify-between gap-3 text-ink-500"><span>Net IQD</span><b className="tabular-nums text-ink-900">{num(over.net)}</b></div>
                <div className="flex justify-between gap-3 text-ink-500"><span>Invoices</span><span className="tabular-nums text-ink-700">{num(over.invoices)}</span></div>
                <div className="flex justify-between gap-3 text-ink-500"><span>Items sold</span><span className="tabular-nums text-ink-700">{num(over.sold)}</span></div>
              </div>
            )}
          </div>
        </div>
        <div className="ml-12 mt-2 flex h-4 text-xs tabular-nums text-ink-400" aria-hidden>
          {times.map((x, i) => (
            <span key={x.key} className="relative min-w-0 flex-1">
              {i % every === 0 && <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{x.label}</span>}
            </span>
          ))}
        </div>
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden xl:h-[25.5rem]">
        <div className="px-5 pb-4 pt-5">
          <h3 className="font-bold text-ink-900">{unitName} by {unit}</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 [scrollbar-width:thin] max-xl:max-h-[22rem]">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 shadow-[inset_0_-1px_0_var(--color-slate-200)]">
              <tr>
                <th className={th}>{unitName}</th>
                <th className={cn(th, 'text-right!')}>Invoices</th>
                <th className={cn(th, 'text-right!')}>Items</th>
                <th className={cn(th, 'text-right! max-sm:hidden')}>Given back</th>
                <th className={cn(th, 'text-right!')}>Net IQD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filled.map((x) => (
                <tr key={x.key}>
                  <td className={cn(td, 'whitespace-nowrap font-semibold text-ink-900')}>{label(x)}</td>
                  <td className={cn(td, 'text-right tabular-nums text-ink-600')}>{num(x.invoices)}</td>
                  <td className={cn(td, 'text-right tabular-nums text-ink-600')}>{num(x.sold)}</td>
                  <td className={cn(td, 'text-right tabular-nums max-sm:hidden', x.refunded ? 'text-amber-700' : 'text-ink-400')}>{x.refunded ? num(x.refunded) : '—'}</td>
                  <td className={cn(td, 'text-right font-bold tabular-nums text-ink-900')}>{num(x.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
