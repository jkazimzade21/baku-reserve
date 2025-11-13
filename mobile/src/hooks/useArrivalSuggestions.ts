import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ArrivalLocationSuggestion,
  fetchArrivalLocationSuggestions,
} from '../api';

const DEFAULT_DEBOUNCE = 200;

export type UseArrivalSuggestionsOptions = {
  limit?: number;
  debounceMs?: number;
  enabled?: boolean;
  minimumQueryLength?: number;
};

export function useArrivalSuggestions(
  reservationId: string | null,
  query: string,
  options?: UseArrivalSuggestionsOptions,
) {
  const [suggestions, setSuggestions] = useState<ArrivalLocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  const limit = options?.limit ?? 5;
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE;
  const enabled = options?.enabled ?? true;
  const minLength = options?.minimumQueryLength ?? 1;

  const normalizedQuery = useMemo(() => query.trim(), [query]);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);
  const lastResolvedRef = useRef<{ reservationId: string; query: string } | null>(null);
  const hasFetchedRef = useRef(false);

  const cleanupPending = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    cleanupPending();
    setLoading(false);
  }, [cleanupPending]);

  const reset = useCallback(() => {
    cancel();
    setSuggestions([]);
    setError(null);
    setHasFetched(false);
    setIsStale(false);
    setLastQuery(null);
    lastResolvedRef.current = null;
    hasFetchedRef.current = false;
  }, [cancel]);

  useEffect(() => {
    return () => {
      cleanupPending();
    };
  }, [cleanupPending]);

  useEffect(() => {
    cleanupPending();

    const lastResolved = lastResolvedRef.current;
    const hasFetchedOnce = hasFetchedRef.current;

    if (!enabled || !reservationId || normalizedQuery.length < minLength || limit <= 0) {
      const stale = Boolean(
        lastResolved &&
          (!enabled || lastResolved.reservationId !== reservationId || lastResolved.query !== normalizedQuery),
      );
      setIsStale(stale && hasFetchedOnce);
      setLoading(false);
      return;
    }

    const activeReservationId = reservationId;

    requestSeq.current += 1;
    const seq = requestSeq.current;
    setLoading(true);
    setError(null);
    setIsStale(
      Boolean(
        lastResolved &&
          (lastResolved.query !== normalizedQuery || lastResolved.reservationId !== activeReservationId),
      ),
    );

    timeoutRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      fetchArrivalLocationSuggestions(activeReservationId, normalizedQuery, limit, controller.signal)
        .then((results) => {
          if (requestSeq.current !== seq) {
            return;
          }
          setSuggestions(results);
          setError(null);
          setHasFetched(true);
          hasFetchedRef.current = true;
          setIsStale(false);
          setLastQuery(normalizedQuery);
          lastResolvedRef.current = { reservationId: activeReservationId, query: normalizedQuery };
        })
        .catch((err: any) => {
          if (controller.signal.aborted || requestSeq.current !== seq) {
            return;
          }
          setError(err?.message || 'GoMap suggestions unavailable');
          setIsStale(true);
        })
        .finally(() => {
          if (requestSeq.current === seq) {
            setLoading(false);
          }
        });
    }, debounceMs);

    return () => {
      cleanupPending();
    };
  }, [reservationId, normalizedQuery, limit, enabled, debounceMs, minLength, cleanupPending]);

  return { suggestions, loading, error, hasFetched, isStale, lastQuery, reset, cancel };
}
