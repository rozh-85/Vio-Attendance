import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { baghdadDay, reminderDay, type Place, type PlaceInput, type PlacesData } from '@/services/places/types';
import { loadPlaces, savePlace, logCall, submitPlaceOrder } from '@/services/places/store';
import type { NewSalesOrder, SellerOrder } from '@/services/orders/types';
import { formatIqd, STATUS_LABEL } from '@/services/orders/options';
import { paths } from '@/routes';

export interface PlaceFormProps { place: Place; onSubmit: (order: NewSalesOrder) => Promise<string | null>; onCancel: () => void }
export function SellerPlacesPage({ token, orders, onOrdersChanged, renderOrder }: { token: string; orders: SellerOrder[]; onOrdersChanged: () => Promise<unknown>; renderOrder: (props: PlaceFormProps) => ReactNode }) {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [editing, setEditing] = useState(false);
  const [addingOrder, setAddingOrder] = useState(false);
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    try { setData(await loadPlaces(token)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load places.'); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void reload(); const timer = window.setInterval(() => void reload(), 60_000); return () => clearInterval(timer); }, [reload]);
  useEffect(() => { setEditing(false); setAddingOrder(false); setNote(''); setNextDate(''); setNotice(''); }, [placeId]);
  const place = data.places.find((p) => p.id === placeId);
  const filtered = data.places.filter((p) => [p.name,p.person_name,p.phone,p.city,p.kind].join(' ').toLowerCase().includes(query.toLowerCase()) && (!dueOnly || reminderDay(p) <= baghdadDay()));
  const due = data.places.filter((p) => reminderDay(p) <= baghdadDay()).length;
  const links = new Set(data.links.filter((l) => l.place_id === placeId).map((l) => l.order_id));
  const placeOrders = orders.filter((o) => links.has(o.id));

  async function recordCall(e: FormEvent) {
    e.preventDefault(); if (!place) return; setBusy(true); setError('');
    try { await logCall(token, place.id, note, nextDate || null); setNote(''); setNextDate(''); setNotice('Call recorded. The next reminder is scheduled.'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save call.'); } finally { setBusy(false); }
  }
  if (loading) return <p className="p-10 text-ink-500">Loading places…</p>;
  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}<button className="ml-3 underline" onClick={() => void reload()}>Retry</button></div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</div>}
    {placeId && !place ? <p>Place not found. <Link to={paths.sellerPlaces} className="underline">Back to places</Link></p> : place ? <>
      <Link to={paths.sellerPlaces} className="text-sm font-semibold text-brand-700">← All places</Link>
      <Card className="p-6"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm font-semibold text-brand-600">{place.kind} · {place.city}</p><h2 className="mt-1 text-3xl font-bold">{place.name}</h2><p className="mt-2 text-ink-500">{place.person_name} · {place.phone}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(!editing)}>Edit place</Button><Button onClick={() => { setAddingOrder(true); setEditing(false); }}>Add order</Button></div></div><p className="mt-5 font-semibold">Next call: {reminderDay(place)} <span className="text-sm font-normal text-ink-500">· {place.reminder_date ? 'Manual date' : 'Automatic, 30 days after latest activity'}</span></p></Card>
      {editing && <PlaceEditor key={place.id} initial={place} token={token} onSaved={async () => { setEditing(false); await reload(); }} onCancel={() => setEditing(false)} />}
      {addingOrder ? <section><h3 className="mb-4 text-xl font-bold">New order for {place.name}</h3>{renderOrder({ place, onCancel: () => setAddingOrder(false), onSubmit: async (order) => {
        try { const result = await submitPlaceOrder(token, place.id, order); localStorage.removeItem(`vio.placeOrderDraft.${place.id}`); setAddingOrder(false); setNotice(`Order #${result.orderNo} saved for ${place.name}.`); await Promise.all([reload(), onOrdersChanged()]); return null; }
        catch (e) { return e instanceof Error ? e.message : 'Could not save order.'; }
      } })}</section> : <>
        <Card className="p-5"><h3 className="mb-4 text-lg font-bold">Record a call</h3><form onSubmit={recordCall} className="space-y-4"><Textarea label="Call notes" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /><Input label="Next call date (optional)" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} hint="Leave blank to remind you in 30 days. Choose a date to schedule it manually." /><Button type="submit" loading={busy}>Mark called & schedule reminder</Button></form></Card>
        <Card className="overflow-hidden"><h3 className="p-5 text-lg font-bold">Orders for this place · {placeOrders.length}</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Order','Date','Item','Total','Status'].map((h) => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{placeOrders.map((o) => <tr key={o.id} className="border-t border-slate-100"><td className="p-4">#{o.orderNo}</td><td className="p-4">{baghdadDay(new Date(o.createdAt))}</td><td className="p-4">{o.itemModel || o.itemCategory}</td><td className="p-4">{formatIqd(o.totalPrice)}</td><td className="p-4">{STATUS_LABEL[o.status]}</td></tr>)}</tbody></table>{!placeOrders.length && <p className="p-5 text-ink-500">No orders yet. Use Add order to save the first one.</p>}</div></Card>
        <Card className="p-5"><h3 className="mb-4 text-lg font-bold">Call history</h3>{data.calls.filter((c) => c.place_id === place.id).sort((a,b) => b.called_at.localeCompare(a.called_at)).map((c) => <div key={c.id} className="border-t border-slate-100 py-3"><p className="text-sm font-semibold">{new Date(c.called_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })}</p><p className="whitespace-pre-wrap text-ink-500">{c.note || 'Call completed'}</p></div>)}{!data.calls.some((c) => c.place_id === place.id) && <p className="text-ink-500">No calls recorded.</p>}</Card>
      </>}
    </> : <>
      <div className="grid gap-3 sm:grid-cols-3">{[[data.places.length,'Places'],[due,'Calls due'],[data.links.length,'Place orders']].map(([n,label]) => <Card key={label} className="p-5"><div className="text-3xl font-bold">{n}</div><div className="text-sm text-ink-500">{label}</div></Card>)}</div>
      {due > 0 && <div className="rounded-xl bg-amber-50 p-4 text-amber-800">{due} {due === 1 ? 'place needs' : 'places need'} a follow-up call. <button className="font-bold underline" onClick={() => { setDueOnly(true); setView('table'); }}>Show due calls</button></div>}
      <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1"><Input label="Search places" placeholder="Place, contact, phone or city…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Button variant="outline" onClick={() => setView(view === 'table' ? 'calendar' : 'table')}>{view === 'table' ? 'Calendar' : 'Table'}</Button><Button onClick={() => setEditing(!editing)}>Add place</Button></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Due and overdue calls only</label>
      {editing && <PlaceEditor token={token} onCancel={() => setEditing(false)} onSaved={async (id) => { await reload(); navigate(paths.sellerPlace(id)); }} />}
      {view === 'table' ? <PlacesTable places={filtered} /> : <PlacesCalendar places={filtered} />}
      <p className="text-sm text-ink-400">Reminders appear here while using the app. Automatic dates are 30 days after adding the place or its latest call/order. Manual dates stay fixed until you change them or record a call.</p>
    </>}
  </div>;
}

