import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { posErrorMessage, type PosText } from '@/services/pos/i18n';
import { num, rateText } from '@/services/pos/logic';
import { cn } from '@/utils/cn';
import { IqdInput, Labelled, Notice, PosDialog, ltrText } from './ui';

/** The dollar today, one rate for every till: shown, and changed from here. */
export function RateButton({ rate, isSet, onSave, t, className }: {
  rate: number;
  /** Someone has set it; else it is still the built-in one. */
  isSet: boolean;
  onSave: (rate: number) => Promise<void>;
  t: PosText;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const good = value >= 10_000 && value <= 10_000_000;

  async function save() {
    if (!good || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(value / 100);
      setOpen(false);
    } catch (err) {
      setError(posErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(Math.round(rate * 100));
          setError('');
          setOpen(true);
        }}
        className={cn(
          'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm transition',
          isSet ? 'border-slate-200 bg-card hover:bg-slate-50' : 'border-amber-300 bg-amber-50 hover:bg-amber-100',
          className,
        )}
      >
        <span className={cn('font-medium', isSet ? 'text-ink-500' : 'text-amber-800')}>{t.dollar}</span>
        <b className={cn('font-semibold tabular-nums', ltrText, isSet ? 'text-ink-900' : 'text-amber-900')}>{rateText(rate)}</b>
      </button>
      {open && (
        <PosDialog
          title={t.dollar}
          hint={t.dollarHint}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <Button disabled={!good} loading={busy} onClick={() => void save()}>
                {t.saveRate}
              </Button>
            </>
          }
        >
          <Labelled label={t.dollarField}>
            <IqdInput value={value} emptyIsZero max={100_000_000} className="h-16! text-3xl! font-bold!" onChange={setValue} onEnter={() => void save()} />
          </Labelled>
          {value > 0 && <p className={cn('mt-2 text-sm font-medium text-ink-500', ltrText)}>{t.dollarOne(num(value / 100))}</p>}
          {error && (
            <Notice tone="danger" className="mt-3">
              {error}
            </Notice>
          )}
        </PosDialog>
      )}
    </>
  );
}
