import { useMemo, useState, type FormEvent } from 'react';
import { posErrorMessage } from '@/services/pos/i18n';
import { BASE_ITEMS, CATEGORIES, categoryName, modelKey, searchItems } from '@/services/pos/items';
import { num, toDinars } from '@/services/pos/logic';
import type { PosSetup, PosStore } from '@/services/pos/store';
import type { PosItem, PosItemChange, PosSettings } from '@/services/pos/types';
import { IqdInput, Photo } from './parts';

/** Prices, the offer, the dollar and what the invoice prints — one for every till. */
export function PriceList({ store, setup, items, onChanged }: { store: PosStore; setup: PosSetup; items: PosItem[]; onChanged: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null);
  const { settings, changes } = setup;
  const list = useMemo(
    () => searchItems(items, query).filter((i) => !category || i.category === category),
    [items, query, category],
  );

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

  return (
    <div className="pr-prices">
      {note && (
        <p className={`pr-said${note.bad ? ' bad' : ''}`} role="status">
          {note.text}
        </p>
      )}
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

      <section className="pr-box">
        <div className="pr-bar">
          <h2>Items and prices</h2>
          <input type="search" value={query} placeholder="Search a model or a name" aria-label="Search" onChange={(e) => setQuery(e.target.value)} />
          <select value={category} aria-label="Category" onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <table className="pr-table prices">
          <thead>
            <tr>
              <th>Item</th>
              <th className="hide-sm">Category</th>
              <th className="end">Regular $</th>
              <th className="end">Offer $</th>
              <th className="end hide-tab">Regular IQD</th>
              <th className="end">Offer IQD</th>
              <th>On the till</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((item) => {
              const dinars = (n: number) => num(toDinars(n, settings.rate, settings.rounding));
              const changed = changes.some((c) => c.id === item.id);
              return (
                <tr key={item.id} className="plain">
                  <td>
                    <span className="pr-item">
                      <span className="pr-photo"><Photo image={item.image} sizes="48px" /></span>
                      <span>
                        <b>{item.model}</b>
                        <small>{item.name}</small>
                      </span>
                    </span>
                  </td>
                  <td className="hide-sm">{categoryName(item.category)}</td>
                  <td className="end" data-label="Regular $">
                    <DollarInput label={`${item.model} regular price`} value={item.price} onSave={(price) => price !== null && void saveItem(item, { price })} />
                  </td>
                  <td className="end" data-label="Offer $">
                    <DollarInput label={`${item.model} offer price`} value={item.offer ?? null} onSave={(offer) => void saveItem(item, { offer })} empty />
                  </td>
                  <td className="end hide-tab" data-label="Regular IQD">{dinars(item.price)}</td>
                  <td className="end strong" data-label="Offer IQD">{item.offer !== undefined ? dinars(item.offer) : '—'}</td>
                  <td data-label="On the till">
                    <label className="pr-check">
                      <input type="checkbox" checked={!item.hidden} onChange={(e) => void saveItem(item, { hidden: !e.target.checked })} />
                      {item.hidden ? 'Hidden' : 'Shown'}
                    </label>
                  </td>
                  <td className="end">
                    {changed && (
                      <button
                        type="button"
                        className="pr-link"
                        onClick={() => {
                          if (item.custom && !window.confirm(`Remove ${item.model} from the price list?`)) return;
                          void run(() => store.resetItem(item.id), item.custom ? `${item.model} is removed.` : `${item.model} is back to the price list.`);
                        }}
                      >
                        {item.custom ? 'Remove' : 'Undo'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length && <p className="pr-none">No item matches this search.</p>}
      </section>

      <AddItem taken={items} onAdd={(change) => run(() => store.saveItem(change), `${change.custom?.model} is added to every till.`)} />
    </div>
  );
}

/** A dollar price, saved on leaving the field or with Enter. */
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
    <span className="pr-dollar">
      <input
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
    <form className="pr-box pr-form" onSubmit={(e) => void submit(e)}>
      <h2>Settings for every till</h2>
      <div className="pr-fields">
        <label>
          <span>Dinars for $100</span>
          <IqdInput value={Math.round(s.rate * 100)} max={10_000_000} onChange={(n) => set({ rate: n / 100 })} />
        </label>
        <label>
          <span>Round prices to</span>
          <select value={s.rounding} onChange={(e) => set({ rounding: Number(e.target.value) })}>
            {[1, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'No rounding' : `${num(n)} IQD`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Offer name</span>
          <input value={s.offer.name} maxLength={40} onChange={(e) => set({ offer: { ...s.offer, name: e.target.value } })} />
        </label>
        <label>
          <span>Offer from</span>
          <input type="date" value={s.offer.from} onChange={(e) => set({ offer: { ...s.offer, from: e.target.value } })} />
        </label>
        <label>
          <span>Offer until</span>
          <input type="date" value={s.offer.to} min={s.offer.from} onChange={(e) => set({ offer: { ...s.offer, to: e.target.value } })} />
        </label>
        <label>
          <span>Phone on the invoice</span>
          <input value={s.phone} maxLength={80} placeholder="Not printed when empty" onChange={(e) => set({ phone: e.target.value })} />
        </label>
        <label className="wide">
          <span>Address on the invoice</span>
          <input dir="auto" value={s.address} maxLength={120} placeholder="Not printed when empty" onChange={(e) => set({ address: e.target.value })} />
        </label>
        <button type="submit" className="pr-btn red" disabled={!form || busy || s.rate < 100}>
          Save settings
        </button>
      </div>
    </form>
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
    <form className="pr-box pr-form" onSubmit={(e) => void submit(e)}>
      <h2>Add an item</h2>
      <div className="pr-fields">
        <label>
          <span>Model</span>
          <input value={form.model} maxLength={40} onChange={(e) => set({ model: e.target.value })} />
        </label>
        <label>
          <span>Name</span>
          <input value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          <span>Kurdish name</span>
          <input dir="auto" value={form.ku} maxLength={80} onChange={(e) => set({ ku: e.target.value })} />
        </label>
        <label>
          <span>Category</span>
          <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Size and power</span>
          <input value={form.spec} maxLength={60} placeholder="8 L · 1800 W" onChange={(e) => set({ spec: e.target.value })} />
        </label>
        <label>
          <span>Price $</span>
          <input inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} />
        </label>
        <label>
          <span>Offer price $</span>
          <input inputMode="decimal" value={form.offer} placeholder="none" onChange={(e) => set({ offer: e.target.value.replace(/[^\d.]/g, '') })} />
        </label>
        <label>
          <span>Photo</span>
          <input
            type="file"
            accept="image/*"
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
        </label>
        {image && <span className="pr-photo large"><Photo image={image} /></span>}
        <button type="submit" className="pr-btn red" disabled={busy}>
          Add item
        </button>
      </div>
      {error && <p className="pr-said bad" role="alert">{error}</p>}
    </form>
  );
}
