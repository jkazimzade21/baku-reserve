import Constants from 'expo-constants';
import { Platform } from 'react-native';

type ExtraConfig = {
  apiUrl?: string;
  API_URL?: string;
};

export type RestaurantSummary = {
  id: string;
  name: string;
  cuisine: string[];
  city?: string;
  cover_photo?: string;
};

export type TableDetail = {
  id: string;
  name: string;
  capacity: number;
};

export type AreaDetail = {
  id: string;
  name: string;
  tables: TableDetail[];
};

export type RestaurantDetail = RestaurantSummary & {
  address?: string;
  phone?: string;
  photos?: string[];
  areas?: AreaDetail[];
};

export type AvailabilitySlot = {
  start: string;
  end: string;
  count: number;
  available_table_ids: string[];
};

export type AvailabilityResponse = {
  slots: AvailabilitySlot[];
};

export type Reservation = {
  id: string;
  restaurant_id: string;
  table_id?: string | null;
  party_size: number;
  start: string;
  end: string;
  guest_name?: string;
  guest_phone?: string | null;
  status: string;
};

export type ReservationPayload = {
  restaurant_id: string;
  party_size: number;
  start: string;
  end: string;
  guest_name: string;
  guest_phone?: string;
  table_id?: string;
};

const extra: ExtraConfig =
  (Constants?.expoConfig?.extra as ExtraConfig | undefined) ??
  (Constants.manifest?.extra as ExtraConfig | undefined) ??
  {};

const DEFAULT_BASE = Platform.select({
  ios: 'http://localhost:8000',
  android: 'http://10.0.2.2:8000',
  default: 'http://192.168.0.148:8000',
});

const ENV_BASE = process.env.EXPO_PUBLIC_API_BASE?.trim();

const hostUri =
  Constants.expoConfig?.hostUri ??
  (Constants as any).manifest?.hostUri ??
  (Constants as any).manifest?.debuggerHost;

let derivedHost: string | undefined;
if (hostUri) {
  const host = hostUri.split(':')[0];
  if (host && host !== '127.0.0.1' && host !== 'localhost') {
    derivedHost = `http://${host}:8000`;
  }
}

export const API_URL =
  ENV_BASE ||
  extra.apiUrl ||
  extra.API_URL ||
  derivedHost ||
  DEFAULT_BASE ||
  'http://localhost:8000';

async function handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (res.ok) {
    return res.json() as Promise<T>;
  }
  let detail = fallbackMessage;
  try {
    const payload = await res.json();
    detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : JSON.stringify(payload?.detail ?? fallbackMessage);
  } catch (err) {
    const text = await res.text();
    if (text) detail = text;
  }
  throw new Error(detail);
}

export async function fetchRestaurants(q?: string) {
  const url = q ? `${API_URL}/restaurants?q=${encodeURIComponent(q)}` : `${API_URL}/restaurants`;
  const res = await fetch(url);
  return handleResponse<RestaurantSummary[]>(res, 'Failed to fetch restaurants');
}

export async function fetchRestaurant(id: string) {
  const res = await fetch(`${API_URL}/restaurants/${id}`);
  return handleResponse<RestaurantDetail>(res, 'Restaurant not found');
}

export async function fetchAvailability(id: string, dateStr: string, partySize: number) {
  const url = `${API_URL}/restaurants/${id}/availability?date=${encodeURIComponent(dateStr)}&party_size=${partySize}`;
  const res = await fetch(url);
  return handleResponse<AvailabilityResponse>(res, 'Failed to fetch availability');
}

export async function createReservation(payload: ReservationPayload) {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handleResponse<Reservation>(res, 'Failed to create reservation');
}
