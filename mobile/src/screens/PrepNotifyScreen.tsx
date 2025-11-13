import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import {
  confirmPreorder,
  getPreorderQuote,
  sendArrivalLocation,
  type ArrivalLocationSuggestion,
  type PreorderQuoteResponse,
  type PreorderRequestPayload,
  type Reservation,
} from '../api';
import Surface from '../components/Surface';
import InfoBanner from '../components/InfoBanner';
import ArrivalInsightCard from '../components/ArrivalInsightCard';
import { colors, radius, spacing } from '../config/theme';
import type { RootStackParamList } from '../types/navigation';
import * as Location from 'expo-location';
import { isWithinAzerbaijan } from '../utils/location';
import { useArrivalSuggestions } from '../hooks/useArrivalSuggestions';

const ETA_CHOICES = [5, 10, 15];
const SCOPE_CHOICES: Array<{ key: PreorderRequestPayload['scope']; label: string }> = [
  { key: 'starters', label: 'Starters only' },
  { key: 'full', label: 'Full meal' },
];

const describeSuggestion = (suggestion: ArrivalLocationSuggestion) => {
  const parts: string[] = [];
  if (suggestion.address) parts.push(suggestion.address);
  if (typeof suggestion.distance_km === 'number') {
    parts.push(`${suggestion.distance_km.toFixed(1)} km`);
  }
  if (typeof suggestion.eta_minutes === 'number') {
    parts.push(`${suggestion.eta_minutes} min`);
  }
  return parts.join(' • ');
};

type Props = NativeStackScreenProps<RootStackParamList, 'PrepNotify'>;

