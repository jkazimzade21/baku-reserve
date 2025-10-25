import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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
import { fetchAvailability, fetchRestaurant, AvailabilitySlot, RestaurantDetail } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import FloorPlanExplorer from '../components/floor/FloorPlanExplorer';
import { RESTAURANT_FLOOR_PLANS } from '../data/floorPlans';
import { findSlotForTime, getSuggestedSlots } from '../utils/availability';
import { buildFloorPlanForRestaurant } from '../utils/floorPlans';
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

function formatTimeInput(date: Date) {
  return date.toISOString().slice(11, 16);
}

function formatHumanTime(value: string | null) {
  if (!value) return 'Select time';
  const [hourStr, minuteStr] = value.split(':');
  const base = new Date();
  base.setHours(Number(hourStr) || 0, Number(minuteStr) || 0, 0, 0);
  return base.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function composeDateTime(dateValue: string, timeValue: string | null) {
  const base = parseDateInput(dateValue.trim()) ?? new Date();
  if (timeValue) {
    const [hourStr, minuteStr] = timeValue.split(':');
    base.setHours(Number(hourStr) || 0, Number(minuteStr) || 0, 0);
  }
  return base;
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
  const [timeStr, setTimeStr] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [pendingTime, setPendingTime] = useState<Date>(() => new Date());
  const [restaurantDetail, setRestaurantDetail] = useState<RestaurantDetail | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const planBundle = useMemo(() => buildFloorPlanForRestaurant(restaurantDetail), [restaurantDetail]);
  const floorPlan = useMemo(() => planBundle?.plan ?? RESTAURANT_FLOOR_PLANS[id] ?? null, [id, planBundle]);
  const floorPlanLabels = planBundle?.tableLabels;

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
  const friendlyTime = useMemo(() => formatHumanTime(timeStr), [timeStr]);

  useEffect(() => {
    navigation.setOptions({ title: `Book · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await fetchRestaurant(id);
        if (mounted) {
          setRestaurantDetail(detail);
        }
      } catch {
        // best-effort; map will fall back to static assets
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

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

  useEffect(() => {
    if (!timeStr && slots.length) {
      const first = new Date(slots[0].start);
      if (!Number.isNaN(first.getTime())) {
        setTimeStr(formatTimeInput(first));
        setPendingTime(first);
      }
    }
  }, [slots, timeStr]);

  useEffect(() => {
    if (timeStr) {
      setPendingTime(composeDateTime(dateStr, timeStr));
    }
  }, [dateStr, timeStr]);

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

  const handleTimeConfirm = useCallback((selectedTime: Date) => {
    const normalized = formatTimeInput(selectedTime);
    setTimeStr(normalized);
    setPendingTime(selectedTime);
  }, []);

  const openTimePicker = useCallback(() => {
    const base = composeDateTime(dateStr, timeStr);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode: 'time',
        is24Hour: false,
        value: base,
        onChange: (event: DateTimePickerEvent, selected) => {
          if (event.type === 'set' && selected) {
            handleTimeConfirm(selected);
          }
        },
      });
      return;
    }
    setPendingTime(base);
    setShowTimePicker(true);
  }, [dateStr, handleTimeConfirm, timeStr]);

  const closeTimePicker = useCallback(() => setShowTimePicker(false), []);

  const confirmIOSTimePicker = useCallback(() => {
    setShowTimePicker(false);
    handleTimeConfirm(pendingTime);
  }, [handleTimeConfirm, pendingTime]);

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

  const selectedSlot = useMemo(
    () => findSlotForTime(slots, dateStr, timeStr),
    [slots, dateStr, timeStr],
  );

  const targetDateTime = useMemo(
    () => (timeStr ? composeDateTime(dateStr, timeStr) : null),
    [dateStr, timeStr],
  );

  const suggestedSlots = useMemo(
    () => getSuggestedSlots(slots, targetDateTime, 4),
    [slots, targetDateTime],
  );

  const selectedSlotAvailability = selectedSlot?.available_table_ids?.length ?? 0;

  const handleFindTables = useCallback(() => {
    if (!timeStr) {
      Alert.alert('Choose a time', 'Select a preferred time before searching for tables.');
      return;
    }
    const match = findSlotForTime(slots, dateStr, timeStr);
    if (!match) {
      Alert.alert('No tables at that time', 'Try a suggested time from the list below.');
      return;
    }
    openSeatPicker(match);
  }, [dateStr, openSeatPicker, slots, timeStr]);

  const handleSuggestionPick = useCallback((slot: AvailabilitySlot) => {
    const slotDate = new Date(slot.start);
    if (!Number.isNaN(slotDate.getTime())) {
      handleTimeConfirm(slotDate);
    }
  }, [handleTimeConfirm]);

  const findDisabled = !timeStr || loading || !slots.length;

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
      {Platform.OS === 'ios' ? (
        <Modal transparent visible={showTimePicker} animationType="fade" onRequestClose={closeTimePicker}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select a time</Text>
                <Pressable onPress={closeTimePicker} style={styles.modalClose}>
                  <Feather name="x" size={18} color={colors.primaryStrong} />
                </Pressable>
              </View>
              <DateTimePicker
                value={pendingTime}
                mode="time"
                display="spinner"
                onChange={(_event, selected) => {
                  if (selected) {
                    setPendingTime(selected);
                  }
                }}
                style={styles.modalPicker}
              />
              <View style={styles.modalActions}>
                <Pressable style={[styles.modalButton, styles.modalButtonGhost]} onPress={closeTimePicker}>
                  <Text style={styles.modalButtonGhostText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.modalButton} onPress={confirmIOSTimePicker}>
                  <Text style={styles.modalButtonText}>Apply</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
      <ScrollView contentContainerStyle={styles.listContent}>
        <View style={styles.header}>
          {floorPlan ? (
            <View style={styles.mapShell}>
              <FloorPlanExplorer plan={floorPlan} venueName={name} labels={floorPlanLabels ?? undefined} />
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
              <Text style={styles.dateHelper}>Pick a different day to refresh availability.</Text>
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Preferred time</Text>
              <View style={styles.timeRow}>
                <Pressable style={styles.dateButton} onPress={openTimePicker}>
                  <Feather name="clock" size={16} color={colors.primaryStrong} />
                  <Text style={styles.dateButtonText}>{friendlyTime}</Text>
                </Pressable>
              </View>
              <Text style={styles.dateHelper}>We’ll match open tables closest to this time.</Text>
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
            <Pressable
              style={[styles.findButton, findDisabled && styles.findButtonDisabled]}
              onPress={handleFindTables}
              disabled={findDisabled}
            >
              <Text style={styles.findButtonText}>Find tables</Text>
            </Pressable>
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

          <View style={styles.summaryCard}>
            {selectedSlot ? (
              <>
                <Text style={styles.summaryHeadline}>
                  {friendlyTime} · {selectedSlotAvailability} table{selectedSlotAvailability === 1 ? '' : 's'} available
                </Text>
                <Text style={styles.summaryMeta}>Tap “Find tables” to choose a specific seat.</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryHeadline}>No exact matches</Text>
                <Text style={styles.summaryMeta}>Try one of the suggested times below for fastest seating.</Text>
              </>
            )}
          </View>

          {suggestedSlots.length ? (
            <View style={styles.suggestionCard}>
              <Text style={styles.sectionLabel}>Suggested times</Text>
              <View style={styles.suggestionRow}>
                {suggestedSlots.map((slot) => {
                  const slotDate = new Date(slot.start);
                  const slotTime = formatTimeInput(slotDate);
                  const slotLabel = `${timeFromISO(slot.start)} · ${slot.available_table_ids?.length ?? 0} tables`;
                  const active = slotTime === timeStr;
                  return (
                    <Pressable
                      key={slot.start}
                      style={[styles.suggestionChip, active && styles.suggestionChipActive]}
                      onPress={() => handleSuggestionPick(slot)}
                    >
                      <Text
                        style={[styles.suggestionChipText, active && styles.suggestionChipTextActive]}
                      >
                        {slotLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!slots.length && !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No availability</Text>
              <Text style={styles.emptySubtitle}>Try another date or reduce your party size.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
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
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
  findButton: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findButtonDisabled: {
    opacity: 0.5,
  },
  findButtonText: {
    color: '#fff',
    fontWeight: '700',
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
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  summaryHeadline: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  summaryMeta: {
    color: colors.muted,
  },
  suggestionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  sectionLabel: {
    fontWeight: '600',
    color: colors.text,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    backgroundColor: colors.overlay,
  },
  suggestionChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  suggestionChipText: {
    color: colors.text,
    fontWeight: '600',
  },
  suggestionChipTextActive: {
    color: '#fff',
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
