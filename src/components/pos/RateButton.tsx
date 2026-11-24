import { useState } from 'react';
import { posErrorMessage, type PosText } from '@/services/pos/i18n';
import { num, rateText } from '@/services/pos/logic';
import { cn } from '@/utils/cn';
import { IqdInput, PosDialog } from './parts';

/** The dollar today, one rate for every till: shown, and changed from here. */
export function RateButton({ rate, isSet, onSave, t }: { rate: number; /** Someone has set it; else it is still the built-in one. */ isSet: boolean; onSave: (rate: number) => Promise<void>; t: PosText }) {
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
        className={cn('pos-rate', !isSet && 'warn')}
        onClick={() => {
          setValue(Math.round(rate * 100));
          setError('');
          setOpen(true);
        }}
      >
        <span>{t.dollar}</span>
        <b className="num">{rateText(rate)}</b>
      </button>
      {open && (
        <PosDialog
          title={t.dollar}
          hint={t.dollarHint}
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" className="pos-btn" onClick={() => setOpen(false)}>
                {t.cancel}
              </button>
              <button type="button" className="pos-btn pos-btn-red" disabled={!good || busy} onClick={() => void save()}>
                {busy ? t.saving : t.saveRate}
              </button>
            </>
          }
        >
          <label className="pos-field">
            <span>{t.dollarField}</span>
            <IqdInput value={value} emptyIsZero max={100_000_000} className="big" onChange={setValue} onEnter={() => void save()} />
          </label>
          {value > 0 && <p className="num pos-one">{t.dollarOne(num(value / 100))}</p>}
          {error && (
            <div className="pos-error" role="alert">
              {error}
            </div>
          )}
        </PosDialog>
      )}
    </>
  );
}
