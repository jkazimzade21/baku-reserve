type ApiModule = typeof import('../src/api');
import type { AvailabilityResponse, Reservation, ReservationPayload, RestaurantDetail, RestaurantSummary } from '../src/api';

function createResponse<T>(overrides: Partial<Response> & { body?: T; ok?: boolean } = {}) {
  const ok = overrides.ok ?? true;
  const body = overrides.body;

  return {
    ok,
    status: overrides.status ?? (ok ? 200 : 500),
    json: jest.fn(async () => body),
    text: jest.fn(async () => JSON.stringify(body ?? {})),
  } as unknown as Response;
}

describe('api layer', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_BASE = 'http://api.test';
    global.fetch = jest.fn();
    jest.doMock('expo-constants', () => ({
      expoConfig: { extra: {} },
      manifest: null,
    }));
  });

  function loadApi(): ApiModule {
    let api: ApiModule | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      api = require('../src/api');
    });
    if (!api) {
      throw new Error('Failed to load API module');
    }
    return api;
  }

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_BASE;
    jest.resetModules();
  });

  it('fetches restaurants with and without a query', async () => {
    const { fetchRestaurants } = loadApi();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      createResponse<RestaurantSummary[]>({ body: [] }),
    );
    await fetchRestaurants();
    expect(global.fetch).toHaveBeenCalledWith('http://api.test/restaurants');

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      createResponse<RestaurantSummary[]>({ body: [] }),
    );
    await fetchRestaurants('Dolma & Co');
    expect(global.fetch).toHaveBeenCalledWith('http://api.test/restaurants?q=Dolma%20%26%20Co');
  });

  it('fetches a single restaurant', async () => {
    const { fetchRestaurant } = loadApi();
    const detail: RestaurantDetail = {
      id: 'r-1',
      name: 'Test',
      cuisine: [],
      areas: [],
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<RestaurantDetail>({ body: detail }));

    const data = await fetchRestaurant('r-1');
    expect(global.fetch).toHaveBeenCalledWith('http://api.test/restaurants/r-1');
    expect(data).toEqual(detail);
  });

  it('fetches availability with encoded params', async () => {
    const { fetchAvailability } = loadApi();
    const slotResponse: AvailabilityResponse = {
      slots: [],
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<AvailabilityResponse>({ body: slotResponse }));

    await fetchAvailability('r-2', '2024-08-01', 4);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.test/restaurants/r-2/availability?date=2024-08-01&party_size=4',
    );
  });

  it('creates a reservation with JSON payload', async () => {
    const { createReservation } = loadApi();
    const payload: ReservationPayload = {
      restaurant_id: 'r-3',
      party_size: 2,
      start: '2024-08-01T18:00:00Z',
      end: '2024-08-01T20:00:00Z',
      guest_name: 'Guest',
    };
    const reservation: Reservation = {
      id: 'res-1',
      restaurant_id: 'r-3',
      party_size: 2,
      start: payload.start,
      end: payload.end,
      status: 'booked',
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<Reservation>({ body: reservation }));

    const data = await createReservation(payload);
    expect(global.fetch).toHaveBeenCalledWith('http://api.test/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(data).toEqual(reservation);
  });

  it('fetches reservations list', async () => {
    const { fetchReservationsList } = loadApi();
    const reservations: Reservation[] = [
      {
        id: 'res-2',
        restaurant_id: 'r-1',
        party_size: 4,
        start: '2024-08-01T18:00:00Z',
        end: '2024-08-01T20:00:00Z',
        status: 'booked',
      },
    ];
    (global.fetch as jest.Mock).mockResolvedValueOnce(createResponse<Reservation[]>({ body: reservations }));

    const data = await fetchReservationsList();
    expect(global.fetch).toHaveBeenCalledWith('http://api.test/reservations');
    expect(data).toEqual(reservations);
  });

  it('throws an error with detail message on failure', async () => {
    const { fetchRestaurants } = loadApi();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      createResponse({
        ok: false,
        status: 404,
        body: { detail: 'Missing' },
      }),
    );

    await expect(fetchRestaurants()).rejects.toThrow('Missing');
  });
});
