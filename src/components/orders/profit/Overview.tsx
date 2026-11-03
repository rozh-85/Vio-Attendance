import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { AlertTriangle, ArrowRight, CheckCircle, TrendingDown, TrendingUp } from '@/components/icons';
import type { ProfitSummary } from '@/services/orders/profit';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { MINUS, MONEY, iqd, percent, shortIqd, signedIqd, type MoneyTone } from './parts';

function Tile({
  tone,
  label,
  value,
  sub,
  subTone,
  share,
  shareLabel,
}: {
  tone: MoneyTone;
  label: string;
  value: number;
  sub: string;
  subTone?: string;
  /** 0–1, drawn as a bar at the foot of the tile. */
  share: number;
  shareLabel: string;
}) {
  return (
    <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card px-3.5 pb-3.5 pt-4 shadow-sm sm:px-5 sm:pb-5 sm:pt-5">
      <span className={cn('absolute inset-x-0 top-0 h-1', MONEY[tone].bg)} />
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400 sm:text-xs">
        <span className={cn('size-2 shrink-0 rounded-full', MONEY[tone].bg)} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1 font-bold text-ink-900">
        {/* Short on phones and tablets, the full amount once there is room. */}
        <span className="text-xl sm:text-2xl lg:hidden">{shortIqd(value)}</span>
        <span className="hidden text-xl [overflow-wrap:anywhere] lg:inline xl:text-2xl 2xl:text-[1.7rem]">{iqd(value)}</span>
        <span className="text-xs font-semibold text-ink-400">IQD</span>
      </div>
      <div className={cn('mt-1 hidden text-sm sm:block', subTone ?? 'text-ink-500')}>{sub}</div>
      <div className="mt-auto pt-3" title={shareLabel}>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-full rounded-full', MONEY[tone].bg)} style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
        </div>
        <div className="mt-1.5 hidden text-[11px] text-ink-400 sm:block">{shareLabel}</div>
      </div>
    </div>
  );
}

function Operator({ sign }: { sign: string }) {
  return (
    <div className="relative z-10 hidden items-center justify-center lg:flex" aria-hidden>
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-card text-xl font-bold text-ink-400 shadow-sm">
        {sign}
      </span>
    </div>
  );
}

/** A thin line of net profit, day by day, inside the net tile. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${((max - v) / span) * 100}`).join(' ');
  const zero = ((max - 0) / span) * 100;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      <line x1="0" x2="100" y1={zero} y2={zero} stroke="white" strokeOpacity="0.25" vectorEffect="non-scaling-stroke" />
      <polyline
        points={pts}
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The profit as the sum it is: sales − goods − sponsors = net profit, each
 * part its own tile. Sales here are those that have a cost, so the sum on
 * screen always adds up; sales still waiting for a cost are named under it.
 */
