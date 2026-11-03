import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Check, Tag, Trash } from '@/components/icons';
import {
  CATEGORIES,
  CITIES,
  GENDER_LABEL,
  PLATFORMS,
  PURCHASE_LABEL,
  SHIFT_LABEL,
  STATUS_LABEL,
  UNKNOWN_SELLER,
  countsAsSale,
  formatIqd,
  purchaseFromCount,
  purchaseText,
  sellerColor,
} from '@/services/orders/options';
import { sellerList, sellerOf } from '@/services/orders/report';
import { markReportReturn } from '@/services/orders/reportMemory';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { OrderStatus, SalesOrder, SalesOrderPatch } from '@/services/orders/types';
import { modelKey, modelWith, parseIqd, type ProfitData } from '@/services/orders/profit';
import { getProfitStore, profitErrorMessage } from '@/services/orders/profitStore';
import { paths } from '@/routes';
import { cn } from '@/utils/cn';

const selectClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-card px-4 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

const STATUS_TONE: Record<OrderStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  new: 'info',
  delivered: 'success',
  cancelled: 'danger',
  returned: 'warning',
};

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">{label}</span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-ink-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/**
 * One order on its own page, where the owner can change any detail —
 * including who sold it and its status — or delete it. Reached from the
 * orders report, and back to the same place in it afterwards.
 */
