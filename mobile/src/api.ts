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
  short_description?: string;
  price_level?: string;
  tags?: string[];
  average_spend?: string;
  requires_deposit?: boolean;
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
  deposit_policy?: string;
  map_images?: string[];
  latitude?: number;
  longitude?: number;
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
