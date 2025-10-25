import React, { useCallback, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withSpring } from 'react-native-reanimated';

import { colors, radius, shadow, spacing } from '../../config/theme';
import type { FloorOverlay, FloorOverlayType, FloorPlanDefinition } from './types';

type Props = {
  plan: FloorPlanDefinition;
  venueName?: string;
  interactiveTypes?: FloorOverlayType[];
  activeOverlayId?: string | null;
  labels?: Record<string, string>;
  detailMode?: 'internal' | 'none';
  isInteractive?: (overlay: FloorOverlay) => boolean;
  onOverlayPress?: (overlay: FloorOverlay) => void;
};

type OverlayLayout = {
  overlay: FloorOverlay;
  left: number;
  top: number;
  width: number;
  height: number;
};

const INITIAL_SCALE = 1;
const MIN_SCALE = 0.7;
const MAX_SCALE = 3;
const DOUBLE_TAP_SCALE = 1.35;

export const overlayIcons: Record<FloorOverlayType, keyof typeof Feather.glyphMap> = {
  table: 'circle',
  booth: 'grid',
  bar: 'coffee',
  dj: 'music',
  kitchen: 'tool',
  entry: 'corner-right-up',
  lounge: 'activity',
  terrace: 'wind',
  stage: 'headphones',
  service: 'truck',
};

