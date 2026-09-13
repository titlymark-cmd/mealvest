import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HotelStaffHomeScreen from "../screens/hotelStaff/HotelStaffHomeScreen";
import HotelScannerScreen from "../screens/hotelStaff/HotelScannerScreen";
import HotelOrdersScreen from "../screens/hotelStaff/HotelOrdersScreen";

export type HotelStaffStackParamList = {
  HotelStaffHome: undefined;
  HotelScanner: undefined;
  HotelOrders: undefined;
};

const Stack = createNativeStackNavigator<HotelStaffStackParamList>();

export function HotelStaffStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HotelStaffHome" component={HotelStaffHomeScreen} />
      <Stack.Screen name="HotelScanner" component={HotelScannerScreen} />
      <Stack.Screen name="HotelOrders" component={HotelOrdersScreen} />
    </Stack.Navigator>
  );
}
