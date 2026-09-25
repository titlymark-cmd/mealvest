import React, { useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";
import { isGoogleAuthConfigured } from "../services/googleAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

/**
 * The actual login form and its logic — unchanged from the previous
 * standalone LoginScreen, just extracted so AuthScreen can embed it
 * inside the diagonal split layout. Every API call, validation rule,
 * and piece of auth state here is identical to before; only the
 * outer chrome (full-screen background/positioning) moved to
 * AuthScreen, and navigation.navigate("RegisterStudent"/"RegisterHotel")
 * became a local callback so switching to Register animates within
 * the same mounted AuthScreen instead of pushing a new stack screen.
 */
export function LoginFormContent({
  onSwitchToRegister,
}: {
  onSwitchToRegister: (role: "student" | "hotel") => void;
}) {
  const { loginWithPassword, loginWithGoogle } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleIdToken = useCallback(
    async (idToken: string) => {
      setError(null);
      setGoogleLoading(true);
      try {
        await loginWithGoogle(idToken);
        // No manual navigation — RootNavigator watches `user` from
        // AuthContext and switches to the correct role stack
        // (student/hotel_owner/hotel_staff/mealvest_admin)
        // automatically, exactly the same as password login.
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
      } finally {
        setGoogleLoading(false);
      }
    },
    [loginWithGoogle]
  );

  const googleConfigured = isGoogleAuthConfigured();

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithPassword(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Logo />
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to continue.</Text>

      {googleConfigured && (
        <>
          <GoogleSignInButton onIdToken={handleGoogleIdToken} loading={googleLoading} />
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Email or phone number"
        placeholderTextColor={COLORS.textOnDarkMuted}
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={COLORS.textOnDarkMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <PrimaryButton onPress={submit} loading={loading} showArrow={false} style={{ marginTop: 8 }}>
        Sign in
      </PrimaryButton>

      <TouchableOpacity onPress={() => onSwitchToRegister("student")}>
        <Text style={styles.link}>New student? Create an account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onSwitchToRegister("hotel")}>
        <Text style={styles.link}>Registering a hotel? Sign up here</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", maxWidth: 420 },
  title: { fontSize: 24, fontFamily: FONTS.displayBold, color: COLORS.textOnDark, marginTop: 22 },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 24 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 10, fontFamily: FONTS.bodySemibold, fontSize: 11, color: COLORS.textOnDarkMuted },
  input: {
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.textOnDark,
  },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 12, fontFamily: FONTS.bodySemibold },
  link: {
    color: COLORS.primary,
    fontFamily: FONTS.bodySemibold,
    fontSize: 13,
    textAlign: "center",
    marginTop: 16,
  },
});
