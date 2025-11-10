import type { RestaurantSummary } from '../api';

type PriceBucket = 1 | 2 | 3 | 4;

const priceKeywordMap: Record<PriceBucket, string[]> = {
  1: ['cheap', 'budget', 'value', 'student', 'low key', 'casual', 'affordable'],
  2: ['mid', 'relaxed', 'weekday', 'lunch', 'comfortable'],
  3: ['nice', 'date', 'special', 'celebration', 'anniversary', 'romantic'],
  4: ['luxury', 'splurge', 'fine dining', 'tasting', 'upscale', 'premium', 'fancy'],
};

const vibeKeywordMap: Array<{
  keywords: string[];
  tags: string[];
  weight?: number;
}> = [
  {
    keywords: ['romantic', 'date', 'anniversary', 'proposal', 'candlelit'],
    tags: ['skyline', 'sunset', 'fine_dining', 'wine_cellar'],
  },
  {
    keywords: ['family', 'kids', 'brunch', 'sunday', 'relaxed'],
    tags: ['family', 'brunch', 'breakfast'],
  },
  {
    keywords: ['live music', 'band', 'dj', 'late night', 'nightlife'],
    tags: ['live_music', 'late_night'],
  },
  {
    keywords: ['waterfront', 'seaside', 'boulevard', 'caspian', 'sea view', 'harbor', 'harbour'],
    tags: ['waterfront', 'sunset'],
  },
  {
    keywords: ['rooftop', 'skyline', 'view', 'panorama'],
    tags: ['skyline', 'sunset', 'hotel_partner'],
  },
  {
    keywords: ['garden', 'outdoor', 'terrace', 'patio'],
    tags: ['garden'],
  },
  {
    keywords: ['heritage', 'old city', 'icheri', 'ichari', 'history'],
    tags: ['old_city', 'heritage'],
  },
  {
    keywords: ['steak', 'meat', 'ribeye'],
    tags: ['steakhouse'],
  },
  {
    keywords: ['seafood', 'fish', 'oyster'],
    tags: ['seafood'],
  },
  {
    keywords: ['dessert', 'sweet', 'patisserie'],
    tags: ['dessert'],
  },
  {
    keywords: ['wine', 'sommelier', 'cellar'],
    tags: ['wine_cellar'],
  },
  {
    keywords: ['casual', 'chill', 'laid back', 'quick bite'],
    tags: ['casual', 'quick_bite', 'comfort'],
  },
];

const cuisineKeywordMap: Record<string, string[]> = {
  italian: ['pasta', 'italian', 'trattoria'],
  azerbaijani: ['azerbaijani', 'local', 'national'],
  seafood: ['seafood', 'fish', 'oyster', 'caviar'],
  steakhouse: ['steak', 'grill', 'meat'],
  sushi: ['sushi', 'japanese', 'nigiri'],
  mediterranean: ['mediterranean', 'mezze'],
  turkish: ['turkish', 'ocakbasi'],
  cafe: ['cafe', 'coffee'],
  brunch: ['brunch', 'breakfast'],
};

const locationKeywords = [
  { keywords: ['old city', 'icheri', 'ichari'], tag: 'old_city', weight: 1.2 },
  { keywords: ['boulevard', 'seaside', 'caspian', 'waterfront'], tag: 'waterfront', weight: 1.4 },
];

const tokenizer = (value: string) => value.toLowerCase().trim();

const includesKeyword = (haystack: string, keyword: string) =>
  haystack.includes(keyword.toLowerCase());

const detectPricePreference = (prompt: string): PriceBucket | null => {
  const normalized = tokenizer(prompt);
  for (const [bucket, words] of Object.entries(priceKeywordMap)) {
    if (words.some((word) => includesKeyword(normalized, word))) {
      return Number(bucket) as PriceBucket;
    }
  }
  return null;
};

