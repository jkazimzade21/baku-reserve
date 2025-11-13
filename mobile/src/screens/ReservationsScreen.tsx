import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';

import {
  confirmArrivalEta,
  decideArrivalIntent,
  fetchFeatureFlags,
  fetchReservationsList,
  requestArrivalIntent,
  sendArrivalLocation,
  type ArrivalLocationSuggestion,
  type FeatureFlags,
  type Reservation,
} from '../api';
import { colors, radius, spacing } from '../config/theme';
import Surface from '../components/Surface';
import SectionHeading from '../components/SectionHeading';
import InfoBanner from '../components/InfoBanner';
import ArrivalInsightCard from '../components/ArrivalInsightCard';
import { useArrivalSuggestions } from '../hooks/useArrivalSuggestions';
import { useRestaurants } from '../hooks/useRestaurants';
import { useAuth } from '../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../types/navigation';
import { isWithinAzerbaijan } from '../utils/location';

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

const PRESET_LOCATIONS: ArrivalLocationSuggestion[] = [
  {
    id: 'preset-koala',
    name: 'Koala Park, Baku',
    address: 'Central Baku',
    latitude: 40.4021,
    longitude: 49.8431,
  },
  {
    id: 'preset-icherisheher',
    name: 'Icherisheher',
    address: 'Old City',
    latitude: 40.3666,
    longitude: 49.8352,
  },
  {
    id: 'preset-port-baku',
    name: 'Port Baku Mall',
    address: 'Shopping district',
    latitude: 40.3722,
    longitude: 49.8553,
  },
  {
    id: 'preset-flame-towers',
    name: 'Flame Towers',
    address: 'Flame Towers complex',
    latitude: 40.3595,
    longitude: 49.8274,
  },
  {
    id: 'preset-deniz-mall',
    name: 'Deniz Mall',
    address: 'Seaside promenade',
    latitude: 40.3694,
    longitude: 49.8408,
  },
];

const normalizeError = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  return value.toLowerCase().includes('setmanualerror') ? fallback : value;
};

const formatSuggestionMeta = (suggestion: ArrivalLocationSuggestion) => {
  const parts: string[] = [];
  if (suggestion.address) {
    parts.push(suggestion.address);
  }
  if (typeof suggestion.distance_km === 'number') {
    parts.push(`${suggestion.distance_km.toFixed(1)} km`);
  }
  if (typeof suggestion.eta_minutes === 'number') {
    parts.push(`${suggestion.eta_minutes} min`);
  }
  return parts.join(' • ');
};

