import React, { useCallback, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [legendOpen, setLegendOpen] = useState(false);
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
    const baseEntries: Array<{ type: FloorOverlayType; label: string }> = [];
    if (plan.legend) {
      Object.entries(plan.legend).forEach(([type, label]) => {
        baseEntries.push({ type: type as FloorOverlayType, label });
      });
    } else {
      const labelsMap = new Map<FloorOverlayType, string>();
      plan.overlays.forEach((overlay) => {
        if (!labelsMap.has(overlay.type)) {
          labelsMap.set(overlay.type, overlay.type.replace('_', ' '));
        }
      });
      labelsMap.forEach((label, type) => {
        baseEntries.push({ type, label });
      });
    }

    const normalized = new Map<string, { type: FloorOverlayType; label: string }>();
    baseEntries.forEach((entry) => {
      const key = entry.type === 'booth' ? 'table' : entry.type;
      if (normalized.has(key)) return;
      normalized.set(key, {
        type: key as FloorOverlayType,
        label:
          key === 'table'
            ? 'Table (selectable)'
            : key === 'service'
            ? 'Services & support'
            : key === 'entry'
            ? 'Entry & host'
            : entry.label,
      });
    });

    return Array.from(normalized.values());
  }, [plan.legend, plan.overlays]);
  const hasLegend = legendEntries.length > 0;

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
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Interactive floor explorer</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show floor legend"
          style={[styles.infoButton, !hasLegend && styles.infoButtonDisabled]}
          onPress={() => hasLegend && setLegendOpen(true)}
          disabled={!hasLegend}
        >
          <Feather name="info" size={16} color={hasLegend ? colors.primaryStrong : colors.muted} />
        </Pressable>
      </View>
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
                  style={[styles.canvasImage, { width: canvasWidth, height: displayHeight }]}
                  resizeMode="contain"
                />
                <View style={[styles.canvasTint, { width: canvasWidth, height: displayHeight }]} />
                {overlayLayouts.map((layout) => {
                  const { overlay, left, top, width, height } = layout;
                  const interactive = checkInteractive(overlay);
                  const icon = overlayIcons[overlay.type] ?? 'map-pin';
                  const label = labels?.[overlay.id];
                  const isActive = derivedActiveId === overlay.id && interactive;
                  const markerStyle = [
                    styles.overlayMarker,
                    {
                      left,
                      top,
                      width,
                      height,
                      borderColor: interactive
                        ? isActive
                          ? colors.primaryStrong
                          : `${plan.accent}88`
                        : 'transparent',
                      backgroundColor: interactive
                        ? isActive
                          ? `${plan.accent}60`
                          : `${plan.accent}24`
                        : 'transparent',
                      borderRadius: overlay.shape === 'rect' ? radius.md : width / 2,
                    },
                  ];
                  const tagStyles = [
                    styles.overlayTag,
                    !interactive && styles.overlayTagStatic,
                    isActive && interactive && styles.overlayTagActive,
                  ];
                  const content = (
                    <View style={tagStyles}>
                      {label ? (
                        <Text style={[styles.overlayTagText, isActive && styles.overlayTagTextActive]}>
                          {label}
                        </Text>
                      ) : (
                        <Feather
                          name={icon}
                          size={14}
                          color={
                            interactive
                              ? isActive
                                ? '#fff'
                                : colors.primaryStrong
                              : colors.muted
                          }
                        />
                      )}
                    </View>
                  );

                  if (!interactive) {
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

      {detailMode === 'internal' && activeLayout && checkInteractive(activeLayout.overlay) ? (
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
      <LegendDrawer visible={legendOpen && hasLegend} entries={legendEntries} onDismiss={() => setLegendOpen(false)} />
    </View>
  );
}

type LegendDrawerProps = {
  visible: boolean;
  entries: Array<{ type: FloorOverlayType; label: string }>;
  onDismiss: () => void;
};

function LegendDrawer({ visible, entries, onDismiss }: LegendDrawerProps) {
  if (!entries.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.legendOverlay}>
        <Pressable style={styles.legendScrim} onPress={onDismiss} />
        <View style={styles.legendSheet}>
          <Text style={styles.legendSheetTitle}>Legend</Text>
          <View style={styles.legendSheetList}>
            {entries.map((entry) => (
              <View key={`legend-${entry.type}`} style={styles.legendSheetRow}>
                <View style={[styles.overlayTag, styles.overlayTagStatic]}>
                  <Feather
                    name={overlayIcons[entry.type] ?? 'map-pin'}
                    size={16}
                    color={entry.type === 'table' ? colors.primaryStrong : colors.muted}
                  />
                </View>
                <Text style={styles.legendSheetLabel}>{entry.label}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.legendCloseButton} onPress={onDismiss}>
            <Text style={styles.legendCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  sectionSubtitle: {
    color: colors.muted,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonDisabled: {
    backgroundColor: 'transparent',
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
  canvasImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0.6,
  },
  canvasTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(247, 239, 229, 0.45)',
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
  overlayTagStatic: {
    minWidth: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    elevation: 0,
  },
  overlayTagActive: {
    backgroundColor: colors.primaryStrong,
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
  legendOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 20, 26, 0.35)',
    justifyContent: 'flex-end',
  },
  legendSheet: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg + spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    ...shadow.card,
  },
  legendSheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  legendScrim: {
    flex: 1,
  },
  legendSheetList: {
    gap: spacing.sm,
  },
  legendSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendSheetLabel: {
    color: colors.text,
  },
  legendCloseButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legendCloseText: {
    color: colors.text,
    fontWeight: '600',
  },
});
