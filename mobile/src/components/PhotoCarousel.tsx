import React, { useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../config/theme';

type Props = {
  photos: string[];
  height?: number;
};

const { width: screenWidth } = Dimensions.get('window');
const slideWidth = screenWidth - spacing.lg * 2;

export default function PhotoCarousel({ photos, height = 240 }: Props) {
  const [index, setIndex] = useState(0);

  if (!photos.length) {
    return null;
  }

  return (
    <View style={[styles.wrapper, { height }]}> 
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(event) => {
          const offsetX = event.nativeEvent.contentOffset.x;
          setIndex(Math.round(offsetX / slideWidth));
        }}
        scrollEventThrottle={16}
      >
        {photos.map((uri) => (
          <Image key={uri} source={{ uri }} style={[styles.image, { width: slideWidth, height }]} />
        ))}
      </ScrollView>
      <View style={styles.pagination}>
        <Text style={styles.paginationText}>
          {index + 1} / {photos.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    width: slideWidth,
  },
  image: {
    resizeMode: 'cover',
  },
  pagination: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  paginationText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
});
