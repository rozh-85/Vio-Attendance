import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { ArrowRight, ChevronRight, Megaphone, Plus } from '@/components/icons';
import {
  sponsorDates,
  sponsorDays,
  sponsorInRange,
  sponsorIqd,
  sponsorPaid,
  type ModelRow,
  type ProfitSummary,
  type Sponsor,
} from '@/services/orders/profit';
import { catalogItem } from '@/services/orders/products';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';
import { MINUS, SectionHead, iqd, linkButton, percent, signTone, signedIqd } from './parts';

const SHOWN = 6;

/** The catalogue photo of a model on white, or its first letters. */
function ModelPhoto({ model }: { model: string }) {
  const [failed, setFailed] = useState(false);
  const src = catalogItem(model)?.image ?? '';
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain p-0.5" />
      ) : (
        <span className="font-mono text-[10px] font-bold text-slate-400">{model.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)}</span>
      )}
    </span>
  );
}

/** Profit kept of each model's sales; null while it has no cost. */
function marginOf(r: ModelRow): number | null {
  if (r.costedOrders > 0 && r.costedOrders === r.orders && r.sales > 0) return r.profit / r.sales;
  return r.cost !== null && r.avgPrice ? (r.avgPrice - r.cost) / r.avgPrice : null;
}

