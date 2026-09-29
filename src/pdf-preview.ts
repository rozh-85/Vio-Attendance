// Scratch harness: renders the employee PDF document in the page so the layout
// can be looked at without opening a print dialog. Delete with pdf-preview.html.
import { buildEmployeePdfHtml } from '@/services/report/employeePdf';
import type { Employee } from '@/types';

const employee: Employee = {
  id: 'e1',
  code: '007',
  fullName: 'Ahmed Karim',
  phone: '0750 000 0000',
  position: 'Warehouse',
  createdAt: '2026-01-01T08:00:00.000Z',
};

const html = buildEmployeePdfHtml(
  employee,
  {
    totalSessions: 5,
    attended: 4,
    notCheckedOut: 2,
    absent: 1,
    totalHours: '31:20',
    period: 'September 2026',
  },
  [
    {
      session: 'Morning shift',
      date: '28 Sep 2026, 08:00',
      checkIn: '08:04',
      checkOut: '16:02',
      status: 'Present',
      hours: '07:58',
    },
    {
      session: 'Morning shift',
      date: '27 Sep 2026, 08:00',
      checkIn: '08:01',
      checkOut: 'Not checked out',
      status: 'Not checked out',
      hours: '08:00',
    },
    {
      session: 'Evening shift',
      date: '26 Sep 2026, 16:00',
      checkIn: '16:10',
      checkOut: 'Not checked out',
      status: 'Not checked out',
      hours: '07:50',
    },
    {
      session: 'Morning shift',
      date: '25 Sep 2026, 08:00',
      checkIn: '—',
      checkOut: '—',
      status: 'Absent',
      hours: '—',
    },
    {
      session: 'Stocktake',
      date: '24 Sep 2026, 09:00',
      checkIn: '—',
      checkOut: '—',
      status: 'Not registered yet',
      hours: '—',
    },
  ],
);

document.documentElement.innerHTML = html.replace(
  /<script[\s\S]*?<\/script>/g,
  '',
);
