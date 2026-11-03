import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Check, Download, Megaphone, Tag, TrendingDown, TrendingUp, X } from '@/components/icons';
import { EMPTY_FILTERS, PERIODS, describePeriod, periodRange, type PeriodId } from '@/services/orders/report';
import {
  summarizeProfit,
  type ModelRow,
  type ProfitData,
  type Sponsor,
  type SponsorInput,
} from '@/services/orders/profit';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import type { SalesOrder } from '@/services/orders/types';
import { exportProfitExcel } from '@/services/report/profitExcel';
import { cn } from '@/utils/cn';
import { ModelCosts, NoModelOrders, type ModelFilter } from './ModelCosts';
import { MoneyBridge, PlatformPayoff, ProfitTrend, ThousandSplit } from './ProfitCharts';
import { SponsorModal, SponsorsCard } from './Sponsors';
import { iqd, percent, signedIqd } from './parts';

/** The period picked, kept while the app is open so switching tabs keeps it. Profit is read a month at a time. */
let remembered: { period: PeriodId | 'custom'; from: string; to: string } | null = null;

const chip = (selected: boolean) =>
  cn(
    'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition',
    selected
      ? 'border-brand-600 bg-brand-50 text-brand-700'
      : 'border-slate-200 bg-card text-ink-700 hover:border-slate-300 hover:bg-slate-50',
  );

const dateClass =
  'mt-1 h-11 w-full rounded-xl border border-slate-200 bg-card px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function Tile({ label, value, unit, sub, icon }: { label: string; value: string; unit?: string; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-card p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xl font-bold text-ink-900 [overflow-wrap:anywhere] sm:text-[1.7rem]">
        <span className="min-w-0">{value}</span>
        {unit && <span className="text-sm font-semibold text-ink-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
    </div>
  );
}

