# Vio Attendance

A React web app for taking employee attendance with QR codes. A supervisor
starts a session and shows two QR codes; employees scan them with their phone to
**check in** and **check out**. Closing a session auto-checks-out everyone still
present. Results export to a cleanly-formatted Excel workbook, and any one
employee's history exports to a Vio-branded PDF.

## How it works

- **Supervisor** signs in at `/VioAdmin`, adds employees, then starts a session.
  A session is two fields: the supervisor's name and the day it covers, which
  defaults to today and becomes the session's name.
- **Add employee** → three fields: **full name**, **phone number** and
  **position**. The employee is identified by their unique phone number and
  receives a short sequential **code** (`001`, `002`, …).
- **Check-In QR / Check-Out QR** → the employee scans, types their code, and is
  marked in / out. Each gate can be opened or paused independently. The QR
  rotates every 5 seconds so a forwarded screenshot won't work; a **Constant QR**
  toggle switches to one code that lasts the whole session.
- **Close session** → ends it and checks out anyone still present.
- **Export Excel** (per session) → one sheet: code, name, position, check-in,
  check-out, total time present.
- **Employee report** → search an employee, narrow to a **month** or a **custom
  date range**, tick the sessions that belong to them, correct any missed scan
  by hand, and **Export PDF**. The chosen period is printed on the PDF, so an
  exported report always says what it covers.

> QR codes simply encode a URL (e.g. `…/checkin/<sessionId>?t=…`). Any phone
> camera opens it — no in-app scanner or native app required.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

The live Supabase project is already configured in `.env` (gitignored). See
[`.env.example`](.env.example) for the shape of it.

## Database

Everything lives in one file: [`supabase/schema.sql`](supabase/schema.sql).

1. Supabase Dashboard → **SQL Editor** → **New query** → paste the whole file →
   **Run**. It creates the tables, the code sequence, the four employee-facing
   functions, row-level security and the grants. Safe to re-run.
2. Supabase Dashboard → **Authentication → Users → Add user** → create the
   supervisor login (email + password, "Auto Confirm User" ticked).
3. Open the app at `/VioAdmin` and sign in with that account.

A commented-out smoke test at the bottom of `schema.sql` runs the whole flow
(create session → register employee → check in → check out) and cleans up after
itself, if you want to prove the database works before touching the UI.

| Table             | Holds                                                     |
| ----------------- | --------------------------------------------------------- |
| `employees`       | `code`, `full_name`, `phone` (unique), `position`          |
| `sessions`        | supervisor, title, location, status, the two QR gates      |
| `attendance`      | one row per employee per session, with in/out timestamps   |
| `check_in_events` | append-only log of which phone made each check-in          |

The app talks to the database with the public **anon key**, which ships inside
the browser bundle. That key can do only four things, all through
security-definer functions: look a code up by phone, check in, check out, and
read the session list. It can never read or edit the employee roster — that
needs a signed-in supervisor.

## Spotting proxy check-ins ("check me in, I'm not there")

The first time a phone checks an employee in, it stores a random **device id**
in its own browser storage. That id rides along with every later check-in, and
the first one opens an **8-hour window** that every later check-in from that
phone joins.

**Nothing is ever blocked.** A phone may check in as many employees as it likes —
the point is that the supervisor sees it. As soon as a phone checks in a *second*
employee, it is reported in two places:

- **On the session screen**, a **Shared phones** card naming everyone that phone
  checked in, with codes and times. Whoever checked in first is marked: that's
  most likely the phone's owner, and the rest were checked in by them. Those
  employees also get a "Same phone as …" line in the table. Both appear **only
  for whoever unlocked the owner report** — an ordinary supervisor opening the
  same session is never even sent the data.
