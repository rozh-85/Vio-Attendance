import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
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
type LeaveMode = 'single' | 'range' | 'multiple';

function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function datesBetween(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(dateKey);
}

function calendarDays(month: string): Date[] {
  const first = startOfMonth(parseISO(`${month}-01`));
  return eachDayOfInterval({
    start: startOfWeek(first, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(first), { weekStartsOn: 1 }),
  });
}

function initialDateForYear(year: number): string {
  return year === currentYear ? todayValue() : `${year}-01-01`;
}

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
  const [error, setError] = useState<string | null>(null);
  const [allowanceInput, setAllowanceInput] = useState('12');
  const [mode, setMode] = useState<LeaveMode>('single');
  const [calendarMonth, setCalendarMonth] = useState(todayValue().slice(0, 7));
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [form, setForm] = useState({ date: todayValue(), endDate: todayValue(), days: '1', note: '' });
  const [editing, setEditing] = useState<LeaveRecord | null>(null);

  const selected = employees.find((employee) => employee.id === selectedId) ?? null;
  const allowance = allowances.find((item) => item.employeeId === selectedId)?.totalDays ?? 12;
  const employeeRecords = useMemo(() => records.filter((record) => record.employeeId === selectedId), [records, selectedId]);
  const used = employeeRecords.reduce((sum, record) => sum + record.days, 0);
  const remaining = allowance - used;
  const plannedDates = useMemo(() => {
    if (mode === 'single') return form.date ? [form.date] : [];
    if (mode === 'range') return datesBetween(form.date, form.endDate);
    return selectedDates.slice().sort();
  }, [form.date, form.endDate, mode, selectedDates]);
  const requestedDays = mode === 'single' ? Number(form.days) || 0 : plannedDates.length;
  const calendar = useMemo(() => calendarDays(calendarMonth), [calendarMonth]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [people, balances, leave] = await Promise.all([
        data.listEmployees(), data.listLeaveAllowances(year), data.listLeaveRecords(undefined, year),
      ]);
      setEmployees(people); setAllowances(balances); setRecords(leave);
      setSelectedId((previous) => previous || people[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load leave data.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [data, year]);
  useEffect(() => { setAllowanceInput(String(allowance)); }, [allowance, selectedId, year]);
  useEffect(() => {
    if (editing) return;
    const date = initialDateForYear(year);
    setForm((previous) => ({ ...previous, date, endDate: date }));
    setSelectedDates([]); setCalendarMonth(date.slice(0, 7));
  }, [year, editing]);

  function changeMode(next: LeaveMode) {
    setMode(next); setMessage(null);
    if (next === 'multiple') {
      setSelectedDates(form.date ? [form.date] : []);
      setCalendarMonth((form.date || initialDateForYear(year)).slice(0, 7));
    }
    if (next === 'range') setForm((previous) => ({ ...previous, endDate: previous.date }));
  }

  async function saveAllowance() {
    if (!selected) return;
    setSaving(true); setMessage(null);
    try {
      const saved = await data.setLeaveAllowance(selected.id, year, Number(allowanceInput));
      setAllowances((all) => [...all.filter((item) => !(item.employeeId === selected.id && item.year === year)), saved]);
      setMessage('Yearly allowance saved.');
    } catch (saveError) { setMessage(saveError instanceof Error ? saveError.message : 'Could not save allowance.'); }
    finally { setSaving(false); }
  }

  async function saveLeave(event: FormEvent) {
    event.preventDefault();
    if (!selected || plannedDates.length === 0 || requestedDays <= 0) return;
    if (plannedDates.some((date) => Number(date.slice(0, 4)) !== year)) {
      setMessage(`Choose dates inside ${year} or change the selected year.`); return;
    }
    setSaving(true); setMessage(null);
    try {
      if (editing) {
        const updated = await data.updateLeave(editing.id, { date: plannedDates[0], days: Number(form.days), note: form.note });
        setRecords((all) => updated.year === year ? all.map((item) => item.id === updated.id ? updated : item) : all.filter((item) => item.id !== updated.id));
        setMessage('Leave entry updated.');
      } else {
        const added: LeaveRecord[] = [];
        for (const date of plannedDates) {
          added.push(await data.addLeave({ employeeId: selected.id, year, date, days: mode === 'single' ? Number(form.days) : 1, note: form.note }));
        }
        setRecords((all) => [...added.reverse(), ...all]);
        setMessage(mode === 'single' ? 'Leave entry added.' : `${plannedDates.length} leave days added to history.`);
      }
      resetForm();
    } catch (saveError) { setMessage(saveError instanceof Error ? saveError.message : 'Could not save leave.'); }
    finally { setSaving(false); }
  }

  function resetForm() {
    const date = initialDateForYear(year);
    setEditing(null); setMode('single'); setSelectedDates([]); setCalendarMonth(date.slice(0, 7));
    setForm({ date, endDate: date, days: '1', note: '' });
  }

  async function removeLeave(id: string) {
    if (!window.confirm('Remove this leave entry?')) return;
    try {
      await data.deleteLeave(id); setRecords((all) => all.filter((item) => item.id !== id)); setMessage('Leave entry removed.');
    } catch (removeError) { setMessage(removeError instanceof Error ? removeError.message : 'Could not remove leave.'); }
  }

  function editLeave(record: LeaveRecord) {
    setEditing(record); setMode('single'); setSelectedDates([]);
    setForm({ date: record.date, endDate: record.date, days: String(record.days), note: record.note });
  }

  function toggleCalendarDate(date: Date) {
    const value = dateKey(date);
    setSelectedDates((previous) => previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]);
  }

  return (
    <AdminLayout>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><div className="text-sm font-bold uppercase tracking-wide text-brand-600">Vio HR</div><h1 className="text-3xl font-bold">Leave management</h1><p className="mt-1 text-ink-500">Add one day, a consecutive range, or separate dates in a few clicks.</p></div>
        <div className="flex flex-wrap items-end gap-3"><Input label="Year" type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value) || currentYear)} className="w-28" />{selected && <Button variant="secondary" leftIcon={<Download width={18} height={18} />} onClick={() => exportLeavePdf(selected, year, allowance, employeeRecords)}>PDF report</Button>}</div>
      </header>

      {loading ? <div className="py-12 text-center text-ink-400">Loading leave data…</div> : error ? <Card className="p-8 text-center text-rose-600">{error}</Card> : employees.length === 0 ? <Card className="p-10 text-center text-ink-500">Add an employee first to start recording leave.</Card> : <>
        <Card className="overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Yearly leave overview · {year}</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400"><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Year</th><th className="px-5 py-3">Total leave days</th><th className="px-5 py-3">Used days</th><th className="px-5 py-3">Remaining days</th></tr></thead><tbody>{employees.map((employee) => { const total = allowances.find((item) => item.employeeId === employee.id)?.totalDays ?? 12; const employeeUsed = records.filter((item) => item.employeeId === employee.id).reduce((sum, item) => sum + item.days, 0); const employeeRemaining = total - employeeUsed; return <tr key={employee.id} className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/50 ${selectedId === employee.id ? 'bg-brand-50/60' : ''}`} onClick={() => setSelectedId(employee.id)}><td className="px-5 py-3.5 font-semibold">{employee.fullName}<span className="ml-2 font-mono text-xs text-ink-400">{employee.code}</span></td><td className="px-5 py-3.5 text-ink-500">{year}</td><td className="px-5 py-3.5 tabular-nums">{total}</td><td className="px-5 py-3.5 tabular-nums">{employeeUsed}</td><td className={`px-5 py-3.5 font-semibold tabular-nums ${employeeRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{employeeRemaining}</td></tr>; })}</tbody></table></div></Card>

        {selected && <><Card className="mt-5 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-600">Selected employee</p><h2 className="text-2xl font-bold">{selected.fullName}</h2><p className="mt-1 text-sm text-ink-500">{[selected.position, selected.phone].filter(Boolean).join(' · ')}</p></div><label className="block min-w-56"><span className="mb-1.5 block text-sm font-semibold text-ink-900">Change employee</span><select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label></div><div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"><StatCard value={allowance} label="Total leave days" tone="info" /><StatCard value={used} label="Used days" tone="warning" /><StatCard value={remaining} label="Remaining days" tone={remaining < 0 ? 'warning' : 'success'} /></div><div className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-5"><Input label="Yearly allowance" type="number" min={0} step="0.5" value={allowanceInput} onChange={(event) => setAllowanceInput(event.target.value)} hint="Defaults to 12 days." /><Button loading={saving} onClick={() => void saveAllowance()}>Save allowance</Button></div></Card>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"><Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{editing ? 'Edit leave' : 'Add leave'}</h2><p className="mt-1 text-sm text-ink-500">Choose the easiest option for this leave request.</p></div>{requestedDays > 0 && <Badge tone="info">{requestedDays} {requestedDays === 1 ? 'day' : 'days'}</Badge>}</div>
          {!editing && <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">{([['single', 'Single day'], ['range', 'Date range'], ['multiple', 'Multiple dates']] as const).map(([value, label]) => <button key={value} type="button" className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition ${mode === value ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`} onClick={() => changeMode(value)}>{label}</button>)}</div>}
          <form onSubmit={saveLeave} className="mt-5 space-y-4">
            {mode === 'single' && <><Input label="Date" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><Input label="Days" type="number" min={0.5} step={0.5} required value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} hint="Use 0.5 for a half-day." /></>}
            {mode === 'range' && <div className="grid gap-4 sm:grid-cols-2"><Input label="From" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /><Input label="To" type="date" required min={form.date} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div>}
            {mode === 'multiple' && <div className="rounded-2xl border border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><button type="button" className="rounded-lg px-2 py-1 text-lg text-ink-500 hover:bg-slate-100" aria-label="Previous month" onClick={() => setCalendarMonth(format(subMonths(parseISO(`${calendarMonth}-01`), 1), 'yyyy-MM'))}>‹</button><span className="font-bold">{format(parseISO(`${calendarMonth}-01`), 'MMMM yyyy')}</span><button type="button" className="rounded-lg px-2 py-1 text-lg text-ink-500 hover:bg-slate-100" aria-label="Next month" onClick={() => setCalendarMonth(format(addMonths(parseISO(`${calendarMonth}-01`), 1), 'yyyy-MM'))}>›</button></div><div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="py-1">{day}</span>)}{calendar.map((date) => { const value = dateKey(date); const inMonth = isSameMonth(date, parseISO(`${calendarMonth}-01`)); const active = selectedDates.includes(value); return <button key={value} type="button" disabled={!inMonth} className={`aspect-square rounded-lg text-sm font-semibold transition ${!inMonth ? 'text-slate-300' : active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-700 hover:bg-brand-50'}`} onClick={() => toggleCalendarDate(date)}>{format(date, 'd')}</button>; })}</div><div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">{selectedDates.length === 0 ? <span className="text-sm text-ink-400">Click dates to select them.</span> : selectedDates.slice().sort().map((date) => <button key={date} type="button" className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100" onClick={() => toggleCalendarDate(parseISO(date))}>{formatDateValue(date)} ×</button>)}</div></div>}
            <Input label="Reason / note" placeholder="Annual leave" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            <div className="flex gap-2"><Button type="submit" loading={saving} disabled={plannedDates.length === 0 || requestedDays <= 0} leftIcon={<Plus width={18} height={18} />}>{editing ? 'Update leave' : mode === 'single' ? 'Add leave' : `Add ${requestedDays || 0} days`}</Button>{editing && <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>}</div>
          </form>
          {message && <p className="mt-4 text-sm font-semibold text-brand-700">{message}</p>}
        </Card>

        <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-bold">Leave history</h2><p className="text-sm text-ink-500">{year} · {employeeRecords.length} entries</p></div>{remaining < 0 && <Badge tone="warning">Allowance exceeded</Badge>}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-400"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Days</th><th className="px-5 py-3">Note</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{employeeRecords.length === 0 ? <tr><td colSpan={4} className="px-5 py-10 text-center text-ink-500">No leave recorded for {year}.</td></tr> : employeeRecords.map((record) => <tr key={record.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3.5 font-semibold">{formatDateValue(record.date)}</td><td className="px-5 py-3.5 tabular-nums">{record.days}</td><td className="px-5 py-3.5 text-ink-500">{record.note || '—'}</td><td className="px-5 py-3.5 text-right"><button type="button" className="mr-1 rounded-lg p-2 text-ink-500 hover:bg-slate-100" title="Edit leave" onClick={() => editLeave(record)}><Pencil width={16} height={16} /></button><button type="button" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" title="Delete leave" onClick={() => void removeLeave(record.id)}><Trash width={16} height={16} /></button></td></tr>)}</tbody></table></div></Card>
        </div></>}
      </>}
    </AdminLayout>
  );
}
