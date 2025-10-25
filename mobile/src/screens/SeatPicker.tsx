import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchRestaurant,
  fetchAvailability,
  createReservation,
  AvailabilitySlot,
  Reservation,
  RestaurantDetail,
} from '../api';
import SeatMap from '../components/SeatMap';
import ZoneToggle from './SeatPicker/components/ZoneToggle';
import { useVenueLayout } from './SeatPicker/useVenueLayout';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type RouteParams = RootStackParamList['SeatPicker'];
type Props = NativeStackScreenProps<RootStackParamList, 'SeatPicker'>;

type TableSummary = {
  id: string;
  label: string;
  capacity: number;
  area?: string;
};

const CROWD_NOTES = ['Terrace has the best sunset glow', 'Lounge pods trend lively after 9pm', 'Dining room ideal for anniversaries'];

export default function SeatPicker({ route, navigation }: Props) {
  const { id, name, partySize, slot, guestName, guestPhone } = route.params;
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTableIds, setAvailableTableIds] = useState<string[]>(slot.available_table_ids ?? []);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(slot.available_table_ids?.[0] ?? null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notesIndex, setNotesIndex] = useState(0);

  useEffect(() => {
    navigation.setOptions({ title: `Choose table · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const detail = await fetchRestaurant(id);
        if (!mounted) return;
        setRestaurant(detail);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load tables');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (restaurant?.areas?.length) {
      setNotesIndex((index) => (index + 1) % CROWD_NOTES.length);
    }
  }, [restaurant?.areas?.length]);

  useEffect(() => {
    if (!availableTableIds.length) {
      setSelectedTableId(null);
    } else if (!selectedTableId || !availableTableIds.includes(selectedTableId)) {
      setSelectedTableId(availableTableIds[0]);
    }
  }, [availableTableIds, selectedTableId]);

  const syncAvailability = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (opts?.manual) {
        setSyncing(true);
        setSyncError(null);
      }
      try {
        const day = new Date(slot.start).toISOString().slice(0, 10);
        const response = await fetchAvailability(id, day, partySize);
        const matching = response.slots?.find((availableSlot: AvailabilitySlot) => availableSlot.start === slot.start);
        if (matching) {
          setAvailableTableIds(matching.available_table_ids ?? []);
        } else {
          setAvailableTableIds([]);
        }
        setLastSyncedAt(new Date());
      } catch (err: any) {
        setSyncError(err.message || 'Unable to refresh – tap to retry');
        if (opts?.manual) {
          Alert.alert('Sync failed', 'Could not refresh live availability. Try again shortly.');
        }
      } finally {
        if (opts?.manual) {
          setSyncing(false);
        }
      }
    },
    [id, partySize, slot.start],
  );

  useFocusEffect(
    useCallback(() => {
      syncAvailability();
      const interval = setInterval(syncAvailability, 15000);
      return () => clearInterval(interval);
    }, [syncAvailability]),
  );

  const availableSet = useMemo(() => new Set(availableTableIds), [availableTableIds]);

  const allTables = useMemo(() => {
    const map: Record<string, TableSummary> = {};
    restaurant?.areas?.forEach((area) => {
      area.tables?.forEach((table) => {
        map[table.id] = {
          id: table.id,
          label: table.name || `Table ${String(table.id).slice(0, 6)}`,
          capacity: table.capacity || 2,
          area: area.name,
        };
      });
    });
    return map;
  }, [restaurant]);

  const occupiedSet = useMemo(() => {
    const set = new Set<string>();
    Object.keys(allTables).forEach((tableId) => {
      if (!availableSet.has(tableId)) {
        set.add(tableId);
      }
    });
    return set;
  }, [allTables, availableSet]);

  const layout = useVenueLayout({
    restaurant,
    activeAreaId,
    setActiveAreaId,
    selectedTableId,
    onSelectTable: (id) => setSelectedTableId(id),
    availability: availableSet,
    occupied: occupiedSet,
  });

  const availableTables = useMemo<TableSummary[]>(() => {
    return availableTableIds
      .map((tableId) => allTables[tableId])
      .filter(Boolean)
      .map((table) => ({ ...table })) as TableSummary[];
  }, [availableTableIds, allTables]);

  const summary = useMemo(() => {
    if (!availableTableIds.length) {
      return 'No tables available for this slot.';
    }
    const openCount = availableTableIds.length;
    return `${openCount} table${openCount === 1 ? '' : 's'} open for ${partySize} guests.`;
  }, [availableTableIds, partySize]);

  const removeTableFromAvailability = (tableId?: string | null) => {
    if (!tableId) return;
    setAvailableTableIds((prev) => prev.filter((id) => id !== tableId));
    setSelectedTableId((prev) => (prev === tableId ? null : prev));
  };

  const book = async (tableId?: string) => {
    try {
      const res: Reservation = await createReservation({
        restaurant_id: id,
        party_size: partySize,
        start: slot.start,
        end: slot.end,
        guest_name: guestName?.trim() || 'Mobile Guest',
        guest_phone: guestPhone?.trim() || undefined,
        table_id: tableId,
      });
      removeTableFromAvailability(res.table_id ?? tableId ?? null);
      layout.performHaptic();
      await new Promise((resolve) => setTimeout(resolve, 420));
      Alert.alert('Booked!', `Reservation ${res.id} confirmed.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not book', err.message || 'Unknown error');
    }
  };

  const handleManualRefresh = useCallback(() => {
    syncAvailability({ manual: true });
  }, [syncAvailability]);

  const heroAccent = layout.activeArea?.theme?.accent ?? colors.primary;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.heroCard, { borderColor: `${heroAccent}44` }]}
          accessibilityRole="summary"
        >
          <View style={styles.heroHeader}>
            <Text style={styles.heroOverline}>Table preview</Text>
            <Text style={styles.heroTitle}>{name}</Text>
            <Text style={styles.heroSubtitle}>
              {new Date(slot.start).toLocaleDateString()} ·
              {` ${new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              {` → ${new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </Text>
            <Text style={styles.heroSummary}>{summary}</Text>
          </View>
          <View style={styles.ribbon}>
            <Text style={styles.ribbonCopy}>{CROWD_NOTES[notesIndex]}</Text>
            <Pressable style={styles.ribbonCta} onPress={() => book(undefined)}>
              <Text style={styles.ribbonCtaText}>Auto-assign</Text>
            </Pressable>
          </View>
          <View style={styles.zoneToggleRow}>
            <ZoneToggle areas={layout.areas} activeAreaId={layout.activeArea?.id ?? null} onSelect={layout.setActiveArea} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primaryStrong} />
            <Text style={styles.loadingText}>Loading layout…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={handleManualRefresh} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : layout.activeArea ? (
          <View style={styles.mapSection}>
            <SeatMap
              area={layout.activeArea}
              selectable
              availableIds={availableSet}
              occupiedIds={occupiedSet}
              selectedId={selectedTableId}
              onSelect={(id) => layout.selectTable(id)}
              onReserve={(tableId) => book(tableId)}
              showLegend
              lastUpdated={lastSyncedAt}
              onRefresh={handleManualRefresh}
              refreshing={syncing}
              errorMessage={syncError}
            />
            {syncError ? <Text style={styles.syncError}>{syncError}</Text> : null}
          </View>
        ) : null}

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Open tables ({availableTables.length})</Text>
          {availableTables.length ? (
            <FlatList
              data={availableTables}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
              renderItem={({ item }) => {
                const isSelected = selectedTableId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      const next = selectedTableId === item.id ? null : item.id;
                      layout.selectTable(next);
                    }}
                    style={[styles.tableRowCard, isSelected && styles.tableRowCardSelected]}
                  >
                    <View>
                      <Text style={styles.tableRowLabel}>{item.label}</Text>
                      <Text style={styles.tableRowMeta}>
                        Seats {item.capacity}
                        {item.area ? ` · ${item.area}` : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.primaryButton, styles.primaryButtonCompact]}
                      onPress={() => book(item.id)}
                    >
                      <Text style={styles.primaryButtonText}>Reserve</Text>
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          ) : (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>Currently fully booked for this time.</Text>
            </View>
          )}
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
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    gap: spacing.lg,
    ...shadow.card,
  },
  heroHeader: {
    gap: spacing.xs,
  },
  heroOverline: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    color: colors.muted,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  heroSubtitle: {
    color: colors.muted,
    fontWeight: '500',
  },
  heroSummary: {
    color: colors.text,
    fontWeight: '600',
  },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  ribbonCopy: {
    flex: 1,
    color: colors.text,
    fontWeight: '500',
  },
  ribbonCta: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  ribbonCtaText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  zoneToggleRow: {
    gap: spacing.sm,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  mapSection: {
    gap: spacing.sm,
  },
  syncError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  errorState: {
    backgroundColor: 'rgba(217, 95, 67, 0.16)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  retryText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  listSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  tableRowCard: {
    backgroundColor: '#F6E7D6',
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tableRowCardSelected: {
    borderColor: colors.primary,
  },
  tableRowLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  tableRowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonCompact: {
    minWidth: 110,
    paddingHorizontal: spacing.sm,
  },
  primaryButtonText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
});
