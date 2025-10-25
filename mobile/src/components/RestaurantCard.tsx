import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { RestaurantSummary } from '../api';

type Props = {
  item: RestaurantSummary;
  onPress: () => void;
};

export default function RestaurantCard({ item, onPress }: Props) {
  const primaryCuisine = item.cuisine?.[0];
  const extraCount = Math.max((item.cuisine?.length ?? 0) - 1, 0);
  const formattedTag = item.tags?.find((tag) => tag !== 'must_book') ?? item.tags?.[0];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      {item.cover_photo ? (
        <Image source={{ uri: item.cover_photo }} style={styles.cover} />
      ) : (
        <View style={styles.coverFallback}>
          <Text style={styles.coverFallbackText}>{item.name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.title}>{item.name}</Text>
        <View style={styles.metaRow}>
          {primaryCuisine ? <Text style={styles.meta}>{primaryCuisine}</Text> : null}
          {extraCount > 0 && <Text style={styles.badge}>+{extraCount}</Text>}
          {item.price_level ? <Text style={styles.metaDivider}>• {item.price_level}</Text> : null}
        </View>
        {item.short_description ? (
          <Text style={styles.description} numberOfLines={2}>
            {item.short_description}
          </Text>
        ) : null}
        {item.city ? <Text style={styles.city}>{item.city}</Text> : null}
        {formattedTag ? <Text style={styles.tag}>{formatTag(formattedTag)}</Text> : null}
      </View>
    </Pressable>
  );
}

function formatTag(tag: string) {
  return tag
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    ...shadow.card,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  cover: {
    width: 92,
    height: 72,
    borderRadius: radius.md,
  },
  coverFallback: {
    width: 92,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.primaryStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meta: {
    color: colors.muted,
    fontWeight: '500',
  },
  metaDivider: {
    color: colors.muted,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: 12,
    backgroundColor: 'rgba(14,165,233,0.16)',
    color: colors.primaryStrong,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  description: {
    color: colors.muted,
    fontSize: 13,
  },
  city: {
    color: colors.muted,
    fontSize: 13,
  },
  tag: {
    marginTop: spacing.xs,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
  },
});
