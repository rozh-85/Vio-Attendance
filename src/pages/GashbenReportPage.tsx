import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Download, Pencil, Plus, Trash } from '@/components/icons';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { CallHistory, isDue, PlaceEditorModal, PlaceOrdersCard, PlaceProfileHeader, PlacesStats, PlacesToolbar } from '@/components/places/PlaceParts';
import { loadPlaces, savePlaceAsOwner, deletePlaceAsOwner } from '@/services/places/store';
import type { Place, PlaceInput, PlacesData } from '@/services/places/types';
import { getOrdersStore } from '@/services/orders/store';
import type { SalesOrder } from '@/services/orders/types';
import { formatIqd } from '@/services/orders/options';
import { exportGashbenPdf } from '@/services/report/gashbenPdf';
import { paths } from '@/routes';

/** The owner's view of Gashben's places: same table and profiles as Gashben sees, plus totals and a PDF. */
export function GashbenReportPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [view, setView] = useState<'table' | 'calendar'>('table');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Place | 'new' | null>(null);
  useEffect(() => { Promise.all([loadPlaces(), getOrdersStore().listOrders()]).then(([next, os]) => { setData(next); setOrders(os); }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load Gashben report.')).finally(() => setLoading(false)); }, []);

  const place = data.places.find((p) => p.id === placeId);
  const due = data.places.filter(isDue).length;
  const filtered = data.places.filter((p) => [p.name, p.person_name, p.phone, p.city, p.kind].join(' ').toLowerCase().includes(query.trim().toLowerCase()) && (!dueOnly || isDue(p)));
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordersOf = (id: string) => data.links.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
  const totals = (id: string) => { const list = ordersOf(id); return { count: list.length, total: list.reduce((s, o) => s + o.totalPrice, 0) }; };
  const linkedValue = data.places.reduce((s, p) => s + totals(p.id).total, 0);

  async function save(input: PlaceInput) {
    const editing = editor !== 'new' && editor ? editor : null;
    const id = await savePlaceAsOwner(input, editing?.id);
    setEditor(null);
    setData(await loadPlaces());
    if (!editing) navigate(paths.gashbenPlaceReport(id));
  }
  async function removePlace(target: Place) {
    if (!window.confirm(`Delete ${target.name}? Its call history and place links will be removed.`)) return;
    try { await deletePlaceAsOwner(target.id); setData(await loadPlaces()); if (placeId) navigate(paths.gashbenReport); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete place.'); }
  }

  if (loading) return <AdminLayout><p className="p-10 text-ink-500">Loading Gashben report…</p></AdminLayout>;
  return <AdminLayout><div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-brand-600">Owner report</p>
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Gashben places</h1>
        <p className="mt-1 max-w-2xl text-ink-500">Places Gashben calls, their follow-up reminders and the orders saved for each one.</p>
      </div>
      <Button variant="outline" leftIcon={<Download width={16} height={16} />} onClick={() => exportGashbenPdf(place ? [place] : filtered, data.links, orders, data.calls)}>
        {place ? 'Export place PDF' : 'Export PDF'}
      </Button>
    </div>
    {error && <Card className="border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</Card>}

    {placeId && !place ? <Card className="p-6">Place not found. <Link className="text-brand-700 underline" to={paths.gashbenReport}>Back to all places</Link></Card> : place ? <>
      <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline" to={paths.gashbenReport}><ArrowLeft width={16} height={16} /> All Gashben places</Link>
      <PlaceProfileHeader place={place} actions={<>
        <Button variant="outline" leftIcon={<Pencil width={15} height={15} />} onClick={() => setEditor(place)}>Edit</Button>
        <Button variant="ghost" aria-label="Delete place" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePlace(place)}><Trash width={16} height={16} /></Button>
      </>} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2"><PlaceOrdersCard orders={ordersOf(place.id)} empty="Gashben has not saved an order for this place yet." /></div>
        <CallHistory calls={data.calls.filter((c) => c.place_id === place.id)} />
      </div>
    </> : <>
      <PlacesStats items={[
        { label: 'Places', value: data.places.length },
        { label: 'Calls due', value: due, tone: due ? 'danger' : 'neutral' },
        { label: 'Linked orders', value: data.links.length, tone: 'info' },
        { label: 'Order value', value: formatIqd(linkedValue), tone: 'success' },
      ]} />
      <PlacesToolbar query={query} onQuery={setQuery} dueOnly={dueOnly} onDueOnly={setDueOnly} dueCount={due} view={view} onView={setView}>
        <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setEditor('new')}>Add place</Button>
      </PlacesToolbar>
      {view === 'table' ? <PlacesTable places={filtered} owner totals={totals} onEdit={setEditor} onDelete={(target) => void removePlace(target)} /> : <PlacesCalendar places={filtered} owner />}
    </>}

    <PlaceEditorModal open={editor !== null} initial={editor === 'new' ? null : editor} onSave={save} onClose={() => setEditor(null)} />
  </div></AdminLayout>;
}
