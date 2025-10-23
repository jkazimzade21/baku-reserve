export const API_URL = 'http://192.168.0.148:8000';

export async function fetchRestaurants(q?: string) {
  const url = q ? `${API_URL}/restaurants?q=${encodeURIComponent(q)}` : `${API_URL}/restaurants`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch restaurants');
  return res.json();
}

export async function fetchRestaurant(id: string) {
  const res = await fetch(`${API_URL}/restaurants/${id}`);
  if (!res.ok) throw new Error('Restaurant not found');
  return res.json();
}

export async function fetchAvailability(id: string, dateStr: string, partySize: number) {
  const url = `${API_URL}/restaurants/${id}/availability?date=${encodeURIComponent(dateStr)}&party_size=${partySize}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch availability');
  return res.json();
}

export async function createReservation(payload: {
  restaurant_id: string;
  party_size: number;
  start: string;
  end: string;
  guest_name: string;
  guest_phone?: string;
  table_id?: string;
}) {
  const res = await fetch(`${API_URL}/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || 'Failed to create reservation');
  }
  return res.json();
}
