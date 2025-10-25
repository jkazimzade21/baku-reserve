import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../config/theme';
import type { AreaDetail } from '../api';

type Props = {
  area: AreaDetail;
  selectable?: boolean;
  availableIds?: Set<string>;
  selectedId?: string | null;
  occupiedIds?: Set<string>;
  onSelect?: (tableId: string) => void;
  showLegend?: boolean;
};

export default function SeatMap({
  area,
  selectable = false,
  availableIds,
  selectedId,
  occupiedIds,
  onSelect,
  showLegend = false,
}: Props) {
  const tablesWithPositions = area.tables.filter((table) => table.position && table.position.length === 2);

  if (tablesWithPositions.length === 0) {
    return <Text style={styles.fallback}>Seat map coming soon for this area.</Text>;
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.canvas}>
        {tablesWithPositions.map((table) => {
          const [x, y] = table.position!;
          const shapeStyles = table.shape === 'rect' ? styles.tableRect : styles.tableCircle;
          const isAvailable = availableIds ? availableIds.has(table.id) : true;
          const isSelected = !!selectedId && selectedId === table.id;
          const isOccupied = occupiedIds ? occupiedIds.has(table.id) : false;
          const disabled = selectable && !isAvailable;
          const statusStyle = resolveStatusStyle({ isAvailable, isSelected, isOccupied });
          const Component = selectable ? Pressable : View;

          return (
            <Component
              key={table.id}
              style={[
                styles.tableBase,
                shapeStyles,
                {
                  left: `${x}%`,
                  top: `${y}%`,
                },
                statusStyle,
              ]}
              onPress={selectable && isAvailable ? () => onSelect?.(table.id) : undefined}
              disabled={disabled}
            >
              <Text style={[styles.tableLabel, isSelected && styles.tableLabelSelected]}>{table.name}</Text>
              <Text style={[styles.tableMeta, isSelected && styles.tableMetaSelected]}>Seats {table.capacity}</Text>
            </Component>
          );
        })}
      </View>
      <Text style={styles.legend}>
        {selectable
          ? 'Tap a table to preview and reserve. Layout is approximate.'
          : 'Approximate layout – exact plan may vary.'}
      </Text>
      {showLegend && selectable ? (
        <View style={styles.legendRow}>
          <LegendSwatch label="Available" style={styles.statusAvailable} />
          <LegendSwatch label="Selected" style={styles.statusSelected} textStyle={styles.legendTextSelected} />
          <LegendSwatch label="Reserved" style={styles.statusUnavailable} />
        </View>
      ) : null}
    </View>
  );
}

type StatusConfig = {
  isAvailable: boolean;
  isSelected: boolean;
  isOccupied: boolean;
};

function resolveStatusStyle({ isAvailable, isSelected, isOccupied }: StatusConfig) {
  if (isSelected) return styles.statusSelected;
  if (!isAvailable || isOccupied) return styles.statusUnavailable;
  return styles.statusAvailable;
}

type LegendProps = {
  label: string;
  style: any;
  textStyle?: any;
};

function LegendSwatch({ label, style, textStyle }: LegendProps) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={[styles.legendText, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  canvas: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    overflow: 'hidden',
  },
  tableBase: {
    position: 'absolute',
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -34 }, { translateY: -34 }],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...radiusShadow(),
  },
  tableCircle: {
    borderRadius: 34,
  },
  tableRect: {
    borderRadius: radius.md,
  },
  tableLabel: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.text,
  },
  tableLabelSelected: {
    color: '#0b1220',
  },
  tableMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  tableMetaSelected: {
    color: '#0b1220',
  },
  legend: {
    color: colors.muted,
    fontSize: 12,
  },
  fallback: {
    color: colors.muted,
    fontSize: 13,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 18,
    height: 18,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
  },
  legendTextSelected: {
    color: '#e2e8f0',
  },
  statusAvailable: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  statusSelected: {
    backgroundColor: colors.primaryStrong,
    borderColor: '#a855f7',
  },
  statusUnavailable: {
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    opacity: 0.5,
  },
});

function radiusShadow() {
  return {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  } as const;
}
