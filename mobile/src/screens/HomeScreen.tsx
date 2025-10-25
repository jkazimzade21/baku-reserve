import React, { useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import RestaurantCard from '../components/RestaurantCard';
import { colors, radius, shadow, spacing } from '../config/theme';
import { useRestaurants } from '../hooks/useRestaurants';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import type { RestaurantSummary } from '../api';

const quickFilters = [
  { label: 'Tonight', query: 'Dinner' },
  { label: 'Brunch', query: 'Brunch' },
  { label: 'Live music', query: 'DJ' },
  { label: 'Terrace', query: 'Terrace' },
];

const tagFilterMap: Record<string, string[]> = {
  book_early: ['book_early'],
  waterfront: ['waterfront', 'sunset', 'seaside'],
  skyline: ['skyline', 'rooftop', 'panorama', 'hotel_partner'],
  late_night: ['late_night', 'dj', 'cocktails', 'nikkei'],
  family_brunch: ['family_brunch', 'family_style', 'breakfast'],
};

const vibeFilters = [
  { label: 'Book early', value: 'book_early' },
  { label: 'Waterfront', value: 'waterfront' },
  { label: 'Skyline lounges', value: 'skyline' },
  { label: 'After dark', value: 'late_night' },
  { label: 'Family brunch', value: 'family_brunch' },
];

const hasTag = (restaurant: RestaurantSummary, tags: string[]) =>
  (restaurant.tags ?? []).some((tag) => tags.includes(tag));

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Discover'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation }: Props) {
  const { restaurants, loading, refreshing, error, query, setQuery, search, reload, clear } = useRestaurants();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const summary = useMemo(() => {
    if (!restaurants.length) {
      return { count: 0, neighborhoods: '--', cuisines: '--' };
    }
    const neighborhoods = Array.from(new Set(restaurants.map((r) => r.city).filter(Boolean)));
    const cuisines = Array.from(new Set(restaurants.flatMap((r) => r.cuisine ?? [])));
    return {
      count: restaurants.length,
      neighborhoods: neighborhoods.slice(0, 2).join(' • ') || 'Across Baku',
      cuisines: cuisines.slice(0, 3).join(' • ') || 'Curated favourites',
    };
  }, [restaurants]);

  const collections = useMemo(() => {
    const pickByTags = (tags: string[]) => restaurants.filter((r) => hasTag(r, tags));
    return [
      {
        key: 'book_early',
        title: 'Reserve-before-5pm',
        subtitle: 'High demand dining rooms that vanish by Friday afternoon.',
        data: pickByTags(tagFilterMap.book_early).slice(0, 8),
      },
      {
        key: 'waterfront',
        title: 'Boulevard sunsets',
        subtitle: 'Caspian-front tables with golden hour views.',
        data: pickByTags(tagFilterMap.waterfront).slice(0, 8),
      },
      {
        key: 'skyline',
        title: 'Skyline lounges',
        subtitle: 'Panoramic rooftops and hotel lounges.',
        data: pickByTags(tagFilterMap.skyline).slice(0, 8),
      },
    ].filter((section) => section.data.length > 0);
  }, [restaurants]);

  const filteredRestaurants = useMemo(() => {
    if (!selectedTag) {
      return restaurants;
    }
    const tags = tagFilterMap[selectedTag];
    if (!tags) return restaurants;
    return restaurants.filter((r) => hasTag(r, tags));
  }, [restaurants, selectedTag]);

  const selectedTagLabel = useMemo(() => {
    if (!selectedTag) return null;
    return vibeFilters.find((tag) => tag.value === selectedTag)?.label ?? selectedTag;
  }, [selectedTag]);

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed.length) {
      clear();
      return;
    }
    setSelectedTag(null);
    search(trimmed);
  }, [clear, query, search]);

  const handleQuickFilter = (value: string) => {
    setTimeout(() => setQuery(value), 0);
    setSelectedTag(null);
    search(value);
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.locationRow}>
        <View>
          <Text style={styles.locationLabel}>Dining in</Text>
          <Text style={styles.locationValue}>Baku, Azerbaijan</Text>
        </View>
        <Pressable style={styles.avatar} onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.avatarText}>AZ</Text>
        </Pressable>
      </View>

      <Pressable style={styles.summaryCard} onPress={() => navigation.navigate('Reservations')}>
        <View style={styles.summaryIcon}>
          <Feather name="calendar" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>{summary.count} tables</Text>
          <Text style={styles.summarySubtitle} numberOfLines={1}>
            {summary.neighborhoods} • {summary.cuisines}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.muted} />
      </Pressable>

      <View style={styles.searchBar}>
        <Feather name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          placeholder="Search name, cuisine, or neighbourhood"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable style={styles.clearButton} onPress={() => { setQuery(''); setSelectedTag(null); clear(); }}>
            <Feather name="x" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickRow}
      >
        {quickFilters.map((item) => {
          const active = query.toLowerCase() === item.query.toLowerCase();
          return (
            <Pressable
              key={item.query}
              onPress={() => handleQuickFilter(item.query)}
              style={[styles.quickChip, active && styles.quickChipActive]}
            >
              <Feather
                name={item.label === 'Tonight' ? 'sunset' : item.label === 'Brunch' ? 'coffee' : item.label === 'Live music' ? 'music' : 'wind'}
                size={14}
                color={active ? colors.primary : colors.muted}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.vibeRow}>
        {vibeFilters.map((item) => {
          const active = selectedTag === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => setSelectedTag(active ? null : item.value)}
              style={[styles.vibePill, active && styles.vibePillActive]}
            >
              <Text style={[styles.vibePillText, active && styles.vibePillTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.errorLabel}>{error}</Text> : null}

      {collections.map((section) => (
        <View key={section.key} style={styles.collectionBlock}>
          <View style={styles.collectionHeader}>
            <Text style={styles.collectionTitle}>{section.title}</Text>
            <Text style={styles.collectionSubtitle}>{section.subtitle}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.collectionScroll}
          >
            {section.data.map((item) => (
              <Pressable
                key={item.id}
                style={styles.collectionCard}
                onPress={() => navigation.navigate('Restaurant', { id: item.id, name: item.name })}
              >
                <Text style={styles.collectionCardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.collectionCardMeta} numberOfLines={1}>
                  {(item.cuisine ?? []).slice(0, 2).join(' • ') || item.price_level || 'Reserve now'}
                </Text>
                <View style={styles.collectionCTA}>
                  <Text style={styles.collectionCTAText}>View tables</Text>
                  <Feather name="arrow-up-right" size={14} color={colors.primary} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}

      {(selectedTag || query) && (
        <Pressable
          style={styles.clearFiltersRow}
          onPress={() => {
            setSelectedTag(null);
            setQuery('');
            clear();
          }}
        >
          <Feather name="refresh-ccw" size={14} color={colors.primary} />
          <Text style={styles.clearFiltersText}>Clear filters</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Finding tables near you…</Text>
        </View>
      ) : (
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
            <RefreshControl refreshing={refreshing} onRefresh={() => reload({ refreshing: true })} tintColor={colors.primaryStrong} />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nothing matched</Text>
              <Text style={styles.emptySubtitle}>
                {selectedTagLabel
                  ? `We’re onboarding more venues for ${selectedTagLabel.toLowerCase()} soon.`
                  : 'Adjust your filters or pull to refresh to try again.'}
              </Text>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerContainer: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.muted,
  },
  locationValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 169, 119, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summarySubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  clearButton: {
    padding: spacing.xs,
  },
  quickRow: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
  },
  quickChipText: {
    fontWeight: '600',
    color: colors.muted,
  },
  quickChipTextActive: {
    color: colors.primary,
  },
  vibeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  vibePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
  },
  vibePillActive: {
    backgroundColor: colors.primary,
  },
  vibePillText: {
    fontWeight: '600',
    color: colors.text,
  },
  vibePillTextActive: {
    color: '#fff',
  },
  errorLabel: {
    color: colors.danger,
    fontWeight: '600',
  },
  collectionBlock: {
    gap: spacing.sm,
  },
  collectionHeader: {
    gap: 4,
  },
  collectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  collectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
  },
  collectionScroll: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  collectionCard: {
    width: 200,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  collectionCardTitle: {
    fontWeight: '700',
    fontSize: 15,
    color: colors.text,
  },
  collectionCardMeta: {
    fontSize: 13,
    color: colors.muted,
  },
  collectionCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  collectionCTAText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  clearFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
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
