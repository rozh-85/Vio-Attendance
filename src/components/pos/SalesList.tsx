import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pencil, Printer, Trash, Undo } from '@/components/icons';
import { formatPhone } from '@/services/repairs/logic';
import type { PosText } from '@/services/pos/i18n';
import { netTotal, num, saleLabel, saleStatus, showDay, showTime } from '@/services/pos/logic';
import { isEdited, isRaised } from '@/services/pos/report';
import type { PosItem, Sale } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import type { SaleMode } from './SaleDrawer';
import { IconButton, Photo, StatusBadge, lineImage, ltrText } from './ui';

const PAGE = 50;

export const itemsText = (sale: Sale): string => sale.lines.map((l) => (l.qty > 1 ? `${l.code} ×${l.qty}` : l.code)).join(', ');

/** The invoices as a table — cards on a phone — with everything that can be done to each on its own row. */
export function SalesList({ sales, items, onOpen, onPrint, marks, t }: {
  sales: Sale[];
  items: PosItem[];
  onOpen: (sale: Sale, mode: SaleMode) => void;
  onPrint: (sale: Sale) => void;
  /** Also show what is unusual about a sale: changed, discounted, a raised price. */
  marks?: boolean;
  t: PosText;
}) {
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [sales.length]);

  const marksOf = (s: Sale): string[] =>
    marks
      ? [
          isEdited(s) ? t.eventName.edit : '',
          s.lines.some(isRaised) ? 'Raised price' : '',
          s.discount > 0 ? `${t.discount} ${num(s.discount)}` : '',
        ].filter(Boolean)
      : [];

  const actions = (s: Sale) => (
    <span className="flex shrink-0 justify-end">
      <IconButton icon={Printer} label={t.print} onClick={() => onPrint(s)} />
      {!s.deletedAt && (
        <>
          <IconButton icon={Undo} label={t.returnItems} tone="amber" disabled={saleStatus(s) === 'returned'} onClick={() => onOpen(s, 'return')} />
          <IconButton icon={Pencil} label={t.edit} tone="blue" onClick={() => onOpen(s, 'edit')} />
          <IconButton icon={Trash} label={t.delete} tone="red" onClick={() => onOpen(s, 'delete')} />
        </>
      )}
    </span>
  );
  const photos = (s: Sale) => (
    <span className="flex shrink-0">
      {s.lines.slice(0, 3).map((l, i) => (
        <Photo key={l.id} image={lineImage(l, items)} sizes="44px" pad="p-1" className={cn('size-11 rounded-xl ring-2 ring-card', i > 0 && '-ms-2.5')} />
      ))}
    </span>
  );

  const th = 'whitespace-nowrap px-3 py-3 text-start text-[13px] font-semibold text-ink-500 first:ps-5 last:pe-4';
  const td = 'px-3 py-3 align-middle first:ps-5 last:pe-4';

  return (
    <Card className="overflow-hidden">
      <table className="hidden w-full lg:table">
        <thead className="border-b border-slate-200 bg-slate-50/70">
          <tr>
            <th className={th}>{t.invoice}</th>
            <th className={th}>{t.customer}</th>
            <th className={th}>{t.itemsTitle}</th>
            <th className={th}>{t.status}</th>
            <th className={cn(th, 'text-end!')}>{t.total}</th>
            <th className={cn(th, 'text-end!')}>{t.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sales.slice(0, shown).map((s) => {
            const extra = marksOf(s);
            return (
              <tr key={s.id} onClick={() => onOpen(s, 'view')} className={cn('cursor-pointer transition hover:bg-slate-50', s.deletedAt && 'opacity-60')}>
                <td className={td}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(s, 'view'); }} className={cn('whitespace-nowrap font-bold text-ink-900 hover:text-brand-700', ltrText)}>
                    {saleLabel(s)}
                  </button>
                  <div className="whitespace-nowrap text-[13px] tabular-nums text-ink-500"><span className={ltrText}>{showDay(s.soldAt)} {showTime(s.soldAt)}</span></div>
                </td>
                <td className={td}>
                  <div className="max-w-48 truncate text-start font-semibold text-ink-900">{s.customerName}</div>
                  <div className="whitespace-nowrap text-[13px] tabular-nums text-ink-500"><span className={ltrText}>{formatPhone(s.customerPhone)}</span></div>
                </td>
                <td className={td}>
                  <div className="flex min-w-0 items-center gap-3">
                    {photos(s)}
                    <span className={cn('line-clamp-2 min-w-0 text-sm text-ink-600', ltrText)}>{itemsText(s)}</span>
                  </div>
                </td>
                <td className={td}>
                  <StatusBadge status={saleStatus(s)} t={t} />
                  {s.pending && <div className="mt-1 text-xs font-semibold text-amber-700">{t.notSent}</div>}
                  {extra.length > 0 && <div className="mt-1 text-xs text-ink-500">{extra.join(' · ')}</div>}
                </td>
                <td className={cn(td, 'text-end')}>
                  <div className="whitespace-nowrap text-[15px] font-bold tabular-nums text-ink-900"><span className={ltrText}>{num(netTotal(s))}</span></div>
                  {s.refunded > 0 && <s className={cn('text-[13px] tabular-nums text-ink-400', ltrText)}>{num(s.total)}</s>}
                </td>
                <td className={td}>{actions(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 lg:hidden">
        {sales.slice(0, shown).map((s) => {
          const extra = marksOf(s);
          return (
            <li key={s.id} onClick={() => onOpen(s, 'view')} className={cn('cursor-pointer px-4 py-3.5', s.deletedAt && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <Photo image={lineImage(s.lines[0], items)} sizes="52px" className="size-13 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-start font-semibold text-ink-900">{s.customerName}</div>
                  <div className="text-start text-[13px] tabular-nums text-ink-500"><span className={ltrText}>{formatPhone(s.customerPhone)}</span></div>
                </div>
                <div className="shrink-0 text-end">
                  <div className="text-base font-bold tabular-nums text-ink-900"><span className={ltrText}>{num(netTotal(s))}</span></div>
                  <div className="text-[13px] tabular-nums text-ink-500"><span className={ltrText}>{saleLabel(s)} · {showTime(s.soldAt)}</span></div>
                </div>
              </div>
              <div className="mt-2 truncate text-start text-[13px] text-ink-600"><span className={ltrText}>{itemsText(s)}</span></div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge status={saleStatus(s)} t={t} />
                  <span className="text-xs text-ink-500">{s.pending ? t.notSent : extra.length ? extra.join(' · ') : showDay(s.soldAt)}</span>
                </span>
                {actions(s)}
              </div>
            </li>
          );
        })}
      </ul>

      {sales.length > shown && (
        <div className="border-t border-slate-100 p-3 text-center">
          <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
            + {num(sales.length - shown)}
          </Button>
        </div>
      )}
    </Card>
  );
}
