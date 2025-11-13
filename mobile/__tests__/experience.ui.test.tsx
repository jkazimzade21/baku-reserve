import React from 'react';
import { Alert } from 'react-native';
import { act, renderHook, waitFor, render, fireEvent } from '@testing-library/react-native';

import RestaurantCard from '../src/components/RestaurantCard';
import PhotoCarousel from '../src/components/PhotoCarousel';
import LiveSyncBadge from '../src/screens/SeatPicker/components/LiveSyncBadge';
import { useRestaurants } from '../src/hooks/useRestaurants';
import { useArrivalSuggestions } from '../src/hooks/useArrivalSuggestions';
import { useVenueLayout } from '../src/screens/SeatPicker/useVenueLayout';
import PrepNotifyScreen from '../src/screens/PrepNotifyScreen';
import type {
  FeatureFlags,
  RestaurantSummary,
  RestaurantDetail,
  Reservation,
  ArrivalLocationSuggestion,
} from '../src/api';

jest.mock('../src/api', () => ({
  fetchRestaurants: jest.fn(),
  getPreorderQuote: jest.fn(),
  confirmPreorder: jest.fn(),
  sendArrivalLocation: jest.fn(),
  fetchArrivalLocationSuggestions: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 40.4, longitude: 49.9 } })),
  Accuracy: { High: 1 },
}));

const apiMock = jest.requireMock('../src/api') as {
  fetchRestaurants: jest.Mock;
  getPreorderQuote: jest.Mock;
  confirmPreorder: jest.Mock;
  sendArrivalLocation: jest.Mock;
  fetchArrivalLocationSuggestions: jest.Mock;
};
const fetchRestaurants = apiMock.fetchRestaurants;
const getPreorderQuote = apiMock.getPreorderQuote;
const confirmPreorder = apiMock.confirmPreorder;
const sendArrivalLocation = apiMock.sendArrivalLocation;
const fetchArrivalLocationSuggestions = apiMock.fetchArrivalLocationSuggestions;
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const sampleRestaurants: RestaurantSummary[] = [
  { id: 'r-1', name: 'Nakhchivan Club', cuisine: ['Fusion'] },
  { id: 'r-2', name: 'Sea Breeze', cuisine: ['Seafood'] },
];

