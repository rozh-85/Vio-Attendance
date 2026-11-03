import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Check, Megaphone, Plus, TrendingUp, X } from '@/components/icons';
import type { ProfitSummary } from '@/services/orders/profit';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { CardTitle, Key, MONEY, iqd, shortIqd, signTone, signedIqd, type MoneyTone } from './parts';

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
 * Net profit of each day (or month): green above the line, red below, and a
 * violet mark under the days a sponsor ran. Drawn with boxes rather than an
 * SVG so it fills whatever height its card has.
 */
export function DailyProfit({ s }: { s: ProfitSummary }) {
  const [active, setActive] = useState<number | null>(null);
  const pts = s.trend;
  const maxUp = Math.max(0, ...pts.map((p) => p.net));
  const maxDown = Math.max(0, ...pts.map((p) => -p.net));
  const range = maxUp + maxDown || 1;
  const zero = (maxUp / range) * 100;
  const maxSponsor = Math.max(0, ...pts.map((p) => p.sponsor));
  const labelEvery = Math.max(1, Math.ceil(pts.length / 7));
  const best = pts.reduce<(typeof pts)[number] | null>((b, p) => (!b || p.net > b.net ? p : b), null);
  const hovered = active !== null ? pts[active] : null;
  const unit = s.trendUnit;

  return (
    <Card className="flex h-full flex-col p-5">
      <CardTitle
        icon={<TrendingUp width={20} height={20} />}
        tone="bg-emerald-50 text-emerald-700"
        title={`Net profit by ${unit}`}
        sub={
          best && best.net > 0 ? (
            <>
              Best {unit}: <b className="text-ink-700">{best.label}</b> · {iqd(best.net)} IQD
            </>
          ) : (
            'After goods and sponsors'
          )
        }
        action={
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <Key tone="profit" />
            <Key tone="sponsor" label="Sponsor running" />
          </div>
        }
      />

      {pts.length === 0 ? (
        <div className="grid flex-1 place-items-center py-12 text-sm text-ink-400">No orders or sponsors in this period.</div>
      ) : (
        <div className="mt-5 flex min-h-60 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            {/* Scale on the left: the highest day, zero, the lowest day. */}
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
                const h = (Math.abs(p.net) / range) * 100;
                return (
                  <div
                    key={p.key}
                    tabIndex={0}
                    aria-label={`${p.label}: net ${iqd(p.net)} IQD`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="relative h-full min-w-0 flex-1 outline-none"
                  >
                    {p.net !== 0 && (
                      <span
                        className={cn(
                          'absolute left-1/2 w-[min(24px,70%)] -translate-x-1/2 transition-opacity',
                          p.net > 0 ? 'rounded-t-[4px] bg-emerald-500' : 'rounded-b-[4px] bg-rose-500',
                          active !== null && active !== i && 'opacity-40',
                        )}
                        style={
                          p.net > 0
                            ? { bottom: `${100 - zero}%`, height: `max(${h}%, 2px)` }
                            : { top: `${zero}%`, height: `max(${h}%, 2px)` }
                        }
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
                    {hovered.uncostedSales > 0 && (
                      <TipRow tone="missing" label="No cost yet" value={signedIqd(-hovered.uncostedSales)} />
                    )}
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
          <div className="ml-11 mt-2 flex gap-px">
            {pts.map((p) => (
              <span
                key={p.key}
                className={cn('h-1.5 min-w-0 flex-1 rounded-full', p.sponsor > 0 ? 'bg-violet-500' : 'bg-slate-100')}
                style={p.sponsor > 0 ? { opacity: 0.35 + 0.65 * (p.sponsor / (maxSponsor || 1)) } : undefined}
              />
            ))}
          </div>
          <div className="ml-11 mt-1.5 flex">
            {pts.map((p, i) => (
              <span key={p.key} className="relative h-4 min-w-0 flex-1">
                {i % labelEvery === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-400">{p.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Whether the sponsors earn back what they cost: sales for each 1 IQD of
 * sponsor, and per platform its orders' profit against its sponsors.
 */
export function SponsorReturn({ s }: { s: ProfitSummary }) {
  const rows = s.byPlatform.filter((r) => r.sponsor > 0 || r.sales > 0).slice(0, 3);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.gross, r.sponsor)));
  return (
    <Card className="flex h-full flex-col p-5">
      <CardTitle
        icon={<Megaphone width={20} height={20} />}
        tone="bg-violet-50 text-violet-700"
        title="Do the sponsors pay off?"
        sub="Each platform’s profit next to its sponsors"
      />

      <div className="mt-4 rounded-2xl bg-violet-50/70 p-4">
        {s.roas !== null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-ink-900">{s.roas.toFixed(1)}×</span>
              <span className="text-sm text-ink-500">sales for each 1 IQD of sponsor</span>
            </div>
            <div className="mt-1 text-sm text-ink-600">
              {s.breakEvenOrders !== null
                ? `The profit of ${s.breakEvenOrders} ${s.breakEvenOrders === 1 ? 'order' : 'orders'} paid for the sponsors.`
                : 'No profit has covered them yet.'}
            </div>
          </>
        ) : (
          <div className="text-sm text-ink-600">
            <b className="block text-base text-ink-900">No sponsor in this period</b>
            Every sale here came without a paid post.
          </div>
        )}
      </div>

      <ul className="mt-2 flex-1 divide-y divide-slate-100">
        {rows.map((r) => {
          const pays = r.net >= 0;
          return (
            <li key={r.key || 'none'} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-ink-900">{r.key || 'Platform not set'}</span>
                {r.sponsor > 0 ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                      pays ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                    )}
                  >
                    {pays ? <Check width={12} height={12} /> : <X width={12} height={12} />}
                    {pays ? 'Pays off' : 'Losing'} <span className="tabular-nums">{signedIqd(r.net)}</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-ink-500">
                    No sponsor · <b className={cn('tabular-nums', signTone(r.gross))}>{signedIqd(r.gross)}</b>
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_2.75rem] items-center gap-x-2 gap-y-1 text-[11px] tabular-nums text-ink-400">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" title={`Profit ${iqd(r.gross)} IQD`}>
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(Math.max(0, r.gross) / max) * 100}%` }} />
                </div>
                <span className="text-right">{shortIqd(r.gross)}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" title={`Sponsors ${iqd(r.sponsor)} IQD`}>
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(r.sponsor / max) * 100}%` }} />
                </div>
                <span className="text-right">{shortIqd(r.sponsor)}</span>
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <li className="py-6 text-center text-sm text-ink-400">No orders in this period.</li>}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex gap-3">
          <Key tone="profit" />
          <Key tone="sponsor" />
        </div>
        <Link
          to={paths.profitNewSponsor}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
        >
          <Plus width={16} height={16} /> Add sponsor
        </Link>
      </div>
    </Card>
  );
}
