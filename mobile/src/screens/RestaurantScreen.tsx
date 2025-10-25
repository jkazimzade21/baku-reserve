import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRestaurant, RestaurantDetail } from '../api';
import SeatMap from '../components/SeatMap';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Restaurant'>;

export default function RestaurantScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [data, setData] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetchRestaurant(id);
        if (!mounted) return;
        setData(r);
        navigation.setOptions({ title: r.name || 'Restaurant' });
      } catch (err: any) {
        Alert.alert('Could not load', err.message || 'Restaurant unavailable');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigation]);

  const stats = useMemo(() => {
    const areas = data?.areas ?? [];
    const totalTables = areas.reduce((acc, area) => acc + (area.tables?.length ?? 0), 0);
    const totalSeats = areas.reduce(
      (acc, area) => acc + area.tables.reduce((sum, table) => sum + (table.capacity ?? 0), 0),
      0,
    );
    return {
      totalAreas: areas.length,
      totalTables,
      totalSeats,
    };
  }, [data]);

  const seatPreviewArea = useMemo(() => {
    if (!data?.areas) return null;
    return (
      data.areas.find((area) => area.tables.some((table) => table.position && table.position.length === 2)) ?? null
    );
  }, [data]);

  const formattedTags = useMemo(() => {
    return data?.tags?.map((tag) => formatTag(tag)) ?? [];
  }, [data]);

  const handleBook = () => {
    if (!data) return;
    navigation.navigate('Book', { id: data.id, name: data.name });
  };

  const handleShare = () => {
    if (!data) return;
    Share.share({
      title: data.name,
      message: `Let's meet at ${data.name}! Tap to view availability: ${data.address ?? 'No address on file.'}`,
    });
  };

  const handleCall = () => {
    if (!data?.phone) {
      Alert.alert('No phone available', 'This restaurant does not have a phone number listed.');
      return;
    }
    Linking.openURL(`tel:${data.phone.replace(/\s+/g, '')}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryStrong} />
        <Text style={styles.loadingText}>Fetching restaurant details…</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>Restaurant unavailable</Text>
        <Text style={styles.errorSubtitle}>Double-check the link and try again.</Text>
      </SafeAreaView>
    );
  }

  const heroPhoto = data.photos?.[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.heroFallbackText}>{data.name.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{data.name}</Text>
            <Text style={styles.heroSubtitle}>{data.cuisine?.join(' • ')}</Text>
            {data.short_description ? (
              <Text style={styles.heroDescription}>{data.short_description}</Text>
            ) : null}
            <View style={styles.heroMetaRow}>
              {data.neighborhood ? <Text style={styles.heroMeta}>{data.neighborhood}</Text> : null}
              {data.price_level ? (
                <Text style={[styles.heroMeta, styles.heroMetaDivider]}>• {data.price_level}</Text>
              ) : null}
            </View>
            {data.address ? <Text style={styles.heroMeta}>{data.address}</Text> : null}
            {data.phone ? <Text style={styles.heroMeta}>Call {data.phone}</Text> : null}
            {formattedTags.length ? (
              <View style={styles.heroTagRow}>
                {formattedTags.map((tag) => (
                  <Text key={tag} style={styles.heroTag}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
          <View style={styles.heroActions}>
            <Pressable style={styles.primaryAction} onPress={handleBook}>
              <Text style={styles.primaryActionText}>See availability</Text>
            </Pressable>
            <View style={styles.secondaryActions}>
              <Pressable style={styles.secondaryAction} onPress={handleShare}>
                <Text style={styles.secondaryActionText}>Share</Text>
              </Pressable>
              <Pressable style={styles.secondaryAction} onPress={handleCall}>
                <Text style={styles.secondaryActionText}>Call</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {(data.deposit_policy || (data.highlights?.length ?? 0) > 0) ? (
          <View style={styles.infoCard}>
            {data.deposit_policy ? (
              <View style={styles.infoBlock}>
                <Text style={styles.sectionTitle}>Deposit policy</Text>
                <Text style={styles.infoText}>{data.deposit_policy}</Text>
              </View>
            ) : null}
            {data.highlights?.length ? (
              <View style={styles.infoBlock}>
                <Text style={styles.sectionTitle}>What to know</Text>
                {data.highlights.map((highlight) => (
                  <Text key={highlight} style={styles.highlightItem}>
                    • {highlight}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {seatPreviewArea ? (
          <View style={styles.mapCard}>
            <Text style={styles.sectionTitle}>Seat preview — {seatPreviewArea.name}</Text>
            <SeatMap area={seatPreviewArea} />
            {data.map_images?.length ? (
              <Image source={{ uri: data.map_images[0] }} style={styles.mapPreview} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Service overview</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Areas</Text>
              <Text style={styles.statValue}>{stats.totalAreas}</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Tables</Text>
              <Text style={styles.statValue}>{stats.totalTables}</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Total seats</Text>
              <Text style={styles.statValue}>{stats.totalSeats}</Text>
            </View>
          </View>
        </View>

        {data.areas?.length ? (
          <View style={styles.areaCard}>
            <Text style={styles.sectionTitle}>Areas & tables</Text>
            {data.areas.map((area) => (
              <View key={area.id} style={styles.areaRow}>
                <View style={styles.areaHeader}>
                  <Text style={styles.areaName}>{area.name}</Text>
                  <Text style={styles.areaMeta}>{area.tables.length} tables</Text>
                </View>
                {area.tables.map((table) => (
                  <View key={table.id} style={styles.tableRow}>
                    <Text style={styles.tableName}>{table.name}</Text>
                    <Text style={styles.tableMeta}>Seats {table.capacity}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  errorSubtitle: {
    color: colors.muted,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
    ...shadow.card,
  },
  heroImage: {
    width: '100%',
    height: 220,
  },
  heroFallback: {
    width: '100%',
    height: 220,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '700',
  },
  heroBody: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  heroSubtitle: {
    color: colors.muted,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  heroDescription: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  heroMeta: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  heroMetaDivider: {
    marginTop: spacing.xs,
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  heroTag: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
    backgroundColor: 'rgba(14,165,233,0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.lg,
  },
  heroActions: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  primaryAction: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  secondaryActionText: {
    color: colors.text,
    fontWeight: '500',
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.md,
    ...shadow.card,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    ...shadow.card,
  },
  infoBlock: {
    gap: spacing.xs,
  },
  infoText: {
    color: colors.text,
    lineHeight: 20,
  },
  highlightItem: {
    color: colors.muted,
    lineHeight: 20,
  },
  mapCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    ...shadow.card,
  },
  mapPreview: {
    width: '100%',
    height: 140,
    borderRadius: radius.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  statBlock: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.12)',
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  statLabel: {
    textTransform: 'uppercase',
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
  },
  statValue: {
    marginTop: spacing.xs,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  areaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.md,
  },
  areaRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  areaName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  areaMeta: {
    color: colors.muted,
    fontWeight: '500',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  tableName: {
    color: colors.text,
    fontWeight: '500',
  },
  tableMeta: {
    color: colors.muted,
  },
});

function formatTag(tag: string) {
  return tag
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
