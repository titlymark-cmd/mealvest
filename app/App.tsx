import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from "@expo-google-fonts/sora";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { COLORS } from "./src/theme/theme";

export default function App() {
  // Sora for display/headline weight (numbers, titles — matches the
  // original web app's identity), Inter for body copy. Everything
  // downstream references these by family name via src/theme/theme.ts
  // rather than hardcoding font strings per-screen.
  const [fontsLoaded] = useFonts({
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg },
});
