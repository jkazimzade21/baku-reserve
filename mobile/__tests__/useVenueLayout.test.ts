import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useVenueLayout } from '../src/screens/SeatPicker/useVenueLayout';
import type { RestaurantDetail } from '../src/api';

const restaurant: RestaurantDetail = {
  id: 'venue-1',
  name: 'Seat Picker Venue',
  cuisine: ['Modern'],
  requires_deposit: false,
  areas: [
    {
      id: 'area-1',
      name: 'Main Dining',
      tables: [
        { id: 't-1', name: 'A1', capacity: 4, position: [20, 20] },
        { id: 't-2', name: 'A2', capacity: 2, position: [40, 20] },
      ],
    },
    {
      id: 'area-2',
      name: 'Terrace',
      tables: [{ id: 't-3', name: 'T1', capacity: 4, position: [60, 60] }],
    },
  ],
};

describe('useVenueLayout', () => {
  it('hydrates areas and exposes helpers', async () => {
    const availability = new Set<string>(['t-1']);
    const occupied = new Set<string>(['t-2']);

    const { result } = renderHook(() => {
      const [activeAreaId, setActiveAreaId] = React.useState<string | null>(null);
      const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);
      const layout = useVenueLayout({
        restaurant,
        activeAreaId,
        setActiveAreaId,
        selectedTableId,
        onSelectTable: setSelectedTableId,
        availability,
        occupied,
      });
      return layout;
    });

    await waitFor(() => expect(result.current.activeArea?.id).toBe('area-1'));

    expect(result.current.areas.map((area) => area.id)).toEqual(['area-1', 'area-2']);
    expect(result.current.getStatus('t-1')).toBe('available');
    expect(result.current.getStatus('t-2')).toBe('reserved');
    expect(result.current.getStatus('unknown')).toBe('held');

    await act(async () => {
      result.current.selectTable('t-2');
    });
    expect(result.current.selectedTable?.id).toBe('t-2');

    await act(async () => {
      result.current.setActiveArea('area-2');
    });
    expect(result.current.activeArea?.id).toBe('area-2');
  });
});
