import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Check, X } from '@/components/icons';
import type { PlatformRow, ProfitPoint, ProfitSummary } from '@/services/orders/profit';
import { cn } from '@/utils/cn';
import { Key, MONEY, iqd, percent, shortIqd, signTone, signedIqd } from './parts';

// ── From sales to net profit ─────────────────────────────────────────────────

interface Step {
  label: string;
  sub?: string;
  tone: keyof typeof MONEY;
  /** Where the bar starts and ends, in IQD. */
  from: number;
  to: number;
  /** What the row says, signed for the steps that take money away. */
  value: string;
  total?: boolean;
}

/**
 * The money of the period as a bridge: sales at the top, each cost taken off
 * as its own floating bar, and the profit left over below. Reads top to
 * bottom on a phone as well as on a wide screen.
 */
export function MoneyBridge({ s }: { s: ProfitSummary }) {
  const steps: Step[] = [
    { label: 'Sales', sub: `${s.orders.toLocaleString('en-US')} ${s.orders === 1 ? 'order' : 'orders'}`, tone: 'sales', from: 0, to: s.sales, value: iqd(s.sales), total: true },
  ];
  if (s.uncostedSales > 0) {
    steps.push({
      label: 'No cost yet',
      sub: `${s.uncostedOrders} ${s.uncostedOrders === 1 ? 'order' : 'orders'}, left out`,
      tone: 'missing',
      from: s.costedSales,
      to: s.sales,
      value: signedIqd(-s.uncostedSales),
    });
  }
  steps.push(
    {
      label: 'Cost of goods',
      sub: s.costedSales ? `${percent(s.cogs / s.costedSales)} of those sales` : undefined,
      tone: 'goods',
      from: s.gross,
      to: s.costedSales,
      value: signedIqd(-s.cogs),
    },
    {
      label: 'Gross profit',
      sub: s.margin !== null ? `${percent(s.margin)} margin` : undefined,
      tone: s.gross >= 0 ? 'profit' : 'loss',
      from: Math.min(0, s.gross),
      to: Math.max(0, s.gross),
      value: iqd(s.gross),
      total: true,
    },
    {
      label: 'Sponsors',
      sub: s.sponsorCount ? `${s.sponsorCount} in this period` : 'None in this period',
      tone: 'sponsor',
      from: s.net,
      to: s.gross,
      value: signedIqd(-s.sponsor),
    },
    {
      label: 'Net profit',
      tone: s.net >= 0 ? 'profit' : 'loss',
      from: Math.min(0, s.net),
      to: Math.max(0, s.net),
      value: iqd(s.net),
      total: true,
    },
  );

  const lo = Math.min(0, ...steps.map((st) => Math.min(st.from, st.to)));
  const hi = Math.max(0, ...steps.map((st) => Math.max(st.from, st.to)));
  const span = hi - lo || 1;
  const at = (v: number) => ((v - lo) / span) * 100;

  return (
    <div>
      <ol className="space-y-1">
        {steps.map((st) => {
          const left = at(Math.min(st.from, st.to));
          const width = Math.abs(at(st.to) - at(st.from));
          return (
            <li
              key={st.label}
              className={cn(
                'grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]',
                st.total && 'bg-slate-50',
              )}
              title={`${st.label}: ${st.value} IQD`}
            >
              <div className="min-w-0">
                <div className={cn('truncate text-sm', st.total ? 'font-bold text-ink-900' : 'font-medium text-ink-700')}>
                  {st.label}
                </div>
                {st.sub && <div className="truncate text-xs text-ink-400">{st.sub}</div>}
              </div>
              <div className="relative h-5">
                {lo < 0 && <span className="absolute inset-y-[-6px] w-px bg-slate-300" style={{ left: `${at(0)}%` }} />}
                <span
                  className={cn('absolute top-0.5 h-4 rounded', MONEY[st.tone].bg)}
                  style={{ left: `${left}%`, width: `max(${width}%, ${width > 0 ? 3 : 0}px)` }}
                />
              </div>
              <div
                className={cn(
                  'whitespace-nowrap text-right text-sm tabular-nums',
                  st.total ? 'font-bold text-ink-900' : 'text-ink-500',
                )}
              >
                {st.value}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 px-2 text-xs text-ink-400">IQD. Cancelled and returned orders are not counted.</p>
    </div>
  );
}

// ── Where each 1,000 IQD went ────────────────────────────────────────────────

/**
 * Sales cut into the parts they paid for — goods, sponsors and what was left —
 * each 1,000 IQD at a time, which is easier to feel than a margin. Only drawn
 * while there is a profit; a loss has no "left over" part to show.
 */
export function ThousandSplit({ s }: { s: ProfitSummary }) {
  if (s.sales <= 0 || s.net < 0) return null;
  const parts = [
    { tone: 'goods' as const, value: s.cogs },
    { tone: 'sponsor' as const, value: s.sponsor },
    { tone: 'profit' as const, value: s.net },
    { tone: 'missing' as const, value: s.uncostedSales },
  ].filter((p) => p.value > 0);
  const per = (v: number) => Math.round((v / s.sales) * 1000);
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-ink-400">Of every 1,000 IQD sold</div>
      <div
        className="mt-2 flex h-7 gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label={parts.map((p) => `${MONEY[p.tone].label} ${per(p.value)}`).join(', ')}
      >
        {parts.map((p) => {
          const share = p.value / s.sales;
          return (
            <div
              key={p.tone}
              title={`${MONEY[p.tone].label}: ${per(p.value)} of every 1,000 IQD`}
              className={cn(
                'flex min-w-0 items-center rounded-[4px] px-2 text-xs font-bold',
                MONEY[p.tone].bg,
                p.tone === 'missing' ? 'text-[#0f172a]' : 'text-white',
              )}
              style={{ width: `${share * 100}%` }}
            >
              {share >= 0.12 && <span className="truncate">{per(p.value)}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <span key={p.tone} className="inline-flex items-center gap-1.5 text-xs text-ink-500">
            <span className={cn('size-2.5 rounded-sm', MONEY[p.tone].bg)} />
            {p.tone === 'profit' ? 'Your profit' : MONEY[p.tone].label}
            <b className="tabular-nums text-ink-700">{per(p.value)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Profit over time ─────────────────────────────────────────────────────────

/** A column with a 4px round end away from the baseline, square on it. */
function columnPath(x: number, base: number, top: number, w: number): string {
  const h = Math.abs(top - base);
  const r = Math.min(4, w / 2, h);
  if (top <= base) {
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
  }
  return `M${x},${base}V${top - r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top - r}V${base}Z`;
}

function TipRow({ tone, label, value, strong }: { tone?: keyof typeof MONEY; label: string; value: string; strong?: boolean }) {
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
 * Net profit for each day (or month): green above the line, red below it,
 * and a violet mark under the days a sponsor was running.
 */
export function ProfitTrend({ s }: { s: ProfitSummary }) {
  const [active, setActive] = useState<number | null>(null);
  const points = s.trend;
  const W = 720;
  const H = 180;
  const top = 8;
  const plotH = H - top;
  const maxUp = Math.max(0, ...points.map((p) => p.net));
  const maxDown = Math.max(0, ...points.map((p) => -p.net));
  const range = maxUp + maxDown || 1;
  const zero = top + (maxUp / range) * plotH;
  const y = (v: number) => zero - (v / range) * plotH;
  const slot = points.length ? W / points.length : W;
  const barW = Math.max(2, Math.min(24, slot * 0.68));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const maxSponsor = Math.max(0, ...points.map((p) => p.sponsor));
  const best = points.reduce<ProfitPoint | null>((b, p) => (!b || p.net > b.net ? p : b), null);
  const hovered = active !== null ? points[active] : null;

  // Clean round gridlines at a quarter, half and three quarters of the tallest side.
  const ticks = [maxUp, maxUp / 2, -maxDown / 2, -maxDown].filter((v) => Math.abs(v) > 0);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink-900">Net profit by {s.trendUnit}</h3>
          <p className="text-sm text-ink-500">
            {best && best.net > 0 ? (
              <>
                Best {s.trendUnit}: <b className="text-ink-700">{best.label}</b> · {iqd(best.net)} IQD
              </>
            ) : (
              'Goods and sponsors taken off, day by day'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <Key tone="profit" />
          <Key tone="loss" />
          <Key tone="sponsor" label="Sponsor running" />
        </div>
      </div>
      {points.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-400">No orders or sponsors in this period.</p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H + 34}`}
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label={`Net profit by ${s.trendUnit}`}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={0} x2={W} y1={y(v)} y2={y(v)} className="stroke-slate-100" />
                <text x={0} y={y(v) - 4} className="fill-ink-400 text-[11px] tabular-nums">
                  {shortIqd(v)}
                </text>
              </g>
            ))}
            <line x1={0} x2={W} y1={zero} y2={zero} className="stroke-slate-300" />
            {points.map((p, i) => {
              const x = i * slot + (slot - barW) / 2;
              const on = active === i;
              return (
                <g key={p.key}>
                  {p.net !== 0 && (
                    <path
                      d={columnPath(x, zero, y(p.net), barW)}
                      className={cn(p.net > 0 ? MONEY.profit.fill : MONEY.loss.fill, active !== null && !on && 'opacity-40')}
                    />
                  )}
                  {p.sponsor > 0 && (
                    <rect
                      x={i * slot + 1}
                      y={H + 4}
                      width={Math.max(1, slot - 2)}
                      height={5}
                      rx={2}
                      className={MONEY.sponsor.fill}
                      opacity={0.35 + 0.65 * (p.sponsor / (maxSponsor || 1))}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={i * slot + slot / 2} y={H + 26} textAnchor="middle" className="fill-ink-400 text-[11px]">
                      {p.label}
                    </text>
                  )}
                  {/* Hover and keyboard target: the whole column, taller than the bar. */}
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={H + 12}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${p.label}: net ${iqd(p.net)} IQD`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="cursor-default outline-none"
                  />
                </g>
              );
            })}
          </svg>
          {hovered && active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-56 rounded-xl border border-slate-200 bg-raised p-3 text-xs shadow-lg"
              style={{
                left: `${((active + 0.5) / points.length) * 100}%`,
                transform: `translateX(${active / points.length > 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
              }}
            >
              <div className="mb-1.5 font-bold text-ink-900">{hovered.label}</div>
              <div className="space-y-1">
                <TipRow label={`Sales · ${hovered.orders} orders`} value={iqd(hovered.sales)} />
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
      )}
    </Card>
  );
}

// ── Do the sponsors pay off? ─────────────────────────────────────────────────

/**
 * Per platform, the profit its orders made next to what its sponsors cost:
 * a platform whose sponsors cost more than its orders earned is losing money.
 */
export function PlatformPayoff({ rows }: { rows: PlatformRow[] }) {
  const shown = rows.filter((r) => r.sales > 0 || r.sponsor > 0);
  const max = Math.max(1, ...shown.map((r) => Math.max(r.gross, r.sponsor)));
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink-900">Do the sponsors pay off?</h3>
          <p className="text-sm text-ink-500">Each platform’s profit next to what its sponsors cost</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <Key tone="profit" label="Gross profit" />
          <Key tone="sponsor" />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-400">No orders or sponsors in this period.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((r) => {
            const pays = r.net >= 0;
            return (
              <li key={r.key || 'none'} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-900">{r.key || 'Platform not set'}</div>
                    <div className="text-xs text-ink-500">
                      {r.orders} {r.orders === 1 ? 'order' : 'orders'} · {shortIqd(r.sales)} sales
                      {r.roas !== null && <> · {r.roas.toFixed(1)}× the sponsor</>}
                      {r.uncostedSales > 0 && <span className="text-amber-700"> · {shortIqd(r.uncostedSales)} with no cost</span>}
                    </div>
                  </div>
                  {r.sponsor > 0 ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                        pays ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                      )}
                    >
                      {pays ? <Check width={13} height={13} /> : <X width={13} height={13} />}
                      {pays ? 'Pays off' : 'Losing'} · <span className="tabular-nums">{signedIqd(r.net)}</span>
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-500">
                      No sponsor · <span className={cn('tabular-nums', signTone(r.gross))}>{signedIqd(r.gross)}</span>
                    </span>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2" title={`Gross profit: ${iqd(r.gross)} IQD`}>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full', MONEY.profit.bg)} style={{ width: `${(Math.max(0, r.gross) / max) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-ink-500">{shortIqd(r.gross)}</span>
                  </div>
                  <div className="flex items-center gap-2" title={`Sponsors: ${iqd(r.sponsor)} IQD`}>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full', MONEY.sponsor.bg)} style={{ width: `${(r.sponsor / max) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs tabular-nums text-ink-500">{shortIqd(r.sponsor)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
