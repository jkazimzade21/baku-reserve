import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { fetchAvailability, AvailabilitySlot } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import FloorPlanExplorer from '../components/floor/FloorPlanExplorer';
import { RESTAURANT_FLOOR_PLANS } from '../data/floorPlans';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (formatDateInput(parsed) !== value) {
    return null;
  }
  return parsed;
}

function timeFromISO(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatHumanDate(value: string) {
  const parsed = parseDateInput(value.trim());
  if (!parsed) return 'Select date';
  return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [pendingDate, setPendingDate] = useState<Date>(() => parseDateInput(formatDateInput(new Date())) ?? new Date());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const floorPlan = useMemo(() => RESTAURANT_FLOOR_PLANS[id] ?? null, [id]);

  const runLoad = useCallback(
    async (targetInput?: string) => {
      const trimmed = (targetInput ?? dateStr).trim();
      if (!trimmed.length) {
        setSlots([]);
        setError('Choose a date to check availability.');
        setLoading(false);
        return;
      }
      if (trimmed.length < 10) {
        setSlots([]);
        setError(null);
        setLoading(false);
        return;
      }
      const parsedDate = parseDateInput(trimmed);
      if (!parsedDate) {
        setSlots([]);
        setError('Enter a valid date in YYYY-MM-DD format.');
        setLoading(false);
        return;
      }
      const normalizedDate = formatDateInput(parsedDate);
      try {
        setLoading(true);
        setError(null);
        if (normalizedDate !== dateStr) {
          setDateStr(normalizedDate);
        }
        const data = await fetchAvailability(id, normalizedDate, partySize);
        setSlots(data.slots ?? []);
      } catch (err: any) {
        setError(err.message || 'Failed to load availability');
        setSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [dateStr, id, partySize],
  );

  const friendlyDate = useMemo(() => formatHumanDate(dateStr), [dateStr]);

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    const parsed = parseDateInput(dateStr);
    if (parsed) {
      setPendingDate(parsed);
    }
  }, [dateStr]);

  useFocusEffect(
    useCallback(() => {
      runLoad();
      return undefined;
    }, [runLoad]),
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
  }, [autoRefresh, runLoad]);

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

  const handleDateConfirm = useCallback(
    (selectedDate: Date) => {
      const normalized = formatDateInput(selectedDate);
      setDateStr(normalized);
      runLoad(normalized);
    },
    [runLoad],
  );

  const handleToday = useCallback(() => {
    const now = new Date();
    setPendingDate(now);
    handleDateConfirm(now);
  }, [handleDateConfirm]);

  const openDatePicker = useCallback(() => {
    const parsed = parseDateInput(dateStr) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: parsed,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            handleDateConfirm(selectedDate);
          }
        },
      });
      return;
    }
    setPendingDate(parsed);
    setShowDatePicker(true);
  }, [dateStr, handleDateConfirm]);

  const closeIOSPicker = useCallback(() => setShowDatePicker(false), []);

  const confirmIOSPicker = useCallback(() => {
    setShowDatePicker(false);
    handleDateConfirm(pendingDate);
  }, [handleDateConfirm, pendingDate]);

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
      {Platform.OS === 'ios' ? (
        <Modal transparent visible={showDatePicker} animationType="fade" onRequestClose={closeIOSPicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select a date</Text>
                <Pressable onPress={closeIOSPicker} style={styles.modalClose}>
                  <Feather name="x" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingDate}
                mode="date"
                display="inline"
                onChange={(_event, selected) => {
                  if (selected) {
                    setPendingDate(selected);
                  }
                }}
                style={styles.modalPicker}
              />
              <View style={styles.modalActions}>
                <Pressable style={[styles.modalButton, styles.modalButtonGhost]} onPress={closeIOSPicker}>
                  <Text style={styles.modalButtonGhostText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalButton} onPress={confirmIOSPicker}>
                  <Text style={styles.modalButtonText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      <FlatList
        data={slots}
        keyExtractor={(item, idx) => `${item.start}-${idx}`}
        renderItem={renderSlot}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            {floorPlan ? (
              <View style={styles.mapShell}>
                <FloorPlanExplorer plan={floorPlan} venueName={name} />
              </View>
            ) : null}
            <View style={styles.filterCard}>
              <Text style={styles.overline}>Availability planner</Text>
              <Text style={styles.heading}>Fine-tune your request</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Date</Text>
                <View style={styles.dateControls}>
                  <Pressable style={styles.dateButton} onPress={openDatePicker}>
                    <Feather name="calendar" size={16} color={colors.primaryStrong} />
                    <Text style={styles.dateButtonText}>{friendlyDate}</Text>
                  </Pressable>
                  <Pressable style={styles.chip} onPress={handleToday}>
                    <Text style={styles.chipText}>Today</Text>
                  </Pressable>
                </View>
                <Text style={styles.dateHelper}>Tap to choose a different day and we’ll refresh available slots.</Text>
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
  mapShell: {
    marginBottom: spacing.lg,
  },
  filterCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateButtonText: {
    fontWeight: '600',
    color: colors.text,
  },
  dateHelper: {
    fontSize: 12,
    color: colors.muted,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  chipText: {
    color: colors.primaryStrong,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.overlay,
  },
  stepperText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.primaryStrong,
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
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#fff',
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
    borderColor: colors.border,
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
    backgroundColor: colors.overlay,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(21, 25, 32, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalClose: {
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  modalPicker: {
    alignSelf: 'stretch',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalButtonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonGhostText: {
    color: colors.text,
    fontWeight: '600',
  },
});
