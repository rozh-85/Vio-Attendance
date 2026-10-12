import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Check } from '@/components/icons';
import {
  CATEGORIES,
  CITIES,
  GENDER_LABEL,
  PLATFORMS,
  PURCHASE_LABEL,
  SHIFT_LABEL,
  STATUS_LABEL,
  UNKNOWN_SELLER,
  purchaseFromCount,
  purchaseText,
} from '@/services/orders/options';
import { sellerOf } from '@/services/orders/report';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { OrderStatus, SalesOrder, SalesOrderPatch } from '@/services/orders/types';

const selectClass =
  'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

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

/** The owner's fix-up form: every field of a saved order, including who sold it. */
export function OrderEditModal({
  order,
  sellers,
  onClose,
  onSaved,
}: {
  order: SalesOrder | null;
  sellers: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SalesOrder | null>(order);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(order);
    setError(null);
  }, [order]);

  if (!order || !form) return null;

  const set = <K extends keyof SalesOrder>(key: K, value: SalesOrder[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
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
        gender: form.gender,
        platform: form.platform,
        purchaseCount: form.purchaseCount,
        purchase: form.purchaseCount ? purchaseFromCount(form.purchaseCount) : form.purchase,
        shift: form.shift,
        note: form.note,
        status: form.status,
        createdAt: form.createdAt,
      };
      await getOrdersStore().updateOrder(form.id, patch);
      onSaved();
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const sellerOptions = [...new Set([sellerOf(order), ...sellers])];
  const platformOptions = [...new Set([...PLATFORMS, form.platform].filter(Boolean))];

  return (
    <Modal open onClose={onClose} title={`Order #${order.orderNo}`} description="Changes show in the report straight away." className="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Seller" value={sellerOf(form)} onChange={(v) => set('sellerName', v)}>
            {sellerOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select label="Status" value={form.status} onChange={(v) => set('status', v as OrderStatus)}>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
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
          <Input label="City" dir="auto" list="edit-cities" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <datalist id="edit-cities">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="sm:col-span-2">
            <Input label="Customer name" dir="auto" value={form.customerName} onChange={(e) => set('customerName', e.target.value)} />
          </div>
          <Input label="Phone" value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} />
          <Input label="Second phone" value={form.secondPhone} onChange={(e) => set('secondPhone', e.target.value)} />
        </div>
        <Textarea label="Address" dir="auto" value={form.address} onChange={(e) => set('address', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Item model" value={form.itemModel} onChange={(e) => set('itemModel', e.target.value)} />
          <Input label="Item type" dir="auto" list="edit-categories" value={form.itemCategory} onChange={(e) => set('itemCategory', e.target.value)} />
          <datalist id="edit-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Input
            label="Price (IQD)"
            inputMode="numeric"
            value={form.totalPrice ? form.totalPrice.toLocaleString('en-US') : ''}
            onChange={(e) => set('totalPrice', Number(e.target.value.replace(/\D/g, '')) || 0)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Platform" value={form.platform} onChange={(v) => set('platform', v)}>
            <option value="">Not set</option>
            {platformOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
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
          <Select label="Shift" value={form.shift} onChange={(v) => set('shift', v as SalesOrder['shift'])}>
            <option value="">Not set</option>
            {(Object.keys(SHIFT_LABEL) as (keyof typeof SHIFT_LABEL)[]).map((s) => (
              <option key={s} value={s}>{SHIFT_LABEL[s].en} ({SHIFT_LABEL[s].hours})</option>
            ))}
          </Select>
          <Select label="Gender" value={form.gender} onChange={(v) => set('gender', v as SalesOrder['gender'])}>
            <option value="">Not set</option>
            {(Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map((g) => (
              <option key={g} value={g}>{GENDER_LABEL[g].en}</option>
            ))}
          </Select>
        </div>
        <Textarea label="Note" dir="auto" value={form.note} onChange={(e) => set('note', e.target.value)} />
        {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} leftIcon={<Check width={17} height={17} />}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
