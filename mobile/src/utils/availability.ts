import type { AvailabilitySlot } from '../api';

const ONE_MINUTE = 60 * 1000;

export const findSlotForTime = (
  slots: AvailabilitySlot[],
  dateStr: string,
  timeStr: string | null,
): AvailabilitySlot | null => {
  if (!timeStr) return null;
  const target = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  let match: AvailabilitySlot | null = null;
  slots.forEach((slot) => {
    const start = new Date(slot.start);
    if (Math.abs(start.getTime() - target.getTime()) < ONE_MINUTE) {
      match = slot;
    }
  });
  return match;
};

export const getSuggestedSlots = (
  slots: AvailabilitySlot[],
  target: Date | null,
  limit = 4,
): AvailabilitySlot[] => {
  const sorted = [...slots].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  if (!target) {
    return sorted.slice(0, limit);
  }
  return sorted
    .sort(
      (a, b) =>
        Math.abs(new Date(a.start).getTime() - target.getTime()) -
        Math.abs(new Date(b.start).getTime() - target.getTime()),
    )
    .slice(0, limit);
};
