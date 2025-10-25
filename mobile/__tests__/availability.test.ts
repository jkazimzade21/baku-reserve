import { findSlotForTime, getSuggestedSlots } from '../src/utils/availability';
import type { AvailabilitySlot } from '../src/api';

describe('availability utils', () => {
  const baseSlots: AvailabilitySlot[] = [
    {
      start: '2025-05-01T18:00:00',
      end: '2025-05-01T20:00:00',
      available_table_ids: ['t1', 't2'],
      hold_ids: [],
    },
    {
      start: '2025-05-01T19:30:00',
      end: '2025-05-01T21:30:00',
      available_table_ids: ['t1'],
      hold_ids: [],
    },
    {
      start: '2025-05-01T21:00:00',
      end: '2025-05-01T23:00:00',
      available_table_ids: ['t3'],
      hold_ids: [],
    },
  ];

  it('locates a slot matching selected time', () => {
    const match = findSlotForTime(baseSlots, '2025-05-01', '19:30');
    expect(match).toBe(baseSlots[1]);
  });

  it('returns null when no exact match exists', () => {
    const match = findSlotForTime(baseSlots, '2025-05-01', '17:15');
    expect(match).toBeNull();
  });

  it('suggests slots ordered by proximity to target', () => {
    const target = new Date('2025-05-01T19:00:00');
    const suggestions = getSuggestedSlots(baseSlots, target, 2);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toBe(baseSlots[1]);
    expect(suggestions[1]).toBe(baseSlots[0]);
  });
});
