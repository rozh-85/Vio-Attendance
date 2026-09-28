/**
 * Holds every check-in up against the work locations set under HR → Locations
 * & devices, so the owner can see by name who checked in from somewhere else.
 * Shown only on the owner-gated check-in locations page (/rozhadmin/locations).
 *
 * Like the shared-phone report, nothing here ever blocks a check-in. It only
 * explains, afterwards, where each one came from:
 *
 * - **Outside** — the phone's GPS put it beyond the radius of every active work
 *   location. Measured to the nearest one.
 * - **No location** — the phone shared no GPS (permission denied, GPS off, or
 *   too slow), so nothing shows it was on site.
 * - **VPN** — the request reached the database from a network outside
 *   {@link HOME_COUNTRY}. A VPN changes the network, never the GPS, so this
 *   does not move a check-in into or out of a work location; it is reported
 *   next to the location, not instead of it.
 */

import type { CheckInEvent, Employee } from '@/types';
import type { HrLocation } from '@/services/hr/types';
import { distanceMeters } from '@/services/hr/logic';

/**
 * The country check-ins normally come from. A check-in whose network is in any
 * other country is marked as a likely VPN. Override with `VITE_HOME_COUNTRY`.
 */
export const HOME_COUNTRY = (
  import.meta.env.VITE_HOME_COUNTRY?.trim() || 'IQ'
).toUpperCase();

export type ZoneCheck =
  | { kind: 'inside'; location: HrLocation; distance: number }
  /** `location` is the nearest active work location. */
  | { kind: 'outside'; location: HrLocation; distance: number }
  | { kind: 'no-location' };

export type NetworkFlag =
  | { kind: 'tor' }
  | { kind: 'abroad'; country: string };

export interface CheckInReview {
  event: CheckInEvent;
  /** Undefined when the employee has since been deleted. */
  employee?: Employee;
  /** Null while no active work location is set — there is nothing to be in. */
  zone: ZoneCheck | null;
  network: NetworkFlag | null;
  /** Outside every work location, or no GPS to show it was inside one. */
  needsReview: boolean;
}

/** Active work locations with usable coordinates — the ones check-ins are held to. */
export function activeZones(locations: HrLocation[]): HrLocation[] {
  return locations.filter(
    (location) =>
      location.active &&
      Number.isFinite(Number(location.latitude)) &&
      Number.isFinite(Number(location.longitude)) &&
      Number(location.radiusMeters) > 0,
  );
}

function measure(
  position: { latitude?: number; longitude?: number },
  zones: HrLocation[],
): ZoneCheck | null {
  if (zones.length === 0) return null;
  const { latitude, longitude } = position;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { kind: 'no-location' };
  }

  const measured = zones.map((location) => ({
    location,
    distance: distanceMeters(
      latitude,
      longitude,
      Number(location.latitude),
      Number(location.longitude),
    ),
  }));
  const inside = measured
    .filter((m) => m.distance <= Number(m.location.radiusMeters))
    .sort((a, b) => a.distance - b.distance)[0];
  if (inside) return { kind: 'inside', ...inside };

  const nearest = measured.reduce((a, b) => (b.distance < a.distance ? b : a));
  return { kind: 'outside', ...nearest };
}

/**
 * Where one position stands against the active work locations. The same rule
 * as HR's "Test a geofence": inside means within a location's radius.
 */
export function checkZone(
  position: { latitude?: number; longitude?: number },
  locations: HrLocation[],
): ZoneCheck | null {
  return measure(position, activeZones(locations));
}

/**
 * Cloudflare, in front of Supabase, names the country of the network each
 * request came from; `T1` is its code for Tor.
 */
export function networkFlag(
  event: Pick<CheckInEvent, 'ipCountry'>,
): NetworkFlag | null {
  const country = event.ipCountry?.trim().toUpperCase();
  if (!country) return null;
  if (country === 'T1') return { kind: 'tor' };
  return country === HOME_COUNTRY ? null : { kind: 'abroad', country };
}

/** One review per check-in, newest first. */
export function reviewCheckIns(
  events: CheckInEvent[],
  employees: Employee[],
  locations: HrLocation[],
): CheckInReview[] {
  const zones = activeZones(locations);
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  return events
    .map((event) => {
      const zone = measure(event, zones);
      return {
        event,
        employee: employeesById.get(event.employeeId),
        zone,
        network: networkFlag(event),
        needsReview: zone?.kind === 'outside' || zone?.kind === 'no-location',
      };
    })
    .sort((a, b) => b.event.at.localeCompare(a.event.at));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  if (meters < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000).toLocaleString('en')} km`;
}

let regionNames: Intl.DisplayNames | null | undefined;

/** "DE" → "Germany". Falls back to the code on browsers without Intl support. */
export function countryName(code: string): string {
  if (code === 'T1') return 'Tor';
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** e.g. "Inside Main office", "2.4 km from Main office", "No location shared". */
export function describeZone(zone: ZoneCheck): string {
  switch (zone.kind) {
    case 'inside':
      return `Inside ${zone.location.name}`;
    case 'outside':
      return `${formatDistance(zone.distance)} from ${zone.location.name}`;
    case 'no-location':
      return 'No location shared';
  }
}

/** e.g. "VPN? Network in Germany". */
export function describeNetwork(flag: NetworkFlag): string {
  return flag.kind === 'tor'
    ? 'Tor network'
    : `VPN? Network in ${countryName(flag.country)}`;
}

/** Google Maps link for a check-in's GPS position, when it has one. */
export function mapUrl(event: Pick<CheckInEvent, 'latitude' | 'longitude'>): string | null {
  if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
}
