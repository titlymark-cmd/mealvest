import React, { useState, useCallback } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity } from "react-native";
import { Logo } from "../components/Logo";
import { PrimaryButton } from "../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../theme/theme";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/authApi";
import { isGoogleAuthConfigured } from "../services/googleAuth";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export default function LoginScreen({ navigation }: any) {
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Logo />
      </View>

      <View style={styles.body}>
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
          placeholderTextColor={COLORS.textFaint}
          autoCapitalize="none"
          value={identifier}
          onChangeText={setIdentifier}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton onPress={submit} loading={loading} showArrow={false} style={{ marginTop: 8 }}>
          Sign in
        </PrimaryButton>

        <TouchableOpacity onPress={() => navigation.navigate("RegisterStudent")}>
          <Text style={styles.link}>New student? Create an account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate("RegisterHotel")}>
          <Text style={styles.link}>Registering a hotel? Sign up here</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 8 },
  body: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  title: { fontSize: 24, fontFamily: FONTS.displayBold, color: COLORS.text },
  subtitle: { fontSize: 14, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 4, marginBottom: 24 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 10, fontFamily: FONTS.bodySemibold, fontSize: 11, color: COLORS.textFaint },
  input: {
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    fontFamily: FONTS.bodyMedium,
    color: COLORS.text,
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
