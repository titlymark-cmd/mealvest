import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LogOut } from "lucide-react-native";
import { Logo } from "./Logo";
import { COLORS, FONTS, RADIUS } from "../theme/theme";
import { useAuth } from "../context/AuthContext";

export function PlaceholderScreen({ label, note }: { label: string; note?: string }) {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Logo size="sm" />
      <View style={styles.center}>
        <Text style={styles.label}>{label}</Text>
        {user && <Text style={styles.welcome}>Signed in as {user.fullName || user.email} ({user.role})</Text>}
        {note && <Text style={styles.note}>{note}</Text>}

        <TouchableOpacity style={styles.logoutButton} onPress={() => logout()}>
          <LogOut size={15} color={COLORS.danger} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, paddingTop: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 22, fontFamily: FONTS.displayBold, color: COLORS.textOnDark },
  welcome: { fontSize: 13, fontFamily: FONTS.bodyMedium, color: COLORS.accent, marginTop: 10 },
  note: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 8, textAlign: "center", maxWidth: 260 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 32,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  logoutText: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontSize: 14 },
});
