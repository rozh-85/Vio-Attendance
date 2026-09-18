import { useState } from "react";
import type { Employee } from "@/types";
import type { HrDocument, HrWorkspace } from "@/services/hr/types";
import { profileFor } from "@/services/hr/store";
import { localDate } from "@/services/hr/logic";
import { openHrFile, safeLink, uploadHrFile } from "@/services/hr/files";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Section, Status, Table, fieldClass } from "./HrUi";

export function HrDocuments({
  workspace,
  employees,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  commit: (m: (w: HrWorkspace) => HrWorkspace, action: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Contract");
  const [expiresOn, setExpires] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const docs = employees.flatMap((e) =>
    profileFor(workspace, e.id).documents.map((d) => ({
      ...d,
      employeeId: e.id,
      employee: e.fullName,
    })),
  );
  return (
    <Section
      title="Employee document archive"
      description="Contracts, identification, certificates and CVs. Upload PDF or images up to 2 MB, or attach a private document link."
      action={
        <Button
          size="sm"
          onClick={() => {
            setOpen(true);
            setError("");
          }}
        >
          Add document
        </Button>
      }
    >
      {error && !open && (
        <p role="alert" className="p-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Table
        rows={docs}
        columns={[
          {
            title: "Document",
            render: (d) => (
              <div className="font-semibold">
                {d.title}
                <div className="text-xs font-normal text-ink-500">{d.type}</div>
              </div>
            ),
          },
          { title: "Employee", render: (d) => d.employee },
          { title: "Uploaded", render: (d) => d.uploadedAt.slice(0, 10) },
          { title: "Expires", render: (d) => d.expiresOn || "No expiry" },
          {
            title: "Status",
            render: (d) => (
              <Status>
                {d.expiresOn && d.expiresOn < localDate()
                  ? "expired"
                  : d.status}
              </Status>
            ),
          },
          {
            title: "Actions",
            render: (d) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void openHrFile(d.url, d.fileName || `${d.title}.pdf`).catch(
                    (e) => setError(e.message),
                  )
                }
              >
                Open / download
              </Button>
            ),
          },
        ]}
      />
      {open && (
        <Modal
          open
          title="Add employee document"
          className="max-w-xl"
          onClose={() => !busy && setOpen(false)}
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (!employeeId || !title.trim())
                  throw new Error("Choose an employee and document title.");
                if (!file && !safeLink(url))
                  throw new Error(
                    "Choose a file or enter a valid HTTPS document link.",
                  );
                const savedUrl = file
                  ? await uploadHrFile(file, employeeId)
                  : url;
                const doc: HrDocument = {
                  id: crypto.randomUUID(),
                  title: title.trim(),
                  type,
                  expiresOn,
                  uploadedAt: new Date().toISOString(),
                  status: "active",
                  url: savedUrl,
                  fileName: file?.name,
                };
                await commit((w) => {
                  const p = profileFor(w, employeeId);
                  return {
                    ...w,
                    profiles: {
                      ...w.profiles,
                      [employeeId]: { ...p, documents: [...p.documents, doc] },
                    },
                  };
                }, `Archived ${type}: ${title}`);
                setOpen(false);
                setTitle("");
                setUrl("");
                setFile(null);
                setExpires("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block text-sm font-semibold">
              Employee
              <select
                required
                className={fieldClass}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Choose employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Document title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="block text-sm font-semibold">
              Category
              <select
                className={fieldClass}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {[
                  "Contract",
                  "ID",
                  "CV",
                  "Certificate",
                  "Medical",
                  "Other",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <Input
              label="Expiry date"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpires(e.target.value)}
            />
            <Input
              label="Upload file"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Input
              label="Or document link"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy}>
              Save document
            </Button>
          </form>
        </Modal>
      )}
    </Section>
  );
}
