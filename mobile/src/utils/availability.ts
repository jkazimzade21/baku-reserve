import type { AvailabilitySlot } from '../api';

const CENTRAL_TIMEZONE = 'America/Chicago';

type ZonedParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIMEZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const timeFormatter24 = new Intl.DateTimeFormat('en-GB', {
  timeZone: CENTRAL_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CENTRAL_TIMEZONE,
});

const displayDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIMEZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const displayTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CENTRAL_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const getCentralParts = (date: Date): ZonedParts => {
  const formatted = partsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  formatted.forEach(({ type, value }) => {
    if (type !== 'literal') {
      map[type] = value;
    }
  });
  return map as ZonedParts;
};

const getCentralTimestamp = (date: Date) => {
  const parts = getCentralParts(date);
  const timestamp = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return { timestamp, parts };
};

const getCentralTimestampFromSelection = (dateStr: string, timeStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0);
};

export const findSlotForTime = (
  slots: AvailabilitySlot[],
  dateStr: string,
  timeStr: string | null,
): AvailabilitySlot | null => {
  if (!timeStr) return null;
  return (
    slots.find((slot) => {
      const { parts } = getCentralTimestamp(new Date(slot.start));
      const slotDate = `${parts.year}-${parts.month}-${parts.day}`;
      const slotTime = timeFormatter24.format(new Date(slot.start));
      return slotDate === dateStr && slotTime === timeStr;
    }) ?? null
  );
};

export const getSuggestedSlots = (
  slots: AvailabilitySlot[],
  targetTimestamp: number | null,
  limit = 4,
): AvailabilitySlot[] => {
  if (!slots.length) {
    return [];
  }
  const enriched = slots.map((slot) => {
    const { timestamp } = getCentralTimestamp(new Date(slot.start));
    return { timestamp, slot };
  });

  const sorted = enriched.sort((a, b) => a.timestamp - b.timestamp);
  if (targetTimestamp == null) {
    return sorted.slice(0, limit).map(({ slot }) => slot);
  }

  return sorted
    .sort(
      (a, b) =>
        Math.abs(a.timestamp - targetTimestamp) - Math.abs(b.timestamp - targetTimestamp),
    )
    .slice(0, limit)
    .map(({ slot }) => slot);
};

export const getCentralDateString = (date: Date) => dateFormatter.format(date);

export const getCentralTimeString = (date: Date) => timeFormatter24.format(date);

export const getSelectionTimestamp = (dateStr: string, timeStr: string | null) =>
  timeStr ? getCentralTimestampFromSelection(dateStr, timeStr) : null;

export const formatCentralDateLabel = (date: Date) => displayDateFormatter.format(date);

export const formatCentralTimeLabel = (date: Date) => `${displayTimeFormatter.format(date)} CT`;
