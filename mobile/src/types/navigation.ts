import type { NavigatorScreenParams } from '@react-navigation/native';
import type { AvailabilitySlot } from '../api';

export type MainTabParamList = {
  Discover: undefined;
  Explore: undefined;
  Reservations: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
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
