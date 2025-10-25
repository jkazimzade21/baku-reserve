import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRestaurants, type RestaurantSummary } from '../api';

type LoadOptions = {
  refreshing?: boolean;
};

export function useRestaurants(initialQuery = '') {
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const queryRef = useRef(initialQuery);

  const load = useCallback(
    async (nextQuery?: string, opts?: LoadOptions) => {
      const effectiveQuery =
        typeof nextQuery === 'string' ? nextQuery : queryRef.current;
      if (typeof nextQuery === 'string') {
        queryRef.current = nextQuery;
        setQuery(nextQuery);
      }

      try {
        if (opts?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const results = await fetchRestaurants(
          effectiveQuery.length ? effectiveQuery : undefined,
        );
        setRestaurants(results);
      } catch (err: any) {
        setError(err.message || 'Failed to load restaurants');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(initialQuery);
  }, [initialQuery, load]);

  return {
    restaurants,
    loading,
    refreshing,
    error,
    query,
    setQuery: (value: string) => {
      queryRef.current = value;
      setQuery(value);
    },
    reload: (opts?: LoadOptions) => load(undefined, opts),
    search: (value: string, opts?: LoadOptions) => load(value, opts),
    clear: () => load(''),
  };
}

export type UseRestaurantsReturn = ReturnType<typeof useRestaurants>;

