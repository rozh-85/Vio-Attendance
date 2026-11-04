import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Building, Check, Download, FileText, Pencil, Phone, Plus, Trash, Wallet } from '@/components/icons';
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
import { cn } from '@/utils/cn';

/** How many rows each overview card shows. */
const ROWS = 5;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The owner's view of Gashben's places: four key figures; three equal cards —
 * calls due, the top places and the latest activity; then every place in a
 * table (or the calendar), and each place's own page with its orders and calls.
 */
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
  const overdue = duePlaces.filter((p) => callStatus(p).days < 0).length;
  const filtered = filterPlaces(data.places, query, tab);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordersOf = (id: string) => data.links.filter((l) => l.place_id === id).map((l) => byId.get(l.order_id)).filter((o): o is SalesOrder => !!o);
  const totals = (id: string) => { const list = ordersOf(id); return { count: list.length, total: list.reduce((s, o) => s + o.totalPrice, 0) }; };
  const linkedValue = data.places.reduce((s, p) => s + totals(p.id).total, 0);
  const ranked = data.places.map((p) => ({ place: p, ...totals(p.id) })).filter((t) => t.count).sort((a, b) => b.total - a.total);
  const top = ranked.slice(0, ROWS);
  const cities = new Set(data.places.map((p) => p.city.trim().toLowerCase()).filter(Boolean)).size;
  const placeName = new Map(data.places.map((p) => [p.id, p]));
  const activity = [
    ...data.calls.map((c) => ({ key: `c${c.id}`, at: c.called_at, place: placeName.get(c.place_id), call: true, text: c.note || 'Call completed' })),
    ...data.links.flatMap((l) => { const o = byId.get(l.order_id); return o ? [{ key: `o${o.id}`, at: o.enteredAt ?? o.createdAt, place: placeName.get(l.place_id), call: false, text: `Order #${o.orderNo} · ${formatIqd(o.totalPrice)}` }] : []; }),
  ].filter((a) => a.place).sort((a, b) => b.at.localeCompare(a.at)).slice(0, ROWS);

  /** The list below, on the calls to make. */
  function showDue() {
    setTab('due');
    requestAnimationFrame(() => document.getElementById('places-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
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
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Gashben places</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500 sm:text-base">Who Gashben calls, when the next call is due, and what each place has ordered.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" leftIcon={<Download width={16} height={16} />} onClick={() => exportGashbenPdf(place ? [place] : data.places, data.links, orders, data.calls)}>
          {place ? 'Place PDF' : 'Export PDF'}
        </Button>
        {!place && <Button leftIcon={<Plus width={16} height={16} />} onClick={() => setEditor('new')}>Add place</Button>}
      </div>
    </header>
    {error && <Card className="border-rose-200 bg-rose-50 p-5 text-rose-700">{error}</Card>}

    {placeId && !place ? <Card className="p-6">Place not found. <Link className="text-brand-700 underline" to={paths.gashbenReport}>Back to all places</Link></Card> : place ? <>
      <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline" to={paths.gashbenReport}><ArrowLeft width={16} height={16} /> All Gashben places</Link>
      <PlaceProfileHeader place={place} actions={<>
        <Button variant="outline" leftIcon={<Pencil width={15} height={15} />} onClick={() => setEditor(place)}>Edit</Button>
        <Button variant="ghost" aria-label="Delete place" className="text-rose-600 hover:bg-rose-50" onClick={() => void removePlace(place)}><Trash width={16} height={16} /></Button>
      </>} />
      {/* Orders and calls side by side, the same height. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="flex lg:col-span-2 [&>*]:flex-1"><PlaceOrdersCard orders={ordersOf(place.id)} empty="Gashben has not saved an order for this place yet." /></div>
        <div className="flex [&>*]:flex-1"><CallHistory calls={data.calls.filter((c) => c.place_id === place.id)} /></div>
      </div>
    </> : <>
      <PlacesStats items={[
        { label: 'Places', icon: Building, value: data.places.length.toLocaleString('en-US'), note: `in ${plural(cities, 'city', 'cities')}` },
        {
          label: 'Calls due',
          icon: Phone,
          value: duePlaces.length.toLocaleString('en-US'),
          note: duePlaces.length ? `${overdue} overdue · ${duePlaces.length - overdue} today` : 'Up to date',
          alert: duePlaces.length > 0,
        },
        { label: 'Place orders', icon: FileText, value: data.links.length.toLocaleString('en-US'), note: `from ${plural(ranked.length, 'place')}` },
        {
          label: 'Order value',
          icon: Wallet,
          value: Math.round(linkedValue).toLocaleString('en-US'),
          unit: 'IQD',
          note: data.links.length ? `${formatIqd(linkedValue / data.links.length)} an order` : 'No orders yet',
        },
      ]} />

      {/* Three cards of the same height, five rows each at most. */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Overview
          title="Calls due"
          count={duePlaces.length}
          empty="Gashben is up to date — no calls due."
          footer={duePlaces.length > ROWS && <FooterButton onClick={showDue}>See all {duePlaces.length} calls</FooterButton>}
        >
          {duePlaces.slice(0, ROWS).map((p) => {
            const status = callStatus(p);
            return (
              <Row
                key={p.id}
                to={paths.gashbenPlaceReport(p.id)}
                lead={<Lead tone={status.days < 0 ? 'rose' : 'amber'}><Phone width={15} height={15} /></Lead>}
                title={p.name}
                meta={`${p.person_name} · ${p.phone}`}
                end={<Badge tone={status.tone}>{status.label}</Badge>}
              />
            );
          })}
        </Overview>

        <Overview title="Top places" note="by order value" empty="No place has ordered yet.">
          {top.map((t, i) => (
            <Row
              key={t.place.id}
              to={paths.gashbenPlaceReport(t.place.id)}
              lead={<Lead tone="slate"><span className="text-xs font-bold tabular-nums">{i + 1}</span></Lead>}
              title={t.place.name}
              meta={`${plural(t.count, 'order')} · ${t.place.city}`}
              end={<span className="text-sm font-semibold tabular-nums text-ink-900">{formatIqd(t.total)}</span>}
            />
          ))}
        </Overview>

        <Overview title="Recent activity" note="calls and orders" empty="No calls or orders yet.">
          {activity.map((a) => (
            <Row
              key={a.key}
              to={paths.gashbenPlaceReport(a.place!.id)}
              lead={
                <Lead tone={a.call ? 'emerald' : 'brand'}>
                  {a.call ? <Check width={15} height={15} /> : <Wallet width={15} height={15} />}
                </Lead>
              }
              title={a.place!.name}
              meta={a.call ? `Called · ${a.text}` : a.text}
              end={
                <span
                  className="whitespace-nowrap text-xs text-ink-400"
                  title={new Date(a.at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'medium', timeStyle: 'short' })}
                >
                  {format(new Date(a.at), 'd MMM')}
                </span>
              }
            />
          ))}
        </Overview>
      </div>

      <div id="places-list" className="scroll-mt-20 space-y-4">
        <PlacesTabs tab={tab} onTab={setTab} dueCount={duePlaces.length} allCount={data.places.length} query={query} onQuery={setQuery} />
        {tab === 'calendar' ? <PlacesCalendar places={filtered} owner /> : <PlacesTable places={filtered} owner totals={totals} onEdit={setEditor} onDelete={(target) => void removePlace(target)} />}
      </div>
    </>}

    <PlaceEditorModal open={editor !== null} initial={editor === 'new' ? null : editor} onSave={save} onClose={() => setEditor(null)} />
  </div></AdminLayout>;
}

/** A card of the overview: a titled header, its rows, and a footer when there is more. */
function Overview({ title, note, count, empty, footer, children }: { title: string; note?: string; count?: number; empty: string; footer?: ReactNode; children: ReactNode[] }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-card shadow-sm">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold text-ink-900">{title}</span>
          {note && <span className="truncate text-sm text-ink-400">{note}</span>}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-rose-700">{count}</span>
        )}
      </header>
      {children.length ? <ul className="divide-y divide-slate-100">{children.map((child, i) => <li key={i}>{child}</li>)}</ul> : <p className="px-5 py-5 text-sm text-ink-500">{empty}</p>}
      {footer}
    </section>
  );
}

function FooterButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-auto w-full border-t border-slate-100 px-5 py-2.5 text-left text-sm font-semibold text-brand-700 transition hover:bg-slate-50">
      {children}
    </button>
  );
}

const LEAD_TONES = {
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  brand: 'bg-brand-50 text-brand-700',
  slate: 'bg-slate-100 text-ink-600',
};

function Lead({ tone, children }: { tone: keyof typeof LEAD_TONES; children: ReactNode }) {
  return <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', LEAD_TONES[tone])}>{children}</span>;
}

/** One row of an overview card: two lines of text between a mark and a figure, all one link. */
function Row({ to, lead, title, meta, end }: { to: string; lead: ReactNode; title: string; meta: string; end: ReactNode }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
      {lead}
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold text-ink-900">{title}</span>
        <span dir="auto" className="block truncate text-xs text-ink-500">{meta}</span>
      </span>
      <span className="shrink-0">{end}</span>
    </Link>
  );
}