/** The models sold in the period, best sellers first, with what each earned. */
export function TopModels({ s }: { s: ProfitSummary }) {
  const [all, setAll] = useState(false);
  const models = s.byModel.filter((r) => r.key);
  const sold = models.filter((r) => r.orders > 0).sort((a, b) => b.sales - a.sales || b.orders - a.orders);
  const shown = all ? sold : sold.slice(0, SHOWN);
  const withCost = models.filter((r) => r.cost !== null).length;

  return (
    <Card className="flex h-full flex-col">
      <SectionHead
        title="Models"
        sub="Best sellers in this period"
        action={
          <Link to={paths.profitModels} className={linkButton.outline}>
            Models &amp; prices <ArrowRight width={15} height={15} />
          </Link>
        }
      />

      {sold.length === 0 ? (
        <div className="m-5 grid flex-1 place-items-center rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-ink-500">
          No model was sold in this period.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs font-medium text-ink-500">
                <th className="py-2 pl-5 pr-3 font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Sold</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Sales</th>
                <th className="px-3 py-2 text-right font-medium">Profit</th>
                <th className="hidden py-2 pl-3 pr-5 text-right font-medium md:table-cell">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => {
                const name = catalogItem(r.key)?.name || r.category;
                const costed = r.costedOrders > 0;
                return (
                  <tr key={r.key}>
                    <td className="py-2.5 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <ModelPhoto model={r.key} />
                        <div className="min-w-0">
                          <div className="truncate font-mono text-sm font-bold text-ink-900">{r.label}</div>
                          {name && <bdi className="block truncate text-xs text-ink-500">{name}</bdi>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{r.orders}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums text-ink-700 sm:table-cell">{iqd(r.sales)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {costed ? (
                        <span className={cn('font-semibold tabular-nums', signTone(r.profit))}>{signedIqd(r.profit)}</span>
                      ) : (
                        <Link
                          to={paths.profitModels}
                          className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          Add cost
                        </Link>
                      )}
                    </td>
                    <td className="hidden py-2.5 pl-3 pr-5 text-right tabular-nums text-ink-500 md:table-cell">{percent(marginOf(r))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-ink-500">
        <span>
          Costs set for <b className="text-ink-700">{withCost}</b> of {models.length} models
        </span>
        {sold.length > SHOWN && (
          <button type="button" onClick={() => setAll((v) => !v)} className="font-semibold text-brand-700 hover:underline">
            {all ? 'Show fewer' : `Show all ${sold.length}`}
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * The sponsors that ran in the period, what they cost and whether they paid
 * off, overall and per platform. Each sponsor opens its own page.
 */
export function SponsorList({ s, sponsors, from, to }: { s: ProfitSummary; sponsors: Sponsor[]; from: string; to: string }) {
  const [all, setAll] = useState(false);
  const list = useMemo(
    () =>
      sponsors
        .map((sp) => ({ sp, part: sponsorInRange(sp, from, to) }))
        .filter(({ part }) => part.days > 0)
        .sort((a, b) => b.sp.startDate.localeCompare(a.sp.startDate) || b.sp.createdAt.localeCompare(a.sp.createdAt)),
    [sponsors, from, to],
  );
  const shown = all ? list : list.slice(0, 4);
  const platforms = s.byPlatform.filter((r) => r.sponsor > 0);

  return (
    <Card className="flex h-full flex-col">
      <SectionHead
        title="Sponsors"
        sub={list.length ? `${list.length} ran in this period` : 'Paid posts and ads'}
        action={
          <Link to={paths.profitNewSponsor} className={linkButton.primary}>
            <Plus width={16} height={16} /> Add sponsor
          </Link>
        }
      />

      {list.length === 0 ? (
        <div className="m-5 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-violet-50 text-violet-700">
            <Megaphone width={18} height={18} />
          </span>
          <p className="mt-3 font-semibold text-ink-900">No sponsors in this period</p>
          <p className="mt-1 max-w-xs text-sm text-ink-500">Add each paid post or ad. One that runs several days counts a share on each day.</p>
        </div>
      ) : (
        <>
          <dl className="mx-5 mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-200">
            <div className="p-3">
              <dt className="text-xs text-ink-500">Spent</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{iqd(s.sponsor)}</dd>
            </div>
            <div className="p-3">
              <dt className="text-xs text-ink-500">Sales back</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">{s.roas !== null ? `${s.roas.toFixed(1)}×` : '—'}</dd>
            </div>
            <div className="p-3">
              <dt className="text-xs text-ink-500">Paid back by</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink-900">
                {s.breakEvenOrders !== null ? `${s.breakEvenOrders} ${s.breakEvenOrders === 1 ? 'order' : 'orders'}` : '—'}
              </dd>
            </div>
          </dl>

          <ul className="mt-2 px-3">
            {shown.map(({ sp, part }) => {
              const days = sponsorDays(sp);
              const start = parseISO(sp.startDate);
              return (
                <li key={sp.id}>
                  <Link to={paths.profitSponsor(sp.id)} className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50">
                    <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-violet-50 py-1 leading-none text-violet-700">
                      <span className="text-base font-bold">{format(start, 'd')}</span>
                      <span className="mt-0.5 text-[10px] font-bold uppercase">{format(start, 'MMM')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-900">{sp.platform || 'Platform not set'}</span>
                        {sp.promoted && (
                          <span dir="auto" className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs text-ink-600">
                            {sp.promoted}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-ink-500">
                        {sponsorDates(sp)} · {days === 1 ? '1 day' : `${days} days`} · {sponsorPaid(sp)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums text-ink-900">{iqd(sponsorIqd(sp))}</span>
                      {part.days < days && <span className="block text-xs text-violet-700">{iqd(part.amount)} here</span>}
                    </span>
                    <ChevronRight width={16} height={16} className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {list.length > 4 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mx-5 mt-1 self-start text-xs font-semibold text-brand-700 hover:underline">
              {all ? 'Show fewer' : `Show all ${list.length} sponsors`}
            </button>
          )}

          {platforms.length > 0 && (
            <div className="mt-auto border-t border-slate-100 px-5 pb-4 pt-3">
              <div className="text-xs font-medium text-ink-500">Profit after sponsors, by platform</div>
              <ul className="mt-2 space-y-1.5">
                {platforms.map((r) => (
                  <li key={r.key || 'none'} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-ink-700">{r.key || 'Platform not set'}</span>
                    <span className="shrink-0 text-xs text-ink-400">
                      {MINUS}
                      {iqd(r.sponsor)} sponsors
                    </span>
                    <span className={cn('w-24 shrink-0 text-right font-semibold tabular-nums', signTone(r.net))}>{signedIqd(r.net)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