- **On the `/rozhadmin` page**, the same report across every session. Filter by
  period, pick a single **session** (the list offers only sessions a shared phone
  actually touched), or search by employee.

  That page names employees suspected of checking in for each other, so it is
  **unlisted**: reached by typing the address, and asking for the owner's email
  and password on top of the supervisor sign-in. Once unlocked it joins the
  sidebar for that browser tab; **Lock report** (or closing the browser) removes
  it again. Change who can open it with `VITE_OWNER_EMAIL` /
  `VITE_OWNER_PASSWORD` (see [`.env.example`](.env.example)); the built-in
  password is stored only as a SHA-256 digest in
  [`ownerGate.ts`](src/services/auth/ownerGate.ts).

  > That gate runs in the browser, so it hides the page rather than securing it —
  > anyone with devtools can get past it, and by default any signed-in supervisor
  > could query `check_in_events` directly. To make "only me" true in the
  > database, run [`restrict-device-log.sql`](supabase/restrict-device-log.sql)
  > with your Supabase login email in it. Employees keep checking in either way.

The window follows the phone, not the session: a phone that checks in one
employee in the morning and another before lunch is reported in both. Because
two sessions are often open at once, **every name carries the session its
check-in actually landed in**.

The window length lives in one place per side —
`DEVICE_SESSION_WINDOW_HOURS` in [`src/utils/device.ts`](src/utils/device.ts)
and `v_window` in the SQL `check_in` function. Change them together.

> This makes casual proxy check-ins obvious; it does not make them impossible.
> An employee who clears their site data or opens a private tab gets a fresh
> device id. Treat the report as a prompt to look up, not as proof.

## Branding

The whole brand is one file plus one module:

- [`public/vio-logo.svg`](public/vio-logo.svg) — the mark. It is the favicon and
  the in-app logo. Drop the official artwork in at this path to replace both.
- [`src/brand.ts`](src/brand.ts) — the name, the colours, and the inline copy of
  the mark that is printed into the PDF report.
- [`src/index.css`](src/index.css) — the `--color-brand-*` tokens every
  `brand-*` utility in the UI reads. Keep them in step with `src/brand.ts`.

Vio red is `#A5292B`.

## Data layer

All persistence goes through the [`DataService`](src/services/data/DataService.ts)
interface, so the UI never touches the backend directly.

- **`supabase`** (default) — [`SupabaseDataService`](src/services/data/SupabaseDataService.ts).
- **`local`** — [`LocalStorageDataService`](src/services/data/LocalStorageDataService.ts),
  stores everything in the browser. Handy for an offline demo; data is
  per-browser, so cross-device check-ins don't sync. Sign-in is skipped
  entirely when no Supabase credentials are configured.

Switch with `VITE_DATA_BACKEND` in `.env`. If Supabase credentials are missing
the app falls back to local storage rather than failing to boot.

## Project structure

```
src/
  brand.ts           Name, colours, and the inline logo used by the PDF
  components/        Reusable UI (ui/ primitives, QR panels, AttendeeTable)
  hooks/             useSessions, useSessionDetail (with live polling)
  pages/             Dashboard, SessionView, Employee report, Check-in/out
  services/
    attendance/      Shared-phone detection (sharedDevices.ts)
    data/            DataService interface + local & Supabase implementations
    report/          Excel exports + the Vio-branded employee PDF
  types/             Domain models (Employee, Session, AttendanceRecord)
  utils/             id/code/phone, time, device, QR token, url helpers
  routes.ts          Centralised route paths
```

## Routes

| Path                     | Who        | Purpose                                |
| ------------------------ | ---------- | -------------------------------------- |
| `/`                      | Supervisor | Dashboard — add employees, start sessions |
| `/session/:id`           | Supervisor | Control panel + QR codes               |
| `/employees`             | Supervisor | Employee report + PDF export           |
| `/VioAdmin`             | Supervisor | Sign in (deliberately non-obvious)     |
| `/rozhadmin`             | Owner      | Phones used by several employees (unlisted, own password) |
| `/checkin/:sessionId`    | Employee   | Enter code to check in                 |
| `/checkout/:sessionId`   | Employee   | Enter code to check out                |
| `/recover`               | Employee   | Look up code by phone number           |

Anything else — `/login`, `/register`, any unknown URL, and every supervisor
route while signed out — shows the neutral employee page, so nobody stumbles
onto the admin area.
