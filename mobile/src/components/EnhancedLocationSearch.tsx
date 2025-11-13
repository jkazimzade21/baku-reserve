/**
 * Enhanced location search component with all new features
 * Displays smart search, nearby POIs, route options, and traffic predictions
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Modal,
  Image,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useEnhancedLocation } from '../hooks/useEnhancedLocation';

interface Props {
  onLocationSelected?: (location: any) => void;
  restaurantLocation?: { latitude: number; longitude: number };
  showMap?: boolean;
}

export function EnhancedLocationSearch({
  onLocationSelected,
  restaurantLocation,
  showMap = true,
}: Props) {
  const {
    currentLocation,
    locationPermission,
    smartSearch,
    autocompleteSearch,
    discoverNearby,
    calculateRoute,
    getPOIDetails,
    predictTraffic,
    optimizeMultiStopRoute,
    saveLocationHistory,
    getLocationHistory,
  } = useEnhancedLocation();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [nearbyPOIs, setNearbyPOIs] = useState<any[]>([]);
  const [selectedPOI, setSelectedPOI] = useState<any>(null);
  const [poiDetails, setPOIDetails] = useState<any>(null);
  const [routeType, setRouteType] = useState<'fastest' | 'shortest' | 'pedestrian'>('fastest');
  const [routePolyline, setRoutePolyline] = useState<any[]>([]);
  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [trafficPrediction, setTrafficPrediction] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'nearby' | 'history'>('search');
  const [locationHistory, setLocationHistory] = useState<any[]>([]);
  const [showPOIModal, setShowPOIModal] = useState(false);

  // Load location history on mount
  useEffect(() => {
    getLocationHistory().then(setLocationHistory);
  }, [getLocationHistory]);

  // Handle search input with debouncing
  useEffect(() => {
    if (searchQuery.length > 0) {
      const timer = setTimeout(() => {
        autocompleteSearch(searchQuery, (results) => {
          setSearchResults(results);
        });
      }, 200); // 200ms debounce

      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, autocompleteSearch]);

  // Discover nearby POIs when tab changes
  useEffect(() => {
    if (activeTab === 'nearby' && currentLocation) {
      discoverNearbyPOIs();
    }
  }, [activeTab, currentLocation]);

  const discoverNearbyPOIs = async () => {
    setIsLoading(true);
    try {
      const pois = await discoverNearby({
        radius_km: 2,
        category: 'restaurant',
        limit: 30,
      });
      setNearbyPOIs(pois);
    } catch (err) {
      Alert.alert('Error', 'Failed to discover nearby places');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = async (location: any) => {
    setSelectedPOI(location);

    // Save to history
    await saveLocationHistory(location);
    setLocationHistory([location, ...locationHistory.slice(0, 19)]);

    // Calculate route if restaurant location is provided
    if (restaurantLocation && currentLocation) {
      await calculateRouteToLocation(location);
    }

    // Get POI details if available
    if (location.id && location.provider === 'gomap') {
      const details = await getPOIDetails(location.id);
      if (details) {
        setPOIDetails(details);
        setShowPOIModal(true);
      }
    }

    // Callback to parent
    onLocationSelected?.(location);
  };

  const calculateRouteToLocation = async (location: any) => {
    setIsLoading(true);
    try {
      const route = await calculateRoute(
        { lat: location.latitude, lon: location.longitude },
        { type: routeType, includePolyline: true, includeTraffic: true }
      );

      if (route.geometry) {
        const polyline = route.geometry.map((coord: [number, number]) => ({
          latitude: coord[0],
          longitude: coord[1],
        }));
        setRoutePolyline(polyline);
      }

      setRouteInfo(route);

      // Get traffic prediction
      if (route.traffic) {
        setTrafficPrediction(route.traffic);
      } else {
        const prediction = await predictTraffic({
          lat: location.latitude,
          lon: location.longitude,
        });
        setTrafficPrediction(prediction);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to calculate route');
    } finally {
      setIsLoading(false);
    }
  };

  const renderSearchResult = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleLocationSelect(item)}
    >
      <View style={styles.resultContent}>
        <Text style={styles.resultName}>{item.name}</Text>
        {item.address && <Text style={styles.resultAddress}>{item.address}</Text>}
        <View style={styles.resultMeta}>
          {item.distance_text && (
            <Text style={styles.resultDistance}>{item.distance_text}</Text>
          )}
          {item.provider === 'gomap_fuzzy' && (
            <Text style={styles.fuzzyBadge}>Fuzzy Match</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  const renderPOIModal = () => (
    <Modal
      visible={showPOIModal}
      animationType="slide"
      onRequestClose={() => setShowPOIModal(false)}
    >
      <ScrollView style={styles.modalContent}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowPOIModal(false)}
        >
          <Ionicons name="close" size={24} color="#333" />
        </TouchableOpacity>

        {poiDetails && (
          <View>
            <Text style={styles.modalTitle}>{poiDetails.name}</Text>

            {poiDetails.images && poiDetails.images.length > 0 && (
              <ScrollView horizontal style={styles.imageScroll}>
                {poiDetails.images.map((img: any, index: number) => (
                  <Image
                    key={index}
                    source={{ uri: img.url }}
                    style={styles.poiImage}
                  />
                ))}
              </ScrollView>
            )}

            {poiDetails.description && (
              <Text style={styles.description}>{poiDetails.description}</Text>
            )}

            <View style={styles.infoSection}>
              {poiDetails.address && (
                <View style={styles.infoRow}>
                  <Ionicons name="location" size={20} color="#666" />
                  <Text style={styles.infoText}>{poiDetails.address}</Text>
                </View>
              )}

              {poiDetails.phone && (
                <View style={styles.infoRow}>
                  <Ionicons name="call" size={20} color="#666" />
                  <Text style={styles.infoText}>{poiDetails.phone}</Text>
                </View>
              )}

              {poiDetails.website && (
                <View style={styles.infoRow}>
                  <Ionicons name="globe" size={20} color="#666" />
                  <Text style={styles.infoText}>{poiDetails.website}</Text>
                </View>
              )}

              {poiDetails.opening_hours && (
                <View style={styles.infoRow}>
                  <Ionicons name="time" size={20} color="#666" />
                  <Text style={styles.infoText}>{poiDetails.opening_hours}</Text>
                </View>
              )}

              {poiDetails.rating && (
                <View style={styles.infoRow}>
                  <Ionicons name="star" size={20} color="#FFD700" />
                  <Text style={styles.infoText}>
                    {poiDetails.rating} / 5.0
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search with typos allowed..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Selection */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'nearby' && styles.activeTab]}
          onPress={() => setActiveTab('nearby')}
        >
          <Text style={[styles.tabText, activeTab === 'nearby' && styles.activeTabText]}>
            Nearby
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Route Type Selector */}
      {selectedPOI && (
        <View style={styles.routeTypeContainer}>
          <Text style={styles.routeTypeLabel}>Route Type:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(['fastest', 'shortest', 'pedestrian'] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.routeTypeButton, routeType === type && styles.activeRouteType]}
                onPress={() => {
                  setRouteType(type);
                  if (selectedPOI) calculateRouteToLocation(selectedPOI);
                }}
              >
                <Ionicons
                  name={type === 'pedestrian' ? 'walk' : 'car'}
                  size={16}
                  color={routeType === type ? '#fff' : '#666'}
                />
                <Text
                  style={[
                    styles.routeTypeText,
                    routeType === type && styles.activeRouteTypeText,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Route Info */}
      {routeInfo && (
        <View style={styles.routeInfoContainer}>
          <View style={styles.routeInfoRow}>
            <Text style={styles.routeInfoLabel}>Distance:</Text>
            <Text style={styles.routeInfoValue}>{routeInfo.distance_km?.toFixed(1)} km</Text>
          </View>
          <View style={styles.routeInfoRow}>
            <Text style={styles.routeInfoLabel}>Duration:</Text>
            <Text style={styles.routeInfoValue}>{routeInfo.duration_minutes} min</Text>
          </View>
          {trafficPrediction && (
            <View style={styles.routeInfoRow}>
              <Text style={styles.routeInfoLabel}>Traffic:</Text>
              <Text style={[
                styles.routeInfoValue,
                { color: trafficPrediction.expected_severity > 2 ? '#FF6B6B' : '#51CF66' }
              ]}>
                {trafficPrediction.message}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Map View */}
      {showMap && currentLocation && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
        >
          {/* Current Location */}
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            title="Your Location"
          >
            <View style={styles.currentLocationMarker}>
              <View style={styles.currentLocationDot} />
            </View>
          </Marker>

          {/* Selected POI */}
          {selectedPOI && (
            <Marker
              coordinate={{
                latitude: selectedPOI.latitude,
                longitude: selectedPOI.longitude,
              }}
              title={selectedPOI.name}
              description={selectedPOI.address}
            />
          )}

          {/* Nearby POIs */}
          {activeTab === 'nearby' &&
            nearbyPOIs.map((poi) => (
              <Marker
                key={poi.id}
                coordinate={{
                  latitude: poi.latitude,
                  longitude: poi.longitude,
                }}
                title={poi.name}
                description={poi.distance_text}
                onPress={() => handleLocationSelect(poi)}
              />
            ))}

          {/* Route Polyline */}
          {routePolyline.length > 0 && (
            <Polyline
              coordinates={routePolyline}
              strokeColor={routeType === 'pedestrian' ? '#4CAF50' : '#2196F3'}
              strokeWidth={3}
            />
          )}

          {/* Nearby Search Radius */}
          {activeTab === 'nearby' && (
            <Circle
              center={{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
              }}
              radius={2000}
              fillColor="rgba(33, 150, 243, 0.1)"
              strokeColor="rgba(33, 150, 243, 0.3)"
            />
          )}
        </MapView>
      )}

      {/* Results List */}
      <FlatList
        style={styles.resultsList}
        data={
          activeTab === 'search'
            ? searchResults
            : activeTab === 'nearby'
            ? nearbyPOIs
            : locationHistory
        }
        renderItem={renderSearchResult}
        keyExtractor={(item) => item.id || `${item.latitude}-${item.longitude}`}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeTab === 'search'
              ? 'Start typing to search...'
              : activeTab === 'nearby'
              ? isLoading
                ? 'Loading nearby places...'
                : 'No nearby places found'
              : 'No location history'}
          </Text>
        }
      />

      {/* POI Details Modal */}
      {renderPOIModal()}

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    margin: 10,
    borderRadius: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  routeTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
  },
  routeTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 10,
  },
  routeTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  activeRouteType: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  routeTypeText: {
    fontSize: 12,
    marginLeft: 4,
    color: '#666',
  },
  activeRouteTypeText: {
    color: '#fff',
  },
  routeInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#f0f8ff',
  },
  routeInfoRow: {
    alignItems: 'center',
  },
  routeInfoLabel: {
    fontSize: 12,
    color: '#666',
  },
  routeInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  map: {
    height: 250,
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
  currentLocationMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2196F3',
  },
  resultsList: {
    flex: 1,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultContent: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '500',
  },
  resultAddress: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  resultDistance: {
    fontSize: 12,
    color: '#2196F3',
    marginRight: 8,
  },
  fuzzyBadge: {
    fontSize: 10,
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 80,
    marginHorizontal: 20,
  },
  imageScroll: {
    height: 200,
    marginTop: 20,
  },
  poiImage: {
    width: 300,
    height: 200,
    marginHorizontal: 10,
    borderRadius: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginHorizontal: 20,
    marginTop: 20,
  },
  infoSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  infoText: {
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});