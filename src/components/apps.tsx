import type { ReactElement, SVGProps } from 'react';
import {
  Building,
  CalendarDays,
  Clock,
  Download,
  FileText,
  Home,
  MapPin,
  Phone,
  Search,
  Settings,
  Tag,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Wallet,
} from './icons';
import { paths } from '@/routes';
import type { HrTab } from '@/services/hr/navigation';

type Icon = (p: SVGProps<SVGSVGElement>) => ReactElement;

/**
 * Every part of the admin area, as a square on the Home screen. The same list
 * names the page in the top bar, so the two never disagree.
 */
export interface AppTile {
  id: string;
  to: string;
  label: string;
  /** One line under the name on the bigger squares. */
  about: string;
  icon: Icon;
  /** The square's colour; white text sits on it in light and dark mode. */
  color: string;
  /** small 1×1, wide 2×1, big 2×2. */
  size: 'small' | 'wide' | 'big';
  group: 'attendance' | 'people' | 'owner';
  /** Only after the owner password, like the pages themselves. */
  owner?: boolean;
  /** Pages that belong to this square besides `to` itself. */
  under?: string[];
}

export const APP_GROUPS: { id: AppTile['group']; label: string; about: string }[] = [
  { id: 'attendance', label: 'Attendance', about: 'Check-in sessions, reports and leave' },
  { id: 'people', label: 'People', about: 'The HR building and its rooms' },
  { id: 'owner', label: 'Owner area', about: 'Sales, profit and private reports' },
];

export const APPS: AppTile[] = [
  {
    id: 'attendance',
    to: paths.dashboard,
    label: 'Attendance',
    about: 'Start a session, show the QR codes, add employees',
    icon: Home,
    color: '#A5292B',
    size: 'big',
    group: 'attendance',
    under: ['/session/'],
  },
  { id: 'employees', to: paths.employees, label: 'Employee report', about: 'One person’s history', icon: Search, color: '#0284C7', size: 'small', group: 'attendance' },
  { id: 'leave', to: paths.leave, label: 'Leave', about: 'Days off', icon: CalendarDays, color: '#7C3AED', size: 'small', group: 'attendance' },
  {
    id: 'locations',
    to: paths.checkInLocations,
    label: 'Check-in locations',
    about: 'Who checked in away from work, and VPNs',
    icon: MapPin,
    color: '#0F766E',
    size: 'wide',
    group: 'attendance',
  },
  {
    id: 'hr',
    to: paths.hr,
    label: 'HR building',
    about: '11 rooms on 4 floors: people, time, pay, hiring',
    icon: Building,
    color: '#4338CA',
    size: 'big',
    group: 'people',
  },
  {
    id: 'profit',
    to: paths.profit,
    label: 'Profit',
    about: 'Sales − goods − sponsors',
    icon: TrendingUp,
    color: '#047857',
    size: 'big',
    group: 'owner',
    owner: true,
  },
  {
    id: 'orders',
    to: paths.socialOrders,
    label: 'Social media orders',
    about: 'Every seller’s orders',
    icon: Wallet,
    color: '#B45309',
    size: 'small',
    group: 'owner',
    owner: true,
  },
  { id: 'products', to: paths.profitModels, label: 'Products', about: 'Models and costs', icon: Tag, color: '#BE185D', size: 'small', group: 'owner', owner: true },
  { id: 'devices', to: paths.devices, label: 'Shared phones', about: 'One phone, many names', icon: Phone, color: '#334155', size: 'small', group: 'owner', owner: true },
  { id: 'gashben', to: paths.gashbenReport, label: 'Gashben places', about: 'Places and their orders', icon: Building, color: '#9333EA', size: 'small', group: 'owner', owner: true },
];

/** The HR rooms with their own square on Home, as shortcuts into the building. */
export const HR_SHORTCUTS: HrTab[] = ['people', 'time', 'leave', 'payroll'];

/** One icon per HR room, the same in the lobby, the corridor and on Home. */
export const HR_ROOM_ICONS: Record<HrTab, Icon> = {
  overview: Home,
  people: Users,
  'employee-details': User,
  organization: Building,
  time: Clock,
  leave: CalendarDays,
  payroll: Wallet,
  hiring: FileText,
  interviews: UserPlus,
  locations: MapPin,
  rules: Settings,
  reports: Download,
};

/** One colour per HR floor. */
export const HR_FLOOR_COLORS: Record<string, string> = {
  People: '#4338CA',
  Workforce: '#047857',
  Talent: '#B45309',
  Administration: '#334155',
};

/** The square a page belongs to: the longest address that matches. */
export function appFor(pathname: string): AppTile | undefined {
  const matches = APPS.filter((a) =>
    a.to === '/'
      ? pathname === '/'
      : pathname === a.to || pathname.startsWith(`${a.to}/`) || a.under?.some((u) => pathname.startsWith(u)),
  );
  // Profit's Products page sits under /rozhadmin/profit: the longer address wins.
  return matches.sort((a, b) => b.to.length - a.to.length)[0];
}
