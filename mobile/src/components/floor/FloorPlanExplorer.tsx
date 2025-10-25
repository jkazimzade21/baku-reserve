import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated';

import { colors, radius, shadow, spacing } from '../../config/theme';
import type { FloorOverlay, FloorOverlayType, FloorPlanDefinition } from './types';

type Props = {
  plan: FloorPlanDefinition;
  venueName?: string;
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

const overlayIcons: Record<FloorOverlayType, keyof typeof Feather.glyphMap> = {
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

export default function FloorPlanExplorer({ plan, venueName }: Props) {
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [visibleCategories, setVisibleCategories] = useState<Set<FloorOverlayType>>(
    () => new Set(plan.overlays.map((overlay) => overlay.type)),
  );
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);

  const scale = useSharedValue(INITIAL_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const canvasWidthShared = useSharedValue(1);
  const canvasHeightShared = useSharedValue(1);

  const imageAspectRatio = plan.imageSize.height / plan.imageSize.width;
  const displayHeight = canvasWidth ? canvasWidth * imageAspectRatio : 0;

  const filteredOverlays = useMemo(
    () => plan.overlays.filter((overlay) => visibleCategories.has(overlay.type)),
    [plan.overlays, visibleCategories],
  );

  const overlayLayouts: OverlayLayout[] = useMemo(() => {
    if (!canvasWidth || !displayHeight) return [];
    return filteredOverlays.map((overlay) => {
      const centerX = (overlay.position.x / 100) * canvasWidth;
      const centerY = (overlay.position.y / 100) * displayHeight;
      const width = overlay.size
        ? (overlay.size.width / 100) * canvasWidth
        : 44;
      const height = overlay.size
        ? (overlay.size.height / 100) * displayHeight
        : 44;
      return {
        overlay,
        left: centerX - width / 2,
        top: centerY - height / 2,
        width,
        height,
      };
    });
  }, [filteredOverlays, canvasWidth, displayHeight]);

  const activeLayout = useMemo(
    () => overlayLayouts.find(({ overlay }) => overlay.id === activeOverlayId) ?? null,
    [overlayLayouts, activeOverlayId],
  );

  const legendEntries = useMemo(() => {
    const baseLegend = plan.legend ?? {};
    const counts = new Map<FloorOverlayType, number>();
    plan.overlays.forEach((overlay) => {
      counts.set(overlay.type, (counts.get(overlay.type) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([type, count]) => ({
      type,
      count,
      label: baseLegend[type] ?? type.replace('_', ' '),
    }));
  }, [plan.legend, plan.overlays]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      const height = width * imageAspectRatio;
      setCanvasWidth(width);
      setCanvasHeight(height);
      canvasWidthShared.value = width;
      canvasHeightShared.value = height;
      translateX.value = 0;
      translateY.value = 0;
      scale.value = INITIAL_SCALE;
    },
    [imageAspectRatio, canvasWidthShared, canvasHeightShared, translateX, translateY, scale],
  );

  const clampTranslation = useCallback(
    (current: number, delta: number, axis: 'x' | 'y') => {
      'worklet';
      const base = axis === 'x' ? canvasWidthShared.value : canvasHeightShared.value;
      if (base === 0) return 0;
      const range = (base * scale.value - base) / 2;
      if (range <= 0) {
        return 0;
      }
      const next = current + delta;
      const padding = 32;
      return Math.max(-range - padding, Math.min(range + padding, next));
    },
    [canvasWidthShared, canvasHeightShared, scale],
  );

  const pan = Gesture.Pan()
    .maxPointers(2)
    .onChange((event) => {
      translateX.value = clampTranslation(translateX.value, event.changeX, 'x');
      translateY.value = clampTranslation(translateY.value, event.changeY, 'y');
    })
    .onEnd((event) => {
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-500, 500],
        deceleration: 0.995,
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-500, 500],
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

  const toggleCategory = (type: FloorOverlayType) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      if (activeOverlayId && !plan.overlays.some((overlay) => overlay.id === activeOverlayId && next.has(overlay.type))) {
        setActiveOverlayId(null);
      }
      return next;
    });
  };

  const isFavourite = useCallback((id: string) => favourites.has(id), [favourites]);

  const toggleFavourite = useCallback((id: string) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

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
      if (activeOverlayId === layout.overlay.id) {
        setActiveOverlayId(null);
        return;
      }
      setActiveOverlayId(layout.overlay.id);
      focusOverlay(layout);
    },
    [activeOverlayId, focusOverlay],
  );

  const resetView = useCallback(() => {
    scale.value = withSpring(INITIAL_SCALE, { damping: 18, stiffness: 150 });
    translateX.value = withSpring(0, { damping: 18, stiffness: 150 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 150 });
  }, [scale, translateX, translateY]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Interactive floor explorer</Text>
      <Text style={styles.sectionSubtitle}>
        Pinch to zoom, drag to pan, and tap hotspots to explore {venueName ?? plan.label ?? 'this venue'}.
      </Text>

      <View style={styles.chipRow}>
        {legendEntries.map((entry) => {
          const icon = overlayIcons[entry.type] ?? 'map-pin';
          const active = visibleCategories.has(entry.type);
          return (
            <Pressable
              key={entry.type}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => toggleCategory(entry.type)}
            >
              <Feather
                name={icon}
                size={14}
                color={active ? '#fff' : colors.muted}
              />
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {entry.label} · {entry.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={[styles.canvasShell, { height: displayHeight || 320 }]}
        onLayout={handleLayout}
      >
        {canvasWidth > 0 ? (
          <>
            <GestureDetector gesture={composedGesture}>
              <Animated.View
                style={[
                  styles.canvasContent,
                  animatedStyle,
                  { width: canvasWidth, height: displayHeight },
                ]}
              >
                <Image
                  source={plan.image}
                  style={{ width: canvasWidth, height: displayHeight, position: 'absolute', top: 0, left: 0 }}
                  resizeMode="contain"
                />
                {overlayLayouts.map((layout) => {
                  const { overlay, left, top, width, height } = layout;
                  const icon = overlayIcons[overlay.type] ?? 'map-pin';
                  const isActive = activeOverlayId === overlay.id;
                  const isFav = favourites.has(overlay.id);
                  return (
                    <Pressable
                      key={overlay.id}
                      style={[
                        styles.overlayMarker,
                        {
                          left,
                          top,
                          width,
                          height,
                          borderColor: isFav ? colors.success : `${plan.accent}77`,
                          backgroundColor: isActive ? `${plan.accent}88` : `${plan.accent}33`,
                          borderRadius: overlay.shape === 'rect' ? radius.md : width / 2,
                        },
                      ]}
                      onPress={() => handleOverlayPress(layout)}
                      onLongPress={() => toggleFavourite(overlay.id)}
                    >
                      <View style={styles.overlayTag}>
                        <Feather
                          name={icon}
                          size={14}
                          color={isActive ? '#fff' : colors.primaryStrong}
                        />
                      </View>
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

      {plan.quickFacts?.length ? (
        <View style={styles.quickFacts}>
          {plan.quickFacts.map((fact) => (
            <View key={fact.label} style={styles.quickFact}>
              <Text style={styles.quickFactLabel}>{fact.label}</Text>
              <Text style={styles.quickFactValue}>{fact.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {plan.legend ? (
        <View style={styles.legendCard}>
          {legendEntries.map((entry) => (
            <View key={`${entry.type}-legend`} style={styles.legendRow}>
              <Feather name={overlayIcons[entry.type] ?? 'map-pin'} size={14} color={colors.primaryStrong} />
              <Text style={styles.legendLabel}>{entry.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {activeLayout ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailTitle}>{activeLayout.overlay.title}</Text>
              {activeLayout.overlay.subtitle ? (
                <Text style={styles.detailSubtitle}>{activeLayout.overlay.subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => toggleFavourite(activeLayout.overlay.id)}
              style={[
                styles.favouriteButton,
                favourites.has(activeLayout.overlay.id) && styles.favouriteButtonActive,
              ]}
            >
              <Feather
                name="heart"
                size={16}
                color={favourites.has(activeLayout.overlay.id) ? '#fff' : colors.primaryStrong}
              />
              <Text
                style={[
                  styles.favouriteText,
                  favourites.has(activeLayout.overlay.id) && styles.favouriteTextActive,
                ]}
              >
                {favourites.has(activeLayout.overlay.id) ? 'Saved' : 'Save'}
              </Text>
            </Pressable>
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
                      width: `${Math.min(100, (activeLayout.overlay.occupancy.available / activeLayout.overlay.occupancy.total) * 100)}%`,
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
          <View style={styles.detailActions}>
            <Pressable style={styles.detailButton}>
              <Feather name="clock" size={14} color={colors.primaryStrong} />
              <Text style={styles.detailButtonText}>Hold 15 min</Text>
            </Pressable>
            <Pressable style={styles.detailButton}>
              <Feather name="share-2" size={14} color={colors.primaryStrong} />
              <Text style={styles.detailButtonText}>Share note</Text>
            </Pressable>
          </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: {
    backgroundColor: colors.primaryStrong,
    borderColor: colors.primaryStrong,
  },
  filterChipText: {
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'capitalize',
  },
  filterChipTextActive: {
    color: '#fff',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
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
  quickFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickFact: {
    flexBasis: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  quickFactLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: colors.muted,
    letterSpacing: 0.6,
  },
  quickFactValue: {
    marginTop: 2,
    fontWeight: '600',
    color: colors.text,
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
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
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
  favouriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryStrong,
  },
  favouriteButtonActive: {
    backgroundColor: colors.primaryStrong,
  },
  favouriteText: {
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  favouriteTextActive: {
    color: '#fff',
  },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  detailButtonText: {
    fontWeight: '600',
    color: colors.primaryStrong,
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
