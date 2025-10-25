import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAvailability, AvailabilitySlot } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeFromISO(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

export default function BookScreen({ route, navigation }: Props) {
  const { id, name, guestName: initialGuestName, guestPhone: initialGuestPhone } = route.params;
  const [dateStr, setDateStr] = useState<string>(formatDateInput(new Date()));
  const [partySize, setPartySize] = useState<number>(2);
  const [guestName, setGuestName] = useState<string>(initialGuestName ?? '');
  const [guestPhone, setGuestPhone] = useState<string>(initialGuestPhone ?? '');
  const [loading, setLoading] = useState<boolean>(true);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const runLoad = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAvailability(id, dateStr, partySize);
      setSlots(data.slots ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to load availability');
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
  }, [name, navigation]);

  useFocusEffect(
    useCallback(() => {
      runLoad();
      return undefined;
    }, [dateStr, partySize])
  );

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        runLoad();
      }, 60000);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return undefined;
  }, [autoRefresh, dateStr, partySize]);

  const availableSummary = useMemo(() => {
    const totalOpen = slots.reduce((acc, slot) => acc + (slot.available_table_ids?.length ?? 0), 0);
    return totalOpen > 0
      ? `Showing ${slots.length} slots across ${totalOpen} open tables.`
      : 'Currently fully booked — try a different time or party size.';
  }, [slots]);

  const changeParty = (delta: number) => {
    setPartySize((prev) => {
      const next = Math.min(Math.max(prev + delta, 1), 20);
      return next;
    });
  };

  const openSeatPicker = (slot: AvailabilitySlot) => {
    navigation.navigate('SeatPicker', {
      id,
      name,
      partySize,
      slot,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
    });
  };

  const renderSlot = ({ item }: { item: AvailabilitySlot }) => {
    const count = item.available_table_ids?.length ?? 0;
    const disabled = count === 0;
    return (
      <View style={styles.slotCard}>
        <View>
          <Text style={styles.slotTime}>
            {timeFromISO(item.start)} → {timeFromISO(item.end)}
          </Text>
          <Text style={styles.slotMeta}>
            {count} table{count === 1 ? '' : 's'} fit party of {partySize}
          </Text>
        </View>
        <Pressable
          onPress={() => openSeatPicker(item)}
          disabled={disabled}
          style={[styles.slotButton, disabled && styles.slotButtonDisabled]}
        >
          <Text style={styles.slotButtonText}>{disabled ? 'Fully booked' : 'Select table'}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={slots}
        keyExtractor={(item, idx) => `${item.start}-${idx}`}
        renderItem={renderSlot}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.filterCard}>
              <Text style={styles.overline}>Availability planner</Text>
              <Text style={styles.heading}>Fine-tune your request</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Date</Text>
                <View style={styles.dateControls}>
                  <Pressable style={styles.chip} onPress={() => setDateStr(addDays(dateStr, -1))}>
                    <Text style={styles.chipText}>Previous</Text>
                  </Pressable>
                  <TextInput
                    value={dateStr}
                    onChangeText={setDateStr}
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.chip} onPress={() => setDateStr(formatDateInput(new Date()))}>
                    <Text style={styles.chipText}>Today</Text>
                  </Pressable>
                  <Pressable style={styles.chip} onPress={() => setDateStr(addDays(dateStr, 1))}>
                    <Text style={styles.chipText}>Next</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Party size</Text>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepperButton} onPress={() => changeParty(-1)}>
                    <Text style={styles.stepperText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{partySize}</Text>
                  <Pressable style={styles.stepperButton} onPress={() => changeParty(1)}>
                    <Text style={styles.stepperText}>＋</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Guest details</Text>
                <TextInput
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="Guest name"
                  style={styles.input}
                />
                <TextInput
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  placeholder="Contact phone"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>
              <View style={styles.controlsRow}>
                <Pressable style={styles.refreshButton} onPress={runLoad}>
                  <Text style={styles.refreshButtonText}>Refresh availability</Text>
                </Pressable>
                <View style={styles.switchRow}>
                  <Switch
                    value={autoRefresh}
                    onValueChange={(value) => {
                      setAutoRefresh(value);
                      if (value) runLoad();
                    }}
                    thumbColor="#fff"
                    trackColor={{ true: colors.primaryStrong, false: colors.border }}
                  />
                  <Text style={styles.switchLabel}>Auto-refresh</Text>
                </View>
              </View>
              {loading && (
                <View style={styles.loadingInline}>
                  <ActivityIndicator color={colors.primaryStrong} />
                  <Text style={styles.loadingInlineText}>Checking slots…</Text>
                </View>
              )}
              {error ? <Text style={styles.errorText}>{error}</Text> : <Text style={styles.statusText}>{availableSummary}</Text>}
            </View>
          </View>
        }
        ListEmptyComponent={
          loading
            ? null
            : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No availability</Text>
                  <Text style={styles.emptySubtitle}>Try another date or reduce your party size.</Text>
                </View>
              )
        }
      />
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
  header: {
    marginBottom: spacing.lg,
  },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.md,
    ...shadow.card,
  },
  overline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    fontWeight: '600',
    color: colors.text,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  chipText: {
    color: colors.primary,
    fontWeight: '600',
  },
  input: {
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    color: colors.text,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primary,
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshButton: {
    flexGrow: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#0b1220',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.muted,
    fontWeight: '500',
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingInlineText: {
    color: colors.muted,
  },
  statusText: {
    color: colors.muted,
    fontWeight: '500',
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  slotCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  slotTime: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  slotMeta: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 13,
  },
  slotButton: {
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.md,
  },
  slotButtonDisabled: {
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
  },
  slotButtonText: {
    color: '#fff',
    fontWeight: '600',
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
});
