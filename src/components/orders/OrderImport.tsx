import { useState } from 'react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, Upload } from '@/components/icons';
import { UNKNOWN_SELLER } from '@/services/orders/options';
import { guessAccount, readOrderSheet, type SheetImport } from '@/services/orders/importCsv';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { SocialAccount } from '@/services/orders/types';

/** '' keeps the name from the sheet; otherwise the account id. */
type Mapping = Record<string, string>;

/**
 * Brings the old Google Form orders in, so the report starts with the full
 * history. Each seller name on the sheet can be joined to a seller account;
 * the rest keep their name as written.
 */
export function OrderImport({ accounts, onImported }: { accounts: SocialAccount[]; onImported: () => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetImport | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  async function onFile(picked: File | undefined) {
    setError(null);
    setResult(null);
    setSheet(null);
    if (!picked) return;
    if (!/\.csv$/i.test(picked.name)) {
      setError('Choose the .csv file. In Google Sheets: File → Download → Comma-separated values (.csv).');
      return;
    }
    const parsed = readOrderSheet(await picked.text());
    if (parsed.rows.length === 0) {
      setError('No orders were found in this file. Is it the "Form Responses 1" sheet?');
      return;
    }
    setFile(picked.name);
    setSheet(parsed);
    setMapping(
      Object.fromEntries(parsed.sellers.map((s) => [s.name, guessAccount(s.name, accounts)?.id ?? ''])),
    );
  }

  async function onImport() {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const rows = sheet.rows.map((row) => {
        const account = byId.get(mapping[row.sellerName] ?? '');
        return {
          ...row,
          accountId: account?.id ?? null,
          sellerName: account?.displayName ?? row.sellerName,
        };
      });
      setResult(await getOrdersStore().importOrders(rows));
      onImported();
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold text-ink-900">Import the old order sheet</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-700">
          <li>Open the Google Sheet with the order form answers.</li>
          <li>
            <b>File → Download → Comma-separated values (.csv)</b> while the <b>Form Responses 1</b> tab is open.
          </li>
          <li>Choose that file below, check the sellers, and import.</li>
        </ol>
        <p className="mt-3 text-sm text-ink-500">
          Importing the same file again later only adds the rows that are new, so you can repeat it until everyone uses
          the new order page.
        </p>
        <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center transition hover:border-brand-300 hover:bg-brand-50/40">
          <Upload width={28} height={28} className="text-brand-600" />
          <span className="font-semibold text-ink-900">{file ?? 'Choose the .csv file'}</span>
          <span className="text-sm text-ink-500">Nothing is added until you press Import.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      </Card>

      {sheet && (
        <Card className="space-y-5 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-400">Orders found</div>
              <div className="text-3xl font-bold tabular-nums">{sheet.rows.length}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-400">From</div>
              <div className="text-lg font-bold">
                {sheet.firstDate ? format(new Date(sheet.firstDate), 'd MMM yyyy') : '—'}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-400">To</div>
              <div className="text-lg font-bold">
                {sheet.lastDate ? format(new Date(sheet.lastDate), 'd MMM yyyy') : '—'}
              </div>
            </div>
          </div>

          <ul className="space-y-1 text-sm text-ink-700">
            {sheet.scaledPrices > 0 && (
              <li>
                • {sheet.scaledPrices === 1 ? '1 price was' : `${sheet.scaledPrices} prices were`} typed in thousands
                (like “180”) and will be saved ×1,000 — the original is kept in the note.
              </li>
            )}
            {sheet.missingPrices > 0 && (
              <li>
                • {sheet.missingPrices === 1 ? '1 order has' : `${sheet.missingPrices} orders have`} no readable price
                and will be saved at 0.
              </li>
            )}
            {sheet.skipped > 0 && <li>• {sheet.skipped === 1 ? '1 empty row is' : `${sheet.skipped} empty rows are`} left out.</li>}
          </ul>

          <div>
            <h3 className="font-bold text-ink-900">Sellers on the sheet</h3>
            <p className="text-sm text-ink-500">Join each name to a seller account, or keep the name as it is written.</p>
            <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {sheet.sellers.map((s) => (
                <div key={s.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div dir="auto" className="font-semibold text-ink-900">{s.name || UNKNOWN_SELLER}</div>
                    <div className="text-xs text-ink-400">{s.orders === 1 ? '1 order' : `${s.orders} orders`}</div>
                  </div>
                  <select
                    className="h-11 min-w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    value={mapping[s.name] ?? ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [s.name]: e.target.value }))}
                  >
                    <option value="">Keep as “{s.name || UNKNOWN_SELLER}”</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} (@{a.username})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {accounts.length === 0 && (
              <p className="mt-2 text-sm text-amber-700">
                Tip: add the seller accounts first, then their old orders join their new ones in the report.
              </p>
            )}
          </div>

          {result ? (
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-800">
              <Check />
              <span>
                <b>{result.added}</b> orders added
                {result.skipped > 0 && <>, {result.skipped} were already imported</>}. Open the Report tab to see them.
              </span>
            </div>
          ) : (
            <Button size="lg" loading={busy} leftIcon={<Upload />} onClick={() => void onImport()}>
              Import {sheet.rows.length} orders
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
