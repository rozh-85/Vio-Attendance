import { addDays, format, parseISO } from 'date-fns';

export interface Place {
  id: string;
  account_id: string;
  person_name: string;
  name: string;
  phone: string;
  city: string;
  kind: string;
  reminder_date: string | null;
  last_activity: string;
  created_at: string;
}
export type PlaceInput = Pick<Place, 'person_name' | 'name' | 'phone' | 'city' | 'kind' | 'reminder_date'>;
export interface PlaceCall { id: string; place_id: string; called_at: string; note: string }
export interface PlaceOrderLink { place_id: string; order_id: string }
export interface PlacesData { places: Place[]; calls: PlaceCall[]; links: PlaceOrderLink[] }

// Match the database's Asia/Baghdad calendar day, independent of the viewer's zone.
export function baghdadDay(at = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)!.value).join('-');
}
export function reminderDay(place: Place): string {
  return place.reminder_date || format(addDays(parseISO(baghdadDay(new Date(place.last_activity))), 30), 'yyyy-MM-dd');
}
export function isGashbenIdentity(username: string, name: string): boolean {
  const aliases = ['gashben', 'gashbin', 'gashbeen', 'گەشبین'];
  return aliases.includes(username.trim().toLowerCase()) || aliases.includes(name.trim().toLowerCase());
}
