import type { AvailabilitySlot } from '../api';

export type RootStackParamList = {
  Home: undefined;
  Restaurant: { id: string; name?: string };
  Book: { id: string; name: string; guestName?: string; guestPhone?: string };
  SeatPicker: {
    id: string;
    name: string;
    partySize: number;
    slot: AvailabilitySlot;
    guestName?: string;
    guestPhone?: string;
  };
};
