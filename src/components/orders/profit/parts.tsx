import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, ArrowLeft, Check } from '@/components/icons';
import type { ProfitLoadError } from '@/hooks/useProfitData';
import { cn } from '@/utils/cn';

/**
 * One colour per kind of money, the same on every Profit page: ink is sales,
 * slate is goods, violet is sponsors, emerald is profit, rose is a loss and
 * amber is sales whose cost is not known yet.
 */
export const MONEY = {
  sales: { bg: 'bg-ink-700', label: 'Sales' },
  missing: { bg: 'bg-amber-400', label: 'No cost yet' },
  goods: { bg: 'bg-slate-400', label: 'Goods' },
  sponsor: { bg: 'bg-violet-500', label: 'Sponsors' },
  profit: { bg: 'bg-emerald-500', label: 'Profit' },
  loss: { bg: 'bg-rose-500', label: 'Loss' },
} as const;

export type MoneyTone = keyof typeof MONEY;

export const MINUS = '−';

/** "1,250,000" */
export const iqd = (value: number) => Math.round(value).toLocaleString('en-US');

/** "+25,000" / "−25,000" — the sign always shown. */
export function signedIqd(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded).toLocaleString('en-US')}`;
}

/** "−1.2M" / "450K" for tight spots, with a real minus sign. */
export function shortIqd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs >= 1_000_000) return `${sign}${+(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}K`;
  return `${sign}${Math.round(abs)}`;
}

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

/** Profit green, loss red, for text that still says its sign. */
export const signTone = (value: number) =>
  value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-ink-500';

/** A small coloured key: swatch and words. */
export function Key({ tone, label }: { tone: MoneyTone; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
      <span className={cn('size-2.5 rounded-sm', MONEY[tone].bg)} />
      {label ?? MONEY[tone].label}
    </span>
  );
}

/** "← Back to profit" at the top of a page opened from the Profit page. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex items-center gap-2 rounded-xl py-1.5 pr-3 text-sm font-semibold text-ink-500 transition hover:text-ink-900"
    >
      <span className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-card shadow-sm transition group-hover:border-slate-300 group-hover:-translate-x-0.5">
        <ArrowLeft width={18} height={18} />
      </span>
      {label}
    </button>
  );
}

/**
 * Shown in the page — never a pop-up — when the owner goes back with changes
 * not saved yet.
 */
export function LeaveNotice({
  text,
  saving,
  onSave,
  onLeave,
  onStay,
}: {
  text: string;
  saving: boolean;
  onSave: () => void;
  onLeave: () => void;
  onStay: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
        <AlertTriangle width={20} height={20} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="font-bold text-amber-900">{text}</div>
        <div className="text-sm text-amber-800">Save them before going back, or leave them.</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={onStay}>
          Stay here
        </Button>
        <Button size="sm" variant="outline" onClick={onLeave}>
          Leave without saving
        </Button>
        <Button size="sm" loading={saving} leftIcon={<Check width={16} height={16} />} onClick={onSave}>
          Save and go back
        </Button>
      </div>
    </div>
  );
}

/** The database is missing a script, or the data could not be read. */
export function LoadProblem({ error, onRetry }: { error: ProfitLoadError; onRetry: () => void }) {
  return (
    <Card className="border-amber-200 bg-amber-50/60 p-6 text-amber-900">
      <h2 className="text-lg font-bold">{error.script ? 'One step left' : 'Could not load the profit'}</h2>
      <p className="mt-1">{error.message}</p>
      {error.script && (
        <p className="mt-2 text-sm">
          Open Supabase → SQL editor, paste the file <code className="font-mono">supabase/{error.script}</code>, press
          Run, then come back here. No order is changed.
        </p>
      )}
      <Button className="mt-4" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </Card>
  );
}

/** Section heading inside a card: icon tile, title and a line under it. */
export function CardTitle({
  icon,
  tone = 'bg-slate-100 text-ink-700',
  title,
  sub,
  action,
}: {
  icon: ReactNode;
  tone?: string;
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-bold text-ink-900">{title}</h2>
        {sub && <p className="text-sm text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
