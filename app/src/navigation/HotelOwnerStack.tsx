import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HotelOwnerHomeScreen from "../screens/hotelOwner/HotelOwnerHomeScreen";
import HotelScannerScreen from "../screens/hotelOwner/HotelScannerScreen";
import HotelOrdersScreen from "../screens/hotelOwner/HotelOrdersScreen";
import HotelMenuManageScreen from "../screens/hotelOwner/HotelMenuManageScreen";
import HotelProfileScreen from "../screens/hotelOwner/HotelProfileScreen";

export type HotelOwnerStackParamList = {
  HotelOwnerHome: undefined;
  HotelScanner: undefined;
  HotelOrders: undefined;
  HotelMenuManage: undefined;
  HotelProfile: undefined;
};

const Stack = createNativeStackNavigator<HotelOwnerStackParamList>();

export function HotelOwnerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HotelOwnerHome" component={HotelOwnerHomeScreen} />
      <Stack.Screen name="HotelScanner" component={HotelScannerScreen} />
      <Stack.Screen name="HotelOrders" component={HotelOrdersScreen} />
      <Stack.Screen name="HotelMenuManage" component={HotelMenuManageScreen} />
      <Stack.Screen name="HotelProfile" component={HotelProfileScreen} />
    </Stack.Navigator>
  );
}
