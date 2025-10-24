import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchRestaurant, createReservation, AvailabilitySlot, Reservation, RestaurantDetail } from '../api';
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
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `Choose table · ${name}` });
  }, [name, navigation]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const restaurant: RestaurantDetail = await fetchRestaurant(id);
        if (!mounted) return;
        const lookup: Record<string, Table> = {};
        restaurant.areas?.forEach((area) => {
          area.tables?.forEach((table) => {
            lookup[table.id] = {
              id: table.id,
              label: table.name || `Table ${String(table.id).slice(0, 6)}`,
              capacity: table.capacity || 2,
              area: area.name,
            };
          });
        });
        const list: Table[] = (slot.available_table_ids || []).map((tid: string) => {
          return lookup[tid] ?? {
            id: tid,
            label: `Table ${String(tid).slice(0, 6)}`,
            capacity: partySize,
          };
        });
        setTables(list);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load tables');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, partySize, slot.available_table_ids]);

  const summary = useMemo(() => {
    if (!slot.available_table_ids?.length) {
      return 'No tables available for this slot.';
    }
    return `${slot.available_table_ids.length} table${slot.available_table_ids.length === 1 ? '' : 's'} open for ${partySize} guests.`;
  }, [slot.available_table_ids, partySize]);

  const book = async (tableId?: string) => {
    try {
      const res: Reservation = await createReservation({
        restaurant_id: id,
        party_size: partySize,
        start: slot.start,
        end: slot.end,
        guest_name: guestName || 'Mobile Guest',
        guest_phone: guestPhone || undefined,
        table_id: tableId,
      });
      Alert.alert('Booked!', `Reservation ${res.id} confirmed.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not book', err.message || 'Unknown error');
    }
  };

  const renderTable = ({ item }: { item: Table }) => (
    <View style={styles.tableCard}>
      <View>
        <Text style={styles.tableLabel}>{item.label}</Text>
        <Text style={styles.tableMeta}>
          Seats {item.capacity}
          {item.area ? ` · ${item.area}` : ''}
        </Text>
      </View>
      <Pressable style={styles.primaryButton} onPress={() => book(item.id)}>
        <Text style={styles.primaryButtonText}>Reserve</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.overline}>Reservation summary</Text>
          <Text style={styles.headerTitle}>{name}</Text>
          <Text style={styles.headerSubtitle}>
            {new Date(slot.start).toLocaleDateString()} · {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} →{' '}
            {new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.headerMeta}>{summary}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => book(undefined)}>
            <Text style={styles.secondaryButtonText}>Let system auto-assign</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primaryStrong} />
            <Text style={styles.loadingText}>Loading available tables…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={tables}
            keyExtractor={(item) => item.id}
            renderItem={renderTable}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No tables available</Text>
                <Text style={styles.emptySubtitle}>Try another time or reduce your party size.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
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
    letterSpacing: 1,
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
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
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
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(248, 113, 113, 0.16)',
  },
  errorText: {
    color: colors.danger,
    fontWeight: '600',
  },
  list: {
    gap: spacing.md,
  },
  tableCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tableLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  tableMeta: {
    marginTop: spacing.xs,
    color: colors.muted,
  },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
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
