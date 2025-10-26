import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import HomeScreen from './src/screens/HomeScreen';
import ExploreScreen from './src/screens/ExploreScreen';
import ReservationsScreen from './src/screens/ReservationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import BookScreen from './src/screens/BookScreen';
import SeatPicker from './src/screens/SeatPicker';
import { colors } from './src/config/theme';
import { MainTabParamList, RootStackParamList } from './src/types/navigation';
import { useWarmRestaurantPhotoCovers } from './src/hooks/useWarmRestaurantPhotoCovers';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    primary: colors.primary,
    text: colors.text,
    card: colors.card,
    border: '#e2e8f0',
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<keyof MainTabParamList, keyof typeof Feather.glyphMap> = {
            Discover: 'home',
            Explore: 'compass',
            Reservations: 'calendar',
            Profile: 'user',
          };
          return <Feather name={iconMap[route.name as keyof MainTabParamList]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Discover" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Reservations" component={ReservationsScreen} options={{ tabBarLabel: 'Bookings' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  useWarmRestaurantPhotoCovers();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <NavigationContainer theme={navigationTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.card },
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Restaurant" component={RestaurantScreen} options={{ title: 'Restaurant' }} />
            <Stack.Screen name="Book" component={BookScreen} options={{ title: 'Book a Table' }} />
            <Stack.Screen name="SeatPicker" component={SeatPicker} options={{ title: 'Choose Table' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