export default function PrepNotifyScreen({ navigation, route }: Props) {
  const { reservation: initialReservation, restaurantName, features } = route.params;
  const [reservation, setReservation] = useState<Reservation>(initialReservation);
  const [minutesAway, setMinutesAway] = useState<number>(10);
  const [scope, setScope] = useState<PreorderRequestPayload['scope']>('starters');
  const [itemsNote, setItemsNote] = useState('');
  const [quote, setQuote] = useState<PreorderQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'pending' | 'shared' | 'denied'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualActive, setManualActive] = useState(false);
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const {
    suggestions: manualSuggestions,
    loading: manualLoading,
    error: manualSuggestionsError,
    isStale: manualIsStale,
    hasFetched: manualHasFetched,
  } = useArrivalSuggestions(reservation.id, manualQuery, {
    limit: 6,
    enabled: manualActive || manualQuery.trim().length > 0,
  });
  const manualQueryTrimmed = manualQuery.trim();
  const hasLiveManualSuggestions = manualSuggestions.length > 0 && !manualIsStale;

  const reservationWindow = useMemo(() => {
    const start = new Date(reservation.start);
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(start);
  }, [reservation.start]);

  useEffect(() => {
    let active = true;
    async function loadQuote() {
      setQuoteLoading(true);
      setQuoteError(null);
      try {
        const payload: PreorderRequestPayload = {
          minutes_away: minutesAway,
          scope,
          items: undefined,
        };
        const result = await getPreorderQuote(reservation.id, payload);
        if (!active) return;
        setQuote(result);
      } catch (err: any) {
        if (!active) return;
        setQuoteError(err?.message || 'Feature currently unavailable.');
      } finally {
        if (active) setQuoteLoading(false);
      }
    }
    loadQuote().catch(() => null);
    return () => {
      active = false;
    };
  }, [reservation.id, scope, minutesAway]);

  const parsedItems = useMemo(() => {
    if (!itemsNote.trim()) return undefined;
    return itemsNote
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [itemsNote]);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      setSubmitError(null);
      const payload: PreorderRequestPayload = {
        minutes_away: minutesAway,
        scope,
        items: parsedItems,
      };
      await confirmPreorder(reservation.id, payload);
      Alert.alert(
        'Kitchen notified',
        'We pinged the restaurant—no deposit required.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      setSubmitError(err?.message || 'Payment failed (mock). Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const locationSupported = Boolean(features?.gomap_ready ?? features?.maps_api_key_present);

  const handleLocationEstimate = async () => {
    try {
      setLocationState('pending');
      setLocationError(null);
      setLocationNotice(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState('denied');
        setLocationError('Location permission denied. Enable access to sync ETA.');
        return;
      }
      const coords = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = coords.coords;
      if (!isWithinAzerbaijan(latitude, longitude)) {
        setLocationState('idle');
        setLocationError('Share a point within Azerbaijan or pick a manual preset.');
        setManualStatus('Detected outside Azerbaijan. Search below to pick a manual point.');
        setManualActive(true);
        return;
      }
      const updated = await sendArrivalLocation(reservation.id, { latitude, longitude });
      setReservation(updated);
      setLocationState('shared');
      setLocationNotice('Location shared. The kitchen will auto-refresh your ETA.');
      Alert.alert('ETA synced', 'We will keep the kitchen updated automatically.');
    } catch (err: any) {
      setLocationState('idle');
      setLocationError(err?.message || 'Unable to use your location right now.');
    }
  };

  const handleManualShare = async (suggestion: ArrivalLocationSuggestion) => {
    try {
      setManualSubmitting(true);
      setManualStatus(`Sharing ${suggestion.name}…`);
      const updated = await sendArrivalLocation(reservation.id, {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
      });
      setReservation(updated);
      setLocationState('shared');
      setLocationNotice('Location shared. The kitchen will auto-refresh your ETA.');
      setManualStatus(`Using ${suggestion.name}`);
      Alert.alert('ETA synced', `We will keep the kitchen updated from ${suggestion.name}.`);
    } catch (err: any) {
      setManualStatus(err?.message || 'Unable to use that location right now.');
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Surface tone="overlay" style={styles.summaryCard}>
          <Text style={styles.title}>{restaurantName}</Text>
          <Text style={styles.subtitle}>{reservationWindow}</Text>
          <Text style={styles.meta}>Party of {reservation.party_size}</Text>
          {reservation.prep_status ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Prep {reservation.prep_status}</Text>
            </View>
          ) : null}
        </Surface>

        <Surface tone="overlay" style={styles.section}>
          <Text style={styles.sectionTitle}>When will you arrive?</Text>
          <View style={styles.segmentRow}>
            {ETA_CHOICES.map((choice) => (
              <Pressable
                key={choice}
                onPress={() => setMinutesAway(choice)}
                style={[styles.segmentChip, minutesAway === choice && styles.segmentChipSelected]}
              >
                <Text
                  style={[styles.segmentText, minutesAway === choice && styles.segmentTextSelected]}
                >
                  {choice} min
                </Text>
              </Pressable>
            ))}
          </View>
          {locationSupported ? (
            <View style={styles.locationBlock}>
              <Pressable
                style={[
                  styles.locationButton,
                  locationState === 'pending' && styles.locationButtonDisabled,
                ]}
                onPress={handleLocationEstimate}
                disabled={locationState === 'pending'}
              >
                <Text style={styles.locationButtonText}>
                  {locationState === 'pending' ? 'Sharing…' : 'Use my location to estimate'}
                </Text>
              </Pressable>
              {locationError ? (
                <InfoBanner tone="warning" icon="alert-triangle" title={locationError} />
              ) : null}
              {locationNotice ? (
                <InfoBanner tone="success" icon="navigation" title={locationNotice} />
              ) : null}
              <ArrivalInsightCard intent={reservation.arrival_intent} />
            </View>
          ) : null}
        </Surface>

        <Surface tone="overlay" style={styles.section}>
          <Text style={styles.sectionTitle}>Manual GoMap location</Text>
          <Text style={styles.sectionSubtitle}>
            Outside Azerbaijan or GPS blocked? Start typing and GoMap suggests options after every letter.
          </Text>
          <TextInput
            style={styles.manualInlineInput}
            value={manualQuery}
            placeholder="Type Flame Towers, Koala Park…"
            placeholderTextColor={colors.muted}
            onFocus={() => setManualActive(true)}
            onChangeText={(value) => {
              setManualQuery(value);
              if (!manualActive) setManualActive(true);
            }}
          />
          {manualStatus ? <Text style={styles.manualStatus}>{manualStatus}</Text> : null}
          {manualSuggestionsError ? (
            <InfoBanner tone="warning" icon="alert-triangle" title={manualSuggestionsError} />
          ) : null}
          {manualLoading ? (
            <ActivityIndicator style={styles.manualInlineLoading} color={colors.primaryStrong} />
          ) : null}
          <View style={styles.manualSuggestionList}>
            {!manualQueryTrimmed ? (
              <Text style={styles.manualSuggestionEmpty}>Start typing to see live GoMap suggestions.</Text>
            ) : manualLoading || manualIsStale ? (
              <Text style={styles.manualSuggestionEmpty}>Fetching live suggestions…</Text>
            ) : hasLiveManualSuggestions ? (
              manualSuggestions.map((suggestion) => {
                const meta = describeSuggestion(suggestion);
                return (
                  <Pressable
                    key={suggestion.id}
                    style={[styles.manualSuggestionRow, manualSubmitting && styles.manualSuggestionDisabled]}
                    disabled={manualSubmitting}
                    onPress={() => handleManualShare(suggestion)}
                  >
                    <Feather name="map-pin" size={16} color={colors.primaryStrong} />
                    <View style={styles.manualSuggestionBody}>
                      <Text style={styles.manualSuggestionTitle}>{suggestion.name}</Text>
                      {meta ? <Text style={styles.manualSuggestionMeta}>{meta}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.muted} />
                  </Pressable>
                );
              })
            ) : manualHasFetched ? (
              <Text style={styles.manualSuggestionEmpty}>No matches yet. Keep typing for more options.</Text>
            ) : (
              <Text style={styles.manualSuggestionEmpty}>Start typing to see live GoMap suggestions.</Text>
            )}
          </View>
        </Surface>

        <Surface tone="overlay" style={styles.section}>
          <Text style={styles.sectionTitle}>What should be prepped?</Text>
          <View style={styles.segmentRow}>
            {SCOPE_CHOICES.map((choice) => (
              <Pressable
                key={choice.key}
                onPress={() => setScope(choice.key)}
                style={[styles.segmentChip, scope === choice.key && styles.segmentChipSelected]}
              >
                <Text style={[styles.segmentText, scope === choice.key && styles.segmentTextSelected]}>
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Notes or items (optional)</Text>
          <TextInput
            style={styles.textArea}
            multiline
            placeholder="E.g., two orders of dolma, extra bread"
            placeholderTextColor={colors.muted}
            value={itemsNote}
            onChangeText={setItemsNote}
          />
        </Surface>

        <Surface tone="overlay" style={styles.section}>
          <Text style={styles.sectionTitle}>What happens next</Text>
          {quoteLoading ? (
            <ActivityIndicator color={colors.primaryStrong} />
          ) : quoteError ? (
            <InfoBanner tone="warning" icon="alert-triangle" title={quoteError} />
          ) : (
            <>
              <Text style={styles.policy}>{quote?.policy}</Text>
              <Text style={styles.policyMeta}>
                {quote?.recommended_prep_minutes
                  ? `We’ll start prepping about ${quote.recommended_prep_minutes} minutes before you arrive.`
                  : 'We’ll start prepping as soon as you hit the road.'}
              </Text>
            </>
          )}
        </Surface>

        {submitError ? (
          <InfoBanner tone="warning" icon="x-circle" title={submitError} />
        ) : null}

        <Pressable
          style={[styles.ctaButton, submitting && styles.ctaButtonDisabled]}
          onPress={handleConfirm}
          disabled={submitting}
        >
          <Text style={styles.ctaText}>{submitting ? 'Processing…' : 'Confirm & notify kitchen'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryCard: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: radius.lg,
  },
  badgeText: {
    color: '#15803d',
    fontWeight: '600',
    fontSize: 12,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontWeight: '600',
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    color: colors.text,
    fontWeight: '500',
  },
  segmentTextSelected: {
    color: '#fff',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 80,
    color: colors.text,
    textAlignVertical: 'top',
  },
  policy: {
    color: colors.muted,
    fontSize: 13,
  },
  policyMeta: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  ctaButton: {
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  locationBlock: {
    gap: spacing.xs,
  },
  locationButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationButtonDisabled: {
    opacity: 0.7,
  },
  locationButtonText: {
    textAlign: 'center',
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  manualInlineInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
  },
  manualStatus: {
    color: colors.text,
    fontSize: 12,
  },
  manualInlineLoading: {
    marginTop: spacing.xs,
  },
  manualSuggestionList: {
    gap: spacing.xs,
  },
  manualSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  manualSuggestionDisabled: {
    opacity: 0.5,
  },
  manualSuggestionBody: {
    flex: 1,
    gap: 2,
  },
  manualSuggestionTitle: {
    color: colors.text,
    fontWeight: '600',
  },
  manualSuggestionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  manualSuggestionEmpty: {
    color: colors.muted,
    fontSize: 12,
  },
});
