import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../config/theme';
import type { AreaDetail } from '../api';

type Props = {
  area: AreaDetail;
};

export default function SeatMap({ area }: Props) {
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
          return (
            <View
              key={table.id}
              style={[
                styles.tableBase,
                shapeStyles,
                {
                  left: `${x}%`,
                  top: `${y}%`,
                },
              ]}
            >
              <Text style={styles.tableLabel}>{table.name}</Text>
              <Text style={styles.tableMeta}>Seats {table.capacity}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.legend}>Approximate layout – exact tables appear during booking.</Text>
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
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    overflow: 'hidden',
  },
  tableBase: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -32 }, { translateY: -32 }],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    ...radiusShadow(),
  },
  tableCircle: {
    borderRadius: 32,
  },
  tableRect: {
    borderRadius: radius.md,
  },
  tableLabel: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.text,
  },
  tableMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  legend: {
    color: colors.muted,
    fontSize: 12,
  },
  fallback: {
    color: colors.muted,
    fontSize: 13,
  },
});

function radiusShadow() {
  return {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  } as const;
}
