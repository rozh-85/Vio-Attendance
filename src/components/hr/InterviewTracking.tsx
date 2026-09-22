import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  LinkIcon,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash,
  X,
} from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { fieldClass } from "@/components/hr/HrUi";
import { createHrId } from "@/services/hr/store";
import type {
  HrInterviewCandidate,
  HrInterviewStatus,
  HrWorkspace,
} from "@/services/hr/types";

const statuses: HrInterviewStatus[] = [
  "Approved",
  "Interviewed",
  "Call Not Answered",
  "Did Not Accept",
  "Rejected",
  "Outside Country",
  "Pending / Call Later",
];

const statusStyles: Record<HrInterviewStatus, string> = {
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Interviewed: "border-blue-200 bg-blue-50 text-blue-700",
  "Call Not Answered": "border-orange-200 bg-orange-50 text-orange-700",
  "Did Not Accept": "border-slate-200 bg-slate-100 text-slate-600",
  Rejected: "border-rose-200 bg-rose-50 text-rose-700",
  "Outside Country": "border-violet-200 bg-violet-50 text-violet-700",
  "Pending / Call Later": "border-amber-200 bg-amber-50 text-amber-700",
};

const today = () => {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

const emptyCandidate = (): HrInterviewCandidate => ({
  id: "",
  date: today(),
  fullName: "",
  phone: "",
  location: "",
  portfolioUrl: "",
  status: "Pending / Call Later",
  notes: "",
  callAgainDate: "",
  expectedReturnDate: "",
  interviewDate: "",
  history: [],
});

function formatDate(value: string) {
  if (!value) return "—";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(parsed);
}

function portfolioUrl(value: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function statusHistoryEvent(status: HrInterviewStatus) {
  const events: Record<HrInterviewStatus, string> = {
    Approved: "Approved",
    Interviewed: "Interview Scheduled",
    "Call Not Answered": "Called — No Answer",
    "Did Not Accept": "Offer Declined",
    Rejected: "Candidate Rejected",
    "Outside Country": "Marked Outside Country",
    "Pending / Call Later": "Follow-up Pending",
  };
  return events[status];
}

function StatusBadge({ status }: { status: HrInterviewStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-ink-500">{label}</span>
        <span className={`size-2 rounded-full ${tone}`} />
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-ink-900">
        {value}
      </div>
    </div>
  );
}

export function InterviewTracking({
  workspace,
  commit,
}: {
  workspace: HrWorkspace;
  commit: (m: (w: HrWorkspace) => HrWorkspace, a: string) => Promise<void>;
}) {
  const candidates = workspace.interviewCandidates;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortKey, setSortKey] = useState<"date" | "name">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<HrInterviewCandidate | null>(null);
  const [selected, setSelected] = useState<HrInterviewCandidate | null>(null);
  const [statusCandidate, setStatusCandidate] =
    useState<HrInterviewCandidate | null>(null);
  const [feedback, setFeedback] = useState("");

  const locations = useMemo(
    () =>
      [...new Set(candidates.map((candidate) => candidate.location).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [candidates],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return candidates
      .filter((candidate) => {
        const searchable = `${candidate.fullName} ${candidate.phone} ${candidate.location}`.toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (!statusFilter || candidate.status === statusFilter) &&
          (!dateFilter || candidate.date === dateFilter) &&
          (!locationFilter || candidate.location === locationFilter)
        );
      })
      .sort((a, b) => {
        const result =
          sortKey === "date"
            ? a.date.localeCompare(b.date)
            : a.fullName.localeCompare(b.fullName, undefined, {
                sensitivity: "base",
              });
        return sortDirection === "asc" ? result : -result;
      });
  }, [candidates, dateFilter, locationFilter, query, sortDirection, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, dateFilter, locationFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selected) return;
    const current = candidates.find((candidate) => candidate.id === selected.id);
    setSelected(current ?? null);
  }, [candidates, selected?.id]);

  const summary = {
    total: candidates.length,
    approved: candidates.filter((candidate) => candidate.status === "Approved")
      .length,
    pending: candidates.filter((candidate) =>
      ["Interviewed", "Pending / Call Later"].includes(candidate.status),
    ).length,
    noAnswer: candidates.filter(
      (candidate) => candidate.status === "Call Not Answered",
    ).length,
    rejected: candidates.filter((candidate) =>
      ["Rejected", "Did Not Accept"].includes(candidate.status),
    ).length,
    outside: candidates.filter(
      (candidate) => candidate.status === "Outside Country",
    ).length,
  };

  function changeSort(next: "date" | "name") {
    if (sortKey === next) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDirection(next === "date" ? "desc" : "asc");
    }
  }

  async function saveCandidate(value: HrInterviewCandidate) {
    const existing = candidates.find((candidate) => candidate.id === value.id);
    const candidateId = value.id || createHrId("interview-candidate");
    const statusChanged = existing && existing.status !== value.status;
    const history = existing?.history ? [...existing.history] : [];
    if (!existing) {
      history.push({
        id: createHrId("interview-history"),
        date: value.date || today(),
        event: "Candidate Added",
      });
    } else if (statusChanged) {
      history.push({
        id: createHrId("interview-history"),
        date: today(),
        event: statusHistoryEvent(value.status),
      });
    }
    const record = { ...value, id: candidateId, history };
    await commit(
      (current) => ({
        ...current,
        interviewCandidates: [
          ...current.interviewCandidates.filter((item) => item.id !== candidateId),
          record,
        ],
      }),
      `${existing ? "Updated" : "Added"} interview candidate ${record.fullName}`,
    );
    setEditing(null);
  }

  async function updateStatus(
    candidate: HrInterviewCandidate,
    status: HrInterviewStatus,
    relatedDate?: string,
  ) {
    if (candidate.status === status && !relatedDate) return;
    const dateUpdate =
      status === "Call Not Answered"
        ? { callAgainDate: relatedDate ?? candidate.callAgainDate }
        : status === "Outside Country"
          ? { expectedReturnDate: relatedDate ?? candidate.expectedReturnDate }
          : status === "Interviewed"
            ? { interviewDate: relatedDate ?? candidate.interviewDate }
            : {};
    const history =
      candidate.status === status
        ? candidate.history
        : [
            ...candidate.history,
            {
              id: createHrId("interview-history"),
              date: today(),
              event: statusHistoryEvent(status),
            },
          ];
    await commit(
      (current) => ({
        ...current,
        interviewCandidates: current.interviewCandidates.map((item) =>
          item.id === candidate.id
            ? { ...item, ...dateUpdate, status, history }
            : item,
        ),
      }),
      `Changed ${candidate.fullName} interview status to ${status}`,
    );
    setStatusCandidate(null);
  }

  async function deleteCandidate(candidate: HrInterviewCandidate) {
    if (!window.confirm(`Delete ${candidate.fullName} from Interview Tracking?`))
      return;
    await commit(
      (current) => ({
        ...current,
        interviewCandidates: current.interviewCandidates.filter(
          (item) => item.id !== candidate.id,
        ),
      }),
      `Deleted interview candidate ${candidate.fullName}`,
    );
    if (selected?.id === candidate.id) setSelected(null);
  }

  async function copyPhone(candidate: HrInterviewCandidate) {
    await navigator.clipboard.writeText(candidate.phone);
    setFeedback(`${candidate.fullName}'s phone number copied.`);
    window.setTimeout(() => setFeedback(""), 2500);
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
    setDateFilter("");
    setLocationFilter("");
  }

  const hasFilters = !!(query || statusFilter || dateFilter || locationFilter);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">
            Interview Tracking
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Manage and track candidates contacted by the HR department.
          </p>
        </div>
        <Button
          size="sm"
          leftIcon={<Plus width={16} />}
          onClick={() => setEditing(emptyCandidate())}
        >
          Add Candidate
        </Button>
      </header>

      <section
        aria-label="Interview candidate summary"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6"
      >
        <SummaryItem label="Total Candidates" value={summary.total} tone="bg-slate-400" />
        <SummaryItem label="Approved" value={summary.approved} tone="bg-emerald-400" />
        <SummaryItem label="Pending / Interviewed" value={summary.pending} tone="bg-blue-400" />
        <SummaryItem label="No Answer" value={summary.noAnswer} tone="bg-orange-400" />
        <SummaryItem label="Rejected" value={summary.rejected} tone="bg-rose-400" />
        <SummaryItem label="Outside Country" value={summary.outside} tone="bg-violet-400" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(260px,1fr)_190px_170px_190px_auto]">
            <label className="relative">
              <span className="sr-only">Search candidates</span>
              <Search
                width={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                className={`${fieldClass} pl-10`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, phone or location…"
              />
            </label>
            <select
              className={fieldClass}
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <label className="relative">
              <span className="sr-only">Filter by date</span>
              <input
                className={fieldClass}
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>
            <select
              className={fieldClass}
              aria-label="Filter by location"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasFilters}
              leftIcon={<X width={15} />}
              onClick={clearFilters}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        {feedback && (
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            {feedback}
          </div>
        )}

        <div className="max-h-[62vh] overflow-auto">
          <table className="min-w-[1040px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgb(226,232,240)]">
              <tr>
                <SortableHeading
                  label="Date"
                  active={sortKey === "date"}
                  direction={sortDirection}
                  onClick={() => changeSort("date")}
                />
                <SortableHeading
                  label="Full Name"
                  active={sortKey === "name"}
                  direction={sortDirection}
                  onClick={() => changeSort("name")}
                />
                {[
                  "Phone Number",
                  "Location",
                  "Portfolio",
                  "Status",
                  "Notes",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center">
                    <div className="font-semibold text-ink-700">
                      {hasFilters ? "No matching candidates" : "No candidates yet"}
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {hasFilters
                        ? "Change or clear the filters to see more results."
                        : "Add the first candidate to begin interview tracking."}
                    </p>
                  </td>
                </tr>
              ) : (
                pageRows.map((candidate) => (
                  <tr
                    key={candidate.id}
                    tabIndex={0}
                    onClick={() => setSelected(candidate)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setSelected(candidate);
                    }}
                    className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-600">
                      {formatDate(candidate.date)}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-ink-900">
                      {candidate.fullName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-600">
                      {candidate.phone}
                    </td>
                    <td className="px-4 py-3.5 text-ink-600">
                      <span className="flex items-center gap-1.5">
                        <MapPin width={14} className="shrink-0 text-ink-400" />
                        {candidate.location}
                      </span>
                    </td>
                    <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                      {portfolioUrl(candidate.portfolioUrl) ? (
                        <a
                          href={portfolioUrl(candidate.portfolioUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
                        >
                          <LinkIcon width={13} /> Open Portfolio
                        </a>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                      <div className="space-y-1.5">
                        <select
                          aria-label={`Change status for ${candidate.fullName}`}
                          title="Change status"
                          value={candidate.status}
                          onChange={(event) =>
                            void updateStatus(
                              candidate,
                              event.target.value as HrInterviewStatus,
                            )
                          }
                          className={`max-w-[185px] rounded-full border px-2.5 py-1 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-100 ${statusStyles[candidate.status]}`}
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <FollowUpDate candidate={candidate} />
                      </div>
                    </td>
                    <td className="max-w-[240px] px-4 py-3.5 text-ink-500">
                      <p className="line-clamp-2">{candidate.notes || "—"}</p>
                    </td>
                    <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                      <ActionMenu
                        candidate={candidate}
                        onView={() => setSelected(candidate)}
                        onEdit={() => setEditing(candidate)}
                        onStatus={() => setStatusCandidate(candidate)}
                        onCopy={() => void copyPhone(candidate)}
                        onDelete={() => void deleteCandidate(candidate)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3 text-sm text-ink-500">
            <span>
              {filtered.length === 0
                ? "0 candidates"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length}`}
            </span>
            <label className="flex items-center gap-2">
              <span className="sr-only">Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-ink-700"
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="min-w-20 text-center text-xs font-semibold text-ink-500">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      {editing && (
        <CandidateForm
          candidate={editing}
          onClose={() => setEditing(null)}
          onSave={saveCandidate}
        />
      )}
      {statusCandidate && (
        <StatusDialog
          candidate={statusCandidate}
          onClose={() => setStatusCandidate(null)}
          onSave={updateStatus}
        />
      )}
      {selected && (
        <CandidateDetails
          candidate={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function SortableHeading({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 hover:text-ink-900"
      >
        {label}
        {active ? (
          direction === "asc" ? (
            <ChevronUp width={14} />
          ) : (
            <ChevronDown width={14} />
          )
        ) : (
          <span className="w-3.5" />
        )}
      </button>
    </th>
  );
}

function FollowUpDate({ candidate }: { candidate: HrInterviewCandidate }) {
  const value =
    candidate.status === "Call Not Answered"
      ? candidate.callAgainDate
      : candidate.status === "Outside Country"
        ? candidate.expectedReturnDate
        : candidate.status === "Interviewed"
          ? candidate.interviewDate
          : "";
  if (!value) return null;
  const label =
    candidate.status === "Call Not Answered"
      ? "Call again"
      : candidate.status === "Outside Country"
        ? "Returns"
        : "Interview";
  return (
    <div className="flex items-center gap-1 text-[11px] font-medium text-ink-500">
      <CalendarDays width={12} /> {label}: {formatDate(value)}
    </div>
  );
}

function ActionMenu({
  candidate,
  onView,
  onEdit,
  onStatus,
  onCopy,
  onDelete,
}: {
  candidate: HrInterviewCandidate;
  onView: () => void;
  onEdit: () => void;
  onStatus: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <details className="group relative">
      <summary
        aria-label={`Actions for ${candidate.fullName}`}
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-lg text-ink-500 hover:bg-slate-100 hover:text-ink-900 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal width={18} />
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        <MenuButton icon={<Eye width={15} />} label="View Details" onClick={onView} />
        <MenuButton icon={<Pencil width={15} />} label="Edit" onClick={onEdit} />
        <MenuButton icon={<CalendarDays width={15} />} label="Change Status" onClick={onStatus} />
        <a
          href={`tel:${candidate.phone}`}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink-700 hover:bg-slate-50"
        >
          <Phone width={15} /> Call Candidate
        </a>
        <MenuButton icon={<Copy width={15} />} label="Copy Phone Number" onClick={onCopy} />
        <div className="my-1 border-t border-slate-100" />
        <MenuButton
          icon={<Trash width={15} />}
          label="Delete"
          onClick={onDelete}
          danger
        />
      </div>
    </details>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-slate-50 ${danger ? "text-rose-600" : "text-ink-700"}`}
    >
      {icon} {label}
    </button>
  );
}

function CandidateForm({
  candidate,
  onClose,
  onSave,
}: {
  candidate: HrInterviewCandidate;
  onClose: () => void;
  onSave: (candidate: HrInterviewCandidate) => Promise<void>;
}) {
  const [value, setValue] = useState(candidate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof HrInterviewCandidate, next: string) =>
    setValue((current) => ({ ...current, [key]: next }));

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={candidate.id ? "Edit Candidate" : "Add Candidate"}
      description="Keep the candidate's contact details and current interview status up to date."
      className="max-w-2xl"
    >
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setBusy(true);
          try {
            if (!value.date || !value.fullName.trim() || !value.phone.trim() || !value.location.trim()) {
              throw new Error("Date, full name, phone number and location are required.");
            }
            if (value.portfolioUrl && !portfolioUrl(value.portfolioUrl)) {
              throw new Error("Portfolio URL must start with http:// or https://.");
            }
            await onSave(value);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save candidate.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Date" required>
            <input
              className={fieldClass}
              type="date"
              required
              value={value.date}
              onChange={(event) => update("date", event.target.value)}
            />
          </FormField>
          <FormField label="Full Name" required>
            <input
              className={fieldClass}
              required
              autoFocus
              value={value.fullName}
              onChange={(event) => update("fullName", event.target.value)}
            />
          </FormField>
          <FormField label="Phone Number" required>
            <input
              className={fieldClass}
              type="tel"
              required
              value={value.phone}
              onChange={(event) => update("phone", event.target.value)}
            />
          </FormField>
          <FormField label="Location" required>
            <input
              className={fieldClass}
              required
              value={value.location}
              onChange={(event) => update("location", event.target.value)}
            />
          </FormField>
          <FormField label="Portfolio URL" hint="Optional">
            <input
              className={fieldClass}
              type="url"
              placeholder="https://"
              value={value.portfolioUrl}
              onChange={(event) => update("portfolioUrl", event.target.value)}
            />
          </FormField>
          <FormField label="Status" required>
            <select
              className={fieldClass}
              required
              value={value.status}
              onChange={(event) =>
                update("status", event.target.value as HrInterviewStatus)
              }
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </FormField>
          {value.status === "Call Not Answered" && (
            <FormField label="Call Again Date" hint="Optional">
              <input
                className={fieldClass}
                type="date"
                value={value.callAgainDate}
                onChange={(event) => update("callAgainDate", event.target.value)}
              />
            </FormField>
          )}
          {value.status === "Outside Country" && (
            <FormField label="Expected Return Date" hint="Optional">
              <input
                className={fieldClass}
                type="date"
                value={value.expectedReturnDate}
                onChange={(event) => update("expectedReturnDate", event.target.value)}
              />
            </FormField>
          )}
          {value.status === "Interviewed" && (
            <FormField label="Interview Date" hint="Optional">
              <input
                className={fieldClass}
                type="date"
                value={value.interviewDate}
                onChange={(event) => update("interviewDate", event.target.value)}
              />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <FormField label="Notes" hint="Optional">
              <textarea
                className={`${fieldClass} min-h-24 py-3`}
                value={value.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </FormField>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save Candidate
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-sm font-semibold text-ink-800">
        {label}
        {required && <span className="text-brand-600">*</span>}
        {hint && <span className="ml-auto text-xs font-normal text-ink-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function StatusDialog({
  candidate,
  onClose,
  onSave,
}: {
  candidate: HrInterviewCandidate;
  onClose: () => void;
  onSave: (
    candidate: HrInterviewCandidate,
    status: HrInterviewStatus,
    relatedDate?: string,
  ) => Promise<void>;
}) {
  const [status, setStatus] = useState(candidate.status);
  const [relatedDate, setRelatedDate] = useState(
    candidate.status === "Call Not Answered"
      ? candidate.callAgainDate
      : candidate.status === "Outside Country"
        ? candidate.expectedReturnDate
        : candidate.status === "Interviewed"
          ? candidate.interviewDate
          : "",
  );
  const [busy, setBusy] = useState(false);
  const dateLabel =
    status === "Call Not Answered"
      ? "Call Again Date"
      : status === "Outside Country"
        ? "Expected Return Date"
        : status === "Interviewed"
          ? "Interview Date"
          : "";
  return (
    <Modal open title="Change Status" description={candidate.fullName} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSave(candidate, status, relatedDate);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField label="Status" required>
          <select
            className={fieldClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as HrInterviewStatus);
              setRelatedDate("");
            }}
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </FormField>
        {dateLabel && (
          <FormField label={dateLabel} hint="Optional">
            <input
              className={fieldClass}
              type="date"
              value={relatedDate}
              onChange={(event) => setRelatedDate(event.target.value)}
            />
          </FormField>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save Status
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CandidateDetails({
  candidate,
  onClose,
  onEdit,
}: {
  candidate: HrInterviewCandidate;
  onClose: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const details = [
    ["Date added", formatDate(candidate.date)],
    ["Phone number", candidate.phone],
    ["Location", candidate.location],
    ["Call again date", formatDate(candidate.callAgainDate)],
    ["Expected return date", formatDate(candidate.expectedReturnDate)],
    ["Interview date", formatDate(candidate.interviewDate)],
  ];
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Candidate details">
      <button
        type="button"
        aria-label="Close candidate details"
        className="absolute inset-0 bg-ink-900/30"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
              Candidate Details
            </p>
            <h3 className="mt-1 truncate text-xl font-bold text-ink-900">
              {candidate.fullName}
            </h3>
            <div className="mt-2">
              <StatusBadge status={candidate.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X width={19} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">{value}</dd>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h4 className="text-sm font-bold text-ink-900">Notes</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-600">
              {candidate.notes || "No notes added."}
            </p>
          </div>
          {portfolioUrl(candidate.portfolioUrl) && (
            <div className="mt-5">
              <a
                href={portfolioUrl(candidate.portfolioUrl)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50"
              >
                <LinkIcon width={15} /> Open Portfolio
              </a>
            </div>
          )}
          <div className="mt-7 border-t border-slate-100 pt-5">
            <h4 className="text-sm font-bold text-ink-900">Status History</h4>
            <div className="mt-4 space-y-0">
              {[...candidate.history].reverse().map((entry, index) => (
                <div className="relative flex gap-3 pb-5" key={entry.id}>
                  {index < candidate.history.length - 1 && (
                    <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" />
                  )}
                  <span className="relative mt-1.5 size-3 shrink-0 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                  <div>
                    <div className="text-sm font-semibold text-ink-800">{entry.event}</div>
                    <div className="mt-0.5 text-xs text-ink-400">{formatDate(entry.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-4 sm:px-6">
          <Button variant="outline" fullWidth onClick={onClose}>
            Close
          </Button>
          <Button fullWidth leftIcon={<Pencil width={15} />} onClick={onEdit}>
            Edit Candidate
          </Button>
        </div>
      </aside>
    </div>
  );
}
