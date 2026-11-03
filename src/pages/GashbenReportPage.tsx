import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Check, Download, Pencil, Plus, Trash, Wallet } from '@/components/icons';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { CallHistory, callStatus, filterPlaces, isDue, PlaceEditorModal, PlaceOrdersCard, PlaceProfileHeader, PlacesStats, PlacesTabs, type PlacesTab } from '@/components/places/PlaceParts';
import { loadPlaces, savePlaceAsOwner, deletePlaceAsOwner } from '@/services/places/store';
import type { Place, PlaceInput, PlacesData } from '@/services/places/types';
import { reminderDay } from '@/services/places/types';
import { getOrdersStore } from '@/services/orders/store';
import type { SalesOrder } from '@/services/orders/types';
import { formatIqd } from '@/services/orders/options';
import { exportGashbenPdf } from '@/services/report/gashbenPdf';
import { paths } from '@/routes';

/** The owner's view of Gashben's places: an overview at a glance, then the same table and profiles Gashben uses, plus a PDF. */
export function GashbenReportPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<PlacesTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<Place | 'new' | null>(null);
  useEffect(() => { Promise.all([loadPlaces(), getOrdersStore().listOrders()]).then(([next, os]) => { setData(next); setOrders(os); }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load Gashben report.')).finally(() => setLoading(false)); }, []);

  const place = data.places.find((p) => p.id === placeId);
  const duePlaces = data.places.filter(isDue).sort((a, b) => reminderDay(a).localeCompare(reminderDay(b)));
  const filtered = filterPlaces(data.places, query, tab);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordersOf = (id: string) => data.links.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
  const totals = (id: string) => { const list = ordersOf(id); return { count: list.length, total: list.reduce((s, o) => s + o.totalPrice, 0) }; };
  const linkedValue = data.places.reduce((s, p) => s + totals(p.id).total, 0);
  const top = data.places.map((p) => ({ place: p, ...totals(p.id) })).filter((t) => t.count).sort((a, b) => b.total - a.total).slice(0, 5);
  const placeName = new Map(data.places.map((p) => [p.id, p]));
  const activity = [
    ...data.calls.map((c) => ({ key: `c${c.id}`, at: c.called_at, place: placeName.get(c.place_id), call: true, text: c.note || 'Call completed' })),
    ...data.links.flatMap((l) => { const o = byId.get(l.order_id); return o ? [{ key: `o${o.id}`, at: o.enteredAt ?? o.createdAt, place: placeName.get(l.place_id), call: false, text: `Order #${o.orderNo} · ${formatIqd(o.totalPrice)}` }] : []; }),
  ].filter((a) => a.place).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

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
  return <AdminLayout><div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-brand-600">Owner report</p>
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Gashben places</h1>
        <p className="mt-1 max-w-2xl text-ink-500">Who Gashben calls, when the next call is due, and what each place has ordered.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" leftIcon={<Download width={16} height={16} />} onClick={() => exportGashbenPdf(place ? [place] : data.places, data.links, orders, data.calls)}>
          {place ? 'Place PDF' : 'Export PDF'}
        </Button>
        {!place && <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setEditor('new')}>Add place</Button>}
      </div>
    </div>
    {error && <Card className="border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</Card>}

    {placeId && !place ? <Card className="p-6">Place not found. <Link className="text-brand-700 underline" to={paths.gashbenReport}>Back to all places</Link></Card> : place ? <>
      <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline" to={paths.gashbenReport}><ArrowLeft width={16} height={16} /> All Gashben places</Link>
      <PlaceProfileHeader place={place} actions={<>
        <Button variant="outline" leftIcon={<Pencil width={15} height={15} />} onClick={() => setEditor(place)}>Edit</Button>
        <Button variant="ghost" aria-label="Delete place" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePlace(place)}><Trash width={16} height={16} /></Button>
      </>} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2"><PlaceOrdersCard orders={ordersOf(place.id)} empty="Gashben has not saved an order for this place yet." /></div>
        <CallHistory calls={data.calls.filter((c) => c.place_id === place.id)} />
      </div>
    </> : <>
      <PlacesStats items={[
        { label: 'Places', value: data.places.length },
        { label: 'Calls due', value: duePlaces.length, tone: duePlaces.length ? 'danger' : 'neutral' },
        { label: 'Linked orders', value: data.links.length, tone: 'info' },
        { label: 'Order value', value: formatIqd(linkedValue), tone: 'success' },
      ]} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel title="Calls due" count={duePlaces.length} isEmpty={!duePlaces.length} empty="Gashben is up to date — no calls due.">
          {duePlaces.slice(0, 6).map((p) => (
            <Link key={p.id} to={paths.gashbenPlaceReport(p.id)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink-900" dir="auto">{p.name}</div>
                <div className="truncate text-xs text-ink-500"><span dir="auto">{p.person_name}</span> · {p.phone}</div>
              </div>
              <Badge tone={callStatus(p).tone}>{callStatus(p).label}</Badge>
            </Link>
          ))}
          {duePlaces.length > 6 && <button type="button" onClick={() => setTab('due')} className="w-full px-3 py-2 text-left text-sm font-semibold text-brand-700">See all {duePlaces.length} below</button>}
        </Panel>

        <Panel title="Top places by orders" count={top.length} isEmpty={!top.length} empty="No place orders yet.">
          {top.map((t) => (
            <Link key={t.place.id} to={paths.gashbenPlaceReport(t.place.id)} className="block rounded-xl px-3 py-2.5 hover:bg-slate-50">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold text-ink-900" dir="auto">{t.place.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatIqd(t.total)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (t.total / (top[0].total || 1)) * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-ink-400">{t.count} {t.count === 1 ? 'order' : 'orders'} · {t.place.city}</div>
            </Link>
          ))}
        </Panel>

        <Panel title="Recent activity" isEmpty={!activity.length} empty="No calls or orders yet.">
          {activity.map((a) => (
            <Link key={a.key} to={paths.gashbenPlaceReport(a.place!.id)} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
              <span className={a.call ? 'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700' : 'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700'}>
                {a.call ? <Check width={14} height={14} /> : <Wallet width={14} height={14} />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink-900"><span dir="auto">{a.place!.name}</span></div>
                <div className="truncate text-xs text-ink-500" dir="auto">{a.call ? 'Called · ' : ''}{a.text}</div>
                <div className="text-[11px] text-ink-400">{new Date(a.at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' })}</div>
              </div>
            </Link>
          ))}
        </Panel>
      </div>

      <PlacesTabs tab={tab} onTab={setTab} dueCount={duePlaces.length} allCount={data.places.length} query={query} onQuery={setQuery} />
      {tab === 'calendar' ? <PlacesCalendar places={filtered} owner /> : <PlacesTable places={filtered} owner totals={totals} onEdit={setEditor} onDelete={(target) => void removePlace(target)} />}
    </>}

    <PlaceEditorModal open={editor !== null} initial={editor === 'new' ? null : editor} onSave={save} onClose={() => setEditor(null)} />
  </div></AdminLayout>;
}

function Panel({ title, count, empty, isEmpty, children }: { title: string; count?: number; empty: string; isEmpty: boolean; children: ReactNode }) {
  return (
    <Card className="min-w-0 p-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <h2 className="font-bold text-ink-900">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-500">{count}</span>}
      </div>
      {!isEmpty ? <div className="pb-1">{children}</div> : <p className="px-3 pb-4 pt-2 text-sm text-ink-500">{empty}</p>}
    </Card>
  );
}
