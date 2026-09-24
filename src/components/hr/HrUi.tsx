import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ArrowLeft, Pencil, Plus, Search } from "@/components/icons";

export type Values = Record<string, string | number | boolean | string[]>;
export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "number"
    | "date"
    | "time"
    | "month"
    | "email"
    | "url"
    | "textarea"
    | "select"
    | "checkbox"
    | "multi";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  options?: { value: string; label: string }[];
}
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }));
export const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
export function Fields({
  fields,
  value,
  onChange,
}: {
  fields: Field[];
  value: Values;
  onChange: (next: Values) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <label
          key={f.key}
          className={
            f.type === "textarea" || f.type === "multi" ? "sm:col-span-2" : ""
          }
        >
          <span className="mb-1.5 block text-sm font-semibold">
            {f.label}
            {f.required && <span className="text-brand-600"> *</span>}
          </span>
          {f.type === "checkbox" ? (
            <input
              type="checkbox"
              className="size-5 accent-brand-600"
              checked={!!value[f.key]}
              onChange={(e) =>
                onChange({ ...value, [f.key]: e.target.checked })
              }
            />
          ) : f.type === "multi" ? (
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {f.options?.map((o) => (
                <label
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm"
                  key={o.value}
                >
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={
                      Array.isArray(value[f.key]) &&
                      (value[f.key] as string[]).includes(o.value)
                    }
                    onChange={(e) => {
                      const values = Array.isArray(value[f.key])
                        ? (value[f.key] as string[])
                        : [];
                      onChange({
                        ...value,
                        [f.key]: e.target.checked
                          ? [...values, o.value]
                          : values.filter((v) => v !== o.value),
                      });
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          ) : f.type === "select" ? (
            <select
              className={fieldClass}
              required={f.required}
              value={String(value[f.key] ?? "")}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            >
              <option value="">Select…</option>
              {f.options?.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              className={`${fieldClass} min-h-24 py-3`}
              required={f.required}
              value={String(value[f.key] ?? "")}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          ) : (
            <input
              className={fieldClass}
              type={f.type ?? "text"}
              required={f.required}
              min={f.min}
              max={f.max}
              step={f.step ?? (f.type === "number" ? "any" : undefined)}
              value={String(value[f.key] ?? "")}
              onChange={(e) =>
                onChange({
                  ...value,
                  [f.key]:
                    f.type === "number" && e.target.value !== ""
                      ? Number(e.target.value)
                      : e.target.value,
                })
              }
            />
          )}
          {f.hint && (
            <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">
              {f.hint}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
/**
 * Runs the same checks the editors used to do inline, so the dialog and the
 * full-page editor reject exactly the same input. Throws on the first problem.
 */
export function assertValid(fields: Field[], value: Values): void {
  for (const f of fields) {
    const v = value[f.key];
    if (
      f.required &&
      (v == null ||
        (typeof v === "string" && !v.trim()) ||
        (Array.isArray(v) && v.length === 0))
    )
      throw new Error(`${f.label} is required.`);
    if (
      f.type === "number" &&
      v !== "" &&
      v != null &&
      (!Number.isFinite(Number(v)) ||
        (f.min !== undefined && Number(v) < f.min) ||
        (f.max !== undefined && Number(v) > f.max))
    )
      throw new Error(`Enter a valid ${f.label.toLowerCase()}.`);
  }
}

/** A titled block of fields inside {@link EditorPage}. */
export interface FieldGroup {
  title: string;
  description?: string;
  fields: Field[];
}

/**
 * A record editor that takes the whole page instead of a dialog.
 *
 * Long forms — the employee profile runs to nearly forty fields — do not fit
 * in a modal: it scrolls inside itself, hides the page behind it, and gives no
 * room to group anything. This lays the same fields out down the page in
 * titled sections, with the actions repeated at the top and the bottom so they
 * are in reach whichever end of the form you are at.
 *
 * `onSave` owns what happens next: it is awaited, anything it throws is shown
 * here, and leaving the page afterwards is the caller's business.
 */
export function EditorPage({
  eyebrow,
  title,
  description,
  backLabel,
  groups,
  initial,
  onSave,
  onClose,
  saveLabel = "Save changes",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** What the back link goes back to, e.g. "Employee details". */
  backLabel: string;
  groups: FieldGroup[];
  initial: Values;
  onSave: (v: Values) => Promise<void>;
  onClose: () => void;
  saveLabel?: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = groups.flatMap((group) => group.fields);

  // `ml-auto` keeps the buttons on the right even when the header wraps them
  // onto their own line on a narrower screen.
  const actions = (
    <div className="ml-auto flex shrink-0 gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" loading={busy}>
        {saveLabel}
      </Button>
    </div>
  );

  return (
    <form
      className="min-w-0"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          assertValid(fields, value);
          await onSave(value);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Unable to save this record.",
          );
          // A failure near the bottom of a long form is easy to miss.
          window.scrollTo({ top: 0, behavior: "smooth" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <header className="mb-6">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft width={18} height={18} /> {backLabel}
        </button>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            {eyebrow && (
              <div className="text-xs font-bold uppercase tracking-wider text-brand-600">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
                {description}
              </p>
            )}
          </div>
          {actions}
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          {error}
        </p>
      )}

      <div className="space-y-5">
        {groups.map((group) => (
          <Section
            key={group.title}
            title={group.title}
            description={group.description}
          >
            <div className="p-5">
              <Fields
                fields={group.fields}
                value={value}
                onChange={setValue}
              />
            </div>
          </Section>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm text-ink-500">
          Nothing is saved until you choose {saveLabel.toLowerCase()}.
        </p>
        {actions}
      </div>
    </form>
  );
}

export function Editor({
  title,
  fields,
  initial,
  onSave,
  onClose,
  description,
}: {
  title: string;
  description?: string;
  fields: Field[];
  initial: Values;
  onSave: (v: Values) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={() => !busy && onClose()}
      className="max-w-2xl"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            assertValid(fields, value);
            await onSave(value);
            onClose();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to save this record.",
            );
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-5"
      >
        <Fields fields={fields} value={value} onChange={setValue} />
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Status({ children }: { children: ReactNode }) {
  const value = String(children).toLowerCase();
  const color =
    /approved|paid|active|present|complete|hired|clocked in/.test(value) &&
    !/inactive|incomplete/.test(value)
      ? "bg-emerald-50 text-emerald-700"
      : /rejected|absent|expired|inactive/.test(value)
        ? "bg-rose-50 text-rose-700"
        : /pending|late|draft|probation|incomplete/.test(value)
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-ink-500";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${color}`}
    >
      {children}
    </span>
  );
}
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5">
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-500">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export interface Column<T> {
  title: string;
  render: (row: T) => ReactNode;
}
export function Table<T>({
  rows,
  columns,
  empty = "No records yet. Add your first record to get started.",
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/80">
          <tr>
            {columns.map((c) => (
              <th
                key={c.title}
                className="whitespace-nowrap px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500"
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-14 text-center text-ink-500"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="border-t border-slate-100 transition-colors hover:bg-slate-50/60"
              >
                {columns.map((c) => (
                  <td key={c.title} className="px-5 py-3.5 align-middle">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
export function Collection<T extends { id: string }>({
  title,
  description,
  rows,
  columns,
  fields,
  defaults,
  onSave,
  validate,
  extra,
  canEdit,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: Column<T>[];
  fields: Field[];
  defaults: NoInfer<T>;
  onSave: (r: T) => Promise<void>;
  validate?: (r: T) => string | null;
  extra?: ReactNode;
  canEdit?: (r: T) => boolean;
}) {
  const [editing, setEditing] = useState<T | null>(null);
  const [query, setQuery] = useState("");
  return (
    <Section
      title={title}
      description={description}
      action={
        <Button
          size="sm"
          leftIcon={<Plus width={16} />}
          onClick={() => setEditing({ ...defaults, id: crypto.randomUUID() })}
        >
          Add {title.toLowerCase().replace(/s$/, "")}
        </Button>
      }
    >
      {(rows.length > 5 || extra) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          {rows.length > 5 && (
            <div className="flex items-center gap-2">
              <Search width={16} className="text-ink-400" />
              <input
                aria-label={`Search ${title}`}
                placeholder={`Search ${title.toLowerCase()}…`}
                className={fieldClass}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {extra}
        </div>
      )}
      <Table
        rows={rows.filter((r) =>
          JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
        )}
        columns={[
          ...columns,
          {
            title: "Actions",
            render: (r) =>
              canEdit && !canEdit(r) ? (
                <Status>Locked</Status>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Edit ${title.toLowerCase()} record`}
                  leftIcon={<Pencil width={14} />}
                  onClick={() => setEditing(r)}
                >
                  Edit
                </Button>
              ),
          },
        ]}
      />
      {editing && (
        <Editor
          title={`${rows.some((r) => r.id === editing.id) ? "Edit" : "Add"} ${title.toLowerCase().replace(/s$/, "")}`}
          fields={fields}
          initial={editing as unknown as Values}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            const row = { ...editing, ...v } as T;
            const err = validate?.(row);
            if (err) throw new Error(err);
            await onSave(row);
          }}
        />
      )}
    </Section>
  );
}