/** First visit: the two things to fill in once. */
function GettingStarted({
  models,
  sponsors,
  onCosts,
  onSponsor,
}: {
  models: number;
  sponsors: number;
  onCosts: () => void;
  onSponsor: () => void;
}) {
  const steps = [
    {
      icon: <Tag width={22} height={22} />,
      tone: 'bg-slate-100 text-ink-700',
      title: 'Write the cost of each model',
      body: `${models} ${models === 1 ? 'model has' : 'models have'} been sold. Write what one piece costs you — every order of it, old and new, gets its profit.`,
      action: 'Start with the best seller',
      onClick: onCosts,
      done: false,
    },
    {
      icon: <Megaphone width={22} height={22} />,
      tone: 'bg-violet-50 text-violet-700',
      title: 'Add your sponsors',
      body: 'Each paid post or ad, in dollars or dinars. It is spread over the days it ran and taken off the profit.',
      action: sponsors ? `${sponsors} added — add another` : 'Add a sponsor',
      onClick: onSponsor,
      done: sponsors > 0,
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="bg-linear-to-br from-emerald-50 via-card to-violet-50/60 p-6 sm:p-8">
        <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Profit</div>
        <h2 className="mt-1 text-2xl font-bold text-ink-900 sm:text-3xl">See what every order really earned</h2>
        <p className="mt-2 max-w-2xl text-ink-500">
          Sales − cost of the goods − sponsors = <b className="text-ink-700">net profit</b>. Fill in two things once;
          from then on every order works out its own profit, the new ones too.
        </p>
        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col rounded-2xl border border-slate-200 bg-card p-5">
              <div className="flex items-center gap-3">
                <span className={cn('grid size-11 place-items-center rounded-xl', step.tone)}>{step.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Step {i + 1}</span>
                {step.done && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <Check width={13} height={13} /> Done
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-lg font-bold text-ink-900">{step.title}</h3>
              <p className="mt-1 flex-1 text-sm text-ink-500">{step.body}</p>
              <Button className="mt-4 self-start" variant={i === 0 ? 'primary' : 'secondary'} onClick={step.onClick}>
                {step.action}
              </Button>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

/**
 * The Profit tab of the owner's orders page: net profit for a period, the
 * way from sales to it, profit by day, whether each platform's sponsors pay
 * off, the sponsors themselves and the cost of every model.
 */
export function ProfitReport({
  orders,
  data,
  update,
}: {
  orders: SalesOrder[];
  data: ProfitData;
  /** Changes the loaded profit data in place, before or after a save. */
  update: (change: (data: ProfitData) => ProfitData) => void;
}) {
  const [period, setPeriod] = useState<PeriodId | 'custom'>(remembered?.period ?? 'month');
  const [range, setRange] = useState(() => (remembered ? { from: remembered.from, to: remembered.to } : periodRange('month')));
  const [filter, setFilter] = useState<ModelFilter>('all');
  const [modal, setModal] = useState<{ sponsor: Sponsor | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelsRef = useRef<HTMLDivElement>(null);
  const store = getProfitStore();

  const pick = (id: PeriodId | 'custom', next = range) => {
    setPeriod(id);
    setRange(next);
    remembered = { period: id, ...next };
  };

  const s = useMemo(() => summarizeProfit(orders, data, range.from, range.to), [orders, data, range]);
  const periodText = describePeriod({ ...EMPTY_FILTERS, ...range });
  const hasCosts = Object.keys(data.models).length > 0 || Object.keys(data.orderCosts).length > 0;
  const modelCount = s.byModel.filter((r) => r.key).length;
  const missingInPeriod = s.byModel.filter((r) => r.key && r.cost === null && r.orders > 0).length;
  const noModelInPeriod = s.byModel.find((r) => !r.key);
  const noModelWaiting = noModelInPeriod ? noModelInPeriod.orders - noModelInPeriod.costedOrders : 0;
  const modelNames = useMemo(() => s.byModel.filter((r) => r.key).map((r) => r.label), [s.byModel]);

  const goToCosts = (f: ModelFilter) => {
    setFilter(f);
    requestAnimationFrame(() => {
      modelsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => modelsRef.current?.querySelector<HTMLInputElement>('input[data-cost-input]')?.focus({ preventScroll: true }), 450);
    });
  };

  async function setModelCost(row: ModelRow, cost: number | null) {
    const before = data.models[row.key];
    const apply = (value: typeof before | undefined) =>
      update((d) => {
        const models = { ...d.models };
        if (value) models[row.key] = value;
        else delete models[row.key];
        return { ...d, models };
      });
    apply(cost === null ? undefined : { key: row.key, label: row.label, cost, updatedAt: new Date().toISOString() });
    setError(null);
    try {
      await store.setModelCost(row.key, row.label, cost);
    } catch (err) {
      apply(before);
      setError(profitErrorMessage(err));
      throw err;
    }
  }

  async function setOrderCost(order: SalesOrder, cost: number | null) {
    const before = data.orderCosts[order.id];
    const apply = (value: number | undefined) =>
      update((d) => {
        const orderCosts = { ...d.orderCosts };
        if (value === undefined) delete orderCosts[order.id];
        else orderCosts[order.id] = value;
        return { ...d, orderCosts };
      });
    apply(cost ?? undefined);
    setError(null);
    try {
      await store.setOrderCost(order.id, cost);
    } catch (err) {
      apply(before);
      setError(profitErrorMessage(err));
      throw err;
    }
  }

  async function saveSponsor(input: SponsorInput, id?: string) {
    const saved = await store.saveSponsor(input, id);
    update((d) => ({ ...d, sponsors: [saved, ...d.sponsors.filter((x) => x.id !== saved.id)] }));
  }

  async function deleteSponsor(sponsor: Sponsor) {
    setError(null);
    try {
      await store.deleteSponsor(sponsor.id);
      update((d) => ({ ...d, sponsors: d.sponsors.filter((x) => x.id !== sponsor.id) }));
    } catch (err) {
      setError(profitErrorMessage(err));
    }
  }

  const profit = s.net >= 0;

  return (
    <div className="space-y-6">
      {/* ── Period ───────────────────────────────────────────────────────── */}
      <Card className="px-5 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:gap-5">
          <div className="text-xs font-bold uppercase tracking-wide text-ink-400 md:w-16 md:shrink-0 md:pt-2.5">Period</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              {PERIODS.map((p) => (
                <button key={p.id} type="button" className={chip(period === p.id)} onClick={() => pick(p.id, periodRange(p.id))}>
                  {p.label}
                </button>
              ))}
              <button type="button" className={chip(period === 'custom')} onClick={() => pick('custom')}>
                Custom dates
              </button>
            </div>
            {period === 'custom' && (
              <div className="mt-3 grid gap-3 sm:max-w-md sm:grid-cols-2">
                <label className="text-sm font-semibold text-ink-700">
                  From
                  <input type="date" className={dateClass} value={range.from} onChange={(e) => pick('custom', { ...range, from: e.target.value })} />
                </label>
                <label className="text-sm font-semibold text-ink-700">
                  To
                  <input type="date" className={dateClass} value={range.to} onChange={(e) => pick('custom', { ...range, to: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{periodText}</h2>
          <p className="text-sm text-ink-500">Every seller · cancelled and returned orders not counted</p>
        </div>
        <Button
          variant="outline"
          leftIcon={<Download width={16} height={16} />}
          onClick={() => exportProfitExcel({ orders, data, summary: s, from: range.from, to: range.to, period: periodText })}
        >
          Excel
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">
          <span className="flex-1">{error}</span>
          <button type="button" aria-label="Close" onClick={() => setError(null)} className="opacity-60 hover:opacity-100">
            <X width={16} height={16} />
          </button>
        </div>
      )}

      {!hasCosts ? (
        <GettingStarted
          models={modelCount}
          sponsors={data.sponsors.length}
          onCosts={() => goToCosts('missing')}
          onSponsor={() => setModal({ sponsor: null })}
        />
      ) : (
        <>
          {/* ── Net profit, and the way to it ─────────────────────────────── */}
          <Card className="overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div
                className={cn(
                  'flex flex-col justify-between gap-6 p-6 sm:p-7',
                  profit ? 'bg-linear-to-br from-emerald-50 to-card' : 'bg-linear-to-br from-rose-50 to-card',
                )}
              >
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-500">Net profit · {periodText}</div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 [overflow-wrap:anywhere]">
                    <span className="text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
                      {s.net < 0 ? '−' : ''}
                      {iqd(Math.abs(s.net))}
                    </span>
                    <span className="text-lg font-semibold text-ink-400">IQD</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                        profit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {profit ? <TrendingUp width={16} height={16} /> : <TrendingDown width={16} height={16} />}
                      {profit ? 'Profit' : 'Loss'}
                      {s.sales > 0 && <span className="font-normal opacity-80">· {percent(Math.abs(s.net) / s.sales)} of sales</span>}
                    </span>
                    {s.uncostedOrders > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                        <AlertTriangle width={15} height={15} />
                        {s.uncostedOrders} orders not counted
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-ink-500">
                    <b className="text-ink-700">{iqd(s.costedSales)}</b> sales − <b className="text-ink-700">{iqd(s.cogs)}</b> goods −{' '}
                    <b className="text-ink-700">{iqd(s.sponsor)}</b> sponsors
                  </p>
                </div>
                <ThousandSplit s={s} />
              </div>
              <div className="border-t border-slate-100 p-4 sm:p-5 lg:border-l lg:border-t-0">
                <h3 className="px-2 pb-2 font-bold text-ink-900">From sales to net profit</h3>
                <MoneyBridge s={s} />
              </div>
            </div>
          </Card>

          {/* ── The numbers behind it ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Gross profit"
              value={iqd(s.gross)}
              unit="IQD"
              sub={s.margin !== null ? `${percent(s.margin)} margin on ${s.costedOrders} orders` : 'No order has a cost yet'}
            />
            <Tile
              label="Sponsors"
              icon={<span className="size-2 rounded-full bg-violet-500" />}
              value={iqd(s.sponsor)}
              unit="IQD"
              sub={
                s.breakEvenOrders !== null
                  ? `The profit of ${s.breakEvenOrders} ${s.breakEvenOrders === 1 ? 'order' : 'orders'} paid for them`
                  : s.sponsorCount
                    ? `${s.sponsorCount} in this period`
                    : 'None in this period'
              }
            />
            <Tile
              label="Sales per 1 IQD of sponsor"
              value={s.roas !== null ? `${s.roas.toFixed(1)}×` : '—'}
              sub={
                s.roas !== null
                  ? `${iqd(s.roas * 1000)} IQD sold for every 1,000 spent`
                  : 'Add sponsors to see what they bring in'
              }
            />
            <Tile
              label="Profit per order"
              value={s.profitPerOrder !== null ? signedIqd(s.profitPerOrder) : '—'}
              unit={s.profitPerOrder !== null ? 'IQD' : undefined}
              sub="After its goods and its share of sponsors"
            />
          </div>

          {/* ── Orders whose profit is not counted yet ────────────────────── */}
          {s.uncostedOrders > 0 && (
            <Card className="flex flex-wrap items-center gap-4 border-amber-200 bg-amber-50/70 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle width={20} height={20} />
              </span>
              <div className="min-w-0 flex-1 basis-64">
                <div className="font-bold text-amber-900">
                  {s.uncostedOrders} {s.uncostedOrders === 1 ? 'order' : 'orders'} worth {iqd(s.uncostedSales)} IQD have no cost yet
                </div>
                <div className="text-sm text-amber-800">
                  Their profit is left out of the numbers above until you write their cost
                  {missingInPeriod > 0 && ` — ${missingInPeriod} ${missingInPeriod === 1 ? 'model' : 'models'}`}
                  {noModelWaiting > 0 && `${missingInPeriod > 0 ? ' and' : ' —'} ${noModelWaiting} with no model written`}.
                </div>
              </div>
              {missingInPeriod > 0 && (
                <Button onClick={() => goToCosts('missing')} leftIcon={<Tag width={16} height={16} />}>
                  Set {missingInPeriod} {missingInPeriod === 1 ? 'cost' : 'costs'}
                </Button>
              )}
            </Card>
          )}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ProfitTrend s={s} />
            <PlatformPayoff rows={s.byPlatform} />
          </div>
        </>
      )}

      <SponsorsCard
        sponsors={data.sponsors}
        from={range.from}
        to={range.to}
        total={s.sponsor}
        onAdd={() => setModal({ sponsor: null })}
        onEdit={(sponsor) => setModal({ sponsor })}
        onDelete={deleteSponsor}
      />

      <ModelCosts
        ref={modelsRef}
        summary={s}
        filter={filter}
        onFilter={setFilter}
        onSetCost={setModelCost}
        periodText={periodText}
      />

      <NoModelOrders orders={orders} data={data} from={range.from} to={range.to} onSetCost={setOrderCost} />

      <p className="text-sm text-ink-400">
        A sponsor over several days counts an equal share on each day, so a period carries only its own days. An
        order’s own cost (set on the order’s page) wins over its model’s. Days follow this computer’s time zone.
      </p>

      <SponsorModal
        open={!!modal}
        sponsor={modal?.sponsor ?? null}
        models={modelNames}
        onClose={() => setModal(null)}
        onSave={saveSponsor}
      />
    </div>
  );
}