describe('Hooks and UI experiences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchRestaurants.mockResolvedValue(sampleRestaurants);
    alertSpy.mockClear();
  });

  describe('useRestaurants', () => {
    it('loads restaurants on mount and exposes query helpers', async () => {
      const { result } = renderHook(() => useRestaurants());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(fetchRestaurants).toHaveBeenCalledWith(undefined);
      expect(result.current.restaurants).toEqual(sampleRestaurants);
      expect(result.current.error).toBeNull();

      const filtered = [sampleRestaurants[0]];
      fetchRestaurants.mockResolvedValueOnce(filtered);
      await act(async () => {
        await result.current.search('Baku Nights');
      });
      expect(fetchRestaurants).toHaveBeenLastCalledWith('Baku Nights');
      expect(result.current.query).toBe('Baku Nights');
      expect(result.current.restaurants).toEqual(filtered);
    });

    it('clears filters, handles refresh, and surfaces errors', async () => {
      const { result } = renderHook(() => useRestaurants());
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchRestaurants.mockRejectedValueOnce(new Error('Network down'));
      await act(async () => {
        await result.current.reload();
      });
      await waitFor(() => expect(result.current.error).toBe('Network down'));
      expect(result.current.restaurants).toEqual(sampleRestaurants);

      fetchRestaurants.mockResolvedValueOnce(sampleRestaurants);
      await act(async () => {
        await result.current.reload({ refreshing: true });
      });
      expect(result.current.refreshing).toBe(false);

      await act(async () => {
        await result.current.clear();
      });
      expect(result.current.query).toBe('');
      expect(fetchRestaurants).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe('useArrivalSuggestions', () => {
    const makeSuggestion = (id: string): ArrivalLocationSuggestion => ({
      id,
      name: id,
      latitude: 40.4,
      longitude: 49.9,
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const advanceDebounce = async (ms = 30) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
      await act(async () => {});
    };

    it('applies only the latest query results', async () => {
      let resolveFirst: ((value: ArrivalLocationSuggestion[]) => void) | null = null;
      fetchArrivalLocationSuggestions
        .mockImplementationOnce(() => new Promise((resolve) => {
          resolveFirst = resolve;
        }))
        .mockImplementationOnce(async () => [makeSuggestion('second')]);

      const { result, rerender } = renderHook(
        ({ query, enabled }: { query: string; enabled: boolean }) =>
          useArrivalSuggestions('res-1', query, { enabled, debounceMs: 25 }),
        { initialProps: { query: '', enabled: true } },
      );

      await act(async () => {
        rerender({ query: 'ko', enabled: true });
      });
      await advanceDebounce();

      await act(async () => {
        rerender({ query: 'koala', enabled: true });
      });
      await advanceDebounce();

      expect(result.current.suggestions[0]?.id).toBe('second');
      expect(fetchArrivalLocationSuggestions).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveFirst?.([makeSuggestion('first')]);
      });
      await act(async () => {});
      expect(result.current.suggestions[0]?.id).toBe('second');
    });

    it('keeps prior suggestions when disabled for preset fallback', async () => {
      fetchArrivalLocationSuggestions.mockResolvedValue([makeSuggestion('alpha')]);

      const { result, rerender } = renderHook(
        ({ query, enabled }: { query: string; enabled: boolean }) =>
          useArrivalSuggestions('res-2', query, { enabled, debounceMs: 20 }),
        { initialProps: { query: '', enabled: true } },
      );

      await act(async () => {
        rerender({ query: 'alpha', enabled: true });
      });
      await advanceDebounce();
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.isStale).toBe(false);

      rerender({ query: 'alpha', enabled: false });
      await act(async () => {});
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.isStale).toBe(true);
      expect(fetchArrivalLocationSuggestions).toHaveBeenCalledTimes(1);
    });

    it('surfaces API errors without clearing existing data mid-flight', async () => {
      fetchArrivalLocationSuggestions.mockRejectedValue(new Error('GoMap down'));

      const { result, rerender } = renderHook(
        ({ query, enabled }: { query: string; enabled: boolean }) =>
          useArrivalSuggestions('res-3', query, { enabled, debounceMs: 20 }),
        { initialProps: { query: '', enabled: true } },
      );

      await act(async () => {
        rerender({ query: 'fail', enabled: true });
      });
      await advanceDebounce();
      expect(result.current.error).toBe('GoMap down');
      expect(result.current.isStale).toBe(true);
      expect(result.current.suggestions).toHaveLength(0);
    });

    it('marks cached suggestions as stale when query clears for preset mode', async () => {
      fetchArrivalLocationSuggestions.mockResolvedValue([makeSuggestion('preset')]);

      const { result, rerender } = renderHook(
        ({ query, enabled }: { query: string; enabled: boolean }) =>
          useArrivalSuggestions('res-4', query, { enabled, debounceMs: 20 }),
        { initialProps: { query: '', enabled: true } },
      );

      await act(async () => {
        rerender({ query: 'preset', enabled: true });
      });
      await advanceDebounce();
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.isStale).toBe(false);

      rerender({ query: '', enabled: true });
      await act(async () => {});
      expect(result.current.isStale).toBe(true);
      expect(result.current.suggestions).toHaveLength(1);

      await act(async () => {
        result.current.reset();
      });
      await act(async () => {});
      expect(result.current.suggestions).toHaveLength(0);
      expect(result.current.hasFetched).toBe(false);
    });
  });

  describe('useVenueLayout', () => {
    const restaurant: RestaurantDetail = {
      id: 'venue-1',
      name: 'Seat Picker Venue',
      cuisine: ['Modern'],
      areas: [
        {
          id: 'area-1',
          name: 'Main Dining',
          tables: [
            { id: 't-1', name: 'A1', capacity: 4, position: [20, 20] },
            { id: 't-2', name: 'A2', capacity: 2, position: [40, 20] },
          ],
        },
        {
          id: 'area-2',
          name: 'Terrace',
          tables: [{ id: 't-3', name: 'T1', capacity: 4, position: [60, 60] }],
        },
      ],
    };

    it('hydrates areas, computes statuses, and updates selections', async () => {
      const availability = new Set<string>(['t-1']);
      const occupied = new Set<string>(['t-2']);

      const { result } = renderHook(() => {
        const [activeAreaId, setActiveAreaId] = React.useState<string | null>(null);
        const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);
        return useVenueLayout({
          restaurant,
          activeAreaId,
          setActiveAreaId,
          selectedTableId,
          onSelectTable: setSelectedTableId,
          availability,
          occupied,
        });
      });

      await waitFor(() => expect(result.current.activeArea?.id).toBe('area-1'));
      expect(result.current.areas.map((area) => area.id)).toEqual(['area-1', 'area-2']);
      expect(result.current.getStatus('t-1')).toBe('available');
      expect(result.current.getStatus('t-2')).toBe('reserved');
      expect(result.current.getStatus('unknown')).toBe('held');

      await act(async () => {
        result.current.selectTable('t-2');
      });
      expect(result.current.selectedTable?.id).toBe('t-2');

      await act(async () => {
        result.current.setActiveArea('area-2');
      });
      expect(result.current.activeArea?.id).toBe('area-2');
    });
  });

  describe('UI primitives', () => {
    const baseRestaurant: RestaurantSummary = {
      id: 'rest-1',
      name: 'Skyline Lounge',
      cuisine: ['International', 'Seafood', 'Mediterranean'],
      city: 'Baku',
      short_description: 'Sunset cocktails overlooking the boulevard.',
      price_level: 'AZN 3/4',
      tags: ['waterfront', 'sunset'],
      cover_photo: 'https://example.com/photo.jpg',
    };

    it('renders RestaurantCard metadata, badges, and interactions', () => {
      const onPress = jest.fn();
      const { getByText } = render(<RestaurantCard item={baseRestaurant} onPress={onPress} />);

      expect(getByText('Skyline Lounge')).toBeTruthy();
      expect(getByText('International')).toBeTruthy();
      expect(getByText('+2')).toBeTruthy();
      expect(getByText('Waterfront')).toBeTruthy();

      fireEvent.press(getByText('Skyline Lounge'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('falls back to initials when cover photo missing', () => {
      const item: RestaurantSummary = {
        ...baseRestaurant,
        id: 'rest-2',
        name: 'Garden Club',
        cover_photo: undefined,
        tags: [],
      };
      const { getByText, queryByText } = render(<RestaurantCard item={item} onPress={jest.fn()} />);
      expect(getByText('G')).toBeTruthy();
    });

    it('renders PhotoCarousel pagination for provided photos', () => {
      const { getByText } = render(
        <PhotoCarousel photos={['https://example.com/a.jpg', 'https://example.com/b.jpg']} height={200} />,
      );
      expect(getByText('1 / 2')).toBeTruthy();
    });

    it('shows LiveSyncBadge states for errors and syncing', () => {
      const onSync = jest.fn();
      const now = new Date('2024-08-01T18:00:30Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const updatedAt = new Date('2024-08-01T18:00:00Z');
      const { getByText, rerender } = render(
        <LiveSyncBadge updatedAt={updatedAt} syncing={false} error={null} onSync={onSync} />,
      );
      expect(getByText('Updated 30s ago')).toBeTruthy();
      fireEvent.press(getByText('Sync now'));
      expect(onSync).toHaveBeenCalledTimes(1);

      rerender(<LiveSyncBadge updatedAt={null} syncing error="Sync failed" onSync={onSync} />);
      expect(getByText('Sync failed')).toBeTruthy();
      expect(getByText('Awaiting sync')).toBeTruthy();
      expect(getByText('Syncing…')).toBeTruthy();

      jest.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('Prep notify screen', () => {
    it('loads a quote and submits the mock payment flow', async () => {
      const reservation: Reservation = {
        id: 'res-1',
        restaurant_id: 'rest-1',
        party_size: 2,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600_000).toISOString(),
        status: 'booked',
        arrival_intent: undefined,
      };
      const features: FeatureFlags = {
        prep_notify_enabled: true,
        payments_mode: 'mock',
        payment_provider: 'mock',
        currency: 'AZN',
        maps_api_key_present: false,
      };
      getPreorderQuote.mockResolvedValue({
        policy: 'Kitchen starts once you are en route.',
        recommended_prep_minutes: 12,
      });
      confirmPreorder.mockResolvedValue({ ...reservation, prep_status: 'accepted' });

      const navigation = { goBack: jest.fn() } as any;
      const route = { params: { reservation, restaurantName: 'Test Kitchen', features } } as any;

      const { findByText, getByText } = render(
        <PrepNotifyScreen navigation={navigation} route={route} />,
      );

      await findByText('Kitchen starts once you are en route.');
      fireEvent.press(getByText('Confirm & notify kitchen'));

      await waitFor(() => expect(confirmPreorder).toHaveBeenCalled());
      expect(alertSpy).toHaveBeenCalled();
      const alertArgs = alertSpy.mock.calls[0];
      const buttons = alertArgs?.[2];
      if (buttons && Array.isArray(buttons) && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
      expect(navigation.goBack).toHaveBeenCalled();
    });

    it('shares live location when GoMap is ready', async () => {
      const reservation: Reservation = {
        id: 'res-2',
        restaurant_id: 'rest-9',
        party_size: 2,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600_000).toISOString(),
        status: 'booked',
        arrival_intent: undefined,
      };
      const features: FeatureFlags = {
        prep_notify_enabled: true,
        payments_mode: 'mock',
        payment_provider: 'mock',
        currency: 'AZN',
        gomap_ready: true,
      };
      getPreorderQuote.mockResolvedValue({
        policy: 'Kitchen starts once you are en route.',
        recommended_prep_minutes: 10,
      });
      sendArrivalLocation.mockResolvedValue(reservation);

      const route = { params: { reservation, restaurantName: 'Test Kitchen', features } } as any;
      const navigation = { goBack: jest.fn() } as any;

      const { findByText, getByText } = render(
        <PrepNotifyScreen navigation={navigation} route={route} />,
      );

      await findByText('Kitchen starts once you are en route.');
      fireEvent.press(getByText('Use my location to estimate'));

      await waitFor(() =>
        expect(sendArrivalLocation).toHaveBeenCalledWith('res-2', {
          latitude: 40.4,
          longitude: 49.9,
        }),
      );
      await findByText('Location shared. The kitchen will auto-refresh your ETA.');
    });
  });
});
