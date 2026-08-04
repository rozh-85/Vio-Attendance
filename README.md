# QR Attendance — Frontend

A React web app for taking student attendance with QR codes. A lecturer starts a
session and shows three QR codes; students scan them with their phone to
**register**, **check in**, and **check out**. Closing a session auto-checks-out
everyone still present. The day's results export to a cleanly-formatted Excel
workbook.

## How it works

- **Lecturer** opens the dashboard, enters their name / lecture title / location,
  and starts a session.
- **Register QR** → opens a form (full name, phone, college, department). The
  student is identified by their **unique phone number** and receives a short
  sequential **code** (`001`, `002`, …).
- **Check-In QR / Check-Out QR** → the student scans, types their code, and is
  marked in / out. Each gate can be opened or paused independently.
- **Shared phones** → when one phone checks in more than one student, the
  session screen names everyone involved. See below.
- **Close session** → ends the lecture and checks out anyone still present.
- **Export Excel** → downloads a workbook with three sheets:
  - `Sessions` — one row per lecture, with duration and headcount + total hours.
  - `Attendance` — one row per student per session, with hours present.
  - `Student Totals` — additive per-student hours across all lectures + %.

> QR codes simply encode a URL (e.g. `…/checkin/<sessionId>`). Any phone camera
> opens it — no in-app scanner or native app required.

## Spotting proxy check-ins ("check me in, I'm not there")

The first time a phone checks a student in, it stores a random **device id** in
its own browser storage. That id rides along with every later check-in, which
gives the lecturer two things:

- **A limit.** One phone may check in at most **3 different students** inside a
  rolling **8-hour window**. The next one is turned away and told to use their
  own phone (the lecturer can still add them by hand from the session screen).
- **The names.** The session screen grows a **Shared phones** card listing every
  phone that checked in more than one student, with all their names and times.
  The student who checked in first is marked — that's most likely the phone's
  owner, and the rest were checked in by them. Flagged students also get a
  "Same phone as …" line in the students table.

The window follows the phone, not the lecture: a phone that checks in one
student in the morning lecture and another before lunch is reported in both.

Both numbers live in one place each — `DEVICE_SESSION_WINDOW_HOURS` and
`MAX_STUDENTS_PER_DEVICE` in [`src/utils/device.ts`](src/utils/device.ts), and
`v_window` / `v_max_students` in the SQL `check_in` function. Change them
together. Raising the limit to a large number keeps the reporting but lets any
number of students through.

> This makes casual proxy check-ins obvious; it does not make them impossible.
> A student who clears their site data or opens a private tab gets a fresh
> device id. Treat the report as a prompt to look up, not as proof.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Data layer (swap-in Supabase)

All persistence goes through the [`DataService`](src/services/data/DataService.ts)
interface, so the UI never touches the backend directly.

- **`local`** (default) — [`LocalStorageDataService`](src/services/data/LocalStorageDataService.ts),
  stores everything in the browser. Great for demos; note that data is per-browser,
  so cross-device check-ins only sync with a shared backend.
- **`supabase`** — [`SupabaseDataService`](src/services/data/SupabaseDataService.ts),
  a full implementation ready to connect.

To switch, copy `.env.example` to `.env` and set:

```
VITE_DATA_BACKEND=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then run the schema in [`supabase/schema.sql`](supabase/schema.sql) in the Supabase
SQL editor. If credentials are missing, the app safely falls back to local storage.

**Already have a database?** `schema.sql` is the full picture for a fresh
project; existing ones are upgraded with the migration files next to it, each
safe to re-run:

| File                                                                           | Adds                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------- |
| [`harden-session-policies.sql`](supabase/harden-session-policies.sql)           | Only lecturers may create / edit sessions          |
| [`harden-student-data.sql`](supabase/harden-student-data.sql)                   | Student data unreadable with the public anon key   |
| [`device-checkin-tracking.sql`](supabase/device-checkin-tracking.sql)           | The shared-phone log described above               |

Until `device-checkin-tracking.sql` is run, check-in keeps working — it just
records no devices and the Shared phones card stays empty.

## Project structure

```
src/
  components/        Reusable UI (ui/ primitives, QRPanel, AttendeeTable, icons)
  hooks/             useSessions, useSessionDetail (with live polling)
  pages/             Dashboard, SessionView, Register, Check-in/out, Recover
  services/
    attendance/      Shared-phone detection (sharedDevices.ts)
    data/            DataService interface + local & Supabase implementations
    report/          Aggregation (aggregate.ts) + Excel export (excel.ts)
  types/             Domain models (Student, Session, AttendanceRecord)
  utils/             id/code/phone, time, url, cn helpers
  routes.ts          Centralised route paths
```

## Routes

| Path                     | Who       | Purpose                        |
| ------------------------ | --------- | ------------------------------ |
| `/`                      | Lecturer  | Dashboard — create / list      |
| `/session/:id`           | Lecturer  | Control panel + QR codes       |
| `/register`              | Student   | Sign up, receive code          |
| `/checkin/:sessionId`    | Student   | Enter code to check in         |
| `/checkout/:sessionId`   | Student   | Enter code to check out        |
| `/recover`               | Student   | Look up code by phone number   |
