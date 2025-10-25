import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import LiveSyncBadge from '../src/screens/SeatPicker/components/LiveSyncBadge';

describe('LiveSyncBadge', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('shows relative update time and triggers sync handler', () => {
    const onSync = jest.fn();
    const now = new Date('2024-08-01T18:00:30Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const updatedAt = new Date('2024-08-01T18:00:00Z');

    const { getByText } = render(
      <LiveSyncBadge updatedAt={updatedAt} syncing={false} error={null} onSync={onSync} />,
    );

    expect(getByText('Updated 30s ago')).toBeTruthy();

    fireEvent.press(getByText('Sync now'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it('renders error state when provided', () => {
    const { getByText } = render(
      <LiveSyncBadge updatedAt={null} syncing={false} error="Sync failed" onSync={jest.fn()} />,
    );

    expect(getByText('Sync failed')).toBeTruthy();
    expect(getByText('Awaiting sync')).toBeTruthy();
  });
});
