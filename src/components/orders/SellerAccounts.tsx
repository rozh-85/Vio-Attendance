import { useMemo, useState, type FormEvent } from 'react';
import { format, startOfMonth } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Check, Copy, Eye, EyeOff, LinkIcon, Plus, Trash, UserPlus } from '@/components/icons';
import { countsAsSale, formatIqd } from '@/services/orders/options';
import { getOrdersStore, ordersErrorMessage } from '@/services/orders/store';
import type { SalesOrder, SocialAccount } from '@/services/orders/types';
import { paths } from '@/routes';
import type { Employee } from '@/types';
import { cn } from '@/utils/cn';

/** Easy to read out over the phone: no 0/O or 1/l look-alikes. */
function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  return Array.from({ length: 4 }, () => pick(letters)).join('') + Array.from({ length: 4 }, () => pick(digits)).join('');
}

function usernameFrom(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9._-]/g, '') ?? ''
  );
}

const orderPageUrl = () => `${window.location.origin}${paths.sellerOrders}`;

function loginText(username: string, password: string): string {
  return `Vio orders\n${orderPageUrl()}\nUsername: ${username}\nPassword: ${password}`;
}

/** The details to send a seller, with one button to copy them. */
function LoginDetails({ username, password }: { username: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="text-sm font-bold text-emerald-800">Send these to the seller</div>
      <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-sm text-ink-900">{loginText(username, password)}</pre>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        leftIcon={copied ? <Check width={16} height={16} /> : <Copy width={16} height={16} />}
        onClick={() => {
          void navigator.clipboard?.writeText(loginText(username, password)).then(() => setCopied(true));
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      <p className="mt-3 text-xs text-ink-500">
        The password is shown only now. If it is lost, give the account a new one.
      </p>
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink-900">
        Password<span className="ml-0.5 text-rose-500">*</span>
      </span>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-11 font-mono text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            aria-label={shown ? 'Hide password' : 'Show password'}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOff width={18} height={18} /> : <Eye width={18} height={18} />}
          </button>
        </div>
        <Button type="button" variant="outline" onClick={() => onChange(generatePassword())}>
          Generate
        </Button>
      </div>
      <span className="mt-1.5 block text-sm text-ink-500">At least 6 characters.</span>
    </div>
  );
}

function AddAccountModal({
  open,
  employees,
  accounts,
  onClose,
  onCreated,
}: {
  open: boolean;
  employees: Employee[];
  accounts: SocialAccount[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  // People without an account yet, social media and sales staff first.
  const choices = useMemo(() => {
    const taken = new Set(accounts.map((a) => a.employeeId).filter(Boolean));
    const isSales = (e: Employee) => /social|media|sales|page|فرۆش|سۆشیال/i.test(e.position ?? '');
    return employees
      .filter((e) => !taken.has(e.id))
      .sort((a, b) => Number(isSales(b)) - Number(isSales(a)) || a.fullName.localeCompare(b.fullName));
  }, [employees, accounts]);

  function reset() {
    setEmployeeId('');
    setDisplayName('');
    setUsername('');
    setPassword(generatePassword());
    setError(null);
    setCreated(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await getOrdersStore().createAccount({
        displayName,
        username,
        password,
        employeeId: employeeId || null,
      });
      setCreated({ username: username.trim(), password });
      onCreated();
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? 'Account ready' : 'Add seller account'}
      description={created ? undefined : 'The seller signs in with this on their phone and can only add orders.'}
    >
      {created ? (
        <div className="space-y-4">
          <LoginDetails username={created.username} password={created.password} />
          <Button fullWidth onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink-900">Employee</span>
            <select
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              value={employeeId}
              onChange={(e) => {
                const id = e.target.value;
                setEmployeeId(id);
                const person = employees.find((p) => p.id === id);
                if (person) {
                  setDisplayName(person.fullName.split(/\s+/)[0] ?? person.fullName);
                  setUsername(usernameFrom(person.fullName));
                }
              }}
            >
              <option value="">Not linked to an employee</option>
              {choices.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                  {e.position ? ` — ${e.position}` : ''}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Name in the report"
            required
            placeholder="e.g. Dilnya"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            label="Username"
            required
            autoCapitalize="none"
            placeholder="e.g. dilnya"
            hint="Letters, numbers, dots, dashes — no spaces."
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
          />
          <PasswordField value={password} onChange={setPassword} />
          {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={!displayName.trim() || !username.trim() || password.length < 6}
              leftIcon={<UserPlus width={17} height={17} />}
            >
              Create account
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function NewPasswordModal({ account, onClose }: { account: SocialAccount | null; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!account) return null;

  const close = () => {
    setPassword(generatePassword());
    setError(null);
    setDone(false);
    onClose();
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    setSaving(true);
    setError(null);
    try {
      await getOrdersStore().setAccountPassword(account.id, password);
      setDone(true);
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={`New password for ${account.displayName}`}
      description={done ? undefined : 'Their phone is signed out until they sign in with the new password.'}
    >
      {done ? (
        <div className="space-y-4">
          <LoginDetails username={account.username} password={password} />
          <Button fullWidth onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <PasswordField value={password} onChange={setPassword} />
          {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={password.length < 6}>
              Set password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function SellerAccounts({
  accounts,
  employees,
  orders,
  colorOf,
  onChanged,
}: {
  accounts: SocialAccount[];
  employees: Employee[];
  orders: SalesOrder[];
  colorOf: (seller: string) => string;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [passwordFor, setPasswordFor] = useState<SocialAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const employeeName = new Map(employees.map((e) => [e.id, e.fullName]));
  const monthStart = startOfMonth(new Date()).toISOString();
  const stats = useMemo(() => {
    const map = new Map<string, { all: number; month: number; monthSales: number }>();
    for (const o of orders) {
      if (!o.accountId) continue;
      const s = map.get(o.accountId) ?? { all: 0, month: 0, monthSales: 0 };
      s.all += 1;
      if (o.createdAt >= monthStart) {
        s.month += 1;
        if (countsAsSale(o.status)) s.monthSales += o.totalPrice;
      }
      map.set(o.accountId, s);
    }
    return map;
  }, [orders, monthStart]);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(ordersErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <LinkIcon />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink-900">Order page for sellers</div>
          <div className="truncate font-mono text-sm text-ink-500">{orderPageUrl()}</div>
          <div className="text-sm text-ink-500">
            Sellers sign in there and can only add orders — they never see any order, theirs or anyone else’s.
          </div>
        </div>
        <Button
          variant="outline"
          leftIcon={copied ? <Check width={16} height={16} /> : <Copy width={16} height={16} />}
          onClick={() => void navigator.clipboard?.writeText(orderPageUrl()).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink-900">
          Seller accounts <span className="font-normal text-ink-400">({accounts.length})</span>
        </h2>
        <Button leftIcon={<Plus />} onClick={() => setAdding(true)}>
          Add account
        </Button>
      </div>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {accounts.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <UserPlus width={26} height={26} />
          </div>
          <h3 className="mt-4 text-lg font-bold">No seller accounts yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-ink-500">
            Add one for each social media seller — Dilnya and Gashbin — and send them their login.
          </p>
          <Button className="mt-5" leftIcon={<Plus />} onClick={() => setAdding(true)}>
            Add the first account
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => {
            const s = stats.get(a.id) ?? { all: 0, month: 0, monthSales: 0 };
            return (
              <Card key={a.id} className={cn('p-5', !a.active && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <span
                    className="grid size-12 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
                    style={{ background: colorOf(a.displayName) }}
                  >
                    {a.displayName.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-lg font-bold text-ink-900">{a.displayName}</span>
                      {a.active ? <Badge tone="success">Active</Badge> : <Badge>Turned off</Badge>}
                    </div>
                    <div className="font-mono text-sm text-ink-500">@{a.username}</div>
                    <div className="text-sm text-ink-500">
                      {a.employeeId ? employeeName.get(a.employeeId) ?? 'Employee removed' : 'Not linked to an employee'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-sm">
                  <div>
                    <div className="text-xs text-ink-400">This month</div>
                    <div className="font-bold tabular-nums">{s.month} orders</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">Month sales</div>
                    <div className="truncate font-bold tabular-nums" title={formatIqd(s.monthSales)}>
                      {formatIqd(s.monthSales)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-400">All time</div>
                    <div className="font-bold tabular-nums">{s.all} orders</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-ink-400">
                  {a.lastLoginAt ? `Last signed in ${format(new Date(a.lastLoginAt), 'd MMM yyyy, hh:mm a')}` : 'Never signed in'}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Button size="sm" variant="outline" onClick={() => setPasswordFor(a)}>
                    New password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busyId === a.id}
                    onClick={() => void run(a.id, () => getOrdersStore().updateAccount(a.id, { active: !a.active }))}
                  >
                    {a.active ? 'Turn off' : 'Turn on'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-rose-600 hover:bg-rose-50"
                    leftIcon={<Trash width={15} height={15} />}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${a.displayName}'s account? They can no longer sign in. Their orders stay in the report under their name.`,
                        )
                      ) {
                        void run(a.id, () => getOrdersStore().deleteAccount(a.id));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddAccountModal
        open={adding}
        employees={employees}
        accounts={accounts}
        onClose={() => setAdding(false)}
        onCreated={onChanged}
      />
      <NewPasswordModal account={passwordFor} onClose={() => setPasswordFor(null)} />
    </div>
  );
}
