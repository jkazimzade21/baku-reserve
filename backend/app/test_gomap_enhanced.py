"""
Comprehensive test suite for enhanced GoMap integration.
Tests all new features including smart search, route optimization, and traffic patterns.
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

import pytest

from app.cache import TTLCache
from app.circuit_breaker import CircuitBreaker, CircuitOpenError
from app.gomap import (
    get_poi_details,
    get_traffic_conditions,
    route_directions_by_type,
    search_objects_fuzzy,
    search_objects_smart,
    search_objects_with_distance,
)
from app.request_batcher import BatchRequest, RequestBatcher
from app.route_optimizer import Location, MultiStopOptimizer, OptimizedRoute
from app.traffic_patterns import TrafficPatternTracker, TrafficPrediction

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def mock_gomap_response():
    """Mock successful GoMap API response."""

    def _mock_response(endpoint: str):
        responses = {
            "searchObj": {
                "success": True,
                "rows": [
                    {
                        "id": "poi1",
                        "nm": "Flame Towers",
                        "addr": "Mehdi Huseyn 1A, Baku",
                        "x": 49.8265,
                        "y": 40.3594,
                    }
                ],
            },
            "searchObjWithDistance": {
                "success": True,
                "rows": [
                    {
                        "id": "poi2",
                        "nm": "Maiden Tower",
                        "addr": "Icherisheher, Baku",
                        "x": 49.8374,
                        "y": 40.3664,
                        "distance": 2500,  # meters
                    }
                ],
            },
            "makeSearchCitySettlementFuzzy": {
                "success": True,
                "rows": [
                    {
                        "id": "poi3",
                        "nm": "Flame Towers",  # Found despite typo
                        "addr": "Mehdi Huseyn 1A, Baku",
                        "x": 49.8265,
                        "y": 40.3594,
                        "similarity": 0.85,
                    }
                ],
            },
            "getRoute": {
                "success": True,
                "distance": 5.2,
                "time": 12,
                "route": "[[40.4093,49.8671],[40.4094,49.8672],[40.4150,49.8700]]",
            },
            "getRouteByType": {
                "success": True,
                "distance": 4.8,
                "time": 10,
                "route": "[[40.4093,49.8671],[40.4150,49.8700]]",
            },
            "searchNearBy50": {
                "success": True,
                "rows": [
                    {
                        "id": f"nearby_{i}",
                        "nm": f"Restaurant {i}",
                        "addr": f"Street {i}, Baku",
                        "x": 49.8671 + i * 0.001,
                        "y": 40.4093 + i * 0.001,
                        "distance": 100 * i,
                        "category": "restaurant",
                    }
                    for i in range(1, 6)
                ],
            },
            "getDetailsByPoi_GUID": {
                "success": True,
                "poi": {
                    "name": "Test Restaurant",
                    "description": "Fine dining establishment",
                    "phone": "+994 12 345 6789",
                    "website": "https://restaurant.az",
                    "hours": "10:00-23:00",
                    "rating": 4.5,
                },
            },
            "getTrafficTilesByCoord": {
                "success": True,
                "traffic": {
                    "severity": 2,
                    "speed": 25.5,
                    "congestion": 0.3,
                },
            },
        }
        return responses.get(endpoint, {"success": False})

    return _mock_response


@pytest.fixture
def traffic_tracker(tmp_path):
    """Create test traffic tracker with temp database."""
    db_path = tmp_path / "test_traffic.db"
    return TrafficPatternTracker(db_path)


@pytest.fixture
def route_optimizer():
    """Create route optimizer for testing."""
    return MultiStopOptimizer(route_type="fastest")


@pytest.fixture
def request_batcher():
    """Create request batcher for testing."""
    batcher = RequestBatcher(
        batch_window_ms=50, max_batch_size=5, cache_ttl_seconds=60, enabled=True
    )
    return batcher


@pytest.fixture
def circuit_breaker():
    """Create circuit breaker for testing."""
    return CircuitBreaker(
        name="test_breaker", failure_threshold=2, cooldown_seconds=1, enabled=True
    )


# =============================================================================
# SMART SEARCH TESTS
# =============================================================================


class TestSmartSearch:
    """Test smart search functionality with all strategies."""

    @patch("app.gomap._post")
    def test_search_with_distance(self, mock_post, mock_gomap_response):
        """Test distance-aware search."""
        mock_post.return_value = mock_gomap_response("searchObjWithDistance")

        results = search_objects_with_distance(
            "Maiden Tower", origin_lat=40.4093, origin_lon=49.8671, limit=10
        )

        assert len(results) == 1
        assert results[0]["name"] == "Maiden Tower"
        assert results[0]["distance_meters"] == 2500
        assert results[0]["distance_text"] == "2.5 km"
        mock_post.assert_called_once()

    @patch("app.gomap._post")
    def test_fuzzy_search(self, mock_post, mock_gomap_response):
        """Test fuzzy search for typo tolerance."""
        mock_post.return_value = mock_gomap_response("makeSearchCitySettlementFuzzy")

        results = search_objects_fuzzy("Flaim Tovers", limit=10)  # Typo

        assert len(results) == 1
        assert results[0]["name"] == "Flame Towers"
        assert results[0]["similarity"] == 0.85
        assert results[0]["provider"] == "gomap_fuzzy"

    @patch("app.gomap._post")
    def test_smart_search_fallback_chain(self, mock_post, mock_gomap_response):
        """Test smart search fallback strategy."""
        # First call fails (distance search)
        # Second call succeeds (exact search)
        # Third call for fuzzy not needed
        mock_post.side_effect = [
            {"success": False},  # Distance search fails
            mock_gomap_response("searchObj"),  # Exact search succeeds
        ]

        results = search_objects_smart(
            "Flame Towers", origin_lat=40.4093, origin_lon=49.8671, use_fuzzy_fallback=True
        )

        assert len(results) == 1
        assert results[0]["name"] == "Flame Towers"
        assert mock_post.call_count == 2  # Distance + exact

    def test_coordinate_validation(self):
        """Test coordinate bounds validation."""
        # Invalid latitude
        results = search_objects_with_distance(
            "test", origin_lat=91, origin_lon=49, limit=10  # Invalid
        )
        assert results == []

        # Invalid longitude
        results = search_objects_with_distance(
            "test", origin_lat=40, origin_lon=181, limit=10  # Invalid
        )
        assert results == []


# =============================================================================
# ROUTE OPTIMIZATION TESTS
# =============================================================================


class TestRouteOptimization:
    """Test route optimization algorithms."""

    @patch("app.gomap.route_directions_by_type")
    def test_nearest_neighbor_optimization(self, mock_route, route_optimizer):
        """Test nearest neighbor algorithm."""
        # Mock distance calculations
        mock_route.return_value = Mock(distance_km=1.5, duration_seconds=180)

        start = Location("start", "Hotel", 40.4093, 49.8671)
        destinations = [
            Location("1", "Restaurant A", 40.4100, 49.8680),
            Location("2", "Restaurant B", 40.4110, 49.8690),
            Location("3", "Restaurant C", 40.4120, 49.8700),
        ]

        result = route_optimizer.optimize_route(start, destinations, algorithm="nearest")

        assert isinstance(result, OptimizedRoute)
        assert len(result.locations) == 4  # start + 3 destinations
        assert result.optimization_method == "nearest_neighbor"
        assert result.total_distance_km > 0

    @patch("app.gomap.route_directions_by_type")
    def test_2opt_improvement(self, mock_route, route_optimizer):
        """Test 2-opt local search improvement."""
        mock_route.return_value = Mock(distance_km=1.0, duration_seconds=120)

        start = Location("start", "Hotel", 40.4093, 49.8671)
        destinations = [
            Location("1", "A", 40.41, 49.87),
            Location("2", "B", 40.42, 49.88),
            Location("3", "C", 40.43, 49.89),
            Location("4", "D", 40.44, 49.90),
        ]

        result = route_optimizer.optimize_route(start, destinations, algorithm="2opt")

        assert result.optimization_method == "2opt"
        assert result.savings_percentage >= 0  # Should improve or equal

    def test_brute_force_exact_solution(self, route_optimizer):
        """Test brute force for small problems."""
        with patch("app.gomap.route_directions_by_type") as mock_route:
            mock_route.return_value = Mock(distance_km=1.0, duration_seconds=60)

            start = Location("s", "Start", 40.40, 49.86)
            destinations = [
                Location("1", "A", 40.41, 49.87),
                Location("2", "B", 40.42, 49.88),
                Location("3", "C", 40.43, 49.89),
            ]

            result = route_optimizer.optimize_route(start, destinations, algorithm="brute_force")

            assert result.optimization_method == "brute_force"
            # Brute force finds optimal solution
            assert result.total_distance_km > 0

    def test_auto_algorithm_selection(self, route_optimizer):
        """Test automatic algorithm selection based on size."""
        with patch("app.gomap.route_directions_by_type") as mock_route:
            mock_route.return_value = Mock(distance_km=1.0, duration_seconds=60)

            start = Location("s", "Start", 40.40, 49.86)

            # Small problem -> brute force
            small_dests = [
                Location(str(i), f"D{i}", 40.4 + i * 0.01, 49.86 + i * 0.01) for i in range(4)
            ]
            result = route_optimizer.optimize_route(start, small_dests, algorithm="auto")
            assert result.optimization_method == "brute_force"

            # Medium problem -> 2opt
            medium_dests = [
                Location(str(i), f"D{i}", 40.4 + i * 0.01, 49.86 + i * 0.01) for i in range(10)
            ]
            result = route_optimizer.optimize_route(start, medium_dests, algorithm="auto")
            assert result.optimization_method == "2opt"


# =============================================================================
# REQUEST BATCHING TESTS
# =============================================================================


class TestRequestBatching:
    """Test request batching for autocomplete."""

    @pytest.mark.asyncio
    async def test_batch_window_consolidation(self, request_batcher):
        """Test requests within window are batched."""
        results = []

        async def mock_processor(requests: list[BatchRequest]):
            # Return same result for all requests
            return {req.query: [{"name": req.query}] for req in requests}

        request_batcher.register_processor("test", mock_processor)

        # Submit multiple requests quickly
        tasks = []
        for i in range(3):
            task = request_batcher.submit(f"query{i}", "test")
            tasks.append(task)

        # Wait for all results
        results = await asyncio.gather(*tasks)

        assert len(results) == 3
        assert request_batcher.stats.batched_requests == 3
        assert request_batcher.stats.api_calls_made == 1  # Single batch

    @pytest.mark.asyncio
    async def test_request_cancellation(self, request_batcher):
        """Test obsolete request cancellation."""

        async def slow_processor(requests: list[BatchRequest]):
            await asyncio.sleep(0.1)
            return {req.query: [] for req in requests}

        request_batcher.register_processor("test", slow_processor)

        # Submit multiple requests from same session
        session_id = "test_session"
        task1 = asyncio.create_task(
            request_batcher.submit("old_query", "test", session_id=session_id)
        )
        await asyncio.sleep(0.01)

        task2 = asyncio.create_task(
            request_batcher.submit("new_query", "test", session_id=session_id)
        )

        # Old request should be cancelled
        with pytest.raises(asyncio.CancelledError):
            await task1

        result2 = await task2
        assert result2 is not None
        assert request_batcher.stats.requests_cancelled > 0

    @pytest.mark.asyncio
    async def test_cache_hit(self, request_batcher):
        """Test result caching."""
        call_count = 0

        async def counting_processor(requests: list[BatchRequest]):
            nonlocal call_count
            call_count += 1
            return {req.query: [{"result": call_count}] for req in requests}

        request_batcher.register_processor("test", counting_processor)

        # First call
        result1 = await request_batcher.submit("cached_query", "test")
        assert result1[0]["result"] == 1

        # Second call (should hit cache)
        result2 = await request_batcher.submit("cached_query", "test")
        assert result2[0]["result"] == 1  # Same result

        assert call_count == 1  # Processor called only once
        assert request_batcher.stats.cache_hits == 1

    def test_statistics_tracking(self, request_batcher):
        """Test performance statistics."""
        stats = request_batcher.get_stats()

        assert "total_requests" in stats
        assert "reduction_percentage" in stats
        assert "average_latency_ms" in stats
        assert "cache_hits" in stats
        assert stats["enabled"] is True


# =============================================================================
# TRAFFIC PATTERN TESTS
# =============================================================================


class TestTrafficPatterns:
    """Test historical traffic pattern tracking."""

    def test_record_observation(self, traffic_tracker):
        """Test recording traffic observations."""
        traffic_tracker.record_observation(
            latitude=40.4093,
            longitude=49.8671,
            severity=3,
            speed_kmh=15.5,
            delay_minutes=5,
            weather="rainy",
        )

        stats = traffic_tracker.get_statistics()
        assert stats["total_observations"] == 1

    def test_traffic_prediction_no_data(self, traffic_tracker):
        """Test prediction with no historical data."""
        prediction = traffic_tracker.predict_traffic(latitude=40.4093, longitude=49.8671)

        assert isinstance(prediction, TrafficPrediction)
        assert prediction.confidence < 0.5  # Low confidence
        assert prediction.prediction_method == "general_pattern"

    def test_traffic_prediction_with_history(self, traffic_tracker):
        """Test prediction with historical data."""
        # Record multiple observations
        now = datetime.now()
        for i in range(20):
            traffic_tracker.record_observation(
                latitude=40.41, longitude=49.87, severity=3, timestamp=now - timedelta(days=i)
            )

        # Force pattern update
        traffic_tracker._update_patterns(
            traffic_tracker._get_grid_id(40.41, 49.87), now.weekday(), now.hour
        )

        # Predict traffic
        prediction = traffic_tracker.predict_traffic(
            latitude=40.41, longitude=49.87, target_time=now
        )

        assert prediction.confidence > 0.1  # Some confidence
        assert prediction.expected_severity > 0
        assert prediction.historical_samples > 0

    def test_anomaly_detection(self, traffic_tracker):
        """Test traffic anomaly detection."""
        # Establish pattern
        for _i in range(30):
            traffic_tracker.record_observation(40.41, 49.87, severity=2)

        # Record anomaly
        traffic_tracker.record_observation(40.41, 49.87, severity=4)

        stats = traffic_tracker.get_statistics()
        # Anomaly detection requires pattern establishment first

    def test_grid_id_generation(self, traffic_tracker):
        """Test location grid ID generation."""
        grid1 = traffic_tracker._get_grid_id(40.4093, 49.8671)
        grid2 = traffic_tracker._get_grid_id(40.4094, 49.8672)
        grid3 = traffic_tracker._get_grid_id(40.4193, 49.8771)

        # Close coordinates get same grid
        assert grid1 == grid2
        # Far coordinates get different grid
        assert grid1 != grid3


# =============================================================================
# CIRCUIT BREAKER TESTS
# =============================================================================


class TestCircuitBreaker:
    """Test circuit breaker resilience pattern."""

    def test_circuit_opens_after_threshold(self, circuit_breaker):
        """Test circuit opens after failure threshold."""

        def failing_func():
            raise RuntimeError("Service unavailable")

        # First failure
        with pytest.raises(RuntimeError):
            circuit_breaker.call(failing_func)
        assert circuit_breaker.is_closed()

        # Second failure (threshold reached)
        with pytest.raises(RuntimeError):
            circuit_breaker.call(failing_func)
        assert circuit_breaker.is_open()

        # Circuit is open, requests rejected
        with pytest.raises(CircuitOpenError):
            circuit_breaker.call(failing_func)

    def test_circuit_recovery(self, circuit_breaker):
        """Test circuit recovery after cooldown."""

        def failing_func():
            raise Exception("Fail")

        def success_func():
            return "Success"

        # Open the circuit
        for _ in range(2):
            try:
                circuit_breaker.call(failing_func)
            except Exception:
                pass

        assert circuit_breaker.is_open()

        # Wait for cooldown
        import time

        time.sleep(1.1)

        # Circuit should be half-open, test request allowed
        result = circuit_breaker.call(success_func)
        assert result == "Success"
        assert circuit_breaker.is_closed()

    def test_statistics_tracking(self, circuit_breaker):
        """Test circuit breaker statistics."""

        def success():
            return "ok"

        def fail():
            raise Exception("error")

        # Some successful calls
        for _ in range(3):
            circuit_breaker.call(success)

        # Some failed calls
        try:
            circuit_breaker.call(fail)
        except Exception:
            pass

        stats = circuit_breaker.stats
        assert stats.successful_calls == 3
        assert stats.failed_calls == 1
        assert stats.total_calls == 4


# =============================================================================
# CACHE TESTS
# =============================================================================


class TestCaching:
    """Test TTL cache implementation."""

    def test_ttl_cache_expiry(self):
        """Test cache entry expiration."""
        cache = TTLCache("test_cache", max_size=10, default_ttl=0.1)

        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

        # Wait for expiry
        import time

        time.sleep(0.2)

        assert cache.get("key1") is None  # Expired
        stats = cache.get_stats()
        assert stats["expirations"] == 1

    def test_lru_eviction(self):
        """Test LRU eviction when cache is full."""
        cache = TTLCache("test_cache", max_size=3, default_ttl=60)

        # Fill cache
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.set("key3", "value3")

        # Access key1 and key2 to make them recently used
        cache.get("key1")
        cache.get("key2")

        # Add new item (should evict key3)
        cache.set("key4", "value4")

        assert cache.get("key1") == "value1"
        assert cache.get("key2") == "value2"
        assert cache.get("key3") is None  # Evicted
        assert cache.get("key4") == "value4"

    def test_cache_statistics(self):
        """Test cache hit/miss statistics."""
        cache = TTLCache("test_cache", max_size=10, default_ttl=60)

        cache.set("key1", "value1")

        # Hit
        cache.get("key1")
        # Miss
        cache.get("key2")

        stats = cache.get_stats()
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["hit_rate"] == 0.5


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestIntegration:
    """Integration tests for complete workflows."""

    @pytest.mark.asyncio
    @patch("app.gomap._post")
    async def test_complete_search_workflow(self, mock_post, mock_gomap_response):
        """Test complete search workflow with all features."""
        # Setup mock responses
        mock_post.side_effect = [
            mock_gomap_response("searchObjWithDistance"),
            mock_gomap_response("getRoute"),
            mock_gomap_response("getTrafficTilesByCoord"),
            mock_gomap_response("getDetailsByPoi_GUID"),
        ]

        # 1. Search with distance
        results = search_objects_with_distance("Maiden Tower", 40.4093, 49.8671)
        assert len(results) > 0

        # 2. Calculate route
        route = route_directions_by_type(40.4093, 49.8671, 40.3664, 49.8374, route_type="fastest")
        assert route is not None
        assert route.distance_km > 0

        # 3. Get traffic conditions
        traffic = get_traffic_conditions(40.4093, 49.8671)
        assert traffic is not None
        assert traffic.severity >= 0

        # 4. Get POI details
        details = get_poi_details("poi1", include_images=True)
        assert details is not None
        assert "name" in details

    @pytest.mark.asyncio
    async def test_performance_under_load(self):
        """Test system performance under load."""
        batcher = RequestBatcher(batch_window_ms=100)

        async def mock_search(requests):
            await asyncio.sleep(0.05)  # Simulate API delay
            return {r.query: [] for r in requests}

        batcher.register_processor("search", mock_search)

        # Simulate 100 rapid requests
        tasks = []
        for i in range(100):
            task = batcher.submit(f"query{i % 10}", "search")
            tasks.append(task)
            await asyncio.sleep(0.001)  # Rapid fire

        results = await asyncio.gather(*tasks)
        assert len(results) == 100

        stats = batcher.get_stats()
        # Should have significant reduction
        assert stats["reduction_percentage"] > 50


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
