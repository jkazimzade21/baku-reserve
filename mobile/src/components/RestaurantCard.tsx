import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../config/theme';
import type { RestaurantSummary } from '../api';

type Props = {
  item: RestaurantSummary;
  onPress: () => void;
};

const tagPriority = [
  'book_early',
  'skyline',
  'late_night',
  'family_brunch',
  'waterfront',
  'seafood',
  'cocktails',
  'garden',
];

const canonicalTag = (tag: string) => {
  switch (tag) {
    case 'must_book':
      return 'book_early';
    case 'dj':
    case 'dj_nights':
    case 'cocktail_lab':
      return 'late_night';
    case 'family_style':
    case 'breakfast':
      return 'family_brunch';
    case 'rooftop':
    case 'panorama':
      return 'skyline';
    default:
      return tag;
  }
};

const pickDisplayTag = (tags?: string[]) => {
  if (!tags || tags.length === 0) return null;
  const normalized = tags.map((tag) => canonicalTag(tag));
  for (const candidate of tagPriority) {
    if (normalized.includes(candidate)) {
      return candidate;
    }
  }
  return normalized[0];
};

export default function RestaurantCard({ item, onPress }: Props) {
  const primaryCuisine = item.cuisine?.[0];
  const extraCount = Math.max((item.cuisine?.length ?? 0) - 1, 0);
  const showDepositBadge = item.requires_deposit;
  const displayTag = pickDisplayTag(item.tags);

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
        <View style={styles.footerRow}>
          {displayTag ? <Text style={styles.tag}>{formatTag(displayTag)}</Text> : null}
          {showDepositBadge ? <Text style={styles.depositBadge}>Deposit</Text> : null}
        </View>
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
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    color: colors.primary,
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
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  depositBadge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: colors.primaryStrong,
    backgroundColor: 'rgba(192, 132, 252, 0.16)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.lg,
  },
});
