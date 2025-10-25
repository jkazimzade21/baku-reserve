import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRestaurants, RestaurantSummary } from '../api';
import RestaurantCard from '../components/RestaurantCard';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

const quickFilters = [
  { label: 'Seafood & grill', query: 'Seafood' },
  { label: 'Steakhouses', query: 'Steakhouse' },
  { label: 'Azerbaijani classics', query: 'Azerbaijani' },
  { label: 'Weekend brunch', query: 'Brunch' },
];

const tagFilterMap: Record<string, string[]> = {
  book_early: ['book_early'],
  waterfront: ['waterfront', 'sunset'],
  skyline: ['skyline', 'rooftop', 'panorama', 'hotel_partner'],
  late_night: ['late_night', 'dj', 'cocktails', 'nikkei'],
  family_brunch: ['family_brunch', 'family_style', 'breakfast'],
};

const tagFilters = [
  { label: 'Book early', value: 'book_early' },
  { label: 'Waterfront evenings', value: 'waterfront' },
  { label: 'Skyline lounges', value: 'skyline' },
  { label: 'Late-night DJs', value: 'late_night' },
  { label: 'Family brunch', value: 'family_brunch' },
];

const hasTag = (restaurant: RestaurantSummary, tags: string[]) =>
  (restaurant.tags ?? []).some((tag) => tags.includes(tag));

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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

  const collections = useMemo(() => {
    const pickByTags = (tags: string[]) => restaurants.filter((r) => hasTag(r, tags));
    return [
      {
        key: 'book_early',
        title: 'Book-early favourites',
        subtitle: 'Hold these high-demand tables before the weekend rush.',
        data: pickByTags(tagFilterMap.book_early).slice(0, 6),
      },
      {
        key: 'waterfront',
        title: 'Waterfront sunsets',
        subtitle: 'Caspian-front terraces and boulevard lounges.',
        data: pickByTags(tagFilterMap.waterfront).slice(0, 6),
      },
      {
        key: 'skyline',
        title: 'Skyline lounges',
        subtitle: 'Panoramic rooftops inside Baku’s finest hotels.',
        data: pickByTags(tagFilterMap.skyline).slice(0, 6),
      },
      {
        key: 'late_night',
        title: 'After-dark DJs',
        subtitle: 'Late kitchens, signature cocktails, and vinyl nights.',
        data: pickByTags(tagFilterMap.late_night).slice(0, 6),
      },
      {
        key: 'family_brunch',
        title: 'Family brunch tables',
        subtitle: 'Brunch boards, play corners, and extra-large tables.',
        data: pickByTags(tagFilterMap.family_brunch).slice(0, 6),
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
    return tagFilters.find((tag) => tag.value === selectedTag)?.label ?? selectedTag;
  }, [selectedTag]);

  const onQuickFilter = (q: string) => {
    setQuery(q);
    setSelectedTag(null);
    load(q);
  };

  const renderHeader = () => (
    <View style={styles.headerStack}>
      <View style={styles.heroCard}>
        <Text style={styles.heroOverline}>This weekend in Baku</Text>
        <Text style={styles.heroTitle}>Reserve Baku&apos;s hardest-to-get tables</Text>
        <Text style={styles.heroSubtitle}>
          Live availability refreshes every 15 seconds, deposits are handled in-app, and every venue includes an
          interactive seat map so you know the view before you arrive.
        </Text>
        <View style={styles.heroHighlights}>
          <View style={styles.highlightPill}>
            <Text style={styles.highlightText}>Seat-by-seat floor plans</Text>
          </View>
          <View style={styles.highlightPill}>
            <Text style={styles.highlightText}>Live availability sync</Text>
          </View>
          <View style={styles.highlightPill}>
            <Text style={styles.highlightText}>Deposits & holds, ready</Text>
          </View>
        </View>
        <View style={styles.searchWrapper}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => load(query)}
            placeholder="Search by name, cuisine, or neighborhood…"
            style={styles.searchInput}
            returnKeyType="search"
            placeholderTextColor={colors.muted}
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
        <View style={styles.tagFilterRow}>
          {tagFilters.map((tag) => {
            const active = selectedTag === tag.value;
            return (
              <Pressable
                key={tag.value}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => setSelectedTag(active ? null : tag.value)}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {(selectedTag || query) ? (
          <Pressable
            style={styles.clearFilters}
            onPress={() => {
              setSelectedTag(null);
              setQuery('');
              load();
            }}
          >
            <Text style={styles.clearFiltersText}>Clear filters</Text>
          </Pressable>
        ) : null}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {collections.map((section) => (
        <View key={section.key} style={styles.collectionWrapper}>
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
                {item.cover_photo ? (
                  <Image source={{ uri: item.cover_photo }} style={styles.collectionImage} resizeMode="cover" />
                ) : (
                  <View style={styles.collectionFallback}>
                    <Text style={styles.collectionFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.collectionCardBody}>
                  <Text style={styles.collectionCardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.collectionCardMeta} numberOfLines={1}>
                    {item.price_level ?? item.cuisine?.slice(0, 2).join(' • ') ?? 'Reserve now'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
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
          data={filteredRestaurants}
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
              <Text style={styles.emptyTitle}>Nothing to show</Text>
              <Text style={styles.emptySubtitle}>
                {selectedTagLabel
                  ? `We’re onboarding more venues for ${selectedTagLabel.toLowerCase()} soon.`
                  : 'Adjust your search or pull to refresh to try again.'}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerStack: {
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.2)',
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
    lineHeight: 20,
  },
  heroHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  highlightPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(231, 169, 119, 0.22)',
  },
  highlightText: {
    color: colors.text,
    fontWeight: '600',
  },
  searchWrapper: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
    color: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.18)',
  },
  actionButton: {
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  tagFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
  },
  filterChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  filterChipText: {
    color: colors.muted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#2F1C11',
  },
  tagChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(231, 169, 119, 0.16)',
  },
  tagChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  tagChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  tagChipTextActive: {
    color: '#2F1C11',
  },
  collectionWrapper: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.2)',
    ...shadow.card,
  },
  collectionHeader: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  collectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  collectionSubtitle: {
    color: colors.muted,
  },
  collectionScroll: {
    gap: spacing.md,
  },
  collectionCard: {
    width: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.16)',
  },
  collectionImage: {
    height: 110,
    width: '100%',
  },
  collectionFallback: {
    height: 110,
    width: '100%',
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionFallbackText: {
    color: '#2F1C11',
    fontSize: 24,
    fontWeight: '700',
  },
  collectionCardBody: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  collectionCardTitle: {
    fontWeight: '600',
    color: colors.text,
  },
  collectionCardMeta: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  clearFilters: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.18)',
  },
  clearFiltersText: {
    color: colors.text,
    fontWeight: '600',
  },
});
