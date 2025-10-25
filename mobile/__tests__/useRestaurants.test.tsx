import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useRestaurants } from '../src/hooks/useRestaurants';
import type { RestaurantSummary } from '../src/api';

jest.mock('../src/api', () => ({
  fetchRestaurants: jest.fn(),
}));

const fetchRestaurants = jest.requireMock('../src/api').fetchRestaurants as jest.Mock;

const sampleRestaurants: RestaurantSummary[] = [
  { id: 'r-1', name: 'Nakhchivan Club', cuisine: ['Fusion'], requires_deposit: false },
  { id: 'r-2', name: 'Sea Breeze', cuisine: ['Seafood'], requires_deposit: true },
];

describe('useRestaurants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchRestaurants.mockResolvedValue(sampleRestaurants);
  });

  it('loads restaurants on mount', async () => {
    const { result } = renderHook(() => useRestaurants());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchRestaurants).toHaveBeenCalledWith(undefined);
    expect(result.current.restaurants).toEqual(sampleRestaurants);
    expect(result.current.error).toBeNull();
  });

  it('handles search queries and trims state', async () => {
    const { result } = renderHook(() => useRestaurants());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const filtered = [sampleRestaurants[0]];
    fetchRestaurants.mockResolvedValueOnce(filtered);

    await act(async () => {
      await result.current.search('Baku Nights');
    });

    expect(fetchRestaurants).toHaveBeenLastCalledWith('Baku Nights');
    expect(result.current.query).toBe('Baku Nights');
    expect(result.current.restaurants).toEqual(filtered);
  });

  it('clears filters and reloads restaurant list', async () => {
    const { result } = renderHook(() => useRestaurants());
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchRestaurants.mockResolvedValueOnce(sampleRestaurants);

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.query).toBe('');
    expect(fetchRestaurants).toHaveBeenLastCalledWith(undefined);
  });

  it('sets error state when fetching fails', async () => {
    fetchRestaurants.mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(() => useRestaurants());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network down');
    expect(result.current.restaurants).toEqual([]);
  });
});
