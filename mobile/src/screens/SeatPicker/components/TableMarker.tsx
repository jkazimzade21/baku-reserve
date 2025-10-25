import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';

import type { TableDetail } from '../../../api';
import type { TableStatus } from '../useVenueLayout';

type Props = {
  table: TableDetail;
  status: TableStatus;
  onSelect: (table: TableDetail) => void;
  onPreview: (table: TableDetail, anchor: { x: number; y: number }) => void;
};

type SeatStyle = { fill: string; stroke: string };

export const seatStatusStyles: Record<TableStatus, SeatStyle> = {
  available: { fill: 'rgba(16, 185, 129, 0.65)', stroke: 'rgba(16, 185, 129, 0.9)' },
  held: { fill: 'rgba(148, 163, 184, 0.35)', stroke: 'rgba(148, 163, 184, 0.55)' },
  reserved: { fill: 'rgba(248, 113, 113, 0.45)', stroke: 'rgba(248, 113, 113, 0.75)' },
  selected: { fill: 'rgba(59, 130, 246, 0.7)', stroke: 'rgba(37, 99, 235, 0.85)' },
};

const AnimatedGroup = Animated.createAnimatedComponent(G);

export function TableMarker({ table, status, onSelect, onPreview }: Props) {
  const scale = useSharedValue(status === 'selected' ? 1.04 : 1);

  useEffect(() => {
    scale.value = withSpring(status === 'selected' ? 1.08 : 1, { damping: 14, stiffness: 120 });
  }, [scale, status]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ scale: scale.value }],
  }));

  const { fill, stroke } = useMemo(() => seatStatusStyles[status], [status]);

  const handlePress = () => {
    if (status !== 'available' && status !== 'selected') {
      return;
    }
    onSelect(table);
  };

  const handleHover = (event: any) => {
    if (status !== 'available' && status !== 'selected') {
      return;
    }
    const layout = event?.nativeEvent;
    if (!layout) return;
    const { pageX, pageY } = layout;
    onPreview(table, { x: pageX, y: pageY });
  };

  const center = table.position ?? [50, 50];
  const rotation = table.rotation ?? table.geometry?.rotation ?? 0;

  const footprint = table.footprint ?? table.geometry?.footprint;

  const renderShape = () => {
    if (footprint?.length) {
      const points = footprint.map(([x, y]) => `${x},${y}`).join(' ');
      return <Polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.2} />;
    }
    if (table.shape === 'rect' || table.shape === 'booth' || table.shape === 'pod') {
      return (
        <Rect
          x={center[0] - 5}
          y={center[1] - 4}
          width={10}
          height={8}
          rx={table.shape === 'booth' ? 3 : 6}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
      );
    }
    return <Circle cx={center[0]} cy={center[1]} r={4.2} fill={fill} stroke={stroke} strokeWidth={1.2} />;
  };

  const groupProps: any = {
    animatedProps,
    onPress: handlePress,
    onLongPress: handlePress,
    accessibilityRole: 'button',
    accessibilityLabel: `${table.name}, seats ${table.capacity}`,
    accessibilityState: { disabled: status !== 'available' && status !== 'selected', selected: status === 'selected' },
    transform: `rotate(${rotation}, ${center[0]}, ${center[1]})`,
  };

  if (Platform.OS === 'web') {
    groupProps.onResponderGrant = handleHover;
    groupProps.onHoverIn = handleHover;
  }

  return (
    <AnimatedGroup {...groupProps}>
      {renderShape()}
      <SvgText
        x={center[0]}
        y={center[1] + 1}
        fontSize={2.6}
        fontWeight="600"
        fill={status === 'selected' ? '#fff' : '#0f172a'}
        textAnchor="middle"
      >
        {table.name}
      </SvgText>
    </AnimatedGroup>
  );
}

export function TableMarkerLayer({ children }: { children: React.ReactNode }) {
  return <Svg width="100%" height="100%" viewBox="0 0 100 100">{children}</Svg>;
}

export default TableMarker;
