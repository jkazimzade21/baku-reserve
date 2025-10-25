import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRestaurant, RestaurantDetail } from '../api';
import SeatMap from '../components/SeatMap';
import PhotoCarousel from '../components/PhotoCarousel';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Restaurant'>;
type ActionItem = { key: string; label: string; onPress: () => void };

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

  const handleWhatsapp = () => {
    const raw = data?.whatsapp?.replace(/\D+/g, '');
    if (!raw) {
      Alert.alert('No WhatsApp number', 'This venue has not shared a WhatsApp contact yet.');
      return;
    }
    const url = `https://wa.me/${raw}`;
    Linking.openURL(url).catch(() => Alert.alert('Unable to open WhatsApp'));
  };

  const handleInstagram = () => {
    if (!data?.instagram) {
      Alert.alert('Instagram unavailable', 'This venue has not shared an Instagram profile yet.');
      return;
    }
    Linking.openURL(data.instagram).catch(() => Alert.alert('Unable to open Instagram link.'));
  };

  const handleMenu = () => {
    if (!data?.menu_url) {
      Alert.alert('Menu unavailable', 'This venue has not published its menu yet.');
      return;
    }
    Linking.openURL(data.menu_url).catch(() => Alert.alert('Unable to open menu link.'));
  };

  const handleDirections = () => {
    if (data?.latitude && data?.longitude) {
      const { latitude, longitude } = data;
      const encodedLabel = encodeURIComponent(data.name);
      const url = Platform.select({
        ios: `maps://?q=${encodedLabel}&ll=${latitude},${longitude}`,
        android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`,
        default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      });
      Linking.openURL(url ?? '').catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    if (data?.address) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}`;
      Linking.openURL(url).catch(() => Alert.alert('Unable to open maps.'));
      return;
    }
    Alert.alert('No address provided', 'This venue has not shared a map location yet.');
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

  const photoSet = data.photos && data.photos.length > 0 ? data.photos : data.cover_photo ? [data.cover_photo] : [];

  const quickActionItems = [
    (data.latitude && data.longitude) || data.address
      ? { key: 'directions', label: 'Directions', onPress: handleDirections }
      : null,
    data.phone ? { key: 'call', label: 'Call', onPress: handleCall } : null,
    data.whatsapp ? { key: 'whatsapp', label: 'WhatsApp', onPress: handleWhatsapp } : null,
    data.instagram ? { key: 'instagram', label: 'Instagram', onPress: handleInstagram } : null,
  ].filter(Boolean) as ActionItem[];

  const secondaryActionItems = [
    { key: 'share', label: 'Share', onPress: handleShare },
    data.menu_url ? { key: 'menu', label: 'Menu', onPress: handleMenu } : null,
  ].filter(Boolean) as ActionItem[];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <PhotoCarousel photos={photoSet} />
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
              {data.average_spend ? (
                <Text style={[styles.heroMeta, styles.heroMetaDivider]}>• {data.average_spend}</Text>
              ) : null}
            </View>
            {data.address ? <Text style={styles.heroMeta}>{data.address}</Text> : null}
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
            {quickActionItems.length ? (
              <View style={styles.quickActions}>
                {quickActionItems.map((action) => (
                  <Pressable key={action.key} style={styles.quickAction} onPress={action.onPress}>
                    <Text style={styles.quickActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {secondaryActionItems.length ? (
              <View style={styles.secondaryActions}>
                {secondaryActionItems.map((action) => (
                  <Pressable key={action.key} style={styles.secondaryAction} onPress={action.onPress}>
                    <Text style={styles.secondaryActionText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {data.deposit_policy ? <Text style={styles.depositNote}>{data.deposit_policy}</Text> : null}
          </View>
        </View>

        {(data.highlights?.length ?? 0) > 0 ? (
          <View style={styles.infoCard}>
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

        {data.experiences?.length ? (
          <View style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Signature experiences</Text>
            {data.experiences.map((exp) => (
              <Text key={exp} style={styles.highlightItem}>
                • {exp}
              </Text>
            ))}
          </View>
        ) : null}

        {seatPreviewArea ? (
          <View style={styles.mapCard}>
            <Text style={styles.sectionTitle}>Seat preview — {seatPreviewArea.name}</Text>
            <SeatMap area={seatPreviewArea} showLegend={false} showStatus={false} />
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
    borderColor: 'rgba(110, 94, 76, 0.2)',
    overflow: 'hidden',
    ...shadow.card,
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
    color: colors.text,
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
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
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickAction: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(231, 169, 119, 0.16)',
    alignItems: 'center',
  },
  quickActionText: {
    color: colors.text,
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
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
  },
  secondaryActionText: {
    color: colors.text,
    fontWeight: '500',
  },
  depositNote: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.text,
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.2)',
    gap: spacing.md,
    ...shadow.card,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.2)',
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
    borderColor: 'rgba(110, 94, 76, 0.2)',
    ...shadow.card,
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
    backgroundColor: 'rgba(231, 169, 119, 0.14)',
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
    borderColor: 'rgba(110, 94, 76, 0.2)',
    gap: spacing.md,
  },
  areaRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.16)',
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