export default function ReservationsScreen({ navigation }: Props) {
  const { restaurants } = useRestaurants();
  const { isAuthenticated } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [manualLocationVisible, setManualLocationVisible] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualReservationId, setManualReservationId] = useState<string | null>(null);
  const [manualHelper, setManualHelper] = useState<string | null>(null);

  const manualSuggestionsEnabled = manualLocationVisible && Boolean(manualReservationId);
  const {
    suggestions: manualSuggestions,
    loading: manualSuggestionsLoading,
    error: manualSuggestionsError,
    isStale: manualSuggestionsStale,
    hasFetched: manualSuggestionsFetched,
    reset: resetManualSuggestions,
    cancel: cancelManualSuggestions,
  } = useArrivalSuggestions(manualSuggestionsEnabled ? manualReservationId : null, manualQuery, {
    limit: 6,
    enabled: manualSuggestionsEnabled,
  });

  const manualQueryTrimmed = manualQuery.trim();
  const showLiveSuggestions = manualSuggestions.length > 0 && !manualSuggestionsStale;
  const manualList = showLiveSuggestions ? manualSuggestions : PRESET_LOCATIONS;

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
    let active = true;
    async function hydrateFeatures() {
      try {
        const flags = await fetchFeatureFlags();
        if (!active) return;
        setFeatureFlags(flags);
        setFeatureError(null);
      } catch (err: any) {
        if (!active) return;
        setFeatureFlags(null);
        setFeatureError(err?.message || 'Feature flags unavailable');
      }
    }
    hydrateFeatures().catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // No cleanup necessary; we simply reload whenever screen regains focus.
      return undefined;
    }, [load]),
  );

  const now = new Date();
  const triggerManualPicker = useCallback(
    (reservationId: string, message?: string) => {
      resetManualSuggestions();
      setManualReservationId(reservationId);
      setManualError(message ?? null);
      setManualHelper(message ?? 'Search updates after each character.');
      setManualQuery('');
      setManualLocationVisible(true);
    },
    [resetManualSuggestions],
  );

  const handleManualSelection = useCallback(
    async (loc: ArrivalLocationSuggestion) => {
      if (!manualReservationId) {
        setManualError('Select a reservation before sharing your location.');
        return;
      }
      try {
        setManualError(null);
        setManualLocationVisible(false);
        setManualReservationId(null);
        setManualHelper(`Using ${loc.name}`);
        await sendArrivalLocation(manualReservationId, {
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
        await load({ refreshing: true });
      } catch (err: any) {
        setManualError(normalizeError(err?.message, 'Unable to use that location'));
      }
    },
    [manualReservationId, load],
  );
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
    const showPrepFlow = Boolean(
      featureFlags?.prep_notify_enabled && item.status === 'booked' && start >= now,
    );

    return (
      <Surface tone="overlay" padding="md" style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{restaurantName}</Text>
          <View style={styles.cardHeaderBadges}>
            <StatusPill status={item.status} />
            {item.prep_status ? <PrepStatusBadge status={item.prep_status} /> : null}
          </View>
        </View>
        <Text style={styles.cardMeta}>{schedule}</Text>
        <Text style={styles.cardMeta}>Party of {item.party_size}</Text>
        {item.guest_name ? (
          <Text style={styles.cardGuest}>Booked under {item.guest_name}</Text>
        ) : null}
        {showPrepFlow ? (
          <Pressable
            style={styles.prepCtaButton}
            onPress={() =>
              navigation.navigate('PrepNotify', {
                reservation: item,
                restaurantName,
                features: featureFlags,
              })
            }
          >
            <Text style={styles.prepCtaText}>On My Way (Prep Food)</Text>
          </Pressable>
        ) : null}
        {start >= now ? (
          <ArrivalPrepControls
            reservation={item}
            onUpdated={load}
            onManualRequest={(message) => triggerManualPicker(item.id, message)}
          />
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

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.authGate}>
          <Feather name="lock" size={32} color={colors.primaryStrong} />
          <Text style={styles.authGateTitle}>Sign in to manage reservations</Text>
          <Text style={styles.authGateSubtitle}>
            Browse restaurants anytime. To view or manage bookings, please sign in first.
          </Text>
          <Pressable style={styles.authGateButton} onPress={() => navigation.navigate('Auth')}>
            <Text style={styles.authGateButtonText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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
              subtitle="Manage upcoming tables and relive past nights out."
            />
            {error ? (
              <InfoBanner
                tone="warning"
                icon="alert-triangle"
                title="We couldn’t refresh reservations"
                message={error}
              />
            ) : null}
            {featureError ? (
              <InfoBanner
                tone="warning"
                icon="alert-triangle"
                title="Feature flags unavailable"
                message={featureError}
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
      <Modal visible={manualLocationVisible} transparent animationType="slide">
        <View style={styles.manualModalBackdrop}>
          <View style={styles.manualModalCard}>
            <Text style={styles.manualTitle}>Choose a nearby point</Text>
            <Text style={styles.manualSubtitle}>
              We couldn’t use GPS. Start typing any landmark—GoMap will suggest matches as you type.
            </Text>
            {manualHelper ? <Text style={styles.manualHelper}>{manualHelper}</Text> : null}
            {manualSuggestionsEnabled && manualQueryTrimmed.length > 0 && (manualSuggestionsLoading || manualSuggestionsStale) ? (
              <Text style={styles.manualHelper}>Searching GoMap…</Text>
            ) : null}
            <TextInput
              placeholder="Search Koala Park, Icherisheher…"
              style={styles.manualInput}
              value={manualQuery}
              onChangeText={setManualQuery}
            />
            {manualSuggestionsLoading ? (
              <ActivityIndicator style={styles.manualLoading} color={colors.primaryStrong} />
            ) : null}
            {manualSuggestionsError ? (
              <Text style={styles.manualError}>{manualSuggestionsError}</Text>
            ) : null}
            {manualError ? <Text style={styles.manualError}>{manualError}</Text> : null}
            <View style={styles.manualList}>
              {manualList.map((loc) => {
                const meta = formatSuggestionMeta(loc);
                return (
                  <Pressable key={loc.id} style={styles.manualRow} onPress={() => handleManualSelection(loc)}>
                    <Feather name="map-pin" size={16} color={colors.primaryStrong} />
                    <View style={styles.manualRowBody}>
                      <Text style={styles.manualRowTitle}>{loc.name}</Text>
                      {meta ? <Text style={styles.manualRowMeta}>{meta}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
            {manualSuggestionsFetched && !manualSuggestionsStale && manualSuggestions.length === 0 && manualQueryTrimmed.length > 0 ? (
              <Text style={styles.manualEmpty}>No GoMap matches yet. Try a different landmark.</Text>
            ) : null}
            <Pressable
              style={styles.manualClose}
              onPress={() => {
                cancelManualSuggestions();
                setManualLocationVisible(false);
                setManualReservationId(null);
                setManualError(null);
                setManualHelper(null);
                setManualQuery('');
              }}
            >
              <Text style={styles.manualCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

function PrepStatusBadge({ status }: { status: Reservation['prep_status'] }) {
  if (!status) return null;
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const colorMap: Record<NonNullable<Reservation['prep_status']>, string> = {
    pending: '#b45309',
    accepted: '#15803d',
    rejected: '#b91c1c',
  };
  const backgroundMap: Record<NonNullable<Reservation['prep_status']>, string> = {
    pending: 'rgba(234,179,8,0.18)',
    accepted: 'rgba(34,197,94,0.15)',
    rejected: 'rgba(239,68,68,0.15)',
  };
  return (
    <View style={[styles.prepBadge, { backgroundColor: backgroundMap[status] }]}>
      <Text style={[styles.prepBadgeText, { color: colorMap[status] }]}>Prep {statusLabel}</Text>
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
  onManualRequest?: (message?: string) => void;
};

function ArrivalPrepControls({ reservation, onUpdated, onManualRequest }: PrepProps) {
  const [leadMinutes, setLeadMinutes] = useState(10);
  const [scope, setScope] = useState<'starters' | 'mains' | 'full'>('full');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const [confirmingEta, setConfirmingEta] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [expanded, setExpanded] = useState(reservation.arrival_intent?.status !== 'idle');

  const status = reservation.arrival_intent?.status ?? 'idle';
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
      setError(normalizeError(err?.message, 'Could not notify the restaurant'));
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
        onManualRequest?.('Location permission denied');
        return;
      }
      const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = coords.coords;
      if (!isWithinAzerbaijan(latitude, longitude)) {
        setLocationState('idle');
        onManualRequest?.('Detected outside Azerbaijan. Pick a nearby point below.');
        return;
      }

      setLocationState('granted');
      await sendArrivalLocation(reservation.id, { latitude, longitude });
      await runRefresh();
    } catch (err: any) {
      setLocationState('idle');
      setError(normalizeError(err?.message, 'Failed to share location'));
      onManualRequest?.();
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
      setError(normalizeError(err?.message, 'Unable to confirm ETA'));
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
      setError(normalizeError(err?.message, 'Unable to cancel prep request'));
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
      {status !== 'idle' ? <Text style={styles.prepStatus}>Prep status: {status}</Text> : null}
      {predictedEta ? (
        <Text style={styles.prepStatus}>AI ETA: {predictedEta} min</Text>
      ) : null}
      {confirmedEta ? (
        <Text style={styles.prepStatus}>Confirmed ETA: {confirmedEta} min</Text>
      ) : null}
      <ArrivalInsightCard intent={reservation.arrival_intent} />
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
        <Pressable
          style={styles.secondaryButton}
          onPress={() => onManualRequest?.()}
        >
          <Text style={styles.secondaryButtonText}>Use manual location</Text>
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
  cardHeaderBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  prepCtaButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
  },
  prepCtaText: {
    color: '#fff',
    fontWeight: '600',
  },
  prepBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.lg,
  },
  prepBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
  manualModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  manualModalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  manualSubtitle: {
    color: colors.muted,
  },
  manualHelper: {
    color: colors.text,
    fontSize: 13,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  manualError: {
    color: colors.primaryStrong,
    fontSize: 12,
  },
  manualLoading: {
    marginVertical: spacing.xs,
  },
  manualList: {
    maxHeight: 200,
    gap: spacing.xs,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  manualRowBody: {
    flex: 1,
    gap: 2,
  },
  manualRowTitle: {
    color: colors.text,
    fontWeight: '600',
  },
  manualRowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  manualEmpty: {
    textAlign: 'center',
    color: colors.muted,
    paddingVertical: spacing.sm,
  },
  manualClose: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  manualCloseText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  authGateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  authGateSubtitle: {
    textAlign: 'center',
    color: colors.muted,
  },
  authGateButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  authGateButtonText: {
    color: '#fff',
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
