import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Check, Plus, Search, Trash, Undo } from '@/components/icons';
import { posErrorMessage } from '@/services/pos/i18n';
import { BASE_ITEMS, CATEGORIES, categoryName, modelKey, searchItems } from '@/services/pos/items';
import { num, toDinars } from '@/services/pos/logic';
import type { PosSetup, PosStore } from '@/services/pos/store';
import type { PosItem, PosItemChange, PosSettings } from '@/services/pos/types';
import { cn } from '@/utils/cn';
import { IconButton, IqdInput, Labelled, Notice, Photo, SelectBox, field } from './ui';

const th = 'whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold text-ink-500 first:pl-5 last:pr-4';
const td = 'px-3 py-3 align-middle first:pl-5 last:pr-4';

/** Prices, the offer, the dollar and what the invoice prints — one for every till. */
export function PriceList({ store, setup, items, onChanged }: { store: PosStore; setup: PosSetup; items: PosItem[]; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);
  const { settings, changes } = setup;
  const list = useMemo(() => searchItems(items, query).filter((i) => !category || i.category === category), [items, query, category]);
  const dinars = (n: number) => num(toDinars(n, settings.rate, settings.rounding));

  async function run(work: () => Promise<void>, done: string): Promise<boolean> {
    try {
      await work();
      setNote({ bad: false, text: done });
      onChanged();
      return true;
    } catch (err) {
      setNote({ bad: true, text: posErrorMessage(err) });
      return false;
    }
  }

  /** The item's change with one thing different. */
  function saveItem(item: PosItem, change: Partial<PosItemChange>) {
    const before = changes.find((c) => c.id === item.id);
    const next: PosItemChange = { id: item.id, ...before, ...change };
    if (item.custom && next.custom) {
      // An added item carries its own prices.
      next.custom = { ...next.custom, price: next.price ?? next.custom.price };
      if (next.offer === null) delete next.custom.offer;
      else if (next.offer !== undefined) next.custom.offer = next.offer;
      delete next.price;
      delete next.offer;
    }
    return run(() => store.saveItem(next), `${item.model} is saved.`);
  }

  function reset(item: PosItem) {
    if (item.custom && !window.confirm(`Remove ${item.model} from the price list?`)) return;
    void run(() => store.resetItem(item.id), item.custom ? `${item.model} is removed.` : `${item.model} is back to the price list.`);
  }

  const regular = (item: PosItem) => <DollarInput label={`${item.model} regular price`} value={item.price} onSave={(price) => price !== null && void saveItem(item, { price })} />;
  const offer = (item: PosItem) => <DollarInput label={`${item.model} offer price`} value={item.offer ?? null} onSave={(o) => void saveItem(item, { offer: o })} empty />;
  const shown = (item: PosItem) => <Toggle checked={!item.hidden} onChange={(on) => void saveItem(item, { hidden: !on })} ariaLabel={`${item.model} on the till`} />;
  const undo = (item: PosItem) =>
    changes.some((c) => c.id === item.id) ? <IconButton icon={item.custom ? Trash : Undo} tone={item.custom ? 'red' : 'grey'} label={item.custom ? 'Remove' : 'Back to the price list'} onClick={() => reset(item)} /> : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {note && <Notice tone={note.bad ? 'danger' : 'success'}>{note.text}</Notice>}

      <SettingsForm
        settings={settings}
        onSave={(next) =>
          run(async () => {
            // The newest dollar stays unless it was changed here.
            const now = (await store.setup()).settings;
            const rateChanged = next.rate !== settings.rate;
            await store.saveSettings({ ...now, ...next, rate: rateChanged ? next.rate : now.rate, rateSet: rateChanged || now.rateSet });
          }, 'The settings are saved for every till.')
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <h3 className="mr-auto font-bold text-ink-900">Items and prices</h3>
          <label className="relative block w-full sm:w-72">
            <Search width={17} height={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className={cn(field, 'ps-10')} value={query} placeholder="Search a model or a name" aria-label="Search" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <SelectBox className="w-full sm:w-52" value={category} aria-label="Category" onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectBox>
        </div>

        <table className="hidden w-full border-t border-slate-100 lg:table">
          <thead className="border-b border-slate-200 bg-slate-50/70">
            <tr>
              <th className={th}>Item</th>
              <th className={cn(th, 'hidden xl:table-cell')}>Category</th>
              <th className={th}>Regular price</th>
              <th className={th}>Offer price</th>
              <th className={cn(th, 'text-right!')}>Regular IQD</th>
              <th className={cn(th, 'text-right!')}>Offer IQD</th>
              <th className={cn(th, 'text-right!')}>On the till</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((item) => (
              <tr key={item.id} className={cn(item.hidden && 'bg-slate-50/70')}>
                <td className={td}>
                  <div className={cn('flex items-center gap-3', item.hidden && 'opacity-50')}>
                    <Photo image={item.image} sizes="48px" className="size-12 rounded-xl" />
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-900">{item.model}</div>
                      <div className="text-[13px] text-ink-500">{item.name}</div>
                    </div>
                  </div>
                </td>
                <td className={cn(td, 'hidden text-sm text-ink-600 xl:table-cell')}>{categoryName(item.category)}</td>
                <td className={td}>{regular(item)}</td>
                <td className={td}>{offer(item)}</td>
                <td className={cn(td, 'text-right text-sm tabular-nums text-ink-600')}>{dinars(item.price)}</td>
                <td className={cn(td, 'text-right text-sm font-bold tabular-nums text-ink-900')}>{item.offer !== undefined ? dinars(item.offer) : '—'}</td>
                <td className={cn(td, 'w-36')}>
                  <div className="flex items-center justify-end gap-2">
                    {undo(item)}
                    {shown(item)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-slate-100 border-t border-slate-100 lg:hidden">
          {list.map((item) => (
            <li key={item.id} className="px-4 py-4">
              <div className="flex items-center gap-3">
                <Photo image={item.image} sizes="52px" className={cn('size-13 rounded-xl', item.hidden && 'opacity-50')} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-900">{item.model}</div>
                  <div className="truncate text-[13px] text-ink-500">{item.name}</div>
                </div>
                {undo(item)}
                {shown(item)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Labelled label={`Regular · ${dinars(item.price)} IQD`}>{regular(item)}</Labelled>
                <Labelled label={item.offer !== undefined ? `Offer · ${dinars(item.offer)} IQD` : 'Offer'}>{offer(item)}</Labelled>
              </div>
            </li>
          ))}
        </ul>
        {!list.length && <p className="border-t border-slate-100 px-5 py-14 text-center text-ink-500">No item matches this search.</p>}
      </Card>

      <AddItem taken={items} onAdd={(change) => run(() => store.saveItem(change), `${change.custom?.model} is added to every till.`)} />
    </div>
  );
}

/** A dollar price, saved on leaving the box or with Enter. */
function DollarInput({ value, onSave, label, empty }: { value: number | null; onSave: (n: number | null) => void; label: string; empty?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  function leave() {
    if (text === null) return;
    const clean = text.trim();
    const n = Number(clean);
    setText(null);
    if (clean === '') {
      if (empty && value !== null) onSave(null);
    } else if (Number.isFinite(n) && n > 0 && n !== value) onSave(Math.round(n * 100) / 100);
  }
  return (
    <span className="relative block w-full lg:w-28">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
      <input
        className={cn(field, 'h-10! ps-7 font-semibold tabular-nums')}
        aria-label={label}
        inputMode="decimal"
        value={text ?? (value === null ? '' : String(value))}
        placeholder="—"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, '').slice(0, 8))}
        onBlur={leave}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </span>
  );
}

function SettingsForm({ settings, onSave }: { settings: PosSettings; onSave: (s: PosSettings) => Promise<boolean> }) {
  const [form, setForm] = useState<PosSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const s = form ?? settings;
  const set = (change: Partial<PosSettings>) => setForm({ ...s, ...change });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (await onSave(s)) setForm(null);
    setBusy(false);
  }

  return (
    <Card className="p-5">
      <form onSubmit={(e) => void submit(e)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink-900">Settings</h3>
            <p className="text-sm text-ink-500">One for every till.</p>
          </div>
          <Button type="submit" variant={form ? 'primary' : 'outline'} loading={busy} disabled={!form || s.rate < 100} leftIcon={<Check width={17} height={17} />}>
            Save settings
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <Labelled label="Dinars for $100">
            <IqdInput value={Math.round(s.rate * 100)} max={10_000_000} onChange={(n) => set({ rate: n / 100 })} />
          </Labelled>
          <Labelled label="Round prices to">
            <SelectBox value={s.rounding} onChange={(e) => set({ rounding: Number(e.target.value) })}>
              {[1, 250, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'No rounding' : `${num(n)} IQD`}
                </option>
              ))}
            </SelectBox>
          </Labelled>
          <Labelled label="Offer name" className="max-lg:col-span-2">
            <input className={field} value={s.offer.name} maxLength={40} onChange={(e) => set({ offer: { ...s.offer, name: e.target.value } })} />
          </Labelled>
          <Labelled label="Offer from">
            <input className={field} type="date" value={s.offer.from} onChange={(e) => set({ offer: { ...s.offer, from: e.target.value } })} />
          </Labelled>
          <Labelled label="Offer until">
            <input className={field} type="date" value={s.offer.to} min={s.offer.from} onChange={(e) => set({ offer: { ...s.offer, to: e.target.value } })} />
          </Labelled>
          <Labelled label="Phone on the invoice" className="col-span-2">
            <input className={field} value={s.phone} maxLength={80} placeholder="Not printed when empty" onChange={(e) => set({ phone: e.target.value })} />
          </Labelled>
          <Labelled label="Address on the invoice" className="col-span-2 lg:col-span-3">
            <input className={field} dir="auto" value={s.address} maxLength={120} placeholder="Not printed when empty" onChange={(e) => set({ address: e.target.value })} />
          </Labelled>
        </div>
      </form>
    </Card>
  );
}

/** A photo made small enough to keep with the item. */
async function smallPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = 480;
  const scale = Math.min(side / bitmap.width, side / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot read the photo.');
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h);
  return canvas.toDataURL('image/webp', 0.85);
}

