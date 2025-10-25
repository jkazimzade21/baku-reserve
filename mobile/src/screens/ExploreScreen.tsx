import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

import RestaurantCard from '../components/RestaurantCard';
import { colors, radius, spacing } from '../config/theme';
import { useRestaurants } from '../hooks/useRestaurants';
import type { RestaurantSummary } from '../api';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';

const tagFilters = [
  { key: 'all', label: 'Highlights', icon: 'star' as const },
  { key: 'waterfront', label: 'Waterfront', icon: 'anchor' as const },
  { key: 'skyline', label: 'Skyline', icon: 'map-pin' as const },
  { key: 'late_night', label: 'Late night', icon: 'moon' as const },
  { key: 'family_brunch', label: 'Family', icon: 'users' as const },
];

const tagFilterMap: Record<string, string[]> = {
  waterfront: ['waterfront', 'sunset', 'seaside'],
  skyline: ['skyline', 'rooftop', 'panorama', 'hotel_partner'],
  late_night: ['late_night', 'dj', 'cocktails', 'nikkei'],
  family_brunch: ['family_brunch', 'family_style', 'breakfast'],
};

const hasTag = (restaurant: RestaurantSummary, tags: string[]) =>
  (restaurant.tags ?? []).some((tag) => tags.includes(tag));

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Explore'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function ExploreScreen({ navigation }: Props) {
  const { restaurants, loading, refreshing, error, reload } = useRestaurants();
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const trending = useMemo(() => {
    return [...restaurants]
      .filter((r) => Boolean(r.cover_photo))
      .slice(0, 6);
  }, [restaurants]);

  const filteredRestaurants = useMemo(() => {
    if (activeFilter === 'all') {
      return restaurants;
    }
    const tags = tagFilterMap[activeFilter];
    if (!tags) return restaurants;
    return restaurants.filter((r) => hasTag(r, tags));
  }, [restaurants, activeFilter]);

  const renderHeader = () => (
    <View style={styles.header}>
      <LinearGradient
        colors={[`${colors.primary}2A`, `${colors.accent}14`, `${colors.card}`]}
        style={styles.mapPreview}
      >
        <Feather name="navigation" size={22} color={colors.primaryStrong} />
        <Text style={styles.mapTitle}>Live tables around the boulevard</Text>
        <Text style={styles.mapSubtitle}>Browse availability by neighbourhood and vibe.</Text>
        <Pressable
          style={styles.mapCTA}
          onPress={() => setActiveFilter('waterfront')}
        >
          <Text style={styles.mapCTAText}>Show waterfront</Text>
          <Feather name="arrow-up-right" size={16} color={colors.primaryStrong} />
        </Pressable>
      </LinearGradient>

      <ScrollChipRow activeFilter={activeFilter} onSelect={setActiveFilter} />

      {error ? <Text style={styles.errorLabel}>{error}</Text> : null}

      {trending.length > 0 ? (
        <View style={styles.trendingBlock}>
          <Text style={styles.sectionTitle}>Trending this week</Text>
          <View style={styles.trendingRow}>
            {trending.map((item) => (
              <Pressable
                key={item.id}
                style={styles.trendingCard}
                onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })}
              >
                <Text style={styles.trendingName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.trendingMeta} numberOfLines={1}>
                  {(item.cuisine ?? []).slice(0, 2).join(' • ') || item.city || 'Reserve now'}
                </Text>
          <View style={styles.trendingBadge}>
            <Feather name="zap" size={12} color={colors.primaryStrong} />
                  <Text style={styles.trendingBadgeText}>Popular</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { marginBottom: spacing.md }]}>Curated for you</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Exploring neighbourhoods…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={filteredRestaurants}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RestaurantCard
            item={item}
            onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => reload({ refreshing: true })}
            tintColor={colors.primaryStrong}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No venues yet</Text>
            <Text style={styles.emptySubtitle}>
              We’re onboarding more restaurants for this vibe. Check back soon.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

type ChipRowProps = {
  activeFilter: string;
  onSelect: (value: string) => void;
};

function ScrollChipRow({ activeFilter, onSelect }: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterScroll}
    >
      {tagFilters.map((filter) => {
        const active = filter.key === activeFilter;
        return (
          <Pressable
            key={filter.key}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => onSelect(filter.key)}
          >
            <Feather
              name={filter.icon}
              size={14}
              color={active ? '#fff' : colors.muted}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  mapPreview: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  mapSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  mapCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: `${colors.primaryStrong}33`,
  },
  mapCTAText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  filterScroll: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  filterChipText: {
    fontWeight: '600',
    color: colors.muted,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  errorLabel: {
    color: colors.danger,
    fontWeight: '600',
  },
  trendingBlock: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  trendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trendingCard: {
    flexBasis: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  trendingName: {
    fontWeight: '700',
    color: colors.text,
  },
  trendingMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  trendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  trendingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
