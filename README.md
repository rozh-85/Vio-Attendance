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
- **Close session** → ends the lecture and checks out anyone still present.
- **Export Excel** → downloads a workbook with three sheets:
  - `Sessions` — one row per lecture, with duration and headcount + total hours.
  - `Attendance` — one row per student per session, with hours present.
  - `Student Totals` — additive per-student hours across all lectures + %.

> QR codes simply encode a URL (e.g. `…/checkin/<sessionId>`). Any phone camera
> opens it — no in-app scanner or native app required.

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

## Project structure

```
src/
  components/        Reusable UI (ui/ primitives, QRPanel, AttendeeTable, icons)
  hooks/             useSessions, useSessionDetail (with live polling)
  pages/             Dashboard, SessionView, Register, Check-in/out, Recover
  services/
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
