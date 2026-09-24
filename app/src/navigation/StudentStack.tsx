import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HotelListScreen from "../screens/student/HotelListScreen";
import HotelMenuScreen from "../screens/student/HotelMenuScreen";
import BudgetOnboardingScreen from "../screens/student/BudgetOnboardingScreen";
import StudentHomeScreen from "../screens/student/StudentHomeScreen";
import MealPassScreen from "../screens/student/MealPassScreen";
import OrderHistoryScreen from "../screens/student/OrderHistoryScreen";
import MealBoostScreen from "../screens/student/MealBoostScreen";

export type StudentStackParamList = {
  HotelList: undefined;
  HotelMenu: { hotelId: string; hotelName: string };
  BudgetOnboarding: {
    hotelId?: string;
    hotelName?: string;
    selectedItemName?: string;
    selectedItemPrice?: string;
  };
  StudentHome: { budget?: unknown; hotelName?: string } | undefined;
  MealPass: { hotelId: string; hotelName: string; itemId: string; itemName: string; itemPrice: string };
  OrderHistory: undefined;
  MealBoost: undefined;
};

const Stack = createNativeStackNavigator<StudentStackParamList>();

export function StudentStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HotelList" component={HotelListScreen} />
      <Stack.Screen name="HotelMenu" component={HotelMenuScreen} />
      <Stack.Screen name="BudgetOnboarding" component={BudgetOnboardingScreen} />
      <Stack.Screen name="StudentHome" component={StudentHomeScreen} />
      <Stack.Screen name="MealPass" component={MealPassScreen} />
      <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
      <Stack.Screen name="MealBoost" component={MealBoostScreen} />
    </Stack.Navigator>
  );
}
