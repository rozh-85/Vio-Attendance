import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Pencil, Plus, Trash } from '@/components/icons';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { CallHistory, isDue, PlaceEditorModal, PlaceOrdersCard, PlaceProfileHeader, PlacesStats, PlacesToolbar, RecordCallCard } from '@/components/places/PlaceParts';
import type { Place, PlaceInput, PlacesData } from '@/services/places/types';
import { loadPlaces, savePlace, deletePlace, logCall, submitPlaceOrder } from '@/services/places/store';
import type { NewSalesOrder, SellerOrder } from '@/services/orders/types';
import { formatIqd } from '@/services/orders/options';
import { paths } from '@/routes';

export interface PlaceFormProps { place: Place; onSubmit: (order: NewSalesOrder) => Promise<string | null>; onCancel: () => void }

/** Gashben's places: a table of hotels, schools… with call reminders, and each place's profile. */
export function SellerPlacesPage({ token, orders, onOrdersChanged, renderOrder }: { token: string; orders: SellerOrder[]; onOrdersChanged: () => Promise<unknown>; renderOrder: (props: PlaceFormProps) => ReactNode }) {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [view, setView] = useState<'table' | 'calendar'>('table');
  // null: closed; 'new': adding; a place: editing it.
  const [editor, setEditor] = useState<Place | 'new' | null>(null);
  const [addingOrder, setAddingOrder] = useState(false);
  const [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    try { setData(await loadPlaces(token)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load places.'); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void reload(); const timer = window.setInterval(() => void reload(), 60_000); return () => clearInterval(timer); }, [reload]);
  useEffect(() => { setEditor(null); setAddingOrder(false); setNotice(''); }, [placeId]);

  const place = data.places.find((p) => p.id === placeId);
  const due = data.places.filter(isDue).length;
  const filtered = data.places.filter((p) => [p.name, p.person_name, p.phone, p.city, p.kind].join(' ').toLowerCase().includes(query.trim().toLowerCase()) && (!dueOnly || isDue(p)));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordersOf = (id: string) => data.links.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SellerOrder => !!o);
  const totals = (id: string) => { const list = ordersOf(id); return { count: list.length, total: list.reduce((s, o) => s + o.totalPrice, 0) }; };
  const linkedValue = data.places.reduce((s, p) => s + totals(p.id).total, 0);

  async function save(input: PlaceInput) {
    const editing = editor !== 'new' && editor ? editor : null;
    const id = await savePlace(token, input, editing?.id);
    setEditor(null);
    await reload();
    if (!editing) navigate(paths.sellerPlace(id));
  }
  async function removePlace(target: Place) {
    if (!window.confirm(`Delete ${target.name}? Its call history and place links will be removed.`)) return;
    try { await deletePlace(token, target.id); if (placeId) navigate(paths.sellerPlaces); else await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete place.'); }
  }
  async function recordCall(note: string, nextDate: string | null) {
    if (!place) return;
    try { await logCall(token, place.id, note, nextDate); setNotice('Call recorded. The next reminder is scheduled.'); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save call.'); throw e; }
  }

  if (loading) return <p className="p-10 text-ink-500">Loading places…</p>;
  return <div className="space-y-5">
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}<button className="ml-3 underline" onClick={() => void reload()}>Retry</button></div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</div>}

    {placeId && !place ? <p>Place not found. <Link to={paths.sellerPlaces} className="underline">Back to places</Link></p> : place ? <>
      <Link to={paths.sellerPlaces} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft width={16} height={16} /> All places</Link>
      <PlaceProfileHeader place={place} actions={<>
        <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setAddingOrder(true)}>Add order</Button>
        <Button variant="outline" leftIcon={<Pencil width={15} height={15} />} onClick={() => setEditor(place)}>Edit</Button>
        <Button variant="ghost" aria-label="Delete place" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePlace(place)}><Trash width={16} height={16} /></Button>
      </>} />
      {addingOrder ? <section>
        <h3 className="mb-4 text-xl font-bold">New order for {place.name}</h3>
        {renderOrder({ place, onCancel: () => setAddingOrder(false), onSubmit: async (order) => {
          try { const result = await submitPlaceOrder(token, place.id, order); localStorage.removeItem(`vio.placeOrderDraft.${place.id}`); setAddingOrder(false); setNotice(`Order #${result.orderNo} saved for ${place.name}.`); await Promise.all([reload(), onOrdersChanged()]); return null; }
          catch (e) { return e instanceof Error ? e.message : 'Could not save order.'; }
        } })}
      </section> : <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <PlaceOrdersCard orders={ordersOf(place.id)} empty="No orders yet. Tap Add order to save the first one for this place." action={<Button size="sm" variant="secondary" leftIcon={<Plus width={15} height={15} />} onClick={() => setAddingOrder(true)}>Add order</Button>} />
          <CallHistory calls={data.calls.filter((c) => c.place_id === place.id)} />
        </div>
        <RecordCallCard onSave={recordCall} />
      </div>}
    </> : <>
      <PlacesStats items={[
        { label: 'Places', value: data.places.length },
        { label: 'Calls due', value: due, tone: due ? 'danger' : 'neutral' },
        { label: 'Place orders', value: data.links.length, tone: 'info' },
        { label: 'Order value', value: formatIqd(linkedValue), tone: 'success' },
      ]} />
      <PlacesToolbar query={query} onQuery={setQuery} dueOnly={dueOnly} onDueOnly={setDueOnly} dueCount={due} view={view} onView={setView}>
        <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setEditor('new')}>Add place</Button>
      </PlacesToolbar>
      {view === 'table' ? <PlacesTable places={filtered} totals={totals} onEdit={setEditor} onDelete={(target) => void removePlace(target)} /> : <PlacesCalendar places={filtered} />}
      <p className="text-sm text-ink-400">Automatic reminders come 30 days after adding a place or its latest call or order. A date you pick stays until you change it or record a call.</p>
    </>}

    <PlaceEditorModal open={editor !== null} initial={editor === 'new' ? null : editor} onSave={save} onClose={() => setEditor(null)} />
  </div>;
}
