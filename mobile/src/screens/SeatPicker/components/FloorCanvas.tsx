import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';

import type { AreaDetail, TableDetail } from '../../../api';
import { colors, radius } from '../../../config/theme';
import type { TableStatus } from '../useVenueLayout';
import { TableMarker, TableMarkerLayer } from './TableMarker';

const MIN_SCALE = 0.8;
const MAX_SCALE = 3.1;

type Transform = {
  scale: number;
  translateX: number;
  translateY: number;
};

type Props = {
  area: AreaDetail;
  tables: TableDetail[];
  getStatus: (id: string) => TableStatus;
  onSelectTable: (table: TableDetail) => void;
  onPreviewTable: (table: TableDetail, anchor: { x: number; y: number }) => void;
  transform: Transform;
  onTransformChange: (next: Transform) => void;
};

export function FloorCanvas({
  area,
  tables,
  getStatus,
  onSelectTable,
  onPreviewTable,
  transform,
  onTransformChange,
}: Props) {
  const scale = useSharedValue(transform.scale);
  const translateX = useSharedValue(transform.translateX);
  const translateY = useSharedValue(transform.translateY);

  useEffect(() => {
    scale.value = transform.scale;
    translateX.value = transform.translateX;
    translateY.value = transform.translateY;
  }, [transform, scale, translateX, translateY]);

  const clampTranslation = (value: number) => {
    'worklet';
    const limit = 120 * (scale.value - 1);
    return Math.max(-limit, Math.min(limit, value));
  };

  const persist = () => {
    'worklet';
    runOnJS(onTransformChange)({
      scale: scale.value,
      translateX: translateX.value,
      translateY: translateY.value,
    });
  };

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((event) => {
      translateX.value = clampTranslation(translateX.value + event.changeX);
      translateY.value = clampTranslation(translateY.value + event.changeY);
    })
    .onEnd((event) => {
      translateX.value = withDecay({ velocity: event.velocityX, clamp: [-160, 160], deceleration: 0.995 }, persist);
      translateY.value = withDecay({ velocity: event.velocityY, clamp: [-160, 160], deceleration: 0.995 }, persist);
    })
    .onFinalize(persist);

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * event.scale));
      scale.value = next;
    })
    .onEnd(() => {
      scale.value = withSpring(scale.value, { damping: 18, stiffness: 140 }, persist);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onBegin(() => {
      const target = Math.min(MAX_SCALE, scale.value * 1.2);
      scale.value = withSpring(target, { damping: 20, stiffness: 160 }, persist);
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const accent = area.theme?.accent ?? colors.primary;
  const ambient = area.theme?.ambientLight ?? 'rgba(231, 169, 119, 0.18)';

  const minimapTables = useMemo(() => tables.map((table) => table.position ?? [0, 0]), [tables]);

  return (
    <View style={styles.wrapper}>
      <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`ambient-${area.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ambient} />
            <Stop offset="1" stopColor={`${accent}22`} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius.lg} fill={`url(#ambient-${area.id})`} />
      </Svg>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.canvas, animatedStyle]}>
          <TableMarkerLayer>
            {area.landmarks?.map((landmark) => (
              <Polygon
                key={landmark.id}
                points={(landmark.footprint ?? []).map(([x, y]) => `${x},${y}`).join(' ')}
                fill={`${accent}22`}
                stroke={`${accent}66`}
                strokeDasharray="4 3"
                strokeWidth={1}
              />
            ))}
            {tables.map((table) => (
              <TableMarker
                key={table.id}
                table={table}
                status={getStatus(table.id)}
                accent={accent}
                onSelect={onSelectTable}
                onPreview={onPreviewTable}
              />
            ))}
          </TableMarkerLayer>
        </Animated.View>
      </GestureDetector>
      <View style={styles.minimap} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Rect x="0" y="0" width="100" height="100" rx={12} fill="rgba(255,255,255,0.78)" />
          {minimapTables.map(([x, y], index) => (
            <Rect key={index} x={x - 2} y={y - 2} width={4} height={4} rx={1.5} fill={`${accent}AA`} />
          ))}
          {area.landmarks?.map((landmark) => (
            <Polygon
              key={`mini-${landmark.id}`}
              points={(landmark.footprint ?? []).map(([x, y]) => `${x},${y}`).join(' ')}
              fill={`${accent}33`}
            />
          ))}
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
  minimap: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 96,
    height: 96,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

export default FloorCanvas;
