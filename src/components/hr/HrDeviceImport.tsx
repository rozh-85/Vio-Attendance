import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Employee } from "@/types";
import type { HrWorkspace } from "@/services/hr/types";
import { parseDeviceCsv } from "@/services/hr/deviceImport";
import { Section, Table, fieldClass } from "./HrUi";

export function HrDeviceImport({
  workspace,
  employees,
  commit,
}: {
  workspace: HrWorkspace;
  employees: Employee[];
  commit: (m: (w: HrWorkspace) => HrWorkspace, action: string) => Promise<void>;
}) {
  const [device, setDevice] = useState("");
  const [rows, setRows] = useState<HrWorkspace["deviceAttendance"]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Section
      title="Import terminal attendance"
      description="Export a CSV from your ZK iFace gateway with headers employee_code,check_in,check_out. Use times such as 2026-09-18T08:00:00+03:00. Preview records before importing; repeat imports skip duplicate check-ins."
    >
      <div className="flex flex-wrap items-center gap-3 p-5">
        <select
          aria-label="Import device"
          className={`${fieldClass} max-w-xs`}
          value={device}
          onChange={(e) => {
            setDevice(e.target.value);
            setRows([]);
          }}
        >
          <option value="">Choose source device…</option>
          {workspace.devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Device CSV"
          type="file"
          accept=".csv,text/csv"
          disabled={!device || busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!f) return;
            setError("");
            setRows([]);
            try {
              if (f.size > 2 * 1024 * 1024)
                throw new Error("CSV must be smaller than 2 MB.");
              const parsed = parseDeviceCsv(
                await f.text(),
                employees,
                device,
                workspace.deviceAttendance,
              );
              setRows(parsed);
              if (!parsed.length)
                setError("No new records; this file may already be imported.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Invalid CSV.");
            }
          }}
        />
        <Button
          size="sm"
          disabled={!rows.length}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await commit(
                (w) => ({
                  ...w,
                  deviceAttendance: [...w.deviceAttendance, ...rows],
                  devices: w.devices.map((d) =>
                    d.id === device
                      ? { ...d, lastSyncAt: new Date().toISOString() }
                      : d,
                  ),
                }),
                `Imported ${rows.length} terminal attendance records`,
              );
              setRows([]);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Import failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Import {rows.length} records
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      <Table
        rows={
          rows.length
            ? rows.slice(0, 30)
            : workspace.deviceAttendance.slice(-30).reverse()
        }
        columns={[
          {
            title: "Employee",
            render: (r) =>
              employees.find((e) => e.id === r.employeeId)?.fullName ??
              "Former employee",
          },
          {
            title: "Check-in",
            render: (r) => new Date(r.checkInAt).toLocaleString(),
          },
          {
            title: "Check-out",
            render: (r) =>
              r.checkOutAt
                ? new Date(r.checkOutAt).toLocaleString()
                : "Missing",
          },
        ]}
        empty="Choose a device and CSV file to preview attendance."
      />
    </Section>
  );
}
