import React, { useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";

import { SplashScreen } from "../screens/SplashScreen";
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterStudentScreen from "../screens/RegisterStudentScreen";
import RegisterHotelScreen from "../screens/RegisterHotelScreen";

import { StudentStack } from "./StudentStack";
import { HotelStaffStack } from "./HotelStaffStack";
import { HotelOwnerStack } from "./HotelOwnerStack";
import { AdminStack } from "./AdminStack";

export type AuthStackParamList = {
  Login: undefined;
  Welcome: undefined;
  RegisterStudent: undefined;
  RegisterHotel: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function UnauthenticatedNavigator() {
  return (
    // Login is the initial route now — splash leads straight into it
    // per the requested flow. Welcome (with the backend health-check
    // display) stays reachable as a secondary screen rather than
    // being removed, since it's still useful during development.
    <AuthStack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: true, title: "" }} />
      <AuthStack.Screen
        name="RegisterStudent"
        component={RegisterStudentScreen}
        options={{ headerShown: true, title: "" }}
      />
      <AuthStack.Screen
        name="RegisterHotel"
        component={RegisterHotelScreen}
        options={{ headerShown: true, title: "" }}
      />
    </AuthStack.Navigator>
  );
}

/**
 * Launch sequence: Splash (MZ logo, fixed minimum display time) ->
 * then, once BOTH the splash timer has elapsed AND AuthContext's
 * silent-refresh check has resolved, either the correct role stack
 * (already logged in) or straight to Login (per the requested flow).
 *
 * Splash and the auth check run in parallel rather than splash-then-
 * check, so a slow network doesn't add extra visible delay beyond
 * what the auth check needed anyway.
 */
export function RootNavigator() {
  const { user, isLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinished = useCallback(() => setSplashDone(true), []);

  if (!splashDone) {
    return <SplashScreen onFinished={handleSplashFinished} />;
  }

  if (isLoading) {
    // Splash's minimum time elapsed but the silent-refresh check is
    // still in flight (e.g. slow network) — brief spinner, not a
    // second splash.
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#0C8CE9" />
      </View>
    );
  }

  if (!user) {
    return <UnauthenticatedNavigator />;
  }

  switch (user.role) {
    case "student":
      return <StudentStack />;
    case "hotel_staff":
      return <HotelStaffStack />;
    case "hotel_owner":
      return <HotelOwnerStack />;
    case "mealvest_admin":
      return <AdminStack />;
    default:
      return <UnauthenticatedNavigator />;
  }
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F9FF" },
});
