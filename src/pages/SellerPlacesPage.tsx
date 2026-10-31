import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Pencil, Phone, Plus, Trash } from '@/components/icons';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { CallHistory, filterPlaces, isDue, PlaceEditorModal, PlaceOrdersCard, PlaceProfileHeader, PlacesTabs, RecordCallCard, RecordCallModal, TodayCard, type PlacesTab } from '@/components/places/PlaceParts';
import type { Place, PlaceInput, PlacesData } from '@/services/places/types';
import { loadPlaces, savePlace, deletePlace, logCall, submitPlaceOrder } from '@/services/places/store';
import type { NewSalesOrder, SellerOrder } from '@/services/orders/types';
import { formatIqd } from '@/services/orders/options';
import { paths } from '@/routes';

export interface PlaceFormProps { place: Place; onSubmit: (order: NewSalesOrder) => Promise<string | null>; onCancel: () => void }

/** Gashben's places: today's calls first, every place one tap away, and each place's profile. */
export function SellerPlacesPage({ token, orders, onOrdersChanged, renderOrder }: { token: string; orders: SellerOrder[]; onOrdersChanged: () => Promise<unknown>; renderOrder: (props: PlaceFormProps) => ReactNode }) {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PlacesTab | null>(null);
  // null: closed; 'new': adding; a place: editing it.
  const [editor, setEditor] = useState<Place | 'new' | null>(null);
  const [calling, setCalling] = useState<Place | null>(null);
  const [addingOrder, setAddingOrder] = useState(false);
  const [notice, setNotice] = useState('');
  const reload = useCallback(async () => {
    try { setData(await loadPlaces(token)); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load places.'); } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void reload(); const timer = window.setInterval(() => void reload(), 60_000); return () => clearInterval(timer); }, [reload]);
  // "+ order" on the list opens the place straight on its order form.
  useEffect(() => {
    setEditor(null);
    setAddingOrder(!!(location.state as { addOrder?: boolean } | null)?.addOrder);
    if (placeId) setNotice('');
  }, [placeId, location.state]);

  const place = data.places.find((p) => p.id === placeId);
  const due = data.places.filter(isDue).length;
  // Open on the calls to make when there are any.
  const view: PlacesTab = tab ?? (due ? 'due' : 'all');
  const filtered = filterPlaces(data.places, query, view);
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
  async function recordCall(target: Place, note: string, nextDate: string | null) {
    try { await logCall(token, target.id, note, nextDate); setNotice(`Call to ${target.name} saved. The next reminder is scheduled.`); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save call.'); throw e; }
  }

  if (loading) return <p className="p-10 text-ink-500">Loading places…</p>;
  return <div className="space-y-5 pb-20 md:pb-0">
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-700">{error}<button className="ml-3 underline" onClick={() => void reload()}>Retry</button></div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{notice}</div>}

    {placeId && !place ? <p>Place not found. <Link to={paths.sellerPlaces} className="underline">Back to places</Link></p> : place ? <>
      <Link to={paths.sellerPlaces} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft width={16} height={16} /> All places</Link>
      <PlaceProfileHeader place={place} actions={<>
        <a href={`tel:${place.phone}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"><Phone width={16} height={16} /> Call</a>
        <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setAddingOrder(true)}>Add order</Button>
        <Button variant="outline" aria-label="Edit place" onClick={() => setEditor(place)}><Pencil width={15} height={15} /></Button>
        <Button variant="ghost" aria-label="Delete place" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePlace(place)}><Trash width={16} height={16} /></Button>
      </>} />
      {addingOrder ? <section>
        <h3 className="mb-4 text-xl font-bold">New order for {place.name}</h3>
        {renderOrder({ place, onCancel: () => setAddingOrder(false), onSubmit: async (order) => {
          try { const result = await submitPlaceOrder(token, place.id, order); localStorage.removeItem(`vio.placeOrderDraft.${place.id}`); setAddingOrder(false); setNotice(`Order #${result.orderNo} saved for ${place.name}.`); await Promise.all([reload(), onOrdersChanged()]); return null; }
          catch (e) { return e instanceof Error ? e.message : 'Could not save order.'; }
        } })}
      </section> : <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="order-2 space-y-5 lg:order-1 lg:col-span-2">
          <PlaceOrdersCard orders={ordersOf(place.id)} empty="No orders yet. Tap Add order to save the first one for this place." action={<Button size="sm" variant="secondary" leftIcon={<Plus width={15} height={15} />} onClick={() => setAddingOrder(true)}>Add order</Button>} />
          <CallHistory calls={data.calls.filter((c) => c.place_id === place.id)} />
        </div>
        <div className="order-1 lg:order-2 lg:sticky lg:top-6"><RecordCallCard onSave={(note, next) => recordCall(place, note, next)} /></div>
      </div>}
    </> : <>
      <TodayCard due={due} onStart={() => { setTab('due'); document.getElementById('places-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} metrics={[
        { label: 'Places', value: data.places.length },
        { label: 'Place orders', value: data.links.length },
        { label: 'Order value', value: formatIqd(linkedValue) },
      ]} />
      <div id="places-list" className="scroll-mt-20" />
      <PlacesTabs tab={view} onTab={setTab} dueCount={due} allCount={data.places.length} query={query} onQuery={setQuery}>
        <span className="hidden md:block"><Button leftIcon={<Plus width={16} height={16} />} onClick={() => setEditor('new')}>Add place</Button></span>
      </PlacesTabs>
      {view === 'calendar' ? <PlacesCalendar places={filtered} /> : <PlacesTable
        places={filtered}
        totals={totals}
        onCalled={setCalling}
        onAddOrder={(p) => navigate(paths.sellerPlace(p.id), { state: { addOrder: true } })}
        empty={view === 'due' && !query ? 'No calls due. Nice work — check All places for upcoming ones.' : undefined}
      />}
      <p className="text-sm text-ink-400">Automatic reminders come 30 days after adding a place or its latest call or order. A date you pick stays until you change it or record a call.</p>
      {/* Phones: Add place always under the thumb. */}
      <button type="button" onClick={() => setEditor('new')} className="fixed bottom-5 right-5 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-brand-600 px-5 font-bold text-white shadow-lg shadow-brand-600/30 md:hidden">
        <Plus width={20} height={20} /> Add place
      </button>
    </>}

    <PlaceEditorModal open={editor !== null} initial={editor === 'new' ? null : editor} onSave={save} onClose={() => setEditor(null)} />
    <RecordCallModal place={calling} onSave={recordCall} onClose={() => setCalling(null)} />
  </div>;
}
