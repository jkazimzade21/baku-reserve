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
import {
  confirmPreorder,
  getPreorderQuote,
  type PreorderQuoteResponse,
  type PreorderRequestPayload,
  type Reservation,
} from '../api';
import Surface from '../components/Surface';
import InfoBanner from '../components/InfoBanner';
import { colors, radius, spacing } from '../config/theme';
import type { RootStackParamList } from '../types/navigation';

const ETA_CHOICES = [5, 10, 15];
const SCOPE_CHOICES: Array<{ key: PreorderRequestPayload['scope']; label: string }> = [
  { key: 'starters', label: 'Starters only' },
  { key: 'full', label: 'Full meal' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'PrepNotify'>;

function formatMoney(amountMinor: number | null | undefined, currency: string) {
  if (amountMinor == null) return '—';
  const major = amountMinor / 100;
  return `${currency} ${major.toFixed(2)}`;
}

export default function PrepNotifyScreen({ navigation, route }: Props) {
  const { reservation, restaurantName, features } = route.params;
  const [minutesAway, setMinutesAway] = useState<number>(10);
  const [scope, setScope] = useState<PreorderRequestPayload['scope']>('starters');
  const [itemsNote, setItemsNote] = useState('');
  const [quote, setQuote] = useState<PreorderQuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
        'We pinged the restaurant and authorized your refundable deposit.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      setSubmitError(err?.message || 'Payment failed (mock). Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const locationSupported = Boolean(features?.maps_api_key_present);

  const handleLocationEstimate = () => {
    Alert.alert(
      'Coming soon',
      'Live ETA via location will be available once the mapping API is configured.',
    );
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
            <Pressable style={styles.locationButton} onPress={handleLocationEstimate}>
              <Text style={styles.locationButtonText}>Use my location to estimate</Text>
            </Pressable>
          ) : null}
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
          <Text style={styles.sectionTitle}>Deposit summary</Text>
          {quoteLoading ? (
            <ActivityIndicator color={colors.primaryStrong} />
          ) : quoteError ? (
            <InfoBanner tone="warning" icon="alert-triangle" title={quoteError} />
          ) : (
            <>
              <Text style={styles.depositAmount}>{formatMoney(quote?.deposit_amount_minor, quote?.currency ?? 'AZN')}</Text>
              <Text style={styles.policy}>{quote?.policy}</Text>
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
          <Text style={styles.ctaText}>{submitting ? 'Processing…' : 'Confirm & pay deposit'}</Text>
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
  depositAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  policy: {
    color: colors.muted,
    fontSize: 13,
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
  locationButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationButtonText: {
    textAlign: 'center',
    fontWeight: '600',
    color: colors.primaryStrong,
  },
});