export default function FloorPlanExplorer({
  plan,
  venueName,
  interactiveTypes = ['table', 'booth'],
  activeOverlayId,
  labels,
  detailMode = 'internal',
  isInteractive,
  onOverlayPress,
}: Props) {
  const [internalActiveId, setInternalActiveId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const scale = useSharedValue(INITIAL_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const imageAspectRatio = plan.imageSize.height / plan.imageSize.width;
  const displayHeight = canvasWidth ? canvasWidth * imageAspectRatio : 0;

  const interactiveTypeSet = useMemo(() => new Set(interactiveTypes), [interactiveTypes]);
  const checkInteractive = useCallback(
    (overlay: FloorOverlay) => {
      if (typeof isInteractive === 'function') {
        return isInteractive(overlay);
      }
      return interactiveTypeSet.has(overlay.type);
    },
    [interactiveTypeSet, isInteractive],
  );

  const overlayLayouts: OverlayLayout[] = useMemo(() => {
    if (!canvasWidth || !displayHeight) return [];
    return plan.overlays.map((overlay) => {
      const centerX = (overlay.position.x / 100) * canvasWidth;
      const centerY = (overlay.position.y / 100) * displayHeight;
      const width = overlay.size ? (overlay.size.width / 100) * canvasWidth : 44;
      const height = overlay.size ? (overlay.size.height / 100) * displayHeight : 44;
      return {
        overlay,
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
      };
    });
  }, [plan.overlays, canvasWidth, displayHeight]);

  const derivedActiveId = activeOverlayId ?? internalActiveId;

  const activeLayout = useMemo(
    () => overlayLayouts.find(({ overlay }) => overlay.id === derivedActiveId) ?? null,
    [overlayLayouts, derivedActiveId],
  );

  const legendEntries = useMemo(() => {
    if (plan.legend) {
      return Object.entries(plan.legend).map(([type, label]) => ({
        type: type as FloorOverlayType,
        label,
      }));
    }
    const labels = new Map<FloorOverlayType, string>();
    plan.overlays.forEach((overlay) => {
      if (!labels.has(overlay.type)) {
        labels.set(overlay.type, overlay.type.replace('_', ' '));
      }
    });
    return Array.from(labels.entries()).map(([type, label]) => ({ type, label }));
  }, [plan.legend, plan.overlays]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      const height = width * imageAspectRatio;
      setCanvasWidth(width);
      setCanvasHeight(height);
      translateX.value = 0;
      translateY.value = 0;
      scale.value = INITIAL_SCALE;
      if (detailMode === 'internal') {
        setInternalActiveId(null);
      }
    },
    [detailMode, imageAspectRatio, scale, translateX, translateY],
  );

  const clampTranslation = useCallback(
    (current: number, delta: number, axisLength: number) => {
      'worklet';
      if (axisLength === 0) return 0;
      const overflow = axisLength * scale.value - axisLength;
      if (overflow <= 0) return 0;
      const limit = overflow / 2 + 32;
      const next = current + delta;
      return Math.max(-limit, Math.min(limit, next));
    },
    [scale.value],
  );

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onChange((event) => {
      translateX.value = clampTranslation(translateX.value, event.changeX, canvasWidth);
      translateY.value = clampTranslation(translateY.value, event.changeY, canvasHeight);
    })
    .onEnd((event) => {
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-600, 600],
        deceleration: 0.995,
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-600, 600],
        deceleration: 0.995,
      });
    });

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * event.scale));
      scale.value = nextScale;
    })
    .onEnd(() => {
      if (scale.value < INITIAL_SCALE) {
        scale.value = withSpring(INITIAL_SCALE, { damping: 18, stiffness: 140 });
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_event, success) => {
      if (!success) return;
      const target = Math.min(MAX_SCALE, Math.max(DOUBLE_TAP_SCALE, scale.value * 1.2));
      scale.value = withSpring(target, { damping: 18, stiffness: 160 });
    });

  const composedGesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const focusOverlay = useCallback(
    (layout: OverlayLayout) => {
      if (!canvasWidth || !canvasHeight) return;
      const centerX = layout.left + layout.width / 2;
      const centerY = layout.top + layout.height / 2;
      const offsetX = canvasWidth / 2 - centerX;
      const offsetY = canvasHeight / 2 - centerY;

      const targetScale = Math.min(MAX_SCALE, Math.max(scale.value, 1.4));
      scale.value = withSpring(targetScale, { damping: 20, stiffness: 160 });
      translateX.value = withSpring(offsetX, { damping: 20, stiffness: 160 });
      translateY.value = withSpring(offsetY, { damping: 20, stiffness: 160 });
    },
    [canvasWidth, canvasHeight, scale, translateX, translateY],
  );

  const handleOverlayPress = useCallback(
    (layout: OverlayLayout) => {
      if (!checkInteractive(layout.overlay)) return;
      if (detailMode === 'internal') {
        setInternalActiveId((prev) => (prev === layout.overlay.id ? null : layout.overlay.id));
      }
      focusOverlay(layout);
      onOverlayPress?.(layout.overlay);
    },
    [checkInteractive, detailMode, focusOverlay, onOverlayPress],
  );

  const resetView = useCallback(() => {
    scale.value = withSpring(INITIAL_SCALE, { damping: 18, stiffness: 150 });
    translateX.value = withSpring(0, { damping: 18, stiffness: 150 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 150 });
    if (detailMode === 'internal') {
      setInternalActiveId(null);
    }
  }, [detailMode, scale, translateX, translateY]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Interactive floor explorer</Text>
      <Text style={styles.sectionSubtitle}>
        Pinch to zoom, drag to pan, and tap hotspots to explore {venueName ?? plan.label ?? 'this venue'}.
      </Text>

      <View style={[styles.canvasShell, { height: displayHeight || 320 }]} onLayout={handleLayout}>
        {canvasWidth > 0 ? (
          <>
            <GestureDetector gesture={composedGesture}>
              <Animated.View
                style={[styles.canvasContent, animatedStyle, { width: canvasWidth, height: displayHeight }]}
              >
                <Image
                  source={plan.image}
                  style={{ width: canvasWidth, height: displayHeight, position: 'absolute', top: 0, left: 0 }}
                  resizeMode="contain"
                />
                {overlayLayouts.map((layout) => {
                  const { overlay, left, top, width, height } = layout;
                  const icon = overlayIcons[overlay.type] ?? 'map-pin';
                  const label = labels?.[overlay.id];
                  const isActive = derivedActiveId === overlay.id;
                  const markerStyle = [
                    styles.overlayMarker,
                    {
                      left,
                      top,
                      width,
                      height,
                      borderColor: isActive ? colors.primaryStrong : `${plan.accent}88`,
                      backgroundColor: isActive ? `${plan.accent}60` : `${plan.accent}30`,
                      borderRadius: overlay.shape === 'rect' ? radius.md : width / 2,
                    },
                  ];
                  const content = (
                    <View style={styles.overlayTag}>
                      {label ? (
                        <Text
                          style={[
                            styles.overlayTagText,
                            isActive && styles.overlayTagTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      ) : (
                        <Feather name={icon} size={14} color={isActive ? '#fff' : colors.primaryStrong} />
                      )}
                    </View>
                  );
                  if (!checkInteractive(overlay)) {
                    return (
                      <View key={overlay.id} style={markerStyle} pointerEvents="none">
                        {content}
                      </View>
                    );
                  }
                  return (
                    <Pressable key={overlay.id} style={markerStyle} onPress={() => handleOverlayPress(layout)}>
                      {content}
                    </Pressable>
                  );
                })}
              </Animated.View>
            </GestureDetector>
            <Pressable style={styles.resetButton} onPress={resetView}>
              <Feather name="target" size={16} color={colors.primaryStrong} />
              <Text style={styles.resetButtonText}>Reset view</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <View style={styles.legendCard}>
        {legendEntries.map((entry) => (
          <View key={`${entry.type}-legend`} style={styles.legendRow}>
            <Feather name={overlayIcons[entry.type] ?? 'map-pin'} size={14} color={colors.primaryStrong} />
            <Text style={styles.legendLabel}>{entry.label}</Text>
          </View>
        ))}
      </View>

      {detailMode === 'internal' && activeLayout ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>{activeLayout.overlay.title}</Text>
              {activeLayout.overlay.subtitle ? (
                <Text style={styles.detailSubtitle}>{activeLayout.overlay.subtitle}</Text>
              ) : null}
            </View>
          </View>
          {activeLayout.overlay.description ? (
            <Text style={styles.detailDescription}>{activeLayout.overlay.description}</Text>
          ) : null}
          {activeLayout.overlay.occupancy ? (
            <View style={styles.occupancyRow}>
              <View style={styles.occupancyBarBackground}>
                <View
                  style={[
                    styles.occupancyBarFill,
                    {
                      width: `${Math.min(
                        100,
                        (activeLayout.overlay.occupancy.available / activeLayout.overlay.occupancy.total) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.occupancyLabel}>
                {activeLayout.overlay.occupancy.available} of {activeLayout.overlay.occupancy.total} tables available
                {typeof activeLayout.overlay.occupancy.onHold === 'number'
                  ? ` · ${activeLayout.overlay.occupancy.onHold} on hold`
                  : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
  },
  canvasShell: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  canvasContent: {
    position: 'relative',
  },
  overlayMarker: {
    position: 'absolute',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTag: {
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  overlayTagText: {
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  overlayTagTextActive: {
    color: '#fff',
  },
  resetButton: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  legendCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'capitalize',
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailAccent: {
    width: 6,
    height: '100%',
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryStrong,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  detailSubtitle: {
    color: colors.muted,
  },
  detailDescription: {
    color: colors.muted,
    lineHeight: 20,
  },
  occupancyRow: {
    gap: spacing.xs,
  },
  occupancyBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.overlay,
    overflow: 'hidden',
  },
  occupancyBarFill: {
    height: 6,
    backgroundColor: colors.primaryStrong,
  },
  occupancyLabel: {
    fontSize: 12,
    color: colors.muted,
  },
});
