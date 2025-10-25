import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle as SvgCircle, Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
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
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
};

type TransformState = {
  scale: number;
  translateX: number;
  translateY: number;
};

type StatusConfig = {
  isAvailable: boolean;
  isSelected: boolean;
  isOccupied: boolean;
};

const MIN_SCALE = 0.9;
const MAX_SCALE = 2.85;
const ZOOM_FACTOR = 1.22;
const DOUBLE_TAP_MS = 260;
const GRID_STEPS = 5;

export default function SeatMap({
  area,
  selectable = false,
  availableIds,
  selectedId,
  occupiedIds,
  onSelect,
  showLegend = false,
  lastUpdated,
  onRefresh,
  refreshing = false,
}: Props) {
  const tablesWithPositions = useMemo(
    () => area.tables.filter((table) => table.position && table.position.length === 2),
    [area.tables],
  );

  if (!tablesWithPositions.length) {
    return <Text style={styles.fallback}>Seat map coming soon for this area.</Text>;
  }

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const transformState = useRef<TransformState>({ scale: 1, translateX: 0, translateY: 0 });
  const pinchDistance = useRef<number | null>(null);
  const isPinching = useRef(false);
  const lastPan = useRef({ dx: 0, dy: 0 });
  const lastTap = useRef(0);
  const lastTapPoint = useRef<{ x: number; y: number } | null>(null);
  const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const livePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [livePulse]);

  const clamp = useCallback((value: number, min: number, max: number) => Math.min(Math.max(value, min), max), []);

  const offsetLimit = useCallback(
    (scaleFactor: number) => {
      const base = Math.max(layout.width, layout.height) || 280;
      return (base / 2) * Math.max(1, scaleFactor);
    },
    [layout],
  );

  const applyScale = useCallback(
    (raw: number) => {
      const clamped = clamp(raw, MIN_SCALE, MAX_SCALE);
      transformState.current.scale = clamped;
      scale.setValue(clamped);
    },
    [clamp, scale],
  );

  const applyTranslate = useCallback(
    (nextX: number, nextY: number) => {
      const limit = offsetLimit(transformState.current.scale);
      const clampedX = clamp(nextX, -limit, limit);
      const clampedY = clamp(nextY, -limit, limit);
      transformState.current.translateX = clampedX;
      transformState.current.translateY = clampedY;
      translateX.setValue(clampedX);
      translateY.setValue(clampedY);
    },
    [clamp, offsetLimit, translateX, translateY],
  );

  const resetView = useCallback(() => {
    transformState.current = { scale: 1, translateX: 0, translateY: 0 };
    pinchDistance.current = null;
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [scale, translateX, translateY]);

  const zoomToPoint = useCallback(
    (point?: { x: number; y: number }, factor = ZOOM_FACTOR) => {
      const current = transformState.current.scale;
      const target = clamp(current * factor, MIN_SCALE, MAX_SCALE);
      const delta = target - current;

      if (!layout.width || !layout.height || !point) {
        applyScale(target);
        return;
      }

      const pivotX = point.x - layout.width / 2 - transformState.current.translateX;
      const pivotY = point.y - layout.height / 2 - transformState.current.translateY;
      const nextTranslateX = transformState.current.translateX - (delta * pivotX) / target;
      const nextTranslateY = transformState.current.translateY - (delta * pivotY) / target;

      applyScale(target);
      applyTranslate(nextTranslateX, nextTranslateY);
    },
    [applyScale, applyTranslate, clamp, layout],
  );

  const zoomIn = useCallback(() => {
    zoomToPoint(layout.width && layout.height ? { x: layout.width / 2, y: layout.height / 2 } : undefined);
  }, [layout.height, layout.width, zoomToPoint]);

  const zoomOut = useCallback(() => {
    zoomToPoint(layout.width && layout.height ? { x: layout.width / 2, y: layout.height / 2 } : undefined, 1 / ZOOM_FACTOR);
  }, [layout.height, layout.width, zoomToPoint]);

  const onCanvasLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          lastPan.current = { dx: 0, dy: 0 };
          if (touches.length === 2) {
            pinchDistance.current = distanceBetweenTouches(touches);
            isPinching.current = true;
            return;
          }
          isPinching.current = false;

          if (touches.length === 1) {
            const touch = touches[0];
            const now = Date.now();
            const point = { x: touch.locationX, y: touch.locationY };
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              const prevPoint = lastTapPoint.current;
              if (!prevPoint || distanceBetweenPoints(prevPoint, point) < 24) {
                zoomToPoint(point);
              }
              lastTap.current = 0;
              lastTapPoint.current = null;
            } else {
              lastTap.current = now;
              lastTapPoint.current = point;
            }
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            isPinching.current = true;
            const currentDistance = distanceBetweenTouches(touches);
            if (!pinchDistance.current) {
              pinchDistance.current = currentDistance;
              return;
            }
            const ratio = currentDistance / (pinchDistance.current || currentDistance);
            pinchDistance.current = currentDistance;
            applyScale(transformState.current.scale * ratio);
            return;
          }
          if (touches.length === 1 && !isPinching.current) {
            const deltaX = gestureState.dx - lastPan.current.dx;
            const deltaY = gestureState.dy - lastPan.current.dy;
            applyTranslate(transformState.current.translateX + deltaX, transformState.current.translateY + deltaY);
            lastPan.current = { dx: gestureState.dx, dy: gestureState.dy };
          }
        },
        onPanResponderRelease: () => {
          pinchDistance.current = null;
          isPinching.current = false;
          lastPan.current = { dx: 0, dy: 0 };
        },
        onPanResponderTerminate: () => {
          pinchDistance.current = null;
          isPinching.current = false;
          lastPan.current = { dx: 0, dy: 0 };
        },
      }),
    [applyScale, applyTranslate, zoomToPoint],
  );

  const statusById = useMemo(() => {
    const map = new Map<string, 'selected' | 'available' | 'reserved'>();
    tablesWithPositions.forEach((table) => {
      const isSelected = selectedId === table.id;
      const isAvailable = availableIds ? availableIds.has(table.id) : true;
      const isOccupied = occupiedIds ? occupiedIds.has(table.id) : !isAvailable;
      const resolved = resolveStatus({ isAvailable, isOccupied, isSelected });
      map.set(table.id, resolved);
    });
    return map;
  }, [availableIds, occupiedIds, selectedId, tablesWithPositions]);

  const boundingBox = useMemo(() => {
    let minX = 100;
    let minY = 100;
    let maxX = 0;
    let maxY = 0;
    tablesWithPositions.forEach((table) => {
      const [x, y] = table.position as [number, number];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    return {
      minX: Math.max(0, minX - 4),
      minY: Math.max(0, minY - 4),
      width: Math.min(100, maxX + 4) - Math.max(0, minX - 4),
      height: Math.min(100, maxY + 4) - Math.max(0, minY - 4),
    };
  }, [tablesWithPositions]);

  const gridLines = useMemo(() => {
    const lines = [];
    for (let i = 1; i < GRID_STEPS; i += 1) {
      const value = (i / GRID_STEPS) * 100;
      lines.push(
        <SvgLine
          key={`h-${value}`}
          x1="0"
          y1={value}
          x2="100"
          y2={value}
          stroke="rgba(110, 94, 76, 0.1)"
          strokeWidth={0.4}
        />,
      );
      lines.push(
        <SvgLine
          key={`v-${value}`}
          x1={value}
          y1="0"
          x2={value}
          y2="100"
          stroke="rgba(110, 94, 76, 0.08)"
          strokeWidth={0.4}
        />,
      );
    }
    return lines;
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.toolboxRow}>
        <View style={styles.liveBadge}>
          <Animated.View
            style={[
              styles.liveDot,
              {
                opacity: livePulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1],
                }),
              },
            ]}
          />
          <Text style={styles.liveText}>
            {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : 'Live availability monitor'}
          </Text>
        </View>
        <View style={styles.toolboxActions}>
          {selectable && onRefresh ? (
            <Pressable
              style={[styles.toolboxButton, refreshing && styles.toolboxButtonDisabled]}
              onPress={!refreshing ? onRefresh : undefined}
            >
              <Text style={styles.toolboxButtonText}>{refreshing ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
          ) : null}
          <View style={styles.zoomGroup}>
            <Pressable style={styles.zoomButton} onPress={zoomOut}>
              <Text style={styles.zoomLabel}>−</Text>
            </Pressable>
            <Pressable style={styles.zoomButton} onPress={resetView}>
              <Text style={styles.zoomLabel}>⟳</Text>
            </Pressable>
            <Pressable style={styles.zoomButton} onPress={zoomIn}>
              <Text style={styles.zoomLabel}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View style={styles.surface}>
        <Animated.View
          style={[
            styles.canvas,
            {
              transform: [{ translateX }, { translateY }, { scale }],
            },
          ]}
          {...panResponder.panHandlers}
          onLayout={onCanvasLayout}
        >
          <Svg viewBox="0 0 100 100" style={styles.svgOverlay}>
            <SvgRect
              x="0"
              y="0"
              width="100"
              height="100"
              rx={radius.lg}
              fill="rgba(231, 169, 119, 0.12)"
            />
            <SvgRect
              x={boundingBox.minX}
              y={boundingBox.minY}
              width={boundingBox.width}
              height={boundingBox.height}
              rx={8}
              fill="rgba(226, 170, 120, 0.08)"
              stroke="rgba(110, 94, 76, 0.14)"
              strokeWidth={0.6}
            />
            {gridLines}
          </Svg>
          {tablesWithPositions.map((table) => {
            const [x, y] = table.position as [number, number];
            const status = statusById.get(table.id) ?? 'available';
            const isSelectable = selectable && status !== 'reserved';
            const Component = selectable ? Pressable : View;
            return (
              <Component
                key={table.id}
                style={[
                  styles.tableBase,
                  table.shape === 'rect' ? styles.tableRect : styles.tableCircle,
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                  },
                  stylesByStatus[status],
                ]}
                onPress={isSelectable ? () => onSelect?.(table.id) : undefined}
                disabled={!isSelectable}
              >
                <Text style={[styles.tableLabel, status === 'selected' && styles.tableLabelSelected]}>{table.name}</Text>
                <Text style={[styles.tableMeta, status === 'selected' && styles.tableMetaSelected]}>
                  Seats {table.capacity}
                </Text>
                {status === 'reserved' ? <Text style={styles.tableBadge}>Reserved</Text> : null}
              </Component>
            );
          })}
        </Animated.View>
        <View style={styles.miniMap} pointerEvents="none">
          <Svg viewBox="0 0 100 100" width="100%" height="100%">
            <SvgRect x="0" y="0" width="100" height="100" rx={12} fill="rgba(251, 244, 232, 0.9)" />
            {tablesWithPositions.map((table) => {
              const [x, y] = table.position as [number, number];
              const status = statusById.get(table.id) ?? 'available';
              const fill = miniMapFill(status);
              return (
                <SvgCircle key={`mini-${table.id}`} cx={x} cy={y} r={table.shape === 'rect' ? 4.8 : 4.6} fill={fill} />
              );
            })}
          </Svg>
          <Text style={styles.miniMapLabel}>{area.name}</Text>
        </View>
      </View>
      <Text style={styles.legendText}>
        {selectable
          ? 'Pinch to zoom, drag to explore, and tap an available table to reserve.'
          : 'Approximate layout – the host will confirm your exact table.'}
      </Text>
      {showLegend ? (
        <View style={styles.legendRow}>
          <LegendSwatch label="Available" style={styles.statusAvailable} />
          <LegendSwatch label="Selected" style={styles.statusSelected} textStyle={styles.legendTextSelected} />
          <LegendSwatch label="Reserved" style={styles.statusUnavailable} />
        </View>
      ) : null}
    </View>
  );
}

