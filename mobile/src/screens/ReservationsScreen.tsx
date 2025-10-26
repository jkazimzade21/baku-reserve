import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import { fetchReservationsList, type Reservation } from '../api';
import { colors, radius, spacing } from '../config/theme';
import Surface from '../components/Surface';
import SectionHeading from '../components/SectionHeading';
import InfoBanner from '../components/InfoBanner';
import { useRestaurants } from '../hooks/useRestaurants';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Reservations'>,
  NativeStackScreenProps<RootStackParamList>
>;

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

export default function ReservationsScreen({ navigation }: Props) {
  const { restaurants } = useRestaurants();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restaurantLookup = useMemo(() => {
    const map = new Map<string, string>();
    restaurants.forEach((restaurant) => {
      map.set(restaurant.id, restaurant.name);
    });
    return map;
  }, [restaurants]);

  const load = useCallback(async (opts?: { refreshing?: boolean }) => {
    try {
      if (opts?.refreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await fetchReservationsList();
      setReservations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load reservations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const upcoming = useMemo(
    () =>
      reservations
        .filter((reservation) => new Date(reservation.start) >= now)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [reservations, now],
  );
  const past = useMemo(
    () =>
      reservations
        .filter((reservation) => new Date(reservation.start) < now)
        .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()),
    [reservations, now],
  );

  const sections = useMemo(() => {
    const entries: Array<{ title: string; data: Reservation[] }> = [];
    if (upcoming.length) {
      entries.push({ title: 'Upcoming', data: upcoming });
    }
    if (past.length) {
      entries.push({ title: 'Past reservations', data: past });
    }
    return entries;
  }, [upcoming, past]);

  const renderReservationCard = ({ item }: { item: Reservation }) => {
    const restaurantName = restaurantLookup.get(item.restaurant_id) ?? 'Restaurant';
    const start = new Date(item.start);
    const end = new Date(item.end);
    const schedule = `${dayFormatter.format(start)} • ${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;

    return (
      <Surface tone="overlay" padding="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{restaurantName}</Text>
          <StatusPill status={item.status} />
        </View>
        <Text style={styles.cardMeta}>{schedule}</Text>
        <Text style={styles.cardMeta}>Party of {item.party_size}</Text>
        {item.guest_name ? (
          <Text style={styles.cardGuest}>Booked under {item.guest_name}</Text>
        ) : null}
        <View style={styles.cardActions}>
          <Pressable
            style={[styles.cardButton, styles.cardButtonPrimary]}
            onPress={() =>
              navigation.navigate('Book', {
                id: item.restaurant_id,
                name: restaurantName,
                guestName: item.guest_name ?? undefined,
                guestPhone: item.guest_phone ?? undefined,
              })
            }
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.cardButtonPrimaryText}>Rebook</Text>
          </Pressable>
          <Pressable
            style={styles.cardButton}
            onPress={() => navigation.navigate('Restaurant', { id: item.restaurant_id, name: restaurantName })}
          >
            <Feather name="info" size={14} color={colors.primaryStrong} />
            <Text style={styles.cardButtonText}>Details</Text>
          </Pressable>
        </View>
      </Surface>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primaryStrong} />
          <Text style={styles.loadingText}>Checking your tables…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderReservationCard}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ refreshing: true })}
            tintColor={colors.primaryStrong}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <SectionHeading
              title="Your reservations"
              subtitle="Manage upcoming tables, track deposits, and relive past nights out."
            />
            {error ? (
              <InfoBanner
                tone="warning"
                icon="alert-triangle"
                title="We couldn’t refresh reservations"
                message={error}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>Nothing booked yet</Text>
            <Text style={styles.emptySubtitle}>
              Reserve a table and it will appear here with live updates and reminders.
            </Text>
            <Pressable
              style={[styles.cardButton, styles.cardButtonPrimary]}
              onPress={() => navigation.navigate('Discover')}
            >
              <Feather name="search" size={14} color="#fff" />
              <Text style={styles.cardButtonPrimaryText}>Find restaurants</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

type StatusProps = {
  status: Reservation['status'];
};

function StatusPill({ status }: StatusProps) {
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const background =
    status === 'booked'
      ? 'rgba(34,197,94,0.12)'
      : status === 'cancelled'
      ? 'rgba(239,68,68,0.12)'
      : 'rgba(231, 169, 119, 0.18)';
  const color =
    status === 'booked'
      ? '#16a34a'
      : status === 'cancelled'
      ? '#dc2626'
      : colors.primary;
  return (
    <View style={[styles.statusPill, { backgroundColor: background }]}>
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
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
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  card: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  cardGuest: {
    color: colors.muted,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardButtonPrimary: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  cardButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  cardButtonPrimaryText: {
    fontWeight: '600',
    color: '#fff',
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
