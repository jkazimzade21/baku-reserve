import React, { useEffect } from 'react';
import { Image, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { AreaDetail, TableDetail } from '../../../api';
import { colors, radius, shadow, spacing } from '../../../config/theme';

type Props = {
  table: TableDetail | null;
  area: AreaDetail | null;
  visible: boolean;
  onClose: () => void;
  onReserve: () => void;
};

const photos = [
  'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=600&q=80',
];

export function SeatPreviewDrawer({ table, area, visible, onClose, onReserve }: Props) {
  const translateY = useSharedValue(visible ? 0 : 320);

  useEffect(() => {
    translateY.value = withTiming(visible ? 0 : 320, { duration: 280 });
  }, [translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleShare = async () => {
    if (!table) return;
    const message = `Let's reserve ${table.name} (${table.capacity} seats) at ${area?.name ?? 'the venue'}.`;
    try {
      await Share.share({ message });
    } catch (err) {
      // noop
    }
  };

  const accent = area?.theme?.accent ?? colors.primary;

  return (
    <Animated.View style={[styles.drawer, animatedStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.handle} />
      <View style={styles.row}>
        <View style={styles.infoColumn}>
          <Text style={styles.drawerTitle}>{table?.name ?? 'Select a table'}</Text>
          <Text style={styles.drawerMeta}>
            {area?.name ?? ''}
            {table ? ` • Seats ${table.capacity}` : ''}
          </Text>
          {table?.tags?.length ? (
            <View style={styles.tagRow}>
              {table.tags.map((tag) => (
                <View key={tag} style={[styles.tag, { borderColor: accent }]}>
                  <Text style={[styles.tagText, { color: accent }]}>{tag.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Pressable onPress={handleShare} style={styles.shareButton}>
          <Text style={styles.shareText}>Share</Text>
        </Pressable>
      </View>
      <View style={styles.photoRow}>
        {photos.map((uri, index) => (
          <Image key={index} source={{ uri }} style={styles.photo} resizeMode="cover" />
        ))}
      </View>
      <View style={styles.actionRow}>
        <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>Close</Text>
        </Pressable>
        <Pressable onPress={onReserve} style={[styles.primary, { backgroundColor: accent }]}> 
          <Text style={styles.primaryText}>Reserve this table</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.15)' : colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  drawerMeta: {
    color: colors.muted,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(231, 169, 119, 0.12)',
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  shareButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(94, 70, 48, 0.16)',
  },
  shareText: {
    fontWeight: '600',
    color: colors.text,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photo: {
    flex: 1,
    height: 80,
    borderRadius: radius.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondary: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(94, 70, 48, 0.16)',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  primary: {
    flex: 2,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  primaryText: {
    color: '#2F1C11',
    fontWeight: '700',
  },
});

export default SeatPreviewDrawer;