function resolveStatus({ isAvailable, isSelected, isOccupied }: StatusConfig) {
  if (isSelected) return 'selected';
  if (!isAvailable || isOccupied) return 'reserved';
  return 'available';
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
      <Text style={[styles.legendLabel, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  toolboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  liveText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  toolboxActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toolboxButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
  },
  toolboxButtonDisabled: {
    opacity: 0.6,
  },
  toolboxButtonText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
  zoomGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.16)',
  },
  zoomButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: 'rgba(231, 169, 119, 0.16)',
  },
  zoomLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  surface: {
    position: 'relative',
  },
  canvas: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  tableBase: {
    position: 'absolute',
    width: 70,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -35 }, { translateY: -35 }],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#5E4630',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  tableCircle: {
    borderRadius: 35,
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
    color: '#2F1C11',
  },
  tableMeta: {
    fontSize: 10,
    color: colors.muted,
  },
  tableMetaSelected: {
    color: '#2F1C11',
  },
  tableBadge: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#2F1C11',
  },
  statusAvailable: {
    backgroundColor: 'rgba(231, 169, 119, 0.18)',
    borderColor: 'rgba(231, 169, 119, 0.45)',
  },
  statusSelected: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primary,
    transform: [{ translateX: -35 }, { translateY: -35 }, { scale: 1.04 }],
  },
  statusUnavailable: {
    backgroundColor: 'rgba(110, 94, 76, 0.24)',
    borderColor: 'rgba(110, 94, 76, 0.45)',
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
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  legendText: {
    color: colors.muted,
    fontSize: 12,
  },
  legendTextSelected: {
    color: colors.text,
  },
  fallback: {
    color: colors.muted,
    fontSize: 13,
  },
  miniMap: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 112,
    height: 112,
    borderRadius: radius.md,
    backgroundColor: 'rgba(251, 244, 232, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(110, 94, 76, 0.18)',
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  miniMapLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    marginTop: 4,
  },
});

const stylesByStatus: Record<'available' | 'selected' | 'reserved', any> = {
  available: styles.statusAvailable,
  selected: styles.statusSelected,
  reserved: styles.statusUnavailable,
};

function miniMapFill(status: 'available' | 'selected' | 'reserved') {
  if (status === 'selected') return colors.primaryStrong;
  if (status === 'reserved') return 'rgba(110, 94, 76, 0.6)';
  return 'rgba(231, 169, 119, 0.65)';
}

function distanceBetweenTouches(touches: readonly any[]) {
  if (touches.length < 2) return 1;
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceBetweenPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function formatRelativeTime(date: Date) {
  const delta = Date.now() - date.getTime();
  if (delta < 1000) return 'just now';
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}