export function OrderEditPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [form, setForm] = useState<SalesOrder | null>(null);
  const [sellers, setSellers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cost of this order: its own, or its model's. Optional — the page works without it.
  const [profitData, setProfitData] = useState<ProfitData | null>(null);
  const [profitIssue, setProfitIssue] = useState<string | null>(null);
  const [costDraft, setCostDraft] = useState('');
  const [applyToModel, setApplyToModel] = useState(false);

  // Opened from far down the report: start at the top of this page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const store = getOrdersStore();
    Promise.all([store.listOrders(), store.listAccounts()])
      .then(([orders, accounts]) => {
        if (!active) return;
        const found = orders.find((o) => o.id === orderId) ?? null;
        setOrder(found);
        setForm(found);
        setSellers(sellerList(orders, accounts.map((a) => a.displayName)));
        if (!found) setLoadError('This order was not found. It may have been deleted.');
      })
      .catch((err) => active && setLoadError(ordersErrorMessage(err)))
      .finally(() => active && setLoading(false));
    getProfitStore()
      .load()
      .then((data) => {
        if (!active) return;
        setProfitData(data);
        const own = data.orderCosts[orderId];
        setCostDraft(own !== undefined ? own.toLocaleString('en-US') : '');
        setApplyToModel(false);
      })
      .catch((err) => active && setProfitIssue(profitErrorMessage(err)));
    return () => {
      active = false;
    };
  }, [orderId]);

  const orderDirty = !!order && !!form && JSON.stringify(order) !== JSON.stringify(form);

  // What the cost box asks for, against what is saved.
  const costKey = form ? modelKey(form.itemModel) : '';
  const listModel = costKey && profitData ? profitData.models[costKey] : undefined;
  /** What one piece of the model costs and sells for, from the price list. */
  const unitCost = listModel?.cost ?? null;
  const unitPrice = listModel?.price ?? null;
  const pieces = form?.quantity || 1;
  const savedOwn = order && profitData ? profitData.orderCosts[order.id] : undefined;
  const typedCost = parseIqd(costDraft);
  const toModel = applyToModel && !!costKey && typedCost !== null;
  /** The typed cost shared over the pieces, as the model's cost of one. */
  const typedUnit = typedCost === null ? null : Math.round(typedCost / pieces);
  const costDirty =
    !!profitData &&
    (typedCost === null
      ? savedOwn !== undefined
      : toModel
        ? unitCost !== typedUnit || savedOwn !== undefined
        : savedOwn !== typedCost);
  const dirty = orderDirty || costDirty;

  // Closing the tab or reloading with changes not saved asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const backToOrders = () => {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    navigate(paths.socialOrders);
  };

  const sellerOptions = useMemo(
    () => (order ? [...new Set([sellerOf(order), ...sellers])] : sellers),
    [order, sellers],
  );
  const colorOf = (name: string) => {
    const index = sellers.indexOf(name);
    return sellerColor(index < 0 ? sellers.length : index);
  };

  if (loading || !order || !form) {
    return (
      <AdminLayout>
        <Link to={paths.socialOrders} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900">
          <ArrowLeft width={16} height={16} /> Back to orders
        </Link>
        <p className="mt-10 text-center text-ink-400">{loading ? 'Loading…' : loadError}</p>
      </AdminLayout>
    );
  }

  const set = <K extends keyof SalesOrder>(key: K, value: SalesOrder[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!form || !order) return;
    setSaving(true);
    setError(null);
    try {
      const patch: SalesOrderPatch = {
        sellerName: form.sellerName === UNKNOWN_SELLER ? '' : form.sellerName,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        secondPhone: form.secondPhone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        itemModel: form.itemModel.trim(),
        itemCategory: form.itemCategory.trim(),
        totalPrice: Math.max(0, Math.round(form.totalPrice)),
        quantity: form.quantity || 1,
        gender: form.gender,
        platform: form.platform,
        purchaseCount: form.purchaseCount,
        purchase: form.purchaseCount ? purchaseFromCount(form.purchaseCount) : form.purchase,
        shift: form.shift,
        note: form.note,
        status: form.status,
        createdAt: form.createdAt,
      };
      if (orderDirty) await getOrdersStore().updateOrder(form.id, patch);
      if (costDirty) {
        const profitStore = getProfitStore();
        if (toModel && typedUnit !== null && profitData) {
          await profitStore.saveModels([modelWith(profitData, costKey, form.itemModel, { cost: typedUnit })]);
          if (savedOwn !== undefined) await profitStore.setOrderCost(form.id, null);
        } else {
          await profitStore.setOrderCost(form.id, typedCost);
        }
      }
      setOrder(form);
      markReportReturn(form.id, `Order #${form.orderNo} saved`);
      navigate(paths.socialOrders);
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!order) return;
    if (!window.confirm(`Delete order #${order.orderNo} (${order.customerName})? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await getOrdersStore().deleteOrder(order.id);
      markReportReturn(null, `Order #${order.orderNo} deleted`);
      navigate(paths.socialOrders);
    } catch (err) {
      setError(ordersErrorMessage(err));
      setDeleting(false);
    }
  }

  const platformOptions = [...new Set([...PLATFORMS, form.platform].filter(Boolean))];

  // In the side panel on wide screens; at the end of the page on phones.
  const deleteCard = (className: string) => (
    <Card className={cn('flex items-center gap-3 border-rose-100 p-4', className)}>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold text-ink-900">Delete this order</div>
        <div className="text-ink-500">It is removed from the report for good.</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="text-rose-600 hover:bg-rose-50"
        loading={deleting}
        leftIcon={<Trash width={16} height={16} />}
        onClick={() => void onDelete()}
      >
        Delete
      </Button>
    </Card>
  );
  // What the goods of this order cost, and the profit left on it.
  const effectiveCost = typedCost ?? (unitCost !== null ? unitCost * pieces : null);
  const orderProfit = effectiveCost === null ? null : form.totalPrice - effectiveCost;
  const costCard = (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-ink-700">
          <Tag width={16} height={16} />
        </span>
        <h2 className="font-bold text-ink-900">Cost &amp; profit</h2>
      </div>
      {profitIssue ? (
        <p className="mt-3 text-sm text-amber-800">{profitIssue}</p>
      ) : !profitData ? (
        <p className="mt-3 text-sm text-ink-400">Loading…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-500">
            {!costKey ? (
              'No model is written on this order, so it needs its own cost.'
            ) : unitCost !== null ? (
              <>
                One <b className="font-mono text-ink-700">{form.itemModel.trim()}</b> costs{' '}
                <b className="tabular-nums text-ink-700">{unitCost.toLocaleString('en-US')} IQD</b>
                {pieces > 1 && <> · × {pieces} = {(unitCost * pieces).toLocaleString('en-US')} IQD</>}.
              </>
            ) : (
              <>
                No cost is set for <b className="font-mono text-ink-700">{form.itemModel.trim()}</b> yet.
              </>
            )}
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink-900">This order’s cost</span>
            <span className="relative block">
              <input
                inputMode="numeric"
                className={cn(selectClass, 'pr-14 text-right font-semibold tabular-nums')}
                placeholder={unitCost !== null ? `${(unitCost * pieces).toLocaleString('en-US')} (model)` : 'Cost of the goods'}
                value={costDraft}
                onChange={(e) => {
                  const n = parseIqd(e.target.value);
                  setCostDraft(n === null ? '' : n.toLocaleString('en-US'));
                  // A model with no cost yet: the first cost typed is most likely its cost.
                  if (n !== null && !costDraft && costKey && unitCost === null && savedOwn === undefined) setApplyToModel(true);
                }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-ink-400">
                IQD
              </span>
            </span>
            <span className="mt-1 block text-xs text-ink-500">
              {unitCost !== null
                ? 'Leave empty to use the model’s cost × the pieces. Write one only for a different supplier price.'
                : 'What the goods of this order cost you.'}
            </span>
          </label>
          {costKey && typedCost !== null && (
            <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-brand-600)]"
                checked={applyToModel}
                onChange={(e) => setApplyToModel(e.target.checked)}
              />
              <span>
                <b className="text-ink-900">Use for every {form.itemModel.trim()} order</b>
                <span className="block text-ink-500">
                  Sets one piece’s cost to {(typedUnit ?? 0).toLocaleString('en-US')} IQD instead of this order’s only.
                </span>
              </span>
            </label>
          )}
          <div
            className={cn(
              'rounded-xl px-4 py-3',
              !countsAsSale(form.status)
                ? 'bg-slate-50'
                : orderProfit === null
                  ? 'bg-amber-50'
                  : orderProfit >= 0
                    ? 'bg-emerald-50'
                    : 'bg-rose-50',
            )}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-ink-500">Profit on this order</div>
            {!countsAsSale(form.status) ? (
              <div className="text-sm text-ink-500">{STATUS_LABEL[form.status]} — no profit counted</div>
            ) : orderProfit === null ? (
              <div className="text-sm font-semibold text-amber-800">Write a cost to see it</div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className={cn('text-2xl font-bold tabular-nums', orderProfit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                  {orderProfit >= 0 ? '+' : '−'}
                  {Math.abs(orderProfit).toLocaleString('en-US')}
                </span>
                <span className="text-sm text-ink-500">
                  IQD{form.totalPrice > 0 && ` · ${Math.round((orderProfit / form.totalPrice) * 100)}%`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );

  const seller = sellerOf(form);
  const savedLater =
    !!order.enteredAt && new Date(order.enteredAt).getTime() - new Date(order.createdAt).getTime() > 12 * 60 * 60 * 1000;

  return (
    <AdminLayout>
      <button
        type="button"
        onClick={backToOrders}
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition hover:text-ink-900"
      >
        <ArrowLeft width={16} height={16} /> Back to orders
      </button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold text-ink-900">
            Order #{order.orderNo}
            <Badge tone={STATUS_TONE[form.status]}>{STATUS_LABEL[form.status]}</Badge>
            {dirty && <Badge tone="warning">Not saved</Badge>}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: colorOf(sellerOf(order)) }} />
              <span dir="auto" className="font-semibold text-ink-700">
                {sellerOf(order)}
              </span>
            </span>
            <span>Ordered {format(new Date(order.createdAt), 'd MMM yyyy, hh:mm a')}</span>
            {savedLater && order.enteredAt && <span>Saved {format(new Date(order.enteredAt), 'd MMM yyyy, hh:mm a')}</span>}
            <span>{order.source === 'import' ? 'From the old order sheet' : 'Saved by the seller in the app'}</span>
            {order.editedAt && (
              <span className="text-amber-700">
                Edited by the seller {format(new Date(order.editedAt), 'd MMM yyyy, hh:mm a')}
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4 pb-24 xl:pb-0">
          <Section title="Customer">
            <Input
              label="Customer name"
              dir="auto"
              value={form.customerName}
              onChange={(e) => set('customerName', e.target.value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Phone" inputMode="tel" value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} />
              <Input label="Second phone" inputMode="tel" value={form.secondPhone} onChange={(e) => set('secondPhone', e.target.value)} />
              <Select label="Gender" value={form.gender} onChange={(v) => set('gender', v as SalesOrder['gender'])}>
                <option value="">Not set</option>
                {(Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABEL[g].en}
                  </option>
                ))}
              </Select>
              <Input
                label="Times the customer has bought"
                inputMode="numeric"
                placeholder={form.purchase ? PURCHASE_LABEL[form.purchase].en : 'Not set'}
                hint={form.purchaseCount ? purchaseText(form.purchaseCount, '') : undefined}
                value={form.purchaseCount ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, '').slice(0, 4));
                  set('purchaseCount', n >= 1 && n <= 1000 ? n : null);
                }}
              />
            </div>
          </Section>

          <Section title="Delivery">
            <Input label="City" dir="auto" list="order-page-cities" value={form.city} onChange={(e) => set('city', e.target.value)} />
            <datalist id="order-page-cities">
              {CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Textarea label="Address" dir="auto" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Section>

          <Section title="Item">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Item model" value={form.itemModel} onChange={(e) => set('itemModel', e.target.value)} />
              <Input
                label="Item type"
                dir="auto"
                list="order-page-categories"
                value={form.itemCategory}
                onChange={(e) => set('itemCategory', e.target.value)}
              />
              <datalist id="order-page-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <Input
                label="Pieces"
                inputMode="numeric"
                className="text-center text-lg font-bold tabular-nums"
                value={form.quantity || 1}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, '').slice(0, 2));
                  set('quantity', n >= 1 ? n : 1);
                }}
              />
              <Input
                label="Total price (IQD)"
                inputMode="numeric"
                className="text-lg font-bold tabular-nums"
                value={form.totalPrice ? form.totalPrice.toLocaleString('en-US') : ''}
                onChange={(e) => set('totalPrice', Number(e.target.value.replace(/\D/g, '')) || 0)}
              />
            </div>
            {unitPrice !== null && unitPrice * pieces !== form.totalPrice && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-600">
                <span>
                  Price list: <b className="tabular-nums text-ink-900">{unitPrice.toLocaleString('en-US')}</b>
                  {pieces > 1 && <> × {pieces} = <b className="tabular-nums text-ink-900">{(unitPrice * pieces).toLocaleString('en-US')}</b></>} IQD
                </span>
                <button
                  type="button"
                  className="rounded-lg bg-card px-3 py-1.5 font-semibold text-brand-700 shadow-sm"
                  onClick={() => set('totalPrice', unitPrice * pieces)}
                >
                  Use it
                </button>
              </div>
            )}
          </Section>

          <Section title="Sale">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Sold on" value={form.platform} onChange={(v) => set('platform', v)}>
                <option value="">Not set</option>
                {platformOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Select label="Shift" value={form.shift} onChange={(v) => set('shift', v as SalesOrder['shift'])}>
                <option value="">Not set</option>
                {(Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((sh) => (
                  <option key={sh} value={sh}>
                    {SHIFT_LABEL[sh].en} ({SHIFT_LABEL[sh].hours})
                  </option>
                ))}
              </Select>
            </div>
            <Textarea label="Note" dir="auto" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </Section>
          {deleteCard('xl:hidden')}
        </div>

        {/* On phones these come first: status, seller and date matter most. */}
        <aside className="order-first self-stretch xl:order-none">
          <div className="space-y-4 xl:sticky xl:top-6">
            <Card className="overflow-hidden">
              <div className="bg-brand-600 px-5 py-4 text-white">
                <div className="text-xs font-bold uppercase tracking-wide text-white/70">Total</div>
                <div className="mt-1 text-3xl font-bold tabular-nums">
                  {form.totalPrice.toLocaleString('en-US')}
                  <span className="ml-1 text-sm font-semibold text-white/70">IQD</span>
                </div>
                <div className="mt-1 text-xs text-white/80">
                  {countsAsSale(form.status) ? 'Counts in sales' : `${STATUS_LABEL[form.status]} — not counted in sales`}
                </div>
              </div>
              <div className="space-y-4 p-5">
                <Select label="Status" value={form.status} onChange={(v) => set('status', v as OrderStatus)}>
                  {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABEL[st]}
                    </option>
                  ))}
                </Select>
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink-900">
                    Seller
                    <span className="size-2.5 rounded-full" style={{ background: colorOf(seller) }} />
                  </span>
                  <select className={selectClass} value={seller} onChange={(e) => set('sellerName', e.target.value)}>
                    {sellerOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  label="Order date"
                  type="date"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  value={format(new Date(form.createdAt), 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    if (!y || !m || !d) return;
                    // Keep the time of day; only the day moves.
                    const at = new Date(form.createdAt);
                    at.setFullYear(y, m - 1, d);
                    set('createdAt', at.toISOString());
                  }}
                />
              </div>
            </Card>

            {costCard}

            <div className="hidden space-y-2 xl:block">
              {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
              <Button type="submit" size="lg" fullWidth loading={saving} disabled={!dirty} leftIcon={<Check />}>
                {dirty ? 'Save changes' : 'No changes yet'}
              </Button>
              <Button type="button" variant="ghost" fullWidth onClick={backToOrders}>
                {dirty ? 'Cancel' : 'Back to orders'}
              </Button>
            </div>

            {deleteCard('hidden xl:flex')}
          </div>
        </aside>

        {/* Save bar on phones, tablets and laptops; wide screens use the side panel. */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-card/95 px-4 py-3 backdrop-blur lg:left-64 xl:hidden">
          <div className="mx-auto max-w-3xl">
            {error && <div className="mb-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" className="px-4" onClick={backToOrders}>
                {dirty ? 'Cancel' : 'Back'}
              </Button>
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={saving}
                disabled={!dirty}
                leftIcon={<Check />}
                className={cn(!dirty && 'opacity-60')}
              >
                {dirty ? `Save changes · ${formatIqd(form.totalPrice)}` : 'No changes yet'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </AdminLayout>
  );
}
