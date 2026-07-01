import { cn } from '@/utils/cn';

type Tone = 'neutral' | 'success' | 'info' | 'warning';

const tones: Record<Tone, string> = {
  neutral: 'bg-white border-slate-200 text-ink-900',
  success: 'bg-emerald-50/70 border-emerald-100 text-emerald-700',
  info: 'bg-brand-50/70 border-brand-100 text-brand-700',
  warning: 'bg-amber-50/70 border-amber-100 text-amber-700',
};

export function StatCard({
  value,
  label,
  tone = 'neutral',
}: {
  value: number | string;
  label: string;
  tone?: Tone;
}) {
  return (
    <div className={cn('rounded-2xl border p-5', tones[tone])}>
      <div className="text-4xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm font-medium text-ink-500">{label}</div>
    </div>
  );
}
