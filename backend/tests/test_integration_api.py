"""
Integration tests for the complete API flow.
Tests real interactions between components.
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestRestaurantIntegration:
    """Test complete restaurant workflows"""

    def test_list_restaurants_integration(self, client):
        """Test full restaurant listing flow"""
        response = client.get("/api/restaurants")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            restaurant = data[0]
            assert "id" in restaurant
            assert "name" in restaurant
            assert "slug" in restaurant

    def test_search_restaurants_integration(self, client):
        """Test restaurant search flow"""
        response = client.get("/api/restaurants?q=restaurant")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_restaurant_details_integration(self, client):
        """Test fetching individual restaurant"""
        # First get list
        list_response = client.get("/api/restaurants")
        restaurants = list_response.json()

        if len(restaurants) > 0:
            rid = restaurants[0]["id"]
            # Get specific restaurant
            detail_response = client.get(f"/api/restaurants/{rid}")
            assert detail_response.status_code in [200, 404]

    def test_health_check_integration(self, client):
        """Test health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestConciergeIntegration:
    """Test concierge AI integration"""

    def test_concierge_endpoint_integration(self, client):
        """Test full concierge query flow"""
        payload = {
            "prompt": "I want a nice Italian restaurant",
            "locale": "en",
            "mode": "local"
        }
        response = client.post("/api/concierge", json=payload)
        assert response.status_code in [200, 503]  # 503 if AI unavailable

        if response.status_code == 200:
            data = response.json()
            assert "results" in data
            assert "mode" in data

    def test_concierge_fallback_integration(self, client):
        """Test concierge fallback when AI unavailable"""
        payload = {
            "prompt": "restaurant",
            "locale": "en",
            "mode": "local"
        }
        response = client.post("/api/concierge", json=payload)
        assert response.status_code in [200, 503]


class TestAuthIntegration:
    """Test authentication integration"""

    def test_auth_bypass_integration(self, client):
        """Test auth bypass in dev mode"""
        response = client.get("/api/session")
        assert response.status_code == 200
        data = response.json()
        assert "sub" in data
        assert "email" in data


class TestReservationIntegration:
    """Test reservation flow integration"""

    def test_reservation_availability_integration(self, client):
        """Test checking availability"""
        # Get a restaurant first
        list_response = client.get("/api/restaurants")
        restaurants = list_response.json()

        if len(restaurants) > 0:
            rid = restaurants[0]["id"]
            params = {
                "date": "2025-12-01",
                "time": "19:00",
                "party_size": 2
            }
            response = client.get(f"/api/restaurants/{rid}/availability", params=params)
            assert response.status_code in [200, 404]


class TestMapIntegration:
    """Test map and location integration"""

    def test_geocode_integration(self, client):
        """Test geocoding"""
        params = {"q": "Baku"}
        response = client.get("/api/geocode", params=params)
        assert response.status_code == 200

    def test_directions_integration(self, client):
        """Test getting directions"""
        params = {
            "origin": "40.4093,49.8671",
            "destination": "40.3777,49.8920"
        }
        response = client.get("/api/directions", params=params)
        assert response.status_code == 200


class TestFullWorkflow:
    """Test complete end-to-end workflows"""

    def test_discovery_to_reservation_workflow(self, client):
        """Test complete user journey"""
        # Step 1: User searches for restaurants
        search_response = client.get("/api/restaurants?q=restaurant")
        assert search_response.status_code == 200
        restaurants = search_response.json()

        if len(restaurants) == 0:
            pytest.skip("No restaurants available for testing")

        # Step 2: User gets details
        rid = restaurants[0]["id"]
        detail_response = client.get(f"/api/restaurants/{rid}")
        assert detail_response.status_code in [200, 404]

        # Step 3: User checks availability
        avail_response = client.get(
            f"/api/restaurants/{rid}/availability",
            params={"date": "2025-12-01", "time": "19:00", "party_size": 2}
        )
        assert avail_response.status_code in [200, 404]

        # Step 4: User gets directions
        geocode_response = client.get("/api/geocode", params={"q": "Baku"})
        assert geocode_response.status_code == 200

    def test_concierge_to_booking_workflow(self, client):
        """Test AI recommendation to booking flow"""
        # Step 1: Get concierge recommendation
        concierge_response = client.post("/api/concierge", json={
            "prompt": "romantic dinner spot",
            "locale": "en",
            "mode": "local"
        })
        assert concierge_response.status_code in [200, 503]

        if concierge_response.status_code == 200:
            data = concierge_response.json()
            if len(data.get("results", [])) > 0:
                rid = data["results"][0]["id"]

                # Step 2: Get restaurant details
                detail_response = client.get(f"/api/restaurants/{rid}")
                assert detail_response.status_code in [200, 404]
