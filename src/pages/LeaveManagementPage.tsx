import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Download, Pencil, Plus, Trash } from '@/components/icons';
import { useDataService } from '@/services/data/context';
import { formatDateValue, todayValue } from '@/utils/time';
import { exportLeavePdf } from '@/services/report/leavePdf';
import type { Employee, LeaveAllowance, LeaveRecord } from '@/types';

const currentYear = new Date().getFullYear();

export function LeaveManagementPage() {
  const data = useDataService();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allowances, setAllowances] = useState<LeaveAllowance[]>([]);
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allowanceInput, setAllowanceInput] = useState('12');
  const [form, setForm] = useState({ date: todayValue(), days: '1', note: '' });
  const [editing, setEditing] = useState<LeaveRecord | null>(null);

  const selected = employees.find((employee) => employee.id === selectedId) ?? null;
  const allowance = allowances.find((item) => item.employeeId === selectedId)?.totalDays ?? 12;
  const employeeRecords = useMemo(() => records.filter((record) => record.employeeId === selectedId), [records, selectedId]);
  const used = employeeRecords.reduce((sum, record) => sum + record.days, 0);
  const remaining = allowance - used;

  async function load() {
    setLoading(true);
    try {
      const [people, balances, leave] = await Promise.all([
        data.listEmployees(), data.listLeaveAllowances(year), data.listLeaveRecords(undefined, year),
      ]);
      setEmployees(people); setAllowances(balances); setRecords(leave);
      setSelectedId((previous) => previous || people[0]?.id || '');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [data, year]);
  useEffect(() => { setAllowanceInput(String(allowance)); }, [allowance, selectedId, year]);

  async function saveAllowance() {
    if (!selected) return;
    setSaving(true); setMessage(null);
    try {
      const saved = await data.setLeaveAllowance(selected.id, year, Number(allowanceInput));
      setAllowances((all) => [...all.filter((item) => !(item.employeeId === selected.id && item.year === year)), saved]);
      setMessage('Yearly allowance saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save allowance.'); }
    finally { setSaving(false); }
  }

  async function saveLeave(event: FormEvent) {
    event.preventDefault();
    if (!selected || !form.date || Number(form.days) <= 0) return;
    setSaving(true); setMessage(null);
    try {
      const payload = { employeeId: selected.id, year: Number(form.date.slice(0, 4)), date: form.date, days: Number(form.days), note: form.note };
      if (editing) {
        const updated = await data.updateLeave(editing.id, { date: payload.date, days: payload.days, note: payload.note });
        setRecords((all) => updated.year === year
          ? all.map((item) => item.id === updated.id ? updated : item)
          : all.filter((item) => item.id !== updated.id));
        setMessage('Leave entry updated.');
      } else {
        const added = await data.addLeave(payload);
        if (added.year === year) setRecords((all) => [added, ...all]);
        setMessage('Leave entry added.');
      }
      setEditing(null); setForm({ date: todayValue(), days: '1', note: '' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save leave.'); }
    finally { setSaving(false); }
  }

  async function removeLeave(id: string) {
    if (!window.confirm('Remove this leave entry?')) return;
    await data.deleteLeave(id); setRecords((all) => all.filter((item) => item.id !== id));
  }

  function editLeave(record: LeaveRecord) { setEditing(record); setForm({ date: record.date, days: String(record.days), note: record.note }); }

  return <AdminLayout>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="text-sm font-bold uppercase tracking-wide text-brand-600">Vio HR</div><h1 className="text-3xl font-bold">Leave management</h1><p className="mt-1 text-ink-500">Track yearly allowances, used leave and remaining days in one place.</p></div><div className="flex items-center gap-3"><Input label="Year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || currentYear)} className="w-28" />{selected && <Button variant="secondary" leftIcon={<Download width={18} height={18} />} onClick={() => exportLeavePdf(selected, year, allowance, employeeRecords)}>PDF report</Button>}</div></header>
    {loading ? <div className="py-12 text-center text-ink-400">Loading leave data…</div> : employees.length === 0 ? <Card className="p-10 text-center text-ink-500">Add an employee first to start recording leave.</Card> : <>
      <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Yearly leave overview · {year}</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400"><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Year</th><th className="px-5 py-3">Total leave days</th><th className="px-5 py-3">Used days</th><th className="px-5 py-3">Remaining days</th></tr></thead><tbody>{employees.map((employee) => { const total = allowances.find((item) => item.employeeId === employee.id)?.totalDays ?? 12; const employeeUsed = records.filter((item) => item.employeeId === employee.id).reduce((sum, item) => sum + item.days, 0); const employeeRemaining = total - employeeUsed; return <tr key={employee.id} className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/50 ${selectedId === employee.id ? 'bg-brand-50/60' : ''}`} onClick={() => setSelectedId(employee.id)}><td className="px-5 py-3.5 font-semibold">{employee.fullName}<span className="ml-2 font-mono text-xs text-ink-400">{employee.code}</span></td><td className="px-5 py-3.5 text-ink-500">{year}</td><td className="px-5 py-3.5 tabular-nums">{total}</td><td className="px-5 py-3.5 tabular-nums">{employeeUsed}</td><td className={`px-5 py-3.5 font-semibold tabular-nums ${employeeRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{employeeRemaining}</td></tr>; })}</tbody></table></div></Card>
      {selected && <><Card className="mt-5 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-600">Selected employee</p><h2 className="text-2xl font-bold">{selected.fullName}</h2><p className="mt-1 text-sm text-ink-500">{[selected.position, selected.phone].filter(Boolean).join(' · ')}</p></div><label className="block min-w-56"><span className="mb-1.5 block text-sm font-semibold text-ink-900">Change employee</span><select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4" value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label></div><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard value={allowance} label="Total leave days" tone="info" /><StatCard value={used} label="Used days" tone="warning" /><StatCard value={remaining} label="Remaining days" tone={remaining < 0 ? 'warning' : 'success'} /></div><div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"><Input label="Yearly allowance" type="number" min={0} step="0.5" value={allowanceInput} onChange={(e) => setAllowanceInput(e.target.value)} hint="Defaults to 12 days." /><Button loading={saving} onClick={saveAllowance}>Save allowance</Button></div></Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"><Card className="p-5"><h2 className="text-lg font-bold">{editing ? 'Edit leave' : 'Add leave'}</h2><p className="mt-1 text-sm text-ink-500">Record a full or half day and keep a short note for HR.</p><form onSubmit={saveLeave} className="mt-5 space-y-4"><Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /><Input label="Days" type="number" min={0.5} step={0.5} required value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /><Input label="Reason / note" placeholder="Annual leave" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /><div className="flex gap-2"><Button type="submit" loading={saving} leftIcon={<Plus width={18} height={18} />}>{editing ? 'Update leave' : 'Add leave'}</Button>{editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setForm({ date: todayValue(), days: '1', note: '' }); }}>Cancel</Button>}</div></form>{message && <p className="mt-4 text-sm font-semibold text-brand-700">{message}</p>}</Card><Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold">Leave history</h2><p className="text-sm text-ink-500">{year} · {employeeRecords.length} entries</p></div>{remaining < 0 && <Badge tone="warning">Allowance exceeded</Badge>}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Days</th><th className="px-5 py-3">Note</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{employeeRecords.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-ink-500">No leave recorded for {year}.</td></tr> : employeeRecords.map((record) => <tr key={record.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3.5 font-semibold">{formatDateValue(record.date)}</td><td className="px-5 py-3.5 tabular-nums">{record.days}</td><td className="px-5 py-3.5 text-ink-500">{record.note || '—'}</td><td className="px-5 py-3.5 text-right"><button className="mr-1 rounded-lg p-2 text-ink-500 hover:bg-slate-100" title="Edit leave" onClick={() => editLeave(record)}><Pencil width={16} height={16} /></button><button className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete leave" onClick={() => void removeLeave(record.id)}><Trash width={16} height={16} /></button></td></tr>)}</tbody></table></div></Card></div></>}
    </>}
  </AdminLayout>;
}