function PlaceEditor({ initial, token, onSaved, onCancel }: { initial?: Place; token: string; onSaved: (id: string) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PlaceInput>(initial ?? { name: '', person_name: '', phone: '', city: '', kind: 'Hotel', reminder_date: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await onSaved(await savePlace(token, form, initial?.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save place.'); } finally { setBusy(false); }
  }
  return <Card className="p-5"><h3 className="mb-4 text-lg font-bold">{initial ? 'Edit place' : 'Add a place'}</h3><form onSubmit={submit} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">
    {([['person_name','Person name'],['name','Place name'],['phone','Phone number'],['city','City']] as const).map(([key,label]) => <Input key={key} label={label} value={form[key]} maxLength={key === 'phone' ? 50 : 200} type={key === 'phone' ? 'tel' : 'text'} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
    <label className="text-sm font-semibold">Place type<select className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-card px-4" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{['Hotel','School','Restaurant','Office','Other'].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
    <Input label="Call reminder date (optional)" type="date" value={form.reminder_date || ''} onChange={(e) => setForm({ ...form, reminder_date: e.target.value || null })} hint="Leave blank for automatic reminders every 30 days after activity." />
  </div>{error && <p role="alert" className="text-rose-600">{error}</p>}<div className="flex gap-2"><Button type="submit" loading={busy}>Save place</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div></form></Card>;
}
