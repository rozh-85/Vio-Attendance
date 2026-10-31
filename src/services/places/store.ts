import { getSupabaseClient } from '@/lib/supabase';
import { LocalOrdersStore } from '@/services/orders/localStore';
import { getOrdersStore } from '@/services/orders/store';
import type { NewSalesOrder } from '@/services/orders/types';
import type { Place, PlaceInput, PlacesData } from './types';

const KEY = 'vio.gashbenPlaces';
const empty = (): PlacesData => ({ places: [], calls: [], links: [] });
function localData(): PlacesData { return JSON.parse(localStorage.getItem(KEY) || 'null') ?? empty(); }
function persist(data: PlacesData) { localStorage.setItem(KEY, JSON.stringify(data)); }
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient()!.rpc(name, args);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42P01') throw new Error('Places are not set up yet. Run supabase/gashben-places.sql in Supabase.');
    throw new Error(error.message);
  }
  return data as T;
}
export async function canUsePlaces(token: string): Promise<boolean> {
  if (getSupabaseClient()) return rpc<boolean>('gashben_places_access', { p_token: token });
  return !!await new LocalOrdersStore().placesAccount(token);
}
async function requireAccount(token: string): Promise<string> {
  const id = await new LocalOrdersStore().placesAccount(token);
  if (!id) throw new Error('This page is only available to Gashben. Please sign in with that account.');
  return id;
}
export async function loadPlaces(token?: string): Promise<PlacesData> {
  if (getSupabaseClient()) return rpc<PlacesData>('gashben_places_data', { p_token: token ?? null });
  const data = localData();
  if (token) {
    const id = await requireAccount(token);
    data.places = data.places.filter((p) => p.account_id === id);
    const ids = new Set(data.places.map((p) => p.id));
    data.calls = data.calls.filter((c) => ids.has(c.place_id));
    data.links = data.links.filter((l) => ids.has(l.place_id));
  }
  return data;
}
export async function savePlace(token: string, input: PlaceInput, id?: string): Promise<string> {
  if (getSupabaseClient()) return rpc<string>('gashben_save_place', { p_token: token, p_id: id ?? null, p_place: input });
  const account = await requireAccount(token);
  const data = localData();
  const existing = data.places.find((p) => p.id === id && p.account_id === account);
  if (id && !existing) throw new Error('Place not found.');
  if (![input.person_name, input.name, input.phone, input.city, input.kind].every((v) => v.trim())) throw new Error('Fill in the contact, place name, phone, city and type.');
  const place: Place = { ...input, id: id ?? crypto.randomUUID(), account_id: account, created_at: existing?.created_at ?? new Date().toISOString(), last_activity: existing?.last_activity ?? new Date().toISOString() };
  data.places = [...data.places.filter((p) => p.id !== place.id), place];
  persist(data);
  return place.id;
}
export async function logCall(token: string, id: string, note: string, nextDate: string | null): Promise<void> {
  if (getSupabaseClient()) return rpc('gashben_log_call', { p_token: token, p_id: id, p_note: note, p_next_date: nextDate });
  const account = await requireAccount(token);
  const data = localData();
  const place = data.places.find((p) => p.id === id && p.account_id === account);
  if (!place) throw new Error('Place not found.');
  const now = new Date().toISOString();
  place.last_activity = now;
  place.reminder_date = nextDate;
  data.calls.push({ id: crypto.randomUUID(), place_id: id, called_at: now, note });
  persist(data);
}
export async function submitPlaceOrder(token: string, id: string, order: NewSalesOrder): Promise<{ orderNo: number }> {
  if (getSupabaseClient()) return rpc('gashben_submit_place_order', { p_token: token, p_id: id, p_order: order });
  const account = await requireAccount(token);
  const data = localData();
  const place = data.places.find((p) => p.id === id && p.account_id === account);
  if (!place) throw new Error('Place not found.');
  const result = await getOrdersStore().submitOrder(token, order);
  const saved = (await getOrdersStore().listMyOrders(token)).find((o) => o.orderNo === result.orderNo)!;
  data.links.push({ place_id: id, order_id: saved.id });
  place.last_activity = new Date().toISOString();
  persist(data);
  return result;
}
