import { render } from '@testing-library/react-native';
import React from 'react';

import PhotoCarousel from '../src/components/PhotoCarousel';

describe('PhotoCarousel', () => {
  it('renders nothing when no photos are provided', () => {
    const { toJSON } = render(<PhotoCarousel photos={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('displays pagination for provided photos', () => {
    const { getByText } = render(
      <PhotoCarousel photos={['https://example.com/a.jpg', 'https://example.com/b.jpg']} height={200} />,
    );
    expect(getByText('1 / 2')).toBeTruthy();
  });
});
