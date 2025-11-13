/**
 * Enhanced location hook with all new GoMap features
 * Includes smart search, route types, nearby discovery, and traffic predictions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

interface LocationSuggestion {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
  distance_text?: string;
  provider: string;
}

interface RouteOptions {
  type: 'fastest' | 'shortest' | 'pedestrian';
  includePolyline: boolean;
  includeTraffic: boolean;
}

interface NearbyPOI {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  distance_text: string;
  category?: string;
}

interface POIDetails {
  guid: string;
  name: string;
  description?: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  opening_hours?: string;
  rating?: number;
  images?: Array<{
    url: string;
    thumbnail?: string;
    caption?: string;
  }>;
}

interface TrafficPrediction {
  expected_severity: number;
  confidence: number;
  speed_factor: number;
  message: string;
  eta_multiplier: number;
}

export function useEnhancedLocation() {
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for autocomplete
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string>(`session-${Date.now()}`);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status === 'granted');

      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation(location);
      }
    })();

    // Initialize WebSocket for autocomplete
    initWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const initWebSocket = () => {
    const wsUrl = API_BASE.replace('http', 'ws') + '/api/v1/search/autocomplete/ws';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('Autocomplete WebSocket connected');
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current.onclose = () => {
      // Reconnect after 2 seconds
      setTimeout(initWebSocket, 2000);
    };
  };

  /**
   * Smart search with fuzzy matching and distance calculations
   */
  const smartSearch = useCallback(async (
    query: string,
    options?: {
      fuzzy?: boolean;
      limit?: number;
      useCurrentLocation?: boolean;
    }
  ): Promise<LocationSuggestion[]> => {
    try {
      const params = new URLSearchParams({
        q: query,
        fuzzy: String(options?.fuzzy ?? true),
        limit: String(options?.limit ?? 10),
      });

      if (options?.useCurrentLocation && currentLocation) {
        params.append('lat', String(currentLocation.coords.latitude));
        params.append('lon', String(currentLocation.coords.longitude));
      }

      const response = await fetch(`${API_BASE}/api/v1/search/smart?${params}`);
      if (!response.ok) throw new Error('Search failed');

      return await response.json();
    } catch (err) {
      console.error('Smart search error:', err);
      return [];
    }
  }, [currentLocation]);

  /**
   * Real-time autocomplete via WebSocket
   */
  const autocompleteSearch = useCallback((
    query: string,
    onResults: (results: LocationSuggestion[]) => void
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Fallback to REST API
      smartSearch(query).then(onResults);
      return;
    }

    wsRef.current.send(JSON.stringify({
      query,
      lat: currentLocation?.coords.latitude,
      lon: currentLocation?.coords.longitude,
      session_id: sessionIdRef.current,
      limit: 5,
      fuzzy: true,
    }));

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.query === query && !data.cancelled) {
        onResults(data.results || []);
      }
    };
  }, [currentLocation, smartSearch]);

  /**
   * Discover nearby POIs
   */
  const discoverNearby = useCallback(async (
    options?: {
      radius_km?: number;
      category?: string;
      limit?: number;
    }
  ): Promise<NearbyPOI[]> => {
    if (!currentLocation) {
      throw new Error('Location permission required');
    }

    try {
      const params = new URLSearchParams({
        lat: String(currentLocation.coords.latitude),
        lon: String(currentLocation.coords.longitude),
        radius_km: String(options?.radius_km ?? 2),
        limit: String(options?.limit ?? 20),
      });

      if (options?.category) {
        params.append('category', options.category);
      }

      const response = await fetch(`${API_BASE}/api/v1/search/nearby?${params}`);
      if (!response.ok) throw new Error('Nearby search failed');

      return await response.json();
    } catch (err) {
      console.error('Nearby discovery error:', err);
      return [];
    }
  }, [currentLocation]);

  /**
   * Calculate route with type selection and polyline
   */
  const calculateRoute = useCallback(async (
    destination: { lat: number; lon: number },
    options?: RouteOptions
  ): Promise<any> => {
    if (!currentLocation) {
      throw new Error('Location permission required');
    }

    try {
      const params = new URLSearchParams({
        origin_lat: String(currentLocation.coords.latitude),
        origin_lon: String(currentLocation.coords.longitude),
        dest_lat: String(destination.lat),
        dest_lon: String(destination.lon),
        route_type: options?.type ?? 'fastest',
        include_polyline: String(options?.includePolyline ?? true),
      });

      const response = await fetch(`${API_BASE}/api/v1/route/calculate?${params}`);
      if (!response.ok) throw new Error('Route calculation failed');

      const route = await response.json();

      // Get traffic-aware ETA if requested
      if (options?.includeTraffic) {
        const trafficResponse = await fetch(
          `${API_BASE}/api/v1/route/eta-with-traffic?${params}`
        );
        if (trafficResponse.ok) {
          const trafficData = await trafficResponse.json();
          route.traffic = trafficData;
        }
      }

      return route;
    } catch (err) {
      console.error('Route calculation error:', err);
      throw err;
    }
  }, [currentLocation]);

  /**
   * Get detailed POI information with photos
   */
  const getPOIDetails = useCallback(async (
    poiGuid: string,
    includeImages: boolean = true
  ): Promise<POIDetails | null> => {
    try {
      const params = new URLSearchParams({
        include_images: String(includeImages),
      });

      const response = await fetch(
        `${API_BASE}/api/v1/poi/${poiGuid}/details?${params}`
      );
      if (!response.ok) throw new Error('POI details fetch failed');

      return await response.json();
    } catch (err) {
      console.error('POI details error:', err);
      return null;
    }
  }, []);

  /**
   * Predict traffic for a specific time
   */
  const predictTraffic = useCallback(async (
    destination: { lat: number; lon: number },
    departureTime?: Date
  ): Promise<TrafficPrediction | null> => {
    if (!currentLocation) {
      throw new Error('Location permission required');
    }

    try {
      const response = await fetch(`${API_BASE}/api/v1/traffic/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: {
            lat: currentLocation.coords.latitude,
            lon: currentLocation.coords.longitude,
          },
          destination,
          departure_time: departureTime?.toISOString() ?? new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error('Traffic prediction failed');
      return await response.json();
    } catch (err) {
      console.error('Traffic prediction error:', err);
      return null;
    }
  }, [currentLocation]);

  /**
   * Optimize multi-stop route
   */
  const optimizeMultiStopRoute = useCallback(async (
    destinations: Array<{
      id: string;
      name: string;
      lat: number;
      lon: number;
      visitDuration?: number;
    }>,
    options?: {
      returnToStart?: boolean;
      algorithm?: 'auto' | 'nearest' | '2opt' | 'genetic';
    }
  ): Promise<any> => {
    if (!currentLocation) {
      throw new Error('Location permission required');
    }

    try {
      const response = await fetch(`${API_BASE}/api/v1/route/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: {
            lat: currentLocation.coords.latitude,
            lon: currentLocation.coords.longitude,
          },
          destinations,
          return_to_start: options?.returnToStart ?? false,
          algorithm: options?.algorithm ?? 'auto',
        }),
      });

      if (!response.ok) throw new Error('Route optimization failed');
      return await response.json();
    } catch (err) {
      console.error('Route optimization error:', err);
      throw err;
    }
  }, [currentLocation]);

  /**
   * Get autocomplete statistics (for debugging)
   */
  const getAutocompleteStats = useCallback(async (): Promise<any> => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/search/autocomplete/stats`);
      if (!response.ok) throw new Error('Stats fetch failed');
      return await response.json();
    } catch (err) {
      console.error('Stats error:', err);
      return null;
    }
  }, []);

  /**
   * Save location to history
   */
  const saveLocationHistory = useCallback(async (location: LocationSuggestion) => {
    try {
      const history = await AsyncStorage.getItem('location_history');
      const locations = history ? JSON.parse(history) : [];

      // Add to history (avoid duplicates)
      const filtered = locations.filter((l: any) => l.id !== location.id);
      filtered.unshift(location);

      // Keep only last 20 locations
      const trimmed = filtered.slice(0, 20);

      await AsyncStorage.setItem('location_history', JSON.stringify(trimmed));
    } catch (err) {
      console.error('Error saving location history:', err);
    }
  }, []);

  /**
   * Get location history
   */
  const getLocationHistory = useCallback(async (): Promise<LocationSuggestion[]> => {
    try {
      const history = await AsyncStorage.getItem('location_history');
      return history ? JSON.parse(history) : [];
    } catch (err) {
      console.error('Error getting location history:', err);
      return [];
    }
  }, []);

  return {
    // Location state
    currentLocation,
    locationPermission,
    isLoading,
    error,

    // Search functions
    smartSearch,
    autocompleteSearch,
    discoverNearby,

    // Route functions
    calculateRoute,
    optimizeMultiStopRoute,

    // POI functions
    getPOIDetails,

    // Traffic functions
    predictTraffic,

    // History functions
    saveLocationHistory,
    getLocationHistory,

    // Debug functions
    getAutocompleteStats,
  };
}
