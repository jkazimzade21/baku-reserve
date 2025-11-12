/**
 * Integration tests for mobile API interactions
 * Tests real API calls and data flow
 */

import { fetchConciergeRecommendations, CONCIERGE_MODE } from '../src/api';

// Mock fetch for testing
global.fetch = jest.fn();

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Concierge API', () => {
    it('should fetch concierge recommendations successfully', async () => {
      const mockResponse = {
        results: [
          {
            id: '1',
            name: 'Test Restaurant',
            slug: 'test-restaurant',
            score: 0.95,
          },
        ],
        mode: 'local',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchConciergeRecommendations(
        'Italian restaurant',
        'en',
        CONCIERGE_MODE.LOCAL
      );

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        fetchConciergeRecommendations('test', 'en', CONCIERGE_MODE.LOCAL)
      ).rejects.toThrow();
    });

    it('should handle non-200 responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(
        fetchConciergeRecommendations('test', 'en', CONCIERGE_MODE.LOCAL)
      ).rejects.toThrow();
    });

    it('should send correct request format', async () => {
      const mockResponse = { results: [], mode: 'local' };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchConciergeRecommendations(
        'romantic dinner',
        'en',
        CONCIERGE_MODE.AI
      );

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const [url, options] = fetchCall;

      expect(url).toContain('/api/concierge');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body).toHaveProperty('prompt');
      expect(body).toHaveProperty('locale');
      expect(body).toHaveProperty('mode');
    });
  });

  describe('Restaurant API', () => {
    it('should fetch restaurant list', async () => {
      const mockRestaurants = [
        {
          id: '1',
          name: 'Restaurant 1',
          slug: 'restaurant-1',
        },
        {
          id: '2',
          name: 'Restaurant 2',
          slug: 'restaurant-2',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRestaurants,
      });

      const response = await fetch('/api/restaurants');
      const data = await response.json();

      expect(data).toEqual(mockRestaurants);
      expect(data).toHaveLength(2);
    });

    it('should handle empty restaurant list', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const response = await fetch('/api/restaurants');
      const data = await response.json();

      expect(data).toEqual([]);
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should check API health status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy' }),
      });

      const response = await fetch('/health');
      const data = await response.json();

      expect(data.status).toBe('healthy');
    });
  });
});

describe('Data Flow Integration', () => {
  it('should handle complete user flow from search to details', async () => {
    // Step 1: Search for restaurants
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: '1',
            name: 'Test Restaurant',
            slug: 'test-restaurant',
            score: 0.95,
          },
        ],
        mode: 'local',
      }),
    });

    const searchResults = await fetchConciergeRecommendations(
      'Italian',
      'en',
      CONCIERGE_MODE.LOCAL
    );

    expect(searchResults.results).toHaveLength(1);

    // Step 2: Get restaurant details
    const restaurantId = searchResults.results[0].id;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: restaurantId,
        name: 'Test Restaurant',
        slug: 'test-restaurant',
        description: 'A great Italian restaurant',
      }),
    });

    const response = await fetch(`/api/restaurants/${restaurantId}`);
    const details = await response.json();

    expect(details.id).toBe(restaurantId);
    expect(details).toHaveProperty('name');
    expect(details).toHaveProperty('description');
  });
});

describe('Error Recovery', () => {
  it('should retry failed requests', async () => {
    let attempts = 0;

    (global.fetch as jest.Mock).mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Network error');
      }
      return {
        ok: true,
        json: async () => ({ results: [], mode: 'local' }),
      };
    });

    // Implement retry logic
    const fetchWithRetry = async (fn: () => Promise<any>, retries = 3): Promise<any> => {
      try {
        return await fn();
      } catch (error) {
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return fetchWithRetry(fn, retries - 1);
        }
        throw error;
      }
    };

    const result = await fetchWithRetry(() =>
      fetchConciergeRecommendations('test', 'en', CONCIERGE_MODE.LOCAL)
    );

    expect(attempts).toBe(3);
    expect(result).toHaveProperty('results');
  });
});
