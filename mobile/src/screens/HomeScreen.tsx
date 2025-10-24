import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRestaurants, RestaurantSummary } from '../api';
import RestaurantCard from '../components/RestaurantCard';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

const quickFilters = [
  { label: 'Baku', query: 'Baku' },
  { label: 'Seafood', query: 'seafood' },
  { label: 'Steak', query: 'steak' },
  { label: 'Family friendly', query: 'family' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);

  const load = useCallback(
    async (q?: string, opts?: { refreshing?: boolean }) => {
      try {
        if (opts?.refreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const items = await fetchRestaurants(q);
        setRestaurants(items);
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
    load();
  }, [load]);

  const summary = useMemo(() => {
    const cities = Array.from(new Set(restaurants.map((r) => r.city).filter(Boolean)));
    const cuisines = Array.from(new Set(restaurants.flatMap((r) => r.cuisine ?? [])));
    return {
      count: restaurants.length,
      cities: cities.slice(0, 2).join(', '),
      cuisines: cuisines.slice(0, 3).join(', '),
    };
  }, [restaurants]);

  const onQuickFilter = (q: string) => {
    setQuery(q);
    load(q);
  };

  const renderHeader = () => (
    <View style={styles.heroCard}>
      <Text style={styles.heroOverline}>Plan tonight</Text>
      <Text style={styles.heroTitle}>Find the right table in seconds</Text>
      <Text style={styles.heroSubtitle}>
        Browse live availability, preview venues, and book directly from the Baku Reserve backend.
      </Text>
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Restaurants</Text>
          <Text style={styles.metricValue}>{summary.count || '—'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Cities</Text>
          <Text style={styles.metricValue}>{summary.cities || 'Updating'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Cuisines</Text>
          <Text style={styles.metricValue}>{summary.cuisines || 'Exploring'}</Text>
        </View>
      </View>
      <View style={styles.searchWrapper}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load(query)}
          placeholder="Search by cuisine, city, or venue…"
          style={styles.searchInput}
          returnKeyType="search"
        />
        <Pressable style={styles.actionButton} onPress={() => load(query)}>
          <Text style={styles.actionButtonText}>Search</Text>
        </Pressable>
      </View>
      <View style={styles.filterRow}>
        {quickFilters.map((filter) => (
          <Pressable
            key={filter.query}
            style={[
              styles.filterChip,
              query.toLowerCase() === filter.query.toLowerCase() && styles.filterChipActive,
            ]}
            onPress={() => onQuickFilter(filter.query)}
          >
            <Text
              style={[
                styles.filterChipText,
                query.toLowerCase() === filter.query.toLowerCase() && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Loading restaurants…</Text>
        </View>
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RestaurantCard
              item={item}
              onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(query, { refreshing: true })} />}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptySubtitle}>Adjust your filters or pull to refresh to try again.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    ...shadow.card,
  },
  heroOverline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  heroSubtitle: {
    marginTop: spacing.sm,
    color: colors.muted,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.08)',
  },
  metricLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
  },
  metricValue: {
    marginTop: spacing.xs,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  searchWrapper: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  actionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  filterChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  filterChipText: {
    color: colors.muted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.muted,
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontWeight: '500',
  },
});
