import type { Employee } from "@/types";
import type { HrWorkspace } from "./types";

// Explicit exchange format, exported by the terminal's middleware. Time zones
// must be included so overnight punches aren't reinterpreted by another browser.
export function parseDeviceCsv(
  input: string,
  employees: Employee[],
  deviceId: string,
  existing: HrWorkspace["deviceAttendance"],
): HrWorkspace["deviceAttendance"] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (lines[0]?.toLowerCase() !== "employee_code,check_in,check_out")
    throw new Error("Headers must be employee_code,check_in,check_out.");
  if (lines.length > 5001)
    throw new Error("Import at most 5,000 records at a time.");
  const result: HrWorkspace["deviceAttendance"] = [];
  const seen = new Set(existing.map((r) => `${r.employeeId}|${r.checkInAt}`));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const [code, start, end] = cells;
    const employee = employees.find((e) => e.code === code);
    if (cells.length !== 3 || !employee)
      throw new Error(
        `Row ${i + 1}: employee code not found or wrong number of columns.`,
      );
    const validTime = (s: string) =>
      /T\d\d:\d\d.*(Z|[+-]\d\d:\d\d)$/.test(s) &&
      Number.isFinite(Date.parse(s));
    if (
      !validTime(start) ||
      (end && (!validTime(end) || Date.parse(end) < Date.parse(start)))
    )
      throw new Error(
        `Row ${i + 1}: use ISO timestamps with time zones; check-out must follow check-in.`,
      );
    const checkInAt = new Date(start).toISOString();
    const checkOutAt = end ? new Date(end).toISOString() : "";
    const key = `${employee.id}|${checkInAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: crypto.randomUUID(),
      employeeId: employee.id,
      deviceId,
      checkInAt,
      checkOutAt,
    });
  }
  return result;
}
