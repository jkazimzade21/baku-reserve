import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import RestaurantCard from '../src/components/RestaurantCard';
import type { RestaurantSummary } from '../src/api';

const baseRestaurant: RestaurantSummary = {
  id: 'rest-1',
  name: 'Skyline Lounge',
  cuisine: ['International', 'Seafood', 'Mediterranean'],
  city: 'Baku',
  short_description: 'Sunset cocktails overlooking the boulevard.',
  price_level: 'AZN 3/4',
  tags: ['waterfront', 'sunset'],
  requires_deposit: true,
  cover_photo: 'https://example.com/photo.jpg',
};

describe('RestaurantCard', () => {
  it('renders core metadata and badges', () => {
    const onPress = jest.fn();
    const { getByText, queryByText } = render(<RestaurantCard item={baseRestaurant} onPress={onPress} />);

    expect(getByText('Skyline Lounge')).toBeTruthy();
    expect(getByText('International')).toBeTruthy();
    expect(getByText('+2')).toBeTruthy();
    expect(getByText('Deposit')).toBeTruthy();
    expect(getByText('Waterfront')).toBeTruthy();
    expect(getByText(/AZN 3\/4/)).toBeTruthy();

    fireEvent.press(getByText('Skyline Lounge'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('falls back to initials when no cover photo exists', () => {
    const item: RestaurantSummary = {
      ...baseRestaurant,
      id: 'rest-2',
      name: 'Garden Club',
      cover_photo: undefined,
      tags: [],
      requires_deposit: false,
    };
    const { getByText, queryByText } = render(<RestaurantCard item={item} onPress={jest.fn()} />);

    expect(getByText('G')).toBeTruthy();
    expect(queryByText('Deposit')).toBeNull();
  });
});
