import React, { useState, useCallback } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../theme/theme";

import { SplashScreen } from "../screens/SplashScreen";
import WelcomeScreen from "../screens/WelcomeScreen";
import AuthScreen from "../screens/AuthScreen";

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
    // Login, RegisterStudent and RegisterHotel all render the SAME
    // AuthScreen component (differing only by initialParams.mode) —
    // that's what lets the Login<->Register toggle inside AuthScreen
    // animate as one persistent diagonal-split screen instead of a
    // hard navigation cut between three separate screens. Each route
    // name stays real and navigable (Welcome still links to them by
    // name), it just always lands on the same underlying screen.
    <AuthStack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={AuthScreen} initialParams={{ mode: "login" }} />
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: true, title: "" }} />
      <AuthStack.Screen name="RegisterStudent" component={AuthScreen} initialParams={{ mode: "register-student" }} />
      <AuthStack.Screen name="RegisterHotel" component={AuthScreen} initialParams={{ mode: "register-hotel" }} />
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
        <ActivityIndicator size="large" color={COLORS.primary} />
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
});
