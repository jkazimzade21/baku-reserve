import React, { useEffect, useMemo, useState } from 'react';
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
import {
  fetchRestaurant,
  createReservation,
  AvailabilitySlot,
  Reservation,
  RestaurantDetail,
} from '../api';
import SeatMap from '../components/SeatMap';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';

type RouteParams = RootStackParamList['SeatPicker'];
type Props = NativeStackScreenProps<RootStackParamList, 'SeatPicker'>;

type Table = {
  id: string;
  label: string;
  capacity: number;
  area?: string;
};

export default function SeatPicker({ route, navigation }: Props) {
  const { id, name, partySize, slot, guestName, guestPhone } = route.params;
  const [restaurant, setRestaurant] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTableIds, setAvailableTableIds] = useState<string[]>(slot.available_table_ids ?? []);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(slot.available_table_ids?.[0] ?? null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);

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
    if (!restaurant?.areas?.length) {
      return;
    }
    const currentAreaExists = activeAreaId
      ? restaurant.areas.some((area) => area.id === activeAreaId)
      : false;
    if (currentAreaExists) {
      return;
    }
    const areaWithMap = restaurant.areas.find((area) =>
      area.tables.some((table) => table.position && table.position.length === 2),
    );
    const nextAreaId = areaWithMap?.id ?? restaurant.areas[0]?.id ?? null;
    if (nextAreaId && nextAreaId !== activeAreaId) {
      setActiveAreaId(nextAreaId);
    }
  }, [restaurant, activeAreaId]);

  useEffect(() => {
    if (!availableTableIds.length) {
      setSelectedTableId(null);
      return;
    }
    if (!selectedTableId || !availableTableIds.includes(selectedTableId)) {
      setSelectedTableId(availableTableIds[0]);
    }
  }, [availableTableIds, selectedTableId]);

  const availableSet = useMemo(() => new Set(availableTableIds), [availableTableIds]);

  const allTables = useMemo(() => {
    const map: Record<string, Table> = {};
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

  const availableTables = useMemo<Table[]>(() => {
    return availableTableIds
      .map((tableId) => allTables[tableId])
      .filter(Boolean)
      .map((table) => ({
        ...table,
      }));
  }, [availableTableIds, allTables]);

  const summary = useMemo(() => {
    if (!availableTableIds.length) {
      return 'No tables available for this slot.';
    }
    const openCount = availableTableIds.length;
    return `${openCount} table${openCount === 1 ? '' : 's'} open for ${partySize} guests.`;
  }, [availableTableIds, partySize]);

  const activeArea = useMemo(() => restaurant?.areas?.find((area) => area.id === activeAreaId) ?? null, [
    restaurant,
    activeAreaId,
  ]);

  const handleSelectTable = (tableId: string) => {
    setSelectedTableId((prev) => (prev === tableId ? null : tableId));
  };

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
      Alert.alert('Booked!', `Reservation ${res.id} confirmed.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not book', err.message || 'Unknown error');
    }
  };

  const renderTable = ({ item }: { item: Table }) => {
    const isSelected = selectedTableId === item.id;
    return (
      <Pressable
        onPress={() => handleSelectTable(item.id)}
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
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerCard}>
          <Text style={styles.overline}>Reservation summary</Text>
          <Text style={styles.headerTitle}>{name}</Text>
          <Text style={styles.headerSubtitle}>
            {new Date(slot.start).toLocaleDateString()} ·
            {` ${new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            {` → ${new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </Text>
          <Text style={styles.headerMeta}>{summary}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => book(undefined)}>
            <Text style={styles.secondaryButtonText}>Let the host auto-assign</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primaryStrong} />
            <Text style={styles.loadingText}>Loading latest layout…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !restaurant ? null : (
          <View style={styles.mapSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaTabs}>
              {restaurant.areas?.map((area) => {
                const isActive = area.id === activeAreaId;
                return (
                  <Pressable
                    key={area.id}
                    style={[styles.areaChip, isActive && styles.areaChipActive]}
                    onPress={() => setActiveAreaId(area.id)}
                  >
                    <Text style={[styles.areaChipText, isActive && styles.areaChipTextActive]}>{area.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeArea ? (
              <SeatMap
                area={activeArea}
                selectable
                availableIds={availableSet}
                occupiedIds={occupiedSet}
                selectedId={selectedTableId}
                onSelect={handleSelectTable}
                showLegend
              />
            ) : (
              <View style={styles.errorState}>
                <Text style={styles.errorText}>No map layout available for this area.</Text>
              </View>
            )}
            {selectedTableId ? (
              <View style={styles.selectionCard}>
                <Text style={styles.selectionTitle}>Selected table</Text>
                <Text style={styles.selectionMeta}>
                  {allTables[selectedTableId]?.label ?? selectedTableId}
                  {allTables[selectedTableId]?.area ? ` · ${allTables[selectedTableId]?.area}` : ''}
                </Text>
                <Text style={styles.selectionMeta}>Seats {allTables[selectedTableId]?.capacity ?? partySize}</Text>
                <Pressable style={styles.primaryButton} onPress={() => book(selectedTableId)}>
                  <Text style={styles.primaryButtonText}>Reserve this table</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Open tables ({availableTables.length})</Text>
          {availableTables.length ? (
            <FlatList
              data={availableTables}
              keyExtractor={(item) => item.id}
              renderItem={renderTable}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.sm,
    ...shadow.card,
  },
  overline: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
    color: colors.muted,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  headerSubtitle: {
    color: colors.muted,
    fontWeight: '500',
  },
  headerMeta: {
    color: colors.muted,
  },
  secondaryButton: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
  },
  errorState: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  mapSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.lg,
    ...shadow.card,
  },
  areaTabs: {
    gap: spacing.sm,
  },
  areaChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  areaChipActive: {
    backgroundColor: colors.primaryStrong,
  },
  areaChipText: {
    color: colors.muted,
    fontWeight: '600',
  },
  areaChipTextActive: {
    color: '#0b1220',
  },
  selectionCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  selectionTitle: {
    fontWeight: '700',
    color: colors.text,
  },
  selectionMeta: {
    color: colors.muted,
  },
  listSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    gap: spacing.lg,
    ...shadow.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  tableRowCard: {
    backgroundColor: 'rgba(17, 28, 45, 0.85)',
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tableRowCardSelected: {
    borderColor: colors.primaryStrong,
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
    color: '#0b1220',
    fontWeight: '700',
  },
});
