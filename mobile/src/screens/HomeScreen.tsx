import React, { useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import RestaurantCard from '../components/RestaurantCard';
import Surface from '../components/Surface';
import SectionHeading from '../components/SectionHeading';
import InfoBanner from '../components/InfoBanner';
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

const fallbackImage =
  'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80';

const hasTag = (restaurant: RestaurantSummary, tags: string[]) =>
  (restaurant.tags ?? []).some((tag) => tags.includes(tag));

const resolvePhoto = (restaurant?: RestaurantSummary) => restaurant?.cover_photo ?? fallbackImage;

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

  const handleQuickFilter = useCallback((value: string) => {
    setTimeout(() => setQuery(value), 0);
    setSelectedTag(null);
    search(value);
  }, [search]);

  const handleClearQuery = useCallback(() => {
    setSelectedTag(null);
    setQuery('');
    clear();
  }, [clear]);

  const handleToggleTag = useCallback((value: string) => {
    setSelectedTag((prev) => (prev === value ? null : value));
  }, []);

  const headerComponent = useMemo(
    () => (
      <HomeListHeader
        summary={summary}
        query={query}
        onChangeQuery={setQuery}
        onSubmitSearch={handleSearch}
        onClearQuery={handleClearQuery}
        onQuickFilter={handleQuickFilter}
        selectedTag={selectedTag}
        onToggleTag={handleToggleTag}
        error={error}
        collections={collections}
        onPressProfile={() => navigation.navigate('Profile')}
        onPressRestaurant={(restaurantId: string, name: string) =>
          navigation.navigate('Restaurant', { id: restaurantId, name })
        }
        showClearFilters={Boolean(selectedTag || query.length)}
        onClearFilters={handleClearQuery}
      />
    ),
    [
      collections,
      error,
      handleClearQuery,
      handleQuickFilter,
      handleSearch,
      handleToggleTag,
      navigation,
      query,
      selectedTag,
      summary,
    ],
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
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => reload({ refreshing: true })} tintColor={colors.primaryStrong} />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={headerComponent}
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
    gap: spacing.lg,
  },
  headerContainer: {
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  heroSection: {
    position: 'relative',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    bottom: '45%',
  },
  heroHeaderRow: {
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${colors.primaryStrong}33`,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  searchSurface: {
    borderRadius: radius.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    paddingVertical: spacing.sm,
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
    shadowColor: 'transparent',
  },
  quickChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  quickChipIcon: {
    marginRight: 6,
  },
  quickChipText: {
    fontWeight: '600',
    color: colors.muted,
  },
  quickChipTextActive: {
    color: '#fff',
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
    backgroundColor: colors.overlay,
  },
  vibePillActive: {
    backgroundColor: colors.primaryStrong,
  },
  vibePillText: {
    fontWeight: '600',
    color: colors.text,
  },
  vibePillTextActive: {
    color: '#fff',
  },
  bannerSpacing: {
    marginTop: spacing.md,
  },
  clearFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    marginTop: spacing.sm,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryStrong,
    textTransform: 'uppercase',
  },
  collectionBlock: {
    gap: spacing.sm,
  },
  collectionScroll: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  collectionCard: {
    width: 220,
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.card,
  },
  collectionImage: {
    width: '100%',
    height: '100%',
  },
  collectionOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  collectionCopy: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: 6,
  },
  collectionCardTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#fff',
  },
  collectionCardMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  collectionCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  collectionCTAText: {
    fontSize: 13,
    fontWeight: '600',
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

type HomeListHeaderProps = {
  summary: { count: number; neighborhoods: string; cuisines: string };
  query: string;
  onChangeQuery: (value: string) => void;
  onSubmitSearch: () => void;
  onClearQuery: () => void;
  onQuickFilter: (value: string) => void;
  selectedTag: string | null;
  onToggleTag: (value: string) => void;
  error: string | null;
  collections: Array<{
    key: string;
    title: string;
    subtitle: string;
    data: RestaurantSummary[];
  }>;
  onPressProfile: () => void;
  onPressRestaurant: (id: string, name: string) => void;
  showClearFilters: boolean;
  onClearFilters: () => void;
};

function HomeListHeader({
  summary,
  query,
  onChangeQuery,
  onSubmitSearch,
  onClearQuery,
  onQuickFilter,
  selectedTag,
  onToggleTag,
  error,
  collections,
  onPressProfile,
  onPressRestaurant,
  showClearFilters,
  onClearFilters,
}: HomeListHeaderProps) {
  const lowerQuery = query.toLowerCase();
  const selectedTagDisplay = selectedTag
    ? vibeFilters.find((tag) => tag.value === selectedTag)?.label ?? selectedTag
    : null;

  return (
    <View style={styles.headerContainer}>
      <View style={styles.heroSection}>
        <LinearGradient
          colors={['transparent', `${colors.accent}26`]}
          style={styles.heroGradient}
          pointerEvents="none"
        />
        <View style={styles.heroHeaderRow}>
          <View>
            <Text style={styles.locationLabel}>Dining in</Text>
            <Text style={styles.locationValue}>Baku, Azerbaijan</Text>
          </View>
          <Pressable style={styles.avatar} onPress={onPressProfile}>
            <Text style={styles.avatarText}>AZ</Text>
          </Pressable>
        </View>

        <Surface tone="muted" padding="sm" elevated={false} style={styles.searchSurface}>
          <View style={styles.searchRow}>
            <Feather name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              placeholder="Search name, cuisine, or neighbourhood"
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              onChangeText={onChangeQuery}
              onSubmitEditing={onSubmitSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable style={styles.clearButton} onPress={onClearQuery}>
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </Surface>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {quickFilters.map((item) => {
            const active = lowerQuery === item.query.toLowerCase();
            const icon = (
              item.label === 'Tonight'
                ? 'sunset'
                : item.label === 'Brunch'
                ? 'coffee'
                : item.label === 'Live music'
                ? 'music'
                : 'wind'
            ) as keyof typeof Feather.glyphMap;
            return (
              <Pressable
                key={item.query}
                onPress={() => onQuickFilter(item.query)}
                style={[styles.quickChip, active && styles.quickChipActive]}
              >
                <Feather
                  name={icon}
                  size={14}
                  color={active ? '#fff' : colors.muted}
                  style={styles.quickChipIcon}
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
                onPress={() => onToggleTag(item.value)}
                style={[styles.vibePill, active && styles.vibePillActive]}
              >
                <Text style={[styles.vibePillText, active && styles.vibePillTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {selectedTag ? (
        <InfoBanner
          style={styles.bannerSpacing}
          icon="filter"
          title={`Curated for ${selectedTagDisplay}`}
          message="Tap clear filters or pull to refresh to browse all venues."
        />
      ) : null}

      {error ? (
        <InfoBanner
          tone="warning"
          icon="alert-triangle"
          title="We hit a snag fetching restaurants"
          message={error}
          style={styles.bannerSpacing}
        />
      ) : null}

      {showClearFilters ? (
        <Pressable style={styles.clearFiltersRow} onPress={onClearFilters}>
          <Feather name="refresh-ccw" size={14} color={colors.primaryStrong} />
          <Text style={styles.clearFiltersText}>Clear filters</Text>
        </Pressable>
      ) : null}

      {collections.map((section) => (
        <View key={section.key} style={styles.collectionBlock}>
          <SectionHeading title={section.title} subtitle={section.subtitle} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.collectionScroll}
          >
            {section.data.map((item) => (
              <Pressable
                key={item.id}
                style={styles.collectionCard}
                onPress={() => onPressRestaurant(item.id, item.name)}
              >
                <Image source={{ uri: resolvePhoto(item) }} style={styles.collectionImage} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.collectionOverlay} />
                <View style={styles.collectionCopy}>
                  <Text style={styles.collectionCardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.collectionCardMeta} numberOfLines={1}>
                    {(item.cuisine ?? []).slice(0, 2).join(' • ') || item.price_level || item.city || 'Reserve now'}
                  </Text>
                  <View style={styles.collectionCTA}>
                    <Text style={styles.collectionCTAText}>View tables</Text>
                    <Feather name="arrow-up-right" size={14} color="#fff" />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}
