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
  session screen names every one of them. Nothing is blocked — see below.
- **Close session** → ends the lecture and checks out anyone still present.
- **Export Excel** → downloads a workbook with three sheets:
  - `Sessions` — one row per lecture, with duration and headcount + total hours.
  - `Attendance` — one row per student per session, with hours present.
  - `Student Totals` — additive per-student hours across all lectures + %.

> QR codes simply encode a URL (e.g. `…/checkin/<sessionId>`). Any phone camera
> opens it — no in-app scanner or native app required.

## Spotting proxy check-ins ("check me in, I'm not there")

The first time a phone checks a student in, it stores a random **device id** in
its own browser storage. That id rides along with every later check-in, and the
first one opens a **12-hour window** that every later check-in from that phone
joins.

**Nothing is ever blocked.** A phone may check in as many students as it likes —
the point is that the lecturer sees it. As soon as a phone checks in a *second*
student, it is reported in two places:

- **On the session screen**, a **Shared phones** card naming everyone that phone
  checked in, with codes and times. The student who checked in first is marked:
  that's most likely the phone's owner, and the rest were checked in by them.
  Those students also get a "Same phone as …" line in the students table. Both
  appear **only for whoever unlocked the owner report** — an ordinary lecturer
  opening the same lecture is never even sent the data.
- **On the `/rozhadmin` page**, the same report across every lecture. Filter by
  period, pick a single **lecture** (the list offers only lectures a shared
  phone actually touched), or search by student. Use it when the lecture is
  already closed, or when you want the whole picture.

  That page names students suspected of checking in for each other, so it is
  **unlisted**: reached by typing the address, and asking for the owner's email
  and password on top of the lecturer sign-in. Once unlocked it joins the
  sidebar for that browser tab, so you can move between it and the dashboard
  freely; **Lock report** (or closing the browser) removes it again. Change who
  can open it with `VITE_OWNER_EMAIL` / `VITE_OWNER_PASSWORD` (see
  [`.env.example`](.env.example)); the built-in password is stored only as a
  SHA-256 digest in [`ownerGate.ts`](src/services/auth/ownerGate.ts).

  > That gate runs in the browser, so on its own it would only hide the page.
  > It is not on its own: once
  > [`lock-device-log.sql`](supabase/lock-device-log.sql) has been run, Postgres
  > lets *no one* read `check_in_events` directly — the only way in is a
  > function that asks for the same password. Getting past the gate with
  > devtools then buys nothing, because the data never leaves the database
  > without it. That is what makes "only me" true here: every lecturer signs in
  > with the same Supabase account, so the account cannot tell you apart from
  > them, but the password can. Students keep checking in either way.
  >
  > Change the password in **both** places or the report will open and then come
  > up empty: set `VITE_OWNER_PASSWORD`, and put that password's SHA-256 in the
  > SQL file.

The window follows the phone, not the lecture: a phone that checks in one
student in the morning lecture and another before lunch is reported in both.
Because two lectures are often open at once, **every name carries the lecture
its check-in actually landed in** — the one you're currently looking at is
marked "this lecture", and a phone that worked more than one lecture says so at
the top of its group.

The window length lives in one place per side —
`DEVICE_SESSION_WINDOW_HOURS` in [`src/utils/device.ts`](src/utils/device.ts)
and `v_window` in the SQL `check_in` function. Change them together.

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
| [`lock-device-log.sql`](supabase/lock-device-log.sql)                           | Makes that log readable only with the owner password |

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
| `/rozhadmin`             | Owner     | Phones used by several students (unlisted, own password) |
| `/register`              | Student   | Sign up, receive code          |
| `/checkin/:sessionId`    | Student   | Enter code to check in         |
| `/checkout/:sessionId`   | Student   | Enter code to check out        |
| `/recover`               | Student   | Look up code by phone number   |