const bucketForPriceLevel = (price?: string | null): PriceBucket => {
  if (!price) return 2;
  const match = price.match(/([1-4])/);
  if (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 4) {
      return value as PriceBucket;
    }
  }
  if (/azn\s+([0-9]+)/i.test(price)) {
    const spend = Number(price.match(/([0-9]+)/)?.[1] ?? 0);
    if (spend >= 100) return 4;
    if (spend >= 70) return 3;
    if (spend >= 40) return 2;
  }
  return 2;
};

const scorePriceFit = (prompt: string, restaurant: RestaurantSummary): number => {
  const preference = detectPricePreference(prompt);
  if (!preference) return 0;
  const bucket = bucketForPriceLevel(restaurant.price_level || restaurant.average_spend);
  const delta = Math.abs(bucket - preference);
  return Math.max(0, 2.5 - delta * 1.2);
};

const scoreTagMatches = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const tags = (restaurant.tags || []).map((tag) => tag.toLowerCase());
  if (!tags.length) return 0;
  let score = 0;
  vibeKeywordMap.forEach(({ keywords, tags: desiredTags, weight = 1.5 }) => {
    const matchesPrompt = keywords.some((keyword) => includesKeyword(haystack, keyword));
    if (!matchesPrompt) return;
    const matchesTag = desiredTags.some((target) => tags.includes(target));
    if (matchesTag) {
      score += weight;
    }
  });
  return score;
};

const scoreCuisineMatches = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const cuisines = (restaurant.cuisine || []).map((c) => c.toLowerCase());
  if (!cuisines.length) return 0;
  let score = 0;
  Object.entries(cuisineKeywordMap).forEach(([cuisineKey, keywords]) => {
    if (!cuisines.includes(cuisineKey)) return;
    if (keywords.some((keyword) => includesKeyword(haystack, keyword))) {
      score += 1.4;
    }
  });
  return score;
};

const scoreLocationHints = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const tags = (restaurant.tags || []).map((tag) => tag.toLowerCase());
  const description = `${restaurant.short_description || ''} ${restaurant.city || ''}`.toLowerCase();
  let score = 0;
  locationKeywords.forEach(({ keywords, tag, weight }) => {
    const matchesPrompt = keywords.some((keyword) => includesKeyword(haystack, keyword));
    if (!matchesPrompt) return;
    const hasTag = tags.includes(tag);
    const hasTextMatch = keywords.some((keyword) => description.includes(keyword));
    if (hasTag || hasTextMatch) {
      score += weight ?? 1;
    }
  });
  return score;
};

const scoreDescriptionOverlap = (prompt: string, restaurant: RestaurantSummary): number => {
  const haystack = tokenizer(prompt);
  const description = (restaurant.short_description || '').toLowerCase();
  if (!description) return 0;
  const keywords = ['waterfront', 'garden', 'rooftop', 'brunch', 'cocktail', 'heritage', 'seafood'];
  const overlaps = keywords.filter((keyword) => includesKeyword(haystack, keyword) && description.includes(keyword));
  return overlaps.length * 0.8;
};

const fallbackScore = (restaurant: RestaurantSummary, index: number): number => 0.2 - index * 0.001;

export const recommendRestaurants = (
  prompt: string,
  restaurants: RestaurantSummary[],
  limit = 4,
): RestaurantSummary[] => {
  const query = prompt.trim();
  if (!query) return [];
  const normalized = tokenizer(query);
  const scored = restaurants.map((restaurant, index) => {
    const score =
      scorePriceFit(normalized, restaurant) +
      scoreTagMatches(normalized, restaurant) +
      scoreCuisineMatches(normalized, restaurant) +
      scoreLocationHints(normalized, restaurant) +
      scoreDescriptionOverlap(normalized, restaurant) +
      fallbackScore(restaurant, index);
    return { restaurant, score };
  });
  const filtered = scored
    .filter((item) => item.score > 0.3)
    .sort((a, b) => b.score - a.score || a.restaurant.name.localeCompare(b.restaurant.name))
    .slice(0, limit)
    .map((item) => item.restaurant);

  if (filtered.length) {
    return filtered;
  }
  return restaurants.slice(0, limit);
};