export function Equation({ s }: { s: ProfitSummary }) {
  const loss = s.net < 0;
  return (
    <section
      aria-label="Net profit"
      className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)_1.25rem_minmax(0,1fr)_1.25rem_minmax(0,1.35fr)] lg:gap-0"
    >
      <Tile
        tone="sales"
        label="Sales"
        value={s.costedSales}
        sub={
          s.uncostedOrders > 0
            ? `${shortIqd(s.uncostedSales)} more waiting for a cost`
            : `${s.orders} ${s.orders === 1 ? 'order' : 'orders'}`
        }
        subTone={s.uncostedOrders > 0 ? 'text-amber-700' : undefined}
        share={s.sales ? s.costedSales / s.sales : 0}
        shareLabel={s.sales ? `${percent(s.costedSales / s.sales)} of all sales have a cost` : 'No sales yet'}
      />
      <Operator sign={MINUS} />
      <Tile
        tone="goods"
        label="Goods"
        value={s.cogs}
        sub={s.costedOrders ? `${s.costedOrders} ${s.costedOrders === 1 ? 'order' : 'orders'} with a cost` : 'No cost set yet'}
        share={s.costedSales ? s.cogs / s.costedSales : 0}
        shareLabel={s.costedSales ? `${percent(s.cogs / s.costedSales)} of these sales` : '—'}
      />
      <Operator sign={MINUS} />
      <Tile
        tone="sponsor"
        label="Sponsors"
        value={s.sponsor}
        sub={s.sponsorCount ? `${s.sponsorCount} ${s.sponsorCount === 1 ? 'sponsor' : 'sponsors'}` : 'None in this period'}
        share={s.costedSales ? s.sponsor / s.costedSales : 0}
        shareLabel={s.costedSales ? `${percent(s.sponsor / s.costedSales)} of these sales` : '—'}
      />
      <Operator sign="=" />
      <div
        className={cn(
          'relative order-first col-span-3 flex flex-col overflow-hidden rounded-2xl p-5 text-white shadow-md sm:p-6 lg:order-none lg:col-span-1',
          loss ? 'bg-linear-to-br from-[#be123c] to-[#881337]' : 'bg-linear-to-br from-[#047857] to-[#064e3b]',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-white/75">Net profit</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
            {loss ? <TrendingDown width={14} height={14} /> : <TrendingUp width={14} height={14} />}
            {loss ? 'Loss' : 'Profit'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 [overflow-wrap:anywhere]">
          <span className="text-4xl font-bold tracking-tight lg:text-[1.9rem] xl:text-4xl">
            {loss ? MINUS : ''}
            {iqd(Math.abs(s.net))}
          </span>
          <span className="text-sm font-semibold text-white/70">IQD</span>
        </div>
        <div className="mt-1 text-sm text-white/80">
          {s.costedSales > 0 ? `${percent(Math.abs(s.net) / s.costedSales)} of sales` : 'No sales with a cost yet'}
          {s.profitPerOrder !== null && ` · ${signedIqd(s.profitPerOrder)} an order`}
        </div>
        <div className="mt-auto pt-3">
          <Sparkline values={s.trend.map((p) => p.net)} />
        </div>
      </div>
    </section>
  );
}

/**
 * Where each 1,000 IQD of sales went: goods, sponsors and what was left —
 * easier to feel than a margin — and whether every order has a cost.
 */
export function MoneySplit({ s, missingModels }: { s: ProfitSummary; missingModels: number }) {
  const spent = s.cogs + s.sponsor;
  const loss = s.net < 0;
  const base = Math.max(s.sales, spent + s.uncostedSales) || 1;
  const parts = [
    { tone: 'goods' as const, value: s.cogs },
    { tone: 'sponsor' as const, value: s.sponsor },
    { tone: 'profit' as const, value: Math.max(0, s.net) },
    { tone: 'missing' as const, value: s.uncostedSales },
  ].filter((p) => p.value > 0);
  const per = (v: number) => Math.round((v / (s.sales || 1)) * 1000);

  return (
    <Card className="grid items-center gap-4 p-4 sm:p-5 lg:grid-cols-[10.5rem_minmax(0,1fr)_minmax(0,16rem)] lg:gap-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-ink-400">Of every 1,000 IQD sold</div>
        <div className={cn('mt-0.5 text-sm font-semibold', loss ? 'text-rose-700' : 'text-emerald-700')}>
          {s.sales <= 0
            ? 'No sales yet'
            : loss
              ? s.costedSales > 0
                ? `${iqd((spent / s.costedSales) * 1000 - 1000)} more spent than sold`
                : 'Sponsors with no sales'
              : `${per(s.net)} is your profit`}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex h-8 gap-0.5 overflow-hidden rounded-lg bg-slate-100" role="img" aria-label={parts.map((p) => `${MONEY[p.tone].label} ${per(p.value)}`).join(', ')}>
          {parts.map((p) => {
            const share = p.value / base;
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
      {s.uncostedOrders > 0 ? (
        <Link
          to={paths.profitCosts}
          className="group flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 transition hover:border-amber-300"
        >
          <AlertTriangle width={18} height={18} className="shrink-0 text-amber-700" />
          <span className="min-w-0 flex-1 text-sm">
            <b className="block text-amber-900">
              {s.uncostedOrders} {s.uncostedOrders === 1 ? 'order has' : 'orders have'} no cost
            </b>
            <span className="text-amber-800">
              {missingModels > 0 ? `Set ${missingModels} model ${missingModels === 1 ? 'cost' : 'costs'}` : 'Set their cost'}
            </span>
          </span>
          <ArrowRight width={16} height={16} className="shrink-0 text-amber-700 transition group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm">
          <CheckCircle width={18} height={18} className="shrink-0 text-emerald-700" />
          <span>
            <b className="block text-emerald-800">Every order has a cost</b>
            <span className="text-emerald-700">The profit is complete</span>
          </span>
        </div>
      )}
    </Card>
  );
}
