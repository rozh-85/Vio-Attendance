import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { AlertTriangle, ArrowRight, Check } from '@/components/icons';
import type { LossOrder, ProfitSummary } from '@/services/orders/profit';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { MINUS, MONEY, SectionHead, iqd, linkButton, percent, signTone, type MoneyTone } from './parts';

/** "1,250,000 IQD", the currency quieter than the number. */
function Amount({ value, sign }: { value: number; sign?: boolean }) {
  const text = sign && value < 0 ? `${MINUS}${iqd(Math.abs(value))}` : iqd(value);
  return (
    <span className="whitespace-nowrap">
      <span className="tabular-nums">{text}</span>
      <span className="ml-1 text-sm font-medium text-ink-400">IQD</span>
    </span>
  );
}

function Stat({
  tone,
  label,
  value,
  sub,
  valueTone,
  note,
}: {
  tone: MoneyTone;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  valueTone?: string;
  note?: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
        <span className={cn('size-2 shrink-0 rounded-full', MONEY[tone].bg)} />
        {label}
      </div>
      <div className={cn('mt-2 text-xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-2xl', valueTone ?? 'text-ink-900')}>
        {value}
      </div>
      <div className="mt-1 text-sm text-ink-500">{sub}</div>
      {note && <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-amber-700">{note}</div>}
    </Card>
  );
}

/** The four numbers the page is about: sales, goods, sponsors and what is left. */
export function KeyFigures({ s }: { s: ProfitSummary }) {
  const counted = s.costedOrders > 0 || s.sponsor > 0;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
      <Stat
        tone="sales"
        label="Sales"
        value={<Amount value={s.sales} />}
        sub={s.orders ? `${plural(s.orders, 'order', 'orders')} · ${iqd(s.sales / s.orders)} average` : 'No orders yet'}
      />
      <Stat
        tone="goods"
        label="Cost of goods"
        value={s.costedOrders ? <Amount value={s.cogs} /> : '—'}
        sub={s.costedOrders ? `${percent(s.cogs / (s.costedSales || 1))} of the sales it covers` : 'Add your products to see it'}
      />
      <Stat
        tone="sponsor"
        label="Sponsors"
        value={<Amount value={s.sponsor} />}
        sub={
          s.sponsorCount
            ? `${plural(s.sponsorCount, 'sponsor', 'sponsors')}${s.roas !== null ? ` · ${s.roas.toFixed(1)}× sales back` : ''}`
            : 'None in this period'
        }
      />
      <Stat
        tone={s.net < 0 ? 'loss' : 'profit'}
        label="Net profit"
        value={counted ? <Amount value={s.net} sign /> : '—'}
        valueTone={counted ? signTone(s.net) : undefined}
        sub={
          counted
            ? s.costedSales > 0
              ? `${percent(s.net / s.costedSales)} of sales kept`
              : 'Sponsors with no costed sales'
            : 'Waiting for your products'
        }
        note={
          s.uncostedOrders > 0 && s.costedOrders > 0
            ? `Counts ${s.costedOrders} of ${s.orders} orders — the rest have no cost yet`
            : undefined
        }
      />
    </section>
  );
}

