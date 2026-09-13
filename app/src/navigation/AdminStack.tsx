import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AdminHomeScreen from "../screens/admin/AdminHomeScreen";
import AdminCreateHotelScreen from "../screens/admin/AdminCreateHotelScreen";

export type AdminStackParamList = {
  AdminHome: undefined;
  AdminCreateHotel: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminHome" component={AdminHomeScreen} />
      <Stack.Screen name="AdminCreateHotel" component={AdminCreateHotelScreen} />
    </Stack.Navigator>
  );
}
