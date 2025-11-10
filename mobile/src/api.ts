import Constants from 'expo-constants';
import { Platform } from 'react-native';

type ExtraConfig = {
  apiUrl?: string;
  API_URL?: string;
};

export type RestaurantSummary = {
  id: string;
  name: string;
  slug?: string;
  cuisine: string[];
  city?: string;
  neighborhood?: string;
  address?: string;
  cover_photo?: string;
  short_description?: string;
  price_level?: string;
  tags?: string[];
  average_spend?: string;
};

export type TableGeometry = {
  position?: [number, number];
  rotation?: number;
  footprint?: Array<[number, number]>;
  hotspot?: [number, number];
};

export type TableDetail = {
  id: string;
  name: string;
  capacity: number;
  position?: [number, number];
  shape?: 'circle' | 'rect' | 'booth' | 'pod';
  tags?: string[];
  category?: string;
  noise_level?: 'low' | 'medium' | 'high';
  featured?: boolean;
  rotation?: number;
  footprint?: Array<[number, number]>;
  geometry?: TableGeometry;
};

export type AreaDetail = {
  id: string;
  name: string;
  tables: TableDetail[];
  theme?: {
    texture?: 'linen' | 'wood' | 'marble' | 'velvet';
    ambientLight?: string;
    accent?: string;
  };
  landmarks?: Array<{
    id: string;
    label: string;
    type: 'bar' | 'kitchen' | 'washroom' | 'stage' | 'entrance';
    position: [number, number];
    footprint?: Array<[number, number]>;
  }>;
};

export type RestaurantDetail = RestaurantSummary & {
  address?: string;
  phone?: string;
  photos?: string[];
  cover_photo?: string;
  neighborhood?: string;
  highlights?: string[];
  map_images?: string[];
  latitude?: number;
  longitude?: number;
  directions_url?: string;
  menu_url?: string;
  instagram?: string;
  whatsapp?: string;
  average_spend?: string;
  dress_code?: string;
  experiences?: string[];
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
  arrival_intent?: ArrivalIntent;
  prep_eta_minutes?: number | null;
  prep_request_time?: string | null;
  prep_items?: string[] | null;
  prep_scope?: 'starters' | 'full' | null;
  prep_status?: 'pending' | 'accepted' | 'rejected' | null;
  prep_policy?: string | null;
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

export type ArrivalIntent = {
  status: 'idle' | 'requested' | 'queued' | 'approved' | 'rejected' | 'cancelled';
  lead_minutes?: number | null;
  prep_scope?: 'starters' | 'mains' | 'full' | null;
  eta_source?: 'user' | 'prediction' | 'location' | null;
  last_signal?: string | null;
  share_location?: boolean;
  notes?: string | null;
  auto_charge?: boolean;
  predicted_eta_minutes?: number | null;
  confirmed_eta_minutes?: number | null;
  last_location?: { latitude: number; longitude: number } | null;
};

export type ArrivalIntentRequest = {
  lead_minutes: number;
  prep_scope: 'starters' | 'mains' | 'full';
  share_location?: boolean;
  eta_source?: 'user' | 'prediction' | 'location';
  auto_charge?: boolean;
  notes?: string | null;
};

export type ArrivalIntentDecision = {
  action: 'approve' | 'queue' | 'reject' | 'cancel';
  notes?: string | null;
};

export type ArrivalLocationPing = {
  latitude: number;
  longitude: number;
};

export type ArrivalEtaConfirmation = {
  eta_minutes: number;
};

export type FeatureFlags = {
  prep_notify_enabled: boolean;
  payments_mode: 'mock' | 'live' | string;
  payment_provider: 'mock' | 'paymentwall' | 'azericard' | string;
  currency: string;
  maps_api_key_present?: boolean;
  gomap_ready?: boolean;
};

export type PreorderRequestPayload = {
  minutes_away: number;
  scope: 'starters' | 'full';
  items?: string[];
};

export type PreorderQuoteResponse = {
  policy: string;
  recommended_prep_minutes: number;
};

export type AccountProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  verified_email: boolean;
  verified_phone: boolean;
  created_at: string;
  updated_at: string;
};


const extra: ExtraConfig =
  (Constants?.expoConfig?.extra as ExtraConfig | undefined) ??
  ((Constants as any).manifest?.extra as ExtraConfig | undefined) ??
  {};

const DEFAULT_BASE = Platform.select({
  ios: 'http://localhost:8000',
  android: 'http://10.0.2.2:8000',
  default: 'http://192.168.0.148:8000',
});

const ENV_BASE = process.env.EXPO_PUBLIC_API_BASE?.trim();

