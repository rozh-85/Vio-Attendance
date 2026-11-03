import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { AlertTriangle, ArrowRight, Check, ChevronRight, Megaphone, Plus, Tag } from '@/components/icons';
import {
  sponsorDates,
  sponsorDays,
  sponsorInRange,
  sponsorIqd,
  sponsorPaid,
  type ProfitSummary,
  type Sponsor,
} from '@/services/orders/profit';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { CardTitle, iqd, percent, signTone, signedIqd } from './parts';

const SHOWN = 5;

const actionLink =
  'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition';

/** The sponsors that ran in the period; each opens its own page. */
export function SponsorList({
  sponsors,
  from,
  to,
  total,
  sales,
  days,
}: {
  sponsors: Sponsor[];
  from: string;
  to: string;
  total: number;
  /** Sales in the period, to show what share the sponsors took. */
  sales: number;
  /** Days in the period, for the daily average. */
  days: number;
}) {
  const [all, setAll] = useState(false);
  const list = useMemo(
    () =>
      sponsors
        .map((s) => ({ s, part: sponsorInRange(s, from, to) }))
        .filter(({ part }) => part.days > 0)
        .sort((a, b) => b.s.startDate.localeCompare(a.s.startDate) || b.s.createdAt.localeCompare(a.s.createdAt)),
    [sponsors, from, to],
  );
  const shown = all ? list : list.slice(0, SHOWN);

  return (
    <Card className="flex h-full flex-col p-5">
      <CardTitle
        icon={<Megaphone width={20} height={20} />}
        tone="bg-violet-50 text-violet-700"
        title="Sponsors"
        sub={list.length ? `${list.length} in this period · ${iqd(total)} IQD` : 'Paid posts and ads'}
        action={
          <Link to={paths.profitNewSponsor} className={cn(actionLink, 'bg-[#7c3aed] text-white shadow-sm hover:bg-[#6d28d9]')}>
            <Plus width={16} height={16} /> Add
          </Link>
        }
      />

      {list.length === 0 ? (
        <div className="mt-4 grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-200 p-6 text-center">
          <div>
            <p className="font-semibold text-ink-700">No sponsors in this period</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
              Add each paid post or ad. A sponsor over several days counts a share on each day.
            </p>
            <Link to={paths.profitNewSponsor} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-violet-700">
              Add a sponsor <ArrowRight width={15} height={15} />
            </Link>
          </div>
        </div>
      ) : (
        <ul className="mb-3 mt-3 flex-1 space-y-1">
          {shown.map(({ s, part }) => {
            const days = sponsorDays(s);
            const start = parseISO(s.startDate);
            return (
              <li key={s.id}>
                <Link
                  to={paths.profitSponsor(s.id)}
                  className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                >
                  <span className="grid w-12 shrink-0 place-items-center rounded-xl bg-violet-50 py-1.5 leading-none text-violet-700">
                    <span className="text-lg font-bold">{format(start, 'd')}</span>
                    <span className="mt-0.5 text-[10px] font-bold uppercase">{format(start, 'MMM')}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink-900">{s.platform || 'Platform not set'}</span>
                      {s.promoted && (
                        <span dir="auto" className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-ink-600">
                          {s.promoted}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {sponsorDates(s)} · {days === 1 ? '1 day' : `${days} days`} · {sponsorPaid(s)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold tabular-nums text-ink-900">{iqd(sponsorIqd(s))}</span>
                    <span className="block text-xs text-violet-700">
                      {part.days < days ? `${iqd(part.amount)} here` : 'all in period'}
                    </span>
                  </span>
                  <ChevronRight width={18} height={18} className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-semibold text-violet-700">
          {all ? 'Show fewer' : `Show all ${list.length} sponsors`}
        </button>
      )}

      <div className="mt-auto border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">
            {days > 0 && total > 0 ? (
              <>
                About <b className="text-ink-700">{iqd(total / days)} IQD</b> a day
              </>
            ) : (
              'Spent on sponsors'
            )}
          </span>
          <b className="tabular-nums text-ink-700">{sales > 0 ? `${percent(total / sales)} of sales` : '—'}</b>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${sales > 0 ? Math.min(1, total / sales) * 100 : 0}%` }} />
        </div>
      </div>
    </Card>
  );
}

/** The models that earned most in the period, and how complete the costs are. */
export function TopModels({ s }: { s: ProfitSummary }) {
  const models = s.byModel.filter((r) => r.key);
  const missing = models.filter((r) => r.cost === null && r.orders > 0);
  const ranked = models
    .filter((r) => r.costedOrders > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, SHOWN);
  const max = Math.max(1, ...ranked.map((r) => Math.abs(r.profit)));
  const withCost = models.filter((r) => r.cost !== null).length;
  const allSales = models.reduce((sum, r) => sum + r.avgPrice * r.allOrders, 0);
  const coverage = allSales ? models.reduce((sum, r) => sum + (r.cost !== null ? r.avgPrice * r.allOrders : 0), 0) / allSales : 0;

  return (
    <Card className="flex h-full flex-col p-5">
      <CardTitle
        icon={<Tag width={20} height={20} />}
        title="Models"
        sub="The most profitable in this period"
        action={
          <Link to={paths.profitModels} className={cn(actionLink, 'border border-slate-200 bg-card text-ink-700 hover:bg-slate-50')}>
            Models &amp; prices <ArrowRight width={15} height={15} />
          </Link>
        }
      />

      {missing.length > 0 && (
        <Link
          to={paths.profitModels}
          className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 transition hover:bg-amber-100"
        >
          <AlertTriangle width={16} height={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            <b className="text-amber-900">{missing.length}</b> sold {missing.length === 1 ? 'model has' : 'models have'} no cost:{' '}
            <span className="font-mono">{missing.slice(0, 3).map((r) => r.label).join(', ')}</span>
          </span>
          <ArrowRight width={15} height={15} className="shrink-0" />
        </Link>
      )}

      {ranked.length === 0 ? (
        <div className="mt-4 grid flex-1 place-items-center rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-ink-500">
          No order in this period has a cost yet.
        </div>
      ) : (
        <ol className="mb-3 mt-3 flex-1 space-y-1">
          {ranked.map((r, i) => {
            const unit = r.cost !== null && r.avgPrice ? (r.avgPrice - r.cost) / r.avgPrice : null;
            return (
              <li key={r.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl p-2">
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full text-xs font-bold',
                    i === 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-ink-500',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-mono text-sm font-bold text-ink-900">{r.label}</span>
                    <bdi className="truncate text-xs text-ink-400">{r.category}</bdi>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className={cn('block h-full rounded-full', r.profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                      style={{ width: `${(Math.abs(r.profit) / max) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="text-right">
                  <span className={cn('block text-sm font-bold tabular-nums', signTone(r.profit))}>{signedIqd(r.profit)}</span>
                  <span className="block text-xs text-ink-400">
                    {r.orders} sold · {percent(unit)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-auto border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">
            Costs set for <b className="text-ink-700">{withCost}</b> of {models.length} models
          </span>
          <b className="tabular-nums text-ink-700">{percent(coverage)} of sales</b>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${coverage * 100}%` }} />
        </div>
      </div>
    </Card>
  );
}

/** First visit, before any cost is set: the two things to fill in once. */
export function GettingStarted({ models, sponsors }: { models: number; sponsors: number }) {
  const steps = [
    {
      to: paths.profitModels,
      icon: <Tag width={24} height={24} />,
      tone: 'bg-slate-100 text-ink-700',
      title: 'Price each model',
      body: `Write each model’s sale price and cost once. Sellers pick the model and the price fills in; every order — ${models} ${models === 1 ? 'model' : 'models'} sold so far — gets its profit.`,
      action: 'Open models & prices',
      done: false,
    },
    {
      to: paths.profitNewSponsor,
      icon: <Megaphone width={24} height={24} />,
      tone: 'bg-violet-50 text-violet-700',
      title: 'Add your sponsors',
      body: 'Each paid post or ad, in dollars or dinars, with the days it ran. It is taken off the profit.',
      action: sponsors ? 'Add another sponsor' : 'Add a sponsor',
      done: sponsors > 0,
    },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col justify-center bg-linear-to-br from-[#047857] to-[#064e3b] p-6 text-white sm:p-8">
          <div className="text-xs font-bold uppercase tracking-wide text-white/70">Profit</div>
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">See what every order really earned</h2>
          <div className="mt-5 space-y-1.5 font-mono text-sm text-white/85">
            <div>&nbsp;&nbsp;Sales</div>
            <div>{'−'} Goods</div>
            <div>{'−'} Sponsors</div>
            <div className="border-t border-white/30 pt-1.5 font-sans text-base font-bold text-white">= Net profit</div>
          </div>
        </div>
        <ol className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Link
                to={step.to}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 p-5 transition hover:border-slate-300 hover:shadow-sm"
              >
                <span className="flex items-center gap-3">
                  <span className={cn('grid size-12 place-items-center rounded-2xl', step.tone)}>{step.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Step {i + 1}</span>
                  {step.done && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <Check width={13} height={13} /> Done
                    </span>
                  )}
                </span>
                <span className="mt-4 text-lg font-bold text-ink-900">{step.title}</span>
                <span className="mt-1 flex-1 text-sm text-ink-500">{step.body}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  {step.action} <ArrowRight width={16} height={16} className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
