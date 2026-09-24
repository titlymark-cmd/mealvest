import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { COLORS, FONTS, RADIUS } from "../theme/theme";
import { useGoogleAuth } from "../services/googleAuth";

interface Props {
  onIdToken: (idToken: string) => void;
  loading: boolean;
}

/**
 * Isolated into its own component so useGoogleAuth — which throws
 * synchronously on web when EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID isn't
 * set (expo-auth-session's own invariant, not ours) — only ever runs
 * when this component is actually mounted. Callers gate mounting on
 * isGoogleAuthConfigured() from services/googleAuth, so an
 * unconfigured deployment never calls the hook at all rather than
 * crashing the whole screen (and, with no error boundary above it,
 * the whole app) before a single email/password field ever renders.
 */
export function GoogleSignInButton({ onIdToken, loading }: Props) {
  const { ready, promptAsync } = useGoogleAuth(onIdToken);

  return (
    <TouchableOpacity style={styles.googleButton} disabled={!ready || loading} onPress={() => promptAsync()}>
      {loading ? (
        <ActivityIndicator color={COLORS.primary} />
      ) : (
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  googleButton: {
    backgroundColor: "#fff",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: { fontFamily: FONTS.bodySemibold, fontSize: 15, color: COLORS.text },
});