function Line({
  label,
  sub,
  value,
  tone,
  level = 'item',
}: {
  label: string;
  sub?: string;
  value: string;
  tone?: string;
  level?: 'item' | 'subtotal' | 'total';
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2.5',
        level === 'subtotal' && 'border-t border-slate-200',
        level === 'total' && 'mt-1 border-t-2 border-ink-900/80 pt-3',
      )}
    >
      <dt className="min-w-0">
        <span className={cn('text-sm', level === 'item' ? 'text-ink-600' : 'font-semibold text-ink-900')}>{label}</span>
        {sub && <span className="block text-xs text-ink-400">{sub}</span>}
      </dt>
      <dd
        className={cn(
          'shrink-0 tabular-nums',
          level === 'total' ? 'text-lg font-bold' : level === 'subtotal' ? 'font-semibold' : 'text-sm',
          tone ?? 'text-ink-900',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * How the sales become the profit, as a short statement that adds up, and
 * where each 1,000 IQD of costed sales went.
 */
export function Breakdown({ s }: { s: ProfitSummary }) {
  const minus = (v: number) => (v ? `${MINUS}${iqd(v)}` : '0');
  const signed = (v: number) => (v < 0 ? `${MINUS}${iqd(-v)}` : iqd(v));
  const per = (v: number) => Math.round((v / (s.costedSales || 1)) * 1000);
  const parts = [
    { tone: 'goods' as const, label: 'Goods', value: s.cogs },
    { tone: 'sponsor' as const, label: 'Sponsors', value: s.sponsor },
    { tone: 'profit' as const, label: 'Profit', value: Math.max(0, s.net) },
  ].filter((p) => p.value > 0);
  const base = Math.max(s.costedSales, s.cogs + s.sponsor) || 1;

  return (
    <Card className="flex h-full flex-col">
      <SectionHead title="Profit breakdown" sub="From sales to what you keep" />
      <dl className="px-5 pt-2">
        <Line label="Sales" sub={`${s.orders} ${s.orders === 1 ? 'order' : 'orders'}`} value={iqd(s.sales)} />
        {s.uncostedSales > 0 && (
          <Line
            label="Left out — no cost yet"
            sub={`${s.uncostedOrders} ${s.uncostedOrders === 1 ? 'order' : 'orders'}`}
            value={minus(s.uncostedSales)}
            tone="text-amber-700"
          />
        )}
        <Line label="Cost of goods" value={minus(s.cogs)} />
        <Line level="subtotal" label="Gross profit" sub={s.margin !== null ? `${percent(s.margin)} margin` : undefined} value={signed(s.gross)} />
        <Line label="Sponsors" value={minus(s.sponsor)} />
        <Line level="total" label="Net profit" value={`${signed(s.net)} IQD`} tone={signTone(s.net)} />
      </dl>

      <div className="mt-auto px-5 pb-5 pt-4">
        {s.costedSales > 0 ? (
          <>
            <div className="text-xs font-medium text-ink-500">Of every 1,000 IQD sold</div>
            <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100">
              {parts.map((p) => (
                <div key={p.tone} className={MONEY[p.tone].bg} style={{ width: `${(p.value / base) * 100}%` }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {parts.map((p) => (
                <span key={p.tone} className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                  <span className={cn('size-2 rounded-full', MONEY[p.tone].bg)} />
                  {p.label} <b className="tabular-nums text-ink-700">{per(p.value)}</b>
                </span>
              ))}
              {s.net < 0 && <span className="text-xs font-semibold text-rose-700">Spent {per(-s.net)} more than sold</span>}
            </div>
          </>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-ink-500">
            Once products have a cost, this shows where each 1,000 IQD of sales goes.
          </p>
        )}
      </div>
    </Card>
  );
}

/** Some orders have no cost yet: they are left out of the profit until they do. */
export function MissingCosts({ s }: { s: ProfitSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle width={20} height={20} className="shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 basis-64 text-sm text-amber-900">
        <b>
          {s.uncostedOrders} {s.uncostedOrders === 1 ? 'order' : 'orders'} ({iqd(s.uncostedSales)} IQD)
        </b>{' '}
        {s.uncostedOrders === 1 ? 'is' : 'are'} left out of the profit: the model is not on your products list, or has no cost yet.
      </p>
      <Link to={paths.profitModels} className={cn(linkButton.outline, 'border-amber-300 text-amber-900')}>
        Fix them <ArrowRight width={15} height={15} />
      </Link>
    </div>
  );
}

/**
 * Orders sold for less than their cost. Profit is always the selling price
 * minus the cost, so these show as a loss; most often the two numbers were
 * typed the wrong way round. Each opens its order, where they can be swapped.
 */
export function BelowCost({ list }: { list: LossOrder[] }) {
  const total = list.reduce((sum, l) => sum + l.profit, 0);
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle width={20} height={20} className="mt-0.5 shrink-0 text-rose-700" />
        <div className="min-w-0 flex-1 text-sm text-rose-900">
          <p>
            <b>
              {list.length} {list.length === 1 ? 'order was' : 'orders were'} sold for less than {list.length === 1 ? 'its' : 'their'} cost
            </b>{' '}
            ({MINUS}
            {iqd(-total)} IQD). Profit is the <b>selling price minus the cost</b>, so a price of 1,000 with a cost of 3,000 is a
            loss of 2,000. If the price and the cost were typed the wrong way round, open the order and press <b>Swap</b>.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {list.slice(0, 6).map((l) => (
              <li key={l.order.id}>
                <Link
                  to={paths.socialOrder(l.order.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-card px-2.5 py-1 text-xs font-semibold text-ink-700 transition hover:border-rose-300"
                >
                  #{l.order.orderNo}
                  <span className="font-normal text-ink-500">
                    sold {iqd(l.order.totalPrice)} · cost {iqd(l.cost)}
                  </span>
                </Link>
              </li>
            ))}
            {list.length > 6 && <li className="self-center text-xs text-rose-800">and {list.length - 6} more</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** First visit, before any product is added: the two things to fill in once. */
export function SetupGuide({ sponsors }: { sponsors: number }) {
  const steps = [
    {
      title: 'Add your products',
      body: 'The few products you sell, each with what one piece costs you. Orders from that day on get their profit: the seller’s price minus your cost.',
      to: paths.profitModels,
      action: 'Add products',
      primary: true,
      done: false,
    },
    {
      title: 'Add your sponsors',
      body: 'Each paid post or ad, in dollars or dinars, with the days it ran. It is taken off the profit.',
      to: paths.profitNewSponsor,
      action: sponsors ? 'Add another' : 'Add a sponsor',
      primary: false,
      done: sponsors > 0,
    },
  ];
  return (
    <Card>
      <SectionHead title="Set up profit tracking" sub="Two steps, once. Older orders are not counted; the numbers below fill in as new orders come." />
      <ol className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {steps.map((step, i) => (
          <li key={step.title} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
                step.done ? 'bg-emerald-500 text-white' : 'border border-slate-300 text-ink-500',
              )}
            >
              {step.done ? <Check width={16} height={16} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-60">
              <div className="font-semibold text-ink-900">{step.title}</div>
              <p className="text-sm text-ink-500">{step.body}</p>
            </div>
            <Link to={step.to} className={step.primary ? linkButton.primary : linkButton.outline}>
              {step.action} <ArrowRight width={15} height={15} />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
