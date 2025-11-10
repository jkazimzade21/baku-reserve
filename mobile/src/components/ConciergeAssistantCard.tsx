import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import type { RestaurantSummary } from '../api';
import { colors, radius, shadow, spacing } from '../config/theme';
import { recommendRestaurants } from '../utils/conciergeRecommender';
import { defaultFallbackSource, resolveRestaurantPhotos } from '../utils/photoSources';

type Props = {
  restaurants: RestaurantSummary[];
  onSelect: (restaurant: RestaurantSummary) => void;
};

const ideaStarters = [
  'Romantic skyline dinner with cocktails',
  'Family-friendly brunch in the Old City',
  'Chill waterfront seafood around 70 AZN',
  'Client dinner that feels upscale but relaxed',
];

type Status = 'idle' | 'thinking' | 'done';

export default function ConciergeAssistantCard({ restaurants, onSelect }: Props) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [results, setResults] = useState<RestaurantSummary[]>([]);
  const [lastQuery, setLastQuery] = useState('');

  const runQuery = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStatus('idle');
      setResults([]);
      setLastQuery('');
      return;
    }
    setStatus('thinking');
    const picks = recommendRestaurants(trimmed, restaurants, 4);
    setResults(picks);
    setLastQuery(trimmed);
    setStatus('done');
  };

  useEffect(() => {
    if (lastQuery) {
      setResults(recommendRestaurants(lastQuery, restaurants, 4));
      setStatus('done');
    }
  }, [restaurants, lastQuery]);

  const handleIdeaPress = (idea: string) => {
    setPrompt(idea);
    runQuery(idea);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>New • Friendly AI</Text>
      <Text style={styles.title}>Describe the vibe</Text>
      <Text style={styles.subtitle}>
        Mention price, neighbourhood, mood, or anything else and Table Scout will suggest a few spots.
      </Text>
      <TextInput
        value={prompt}
        multiline
        placeholder="E.g. Cozy garden dinner for two under 80 AZN"
        placeholderTextColor={colors.muted}
        onChangeText={setPrompt}
        style={styles.input}
      />
      <Pressable style={styles.button} onPress={() => runQuery(prompt)}>
        <Feather name="zap" size={16} color="#fff" />
        <Text style={styles.buttonText}>Show matches</Text>
      </Pressable>
      <View style={styles.chipWrap}>
        {ideaStarters.map((idea) => (
          <Pressable key={idea} style={styles.ideaChip} onPress={() => handleIdeaPress(idea)}>
            <Text style={styles.ideaText}>{idea}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.resultsBlock}>
        {status === 'thinking' ? (
          <View style={styles.resultLoading}>
            <ActivityIndicator color={colors.primaryStrong} />
            <Text style={styles.resultHint}>Pulling a short list…</Text>
          </View>
        ) : results.length > 0 ? (
          <View style={styles.resultList}>
            {results.map((restaurant) => {
              const bundle = resolveRestaurantPhotos(restaurant);
              const source = bundle.cover || bundle.gallery[0] || defaultFallbackSource;
              return (
                <Pressable
                  key={restaurant.id}
                  style={styles.resultCard}
                  onPress={() => onSelect(restaurant)}
                >
                  <Image source={source} style={styles.resultImage} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultName}>{restaurant.name}</Text>
                    <Text style={styles.resultMeta} numberOfLines={2}>
                      {restaurant.short_description || restaurant.cuisine?.join(' • ')}
                    </Text>
                    <Text style={styles.resultTags}>
                      {[restaurant.price_level, restaurant.cuisine?.[0], restaurant.city]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={18} color={colors.primaryStrong} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.resultHint}>Tell us what you’re craving and we’ll narrow it down.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  kicker: {
    color: colors.primaryStrong,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 16,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.primaryStrong,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ideaChip: {
    backgroundColor: colors.overlay,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  ideaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resultsBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  resultHint: {
    color: colors.muted,
    fontStyle: 'italic',
  },
  resultLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultList: {
    gap: spacing.sm,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
  },
  resultCopy: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontWeight: '700',
    color: colors.text,
  },
  resultMeta: {
    color: colors.muted,
    fontSize: 13,
  },
  resultTags: {
    color: colors.muted,
    fontSize: 12,
  },
});
