import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import type { ProfitSummary } from '@/services/orders/profit';
import { cn } from '@/utils/cn';
import { Key, MONEY, SectionHead, iqd, shortIqd, signedIqd, type MoneyTone } from './parts';

type Metric = 'profit' | 'sales';

function TipRow({ tone, label, value, strong }: { tone?: MoneyTone; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 text-ink-500">
        {tone && <span className={cn('size-2 rounded-sm', MONEY[tone].bg)} />}
        {label}
      </span>
      <span className={cn('tabular-nums', strong ? 'font-bold text-ink-900' : 'text-ink-700')}>{value}</span>
    </div>
  );
}

/**
 * Net profit (or sales) of each day or month: profit green above the line and
 * red below, with a violet mark under the days a sponsor ran. Drawn with boxes
 * rather than an SVG so it fills whatever height its card has. Opens on sales
 * while no order has a cost, since the profit would be empty.
 */
export function TrendChart({ s }: { s: ProfitSummary }) {
  const [picked, setPicked] = useState<Metric | null>(null);
  const metric: Metric = picked ?? (s.costedOrders > 0 || s.sponsor > 0 ? 'profit' : 'sales');
  const [active, setActive] = useState<number | null>(null);
  const pts = s.trend;
  const valueOf = (p: (typeof pts)[number]) => (metric === 'profit' ? p.net : p.sales);
  const maxUp = Math.max(0, ...pts.map(valueOf));
  const maxDown = Math.max(0, ...pts.map((p) => -valueOf(p)));
  const range = maxUp + maxDown || 1;
  const zero = (maxUp / range) * 100;
  const maxSponsor = Math.max(0, ...pts.map((p) => p.sponsor));
  const labelEvery = Math.max(1, Math.ceil(pts.length / 7));
  const best = pts.reduce<(typeof pts)[number] | null>((b, p) => (!b || valueOf(p) > valueOf(b) ? p : b), null);
  const hovered = active !== null ? pts[active] : null;
  const unit = s.trendUnit;
  const tab = (on: boolean) =>
    cn('rounded-lg px-3 py-1.5 text-sm font-semibold transition', on ? 'bg-raised text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900');

  return (
    <Card className="flex h-full flex-col">
      <SectionHead
        title={metric === 'profit' ? `Net profit by ${unit}` : `Sales by ${unit}`}
        sub={
          best && valueOf(best) > 0 ? (
            <>
              Best {unit}: <b className="font-semibold text-ink-700">{best.label}</b> · {iqd(valueOf(best))} IQD
            </>
          ) : metric === 'profit' ? (
            'After goods and sponsors'
          ) : (
            'Every order that counts as a sale'
          )
        }
        action={
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Show">
            <button type="button" role="tab" aria-selected={metric === 'profit'} className={tab(metric === 'profit')} onClick={() => setPicked('profit')}>
              Profit
            </button>
            <button type="button" role="tab" aria-selected={metric === 'sales'} className={tab(metric === 'sales')} onClick={() => setPicked('sales')}>
              Sales
            </button>
          </div>
        }
      />

      {pts.length === 0 ? (
        <div className="grid flex-1 place-items-center px-5 py-16 text-sm text-ink-400">No orders or sponsors in this period.</div>
      ) : (
        <div className="flex min-h-64 flex-1 flex-col px-5 pb-5 pt-6">
          <div className="relative flex min-h-0 flex-1">
            {/* Scale on the left: the highest, zero, the lowest. */}
            <div className="relative w-11 shrink-0 text-[11px] tabular-nums text-ink-400">
              {maxUp > 0 && <span className="absolute -translate-y-1/2" style={{ top: 0 }}>{shortIqd(maxUp)}</span>}
              <span className="absolute -translate-y-1/2" style={{ top: `${zero}%` }}>0</span>
              {maxDown > 0 && <span className="absolute -translate-y-1/2" style={{ top: '100%' }}>{shortIqd(-maxDown)}</span>}
            </div>
            <div className="relative flex min-w-0 flex-1" onMouseLeave={() => setActive(null)}>
              <span className="absolute inset-x-0 top-0 h-px bg-slate-100" />
              <span className="absolute inset-x-0 top-1/2 h-px bg-slate-100" />
              <span className="absolute inset-x-0 bottom-0 h-px bg-slate-100" />
              <span className="absolute inset-x-0 h-px bg-slate-300" style={{ top: `${zero}%` }} />
              {pts.map((p, i) => {
                const v = valueOf(p);
                const h = (Math.abs(v) / range) * 100;
                return (
                  <div
                    key={p.key}
                    tabIndex={0}
                    aria-label={`${p.label}: ${metric === 'profit' ? 'net profit' : 'sales'} ${iqd(v)} IQD`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="relative h-full min-w-0 flex-1 outline-none"
                  >
                    {v !== 0 && (
                      <span
                        className={cn(
                          'absolute left-1/2 w-[min(24px,70%)] -translate-x-1/2 transition-opacity',
                          v > 0 ? 'rounded-t-[4px]' : 'rounded-b-[4px]',
                          metric === 'sales' ? MONEY.sales.bg : v > 0 ? MONEY.profit.bg : MONEY.loss.bg,
                          active !== null && active !== i && 'opacity-40',
                        )}
                        style={v > 0 ? { bottom: `${100 - zero}%`, height: `max(${h}%, 2px)` } : { top: `${zero}%`, height: `max(${h}%, 2px)` }}
                      />
                    )}
                  </div>
                );
              })}
              {hovered && active !== null && (
                <div
                  className="pointer-events-none absolute top-0 z-10 w-56 rounded-xl border border-slate-200 bg-raised p-3 text-xs shadow-lg"
                  style={{
                    left: `${((active + 0.5) / pts.length) * 100}%`,
                    transform: `translateX(${active / pts.length > 0.55 ? 'calc(-100% - 10px)' : '10px'})`,
                  }}
                >
                  <div className="mb-1.5 font-bold text-ink-900">{hovered.label}</div>
                  <div className="space-y-1">
                    <TipRow label={`Sales · ${hovered.orders} ${hovered.orders === 1 ? 'order' : 'orders'}`} value={iqd(hovered.sales)} />
                    {hovered.uncostedSales > 0 && <TipRow tone="missing" label="No cost yet" value={signedIqd(-hovered.uncostedSales)} />}
                    <TipRow tone="goods" label="Goods" value={signedIqd(-hovered.cogs)} />
                    <TipRow tone="sponsor" label="Sponsors" value={signedIqd(-hovered.sponsor)} />
                    <div className="border-t border-slate-100 pt-1">
                      <TipRow tone={hovered.net >= 0 ? 'profit' : 'loss'} label="Net profit" value={iqd(hovered.net)} strong />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Sponsor days, then the dates. */}
          {metric === 'profit' && (
            <div className="ml-11 mt-2 flex gap-px">
              {pts.map((p) => (
                <span
                  key={p.key}
                  className={cn('h-1.5 min-w-0 flex-1 rounded-full', p.sponsor > 0 ? 'bg-violet-500' : 'bg-slate-100')}
                  style={p.sponsor > 0 ? { opacity: 0.35 + 0.65 * (p.sponsor / (maxSponsor || 1)) } : undefined}
                />
              ))}
            </div>
          )}
          <div className="ml-11 mt-1.5 flex">
            {pts.map((p, i) => (
              <span key={p.key} className="relative h-4 min-w-0 flex-1">
                {i % labelEvery === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-400">{p.label}</span>
                )}
              </span>
            ))}
          </div>
          <div className="ml-11 mt-3 flex flex-wrap gap-4">
            {metric === 'profit' ? (
              <>
                <Key tone="profit" />
                <Key tone="loss" />
                <Key tone="sponsor" label="Sponsor running" />
              </>
            ) : (
              <Key tone="sales" />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
