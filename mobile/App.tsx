import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './src/screens/HomeScreen';
import RestaurantScreen from './src/screens/RestaurantScreen';
import BookScreen from './src/screens/BookScreen';
import SeatPicker from './src/screens/SeatPicker';
const Stack = createNativeStackNavigator();
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Baku Reserve' }} />
        <Stack.Screen name="Restaurant" component={RestaurantScreen} options={{ title: 'Details' }} />
        <Stack.Screen name="Book" component={BookScreen} options={{ title: 'Book' }} />
      <Stack.Screen name="SeatPicker" component={SeatPicker} options={{ title: 'Choose table' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}