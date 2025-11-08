import React, { useCallback, useMemo, useState } from 'react';
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
import * as Location from 'expo-location';

import {
  confirmArrivalEta,
  decideArrivalIntent,
  fetchReservationsList,
  requestArrivalIntent,
  sendArrivalLocation,
  type Reservation,
} from '../api';
import { colors, radius, spacing } from '../config/theme';
import Surface from '../components/Surface';
import SectionHeading from '../components/SectionHeading';
import InfoBanner from '../components/InfoBanner';
import { useRestaurants } from '../hooks/useRestaurants';
import { useFocusEffect } from '@react-navigation/native';
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

  useFocusEffect(
    useCallback(() => {
      void load();
      // No cleanup necessary; we simply reload whenever screen regains focus.
      return undefined;
    }, [load]),
  );

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
        {start >= now ? (
          <ArrivalPrepControls reservation={item} onUpdated={load} />
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

const LEAD_MINUTES = [5, 10, 15, 20, 30];
const SCOPE_OPTIONS: Array<{ key: 'starters' | 'mains' | 'full'; label: string }> = [
  { key: 'starters', label: 'Starters ready' },
  { key: 'mains', label: 'Mains ready' },
  { key: 'full', label: 'Entire meal' },
];

type PrepProps = {
  reservation: Reservation;
  onUpdated: (opts?: { refreshing?: boolean }) => Promise<void> | void;
};

function ArrivalPrepControls({ reservation, onUpdated }: PrepProps) {
  const [leadMinutes, setLeadMinutes] = useState(10);
  const [scope, setScope] = useState<'starters' | 'mains' | 'full'>('full');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const [confirmingEta, setConfirmingEta] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [expanded, setExpanded] = useState(reservation.arrival_intent?.status !== 'idle');

  const status = reservation.arrival_intent?.status ?? 'idle';
  const depositMinor = reservation.arrival_intent?.deposit_amount ?? null;
  const depositCurrency = reservation.arrival_intent?.deposit_currency ?? 'AZN';
  const depositLabel =
    depositMinor != null ? `${depositCurrency} ${(depositMinor / 100).toFixed(2)}` : null;
  const predictedEta = reservation.arrival_intent?.predicted_eta_minutes ?? null;
  const confirmedEta = reservation.arrival_intent?.confirmed_eta_minutes ?? null;

  const disableSend = submitting || ['requested', 'queued'].includes(status as any);

  const runRefresh = async () => {
    if (onUpdated) {
      await onUpdated({ refreshing: true });
    }
  };

  if (!expanded) {
    return (
      <Pressable style={styles.prepSummary} onPress={() => setExpanded(true)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.prepTitle}>Pre-fire meal</Text>
          <Text style={styles.prepSubtitle}>
            {status === 'idle'
              ? 'Let the kitchen know when you are on the way.'
              : `Status: ${status}${predictedEta ? ` • ETA ${predictedEta}m` : ''}`}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.primaryStrong} />
      </Pressable>
    );
  }

  const handleSend = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await requestArrivalIntent(reservation.id, {
        lead_minutes: leadMinutes,
        prep_scope: scope,
        share_location: false,
        eta_source: 'user',
        auto_charge: true,
      });
      await runRefresh();
    } catch (err: any) {
      setError(err.message || 'Could not notify the restaurant');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLocationPing = async () => {
    try {
      setLocationState('pending');
      setError(null);
      const { status: perms } = await Location.requestForegroundPermissionsAsync();
      if (perms !== 'granted') {
        setLocationState('denied');
        setError('Location permission denied');
        return;
      }
      const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocationState('granted');
      await sendArrivalLocation(reservation.id, {
        latitude: coords.coords.latitude,
        longitude: coords.coords.longitude,
      });
      await runRefresh();
    } catch (err: any) {
      setLocationState('idle');
      setError(err.message || 'Failed to share location');
    }
  };

  const handleEtaConfirm = async () => {
    try {
      setConfirmingEta(true);
      setError(null);
      const etaValue = predictedEta ?? leadMinutes;
      await confirmArrivalEta(reservation.id, { eta_minutes: etaValue });
      await runRefresh();
    } catch (err: any) {
      setError(err.message || 'Unable to confirm ETA');
    } finally {
      setConfirmingEta(false);
    }
  };

  const handleCancel = async () => {
    try {
      setCanceling(true);
      setError(null);
      await decideArrivalIntent(reservation.id, { action: 'cancel' });
      await runRefresh();
    } catch (err: any) {
      setError(err.message || 'Unable to cancel prep request');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <View style={styles.prepContainer}>
      <Text style={styles.prepTitle}>Have the kitchen pre-fire your meal</Text>
      <Text style={styles.prepSubtitle}>Let them know how close you are so courses arrive faster.</Text>
      <View style={styles.prepRow}>
        {LEAD_MINUTES.map((option) => (
          <Pressable
            key={option}
            style={[styles.chip, leadMinutes === option && styles.chipSelected]}
            onPress={() => setLeadMinutes(option)}
          >
            <Text style={[styles.chipText, leadMinutes === option && styles.chipTextSelected]}>
              {option}m
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.prepRow}>
        {SCOPE_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            style={[styles.scopeChip, scope === option.key && styles.scopeChipSelected]}
            onPress={() => setScope(option.key)}
          >
            <Text style={[styles.scopeChipText, scope === option.key && styles.scopeChipTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {depositLabel ? <Text style={styles.depositLabel}>Deposit hold: {depositLabel}</Text> : null}
      {status !== 'idle' ? <Text style={styles.prepStatus}>Prep status: {status}</Text> : null}
      {predictedEta ? (
        <Text style={styles.prepStatus}>AI ETA: {predictedEta} min</Text>
      ) : null}
      {confirmedEta ? (
        <Text style={styles.prepStatus}>Confirmed ETA: {confirmedEta} min</Text>
      ) : null}
      {error ? <Text style={styles.prepError}>{error}</Text> : null}
      <View style={styles.prepButtonRow}>
        <Pressable
          style={[styles.secondaryButton, locationState === 'pending' && styles.secondaryButtonDisabled]}
          onPress={handleLocationPing}
          disabled={locationState === 'pending'}
        >
          <Text style={styles.secondaryButtonText}>
            {locationState === 'pending' ? 'Sharing…' : 'Share location (15m)'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, confirmingEta && styles.secondaryButtonDisabled]}
          onPress={handleEtaConfirm}
          disabled={confirmingEta}
        >
          <Text style={styles.secondaryButtonText}>
            {confirmingEta ? 'Confirming…' : 'Confirm ETA'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, canceling && styles.secondaryButtonDisabled]}
          onPress={handleCancel}
          disabled={canceling}
        >
          <Text style={styles.secondaryButtonText}>{canceling ? 'Cancelling…' : 'Cancel'}</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.sendButton, disableSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={disableSend}
      >
        <Text style={styles.sendButtonText}>{submitting ? 'Sending…' : 'Notify kitchen'}</Text>
      </Pressable>
      <Pressable style={styles.collapseButton} onPress={() => setExpanded(false)}>
        <Text style={styles.collapseText}>Hide prep controls</Text>
      </Pressable>
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
  prepContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  prepTitle: {
    fontWeight: '600',
    color: colors.text,
  },
  prepSubtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  prepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  chipText: {
    color: colors.text,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#fff',
  },
  scopeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexGrow: 1,
  },
  scopeChipSelected: {
    backgroundColor: `${colors.primaryStrong}11`,
    borderColor: colors.primaryStrong,
  },
  scopeChipText: {
    textAlign: 'center',
    color: colors.text,
    fontWeight: '500',
  },
  scopeChipTextSelected: {
    color: colors.primaryStrong,
  },
  depositLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  prepStatus: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  prepError: {
    color: colors.danger,
    fontSize: 12,
  },
  prepSummary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  prepButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  secondaryButton: {
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  collapseButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  collapseText: {
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