const EMPTY = { model: '', name: '', ku: '', category: CATEGORIES[0].id, spec: '', price: '', offer: '' };

function AddItem({ taken, onAdd }: { taken: PosItem[]; onAdd: (change: PosItemChange) => Promise<boolean> }) {
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...change }));
  const money = (value: string) => value.replace(/[^\d.]/g, '').slice(0, 8);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const model = form.model.trim();
    const price = Number(form.price);
    const offer = form.offer ? Number(form.offer) : undefined;
    const used = [...taken, ...BASE_ITEMS].some((i) => [i.model, ...(i.variants?.map((v) => v.code) ?? [])].some((c) => modelKey(c) === modelKey(model)));
    if (!model || !form.name.trim() || !(price > 0)) return setError('Write the model, the name and the price.');
    if (used) return setError(`${model} is already on the price list.`);
    if (offer !== undefined && !(offer > 0)) return setError('Check the offer price.');
    setBusy(true);
    setError('');
    const ok = await onAdd({
      id: `own-${modelKey(model).toLowerCase()}`,
      custom: { model, name: form.name.trim(), ku: form.ku.trim(), category: form.category, spec: form.spec.trim(), price, ...(offer ? { offer } : {}), image },
    });
    setBusy(false);
    if (!ok) return;
    setForm({ ...EMPTY, category: form.category });
    setImage('');
  }

  return (
    <Card className="p-5">
      <form onSubmit={(e) => void submit(e)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-ink-900">Add an item</h3>
            <p className="text-sm text-ink-500">It shows on every till at once.</p>
          </div>
          <Button type="submit" loading={busy} leftIcon={<Plus width={17} height={17} />}>
            Add item
          </Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Labelled label="Model">
            <input className={field} value={form.model} maxLength={40} onChange={(e) => set({ model: e.target.value })} />
          </Labelled>
          <Labelled label="Name">
            <input className={field} value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Labelled>
          <Labelled label="Kurdish name">
            <input className={field} dir="auto" value={form.ku} maxLength={80} onChange={(e) => set({ ku: e.target.value })} />
          </Labelled>
          <Labelled label="Category">
            <SelectBox value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectBox>
          </Labelled>
          <Labelled label="Size and power">
            <input className={field} value={form.spec} maxLength={60} placeholder="8 L · 1800 W" onChange={(e) => set({ spec: e.target.value })} />
          </Labelled>
          <Labelled label="Price in dollars">
            <input className={field} inputMode="decimal" value={form.price} onChange={(e) => set({ price: money(e.target.value) })} />
          </Labelled>
          <Labelled label="Offer price in dollars">
            <input className={field} inputMode="decimal" value={form.offer} placeholder="None" onChange={(e) => set({ offer: money(e.target.value) })} />
          </Labelled>
          <div className="flex min-w-0 items-end gap-3">
            {image && <Photo image={image} className="size-11 rounded-xl" pad="p-1" />}
            <Labelled label="Photo" className="flex-1">
              <input
                type="file"
                accept="image/*"
                className="block h-11 w-full min-w-0 rounded-xl border border-dashed border-slate-300 bg-card p-1.5 text-sm text-ink-500 file:mr-3 file:h-8 file:cursor-pointer file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-semibold file:text-ink-700"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setImage(await smallPhoto(file));
                    setError('');
                  } catch {
                    setError('This photo could not be read.');
                  }
                  e.target.value = '';
                }}
              />
            </Labelled>
          </div>
        </div>
        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
      </form>
    </Card>
  );
}
