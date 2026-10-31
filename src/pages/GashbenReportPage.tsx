import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlacesTable } from '@/components/places/PlacesTable';
import { PlacesCalendar } from '@/components/places/PlacesCalendar';
import { loadPlaces } from '@/services/places/store';
import type { PlacesData } from '@/services/places/types';
import { baghdadDay, reminderDay } from '@/services/places/types';
import { getOrdersStore } from '@/services/orders/store';
import type { SalesOrder } from '@/services/orders/types';
import { formatIqd, STATUS_LABEL } from '@/services/orders/options';
import { exportGashbenPdf } from '@/services/report/gashbenPdf';
import { paths } from '@/routes';

export function GashbenReportPage() {
  const { placeId } = useParams();
  const [data, setData] = useState<PlacesData>({ places: [], calls: [], links: [] });
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState('');
  const [calendar, setCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { Promise.all([loadPlaces(), getOrdersStore().listOrders()]).then(([next, os]) => { setData(next); setOrders(os); }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load Gashben report.')).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => data.places.filter((p) => [p.name,p.person_name,p.phone,p.city,p.kind].join(' ').toLowerCase().includes(query.toLowerCase())), [data.places, query]);
  const place = data.places.find((p) => p.id === placeId);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const linked = (id: string) => data.links.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
  if (loading) return <AdminLayout><p className="p-10 text-ink-500">Loading Gashben report…</p></AdminLayout>;
  return <AdminLayout><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-brand-600">Owner report</p><h1 className="text-3xl font-bold">Gashben places</h1><p className="mt-1 max-w-3xl text-ink-500">Places, follow-up reminders and orders connected to the Gashben account.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => exportGashbenPdf(data.places, data.links, orders)}>Export PDF</Button><Button variant="outline" onClick={() => setCalendar(!calendar)}>{calendar ? 'Table' : 'Calendar'}</Button></div></div>
  {error && <Card className="mt-6 border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</Card>}
  {placeId && place ? <><Link className="mt-6 inline-block text-brand-700 underline" to={paths.gashbenReport}>← All Gashben places</Link><Card className="mt-4 p-6"><div className="grid gap-4 sm:grid-cols-4"><div><div className="text-xs uppercase text-ink-400">Place</div><div className="text-xl font-bold">{place.name}</div></div><div><div className="text-xs uppercase text-ink-400">Contact</div><div className="font-semibold">{place.person_name}</div><div className="text-sm text-ink-500">{place.phone}</div></div><div><div className="text-xs uppercase text-ink-400">City / type</div><div>{place.city} · {place.kind}</div></div><div><div className="text-xs uppercase text-ink-400">Next call</div><div className={reminderDay(place) <= baghdadDay() ? 'font-bold text-rose-600' : 'font-semibold'}>{reminderDay(place)}</div></div></div></Card><Card className="mt-5 overflow-hidden"><h2 className="p-5 text-lg font-bold">Linked orders · {linked(place.id).length}</h2><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{['Order','Date','Customer','Item','Total','Status'].map((h)=><th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>{linked(place.id).map((o)=><tr key={o.id} className="border-t border-slate-100"><td className="p-4">#{o.orderNo}</td><td className="p-4">{o.createdAt.slice(0,10)}</td><td className="p-4">{o.customerName}</td><td className="p-4">{o.itemModel || o.itemCategory}</td><td className="p-4">{formatIqd(o.totalPrice)}</td><td className="p-4">{STATUS_LABEL[o.status]}</td></tr>)}</tbody></table></Card></> : <><div className="mt-6 grid gap-4 sm:grid-cols-4"><Card className="p-5"><div className="text-3xl font-bold">{data.places.length}</div><div className="text-sm text-ink-500">Places</div></Card><Card className="p-5"><div className="text-3xl font-bold">{data.places.filter((p) => reminderDay(p) <= baghdadDay()).length}</div><div className="text-sm text-ink-500">Calls due</div></Card><Card className="p-5"><div className="text-3xl font-bold">{data.links.length}</div><div className="text-sm text-ink-500">Linked orders</div></Card><Card className="p-5"><div className="text-3xl font-bold">{formatIqd(orders.filter((o) => data.links.some((l) => l.order_id === o.id)).reduce((sum,o)=>sum+o.totalPrice,0))}</div><div className="text-sm text-ink-500">Order value</div></Card></div><div className="mt-6"><Input label="Search" placeholder="Place, contact, phone or city…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="mt-6">{calendar ? <PlacesCalendar places={filtered} owner /> : <PlacesTable places={filtered} owner />}</div></>}</AdminLayout>;
}
