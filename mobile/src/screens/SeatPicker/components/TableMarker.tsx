import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';

import type { TableDetail } from '../../../api';
import { colors } from '../../../config/theme';
import type { TableStatus } from '../useVenueLayout';

type Props = {
  table: TableDetail;
  status: TableStatus;
  accent: string;
  onSelect: (table: TableDetail) => void;
  onPreview: (table: TableDetail, anchor: { x: number; y: number }) => void;
};

const STATUS_FILLS: Record<TableStatus, string> = {
  available: 'rgba(231, 169, 119, 0.26)',
  held: 'rgba(163, 163, 128, 0.28)',
  reserved: 'rgba(110, 94, 76, 0.32)',
  selected: colors.primaryStrong,
};

const AnimatedGroup = Animated.createAnimatedComponent(G);

export function TableMarker({ table, status, accent, onSelect, onPreview }: Props) {
  const scale = useSharedValue(status === 'selected' ? 1.04 : 1);

  useEffect(() => {
    scale.value = withSpring(status === 'selected' ? 1.06 : 1, { damping: 14, stiffness: 120 });
  }, [scale, status]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fill = useMemo(() => {
    if (status === 'available' && table.featured) {
      return 'rgba(244, 201, 160, 0.55)';
    }
    return STATUS_FILLS[status];
  }, [status, table.featured]);

  const border = status === 'selected' ? accent : `${accent}55`;

  const handlePress = () => onSelect(table);

  const handleHover = (event: any) => {
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
      return <Polygon points={points} fill={fill} stroke={border} strokeWidth={1.2} />;
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
          stroke={border}
          strokeWidth={1.2}
        />
      );
    }
    return <Circle cx={center[0]} cy={center[1]} r={4.2} fill={fill} stroke={border} strokeWidth={1.2} />;
  };

  return (
    <AnimatedGroup
      animatedProps={animatedProps}
      onPress={handlePress}
      onLongPress={handlePress}
      onResponderGrant={Platform.OS === 'web' ? handleHover : undefined}
      onHoverIn={Platform.OS === 'web' ? handleHover : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${table.name}, seats ${table.capacity}`}
      transform={`rotate(${rotation}, ${center[0]}, ${center[1]})`}
    >
      {renderShape()}
      <SvgText
        x={center[0]}
        y={center[1] + 1}
        fontSize={2.6}
        fontWeight="600"
        fill={status === 'selected' ? '#2F1C11' : colors.text}
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