const rawHostCandidates: Array<string | undefined> = [
  Constants.expoConfig?.hostUri,
  Constants.expoConfig?.extra?.expoGo?.hostUri,
  Constants.expoConfig?.extra?.expoGo?.debuggerHost,
  (Constants as any).manifest2?.extra?.expoGo?.hostUri,
  (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
  (Constants as any).manifest?.hostUri,
  (Constants as any).manifest?.debuggerHost,
  Constants.linkingUri,
];

const BUNDLER_PORTS = new Set(['19000', '19001', '8081', '8082']);

let derivedHost: string | undefined;
for (const candidate of rawHostCandidates) {
  if (!candidate) continue;
  let cleaned = candidate.trim();
  if (!cleaned) continue;
  if (cleaned.includes('://')) {
    const [, remainder] = cleaned.split('://');
    cleaned = remainder || cleaned;
  }
  cleaned = cleaned.split('?')[0] ?? cleaned;
  cleaned = cleaned.split('#')[0] ?? cleaned;
  cleaned = cleaned.replace(/^\/+/, '');
  const slashIndex = cleaned.indexOf('/');
  if (slashIndex !== -1) {
    cleaned = cleaned.slice(0, slashIndex);
  }
  const [hostPartRaw, portRaw] = cleaned.split(':');
  const hostPart = hostPartRaw?.trim();
  if (!hostPart || hostPart === '127.0.0.1' || hostPart === 'localhost') {
    continue;
  }
  const detectedPort = portRaw && /^\d+$/.test(portRaw) ? portRaw : undefined;
  const preferredPort =
    detectedPort && !BUNDLER_PORTS.has(detectedPort) ? detectedPort : '8000';
  derivedHost = `http://${hostPart}:${preferredPort}`;
  break;
}

export const API_URL =
  ENV_BASE ||
  extra.apiUrl ||
  extra.API_URL ||
  derivedHost ||
  DEFAULT_BASE ||
  'http://localhost:8000';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function withAuth(headers?: Record<string, string>) {
  if (!authToken) {
    return headers ?? {};
  }
  return {
    Authorization: `Bearer ${authToken}`,
    ...(headers ?? {}),
  };
}

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
  const res = await fetch(url, { headers: withAuth() });
  return handleResponse<RestaurantSummary[]>(res, 'Failed to fetch restaurants');
}

export async function fetchRestaurant(id: string) {
  const res = await fetch(`${API_URL}/restaurants/${id}`, { headers: withAuth() });
  return handleResponse<RestaurantDetail>(res, 'Restaurant not found');
}

export async function fetchAvailability(id: string, dateStr: string, partySize: number) {
  const url = `${API_URL}/restaurants/${id}/availability?date=${encodeURIComponent(dateStr)}&party_size=${partySize}`;
  const res = await fetch(url, { headers: withAuth() });
  return handleResponse<AvailabilityResponse>(res, 'Failed to fetch availability');
}

export async function createReservation(payload: ReservationPayload) {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return handleResponse<Reservation>(res, 'Failed to create reservation');
}

export async function fetchReservationsList() {
  const res = await fetch(`${API_URL}/reservations`, { headers: withAuth() });
  return handleResponse<Reservation[]>(res, 'Failed to fetch reservations');
}

export async function requestArrivalIntent(reservationId: string, payload: ArrivalIntentRequest) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/arrival_intent`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Failed to notify the restaurant');
}

export async function decideArrivalIntent(reservationId: string, payload: ArrivalIntentDecision) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/arrival_intent/decision`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Failed to update prep request');
}

export async function sendArrivalLocation(reservationId: string, payload: ArrivalLocationPing) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/arrival_intent/location`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Failed to share location');
}

export async function confirmArrivalEta(reservationId: string, payload: ArrivalEtaConfirmation) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/arrival_intent/eta`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Failed to confirm ETA');
}

export async function fetchFeatureFlags() {
  const res = await fetch(`${API_URL}/config/features`, { headers: withAuth() });
  return handleResponse<FeatureFlags>(res, 'Failed to load feature configuration');
}

export async function getPreorderQuote(reservationId: string, payload: PreorderRequestPayload) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/preorder/quote`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<PreorderQuoteResponse>(res, 'Feature currently unavailable.');
}

export async function confirmPreorder(reservationId: string, payload: PreorderRequestPayload) {
  const res = await fetch(`${API_URL}/reservations/${reservationId}/preorder/confirm`, {
    method: 'POST',
    headers: withAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<Reservation>(res, 'Unable to notify the kitchen. Please try again.');
}
