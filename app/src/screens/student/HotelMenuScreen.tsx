import React, { useEffect, useState } from "react";
import { View, Text, SectionList, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { Coffee, Sun, Moon, Cookie, GlassWater, UtensilsCrossed } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { fetchHotelMenu, MenuItem } from "../../services/hotelsApi";

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Dinner", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

export default function HotelMenuScreen({ route, navigation }: any) {
  const { hotelId, hotelName } = route.params;
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelMenu(hotelId)
      .then((data) => setMenu(data.menu))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [hotelId]);

  const requestMeal = (item: MenuItem) => {
    // Goes straight to the real order+payment+QR flow. If the
    // student has no active budget yet, MealPassScreen surfaces that
    // clearly (BUDGET_NOT_FOUND from the backend) with a path into
    // BudgetOnboarding — but the default path for a student who's
    // already funded is now the real one, not a detour through setup
    // every time.
    navigation.navigate("MealPass", {
      hotelId,
      hotelName,
      itemId: item.id,
      itemName: item.name,
      itemPrice: item.price,
    });
  };

  const sections = Object.keys(CATEGORY_META)
    .map((key) => ({ key, ...CATEGORY_META[key], data: menu.filter((m) => m.category === key) }))
    .filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{hotelName}</Text>
      <Text style={styles.subtitle}>Pick a meal to request, or continue to set up your plan.</Text>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      {!loading && !error && menu.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>This hotel hasn't added any menu items yet.</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <section.Icon size={15} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>{section.label}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbFallback}>
                <UtensilsCrossed size={20} color={COLORS.textFaint} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.price}>KSh {Number(item.price).toLocaleString()}</Text>
              <TouchableOpacity style={styles.requestButton} onPress={() => requestMeal(item)}>
                <Text style={styles.requestButtonText}>Request meal</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 6 }} />}
      />

      <View style={styles.footer}>
        <PrimaryButton
          onPress={() => navigation.navigate("BudgetOnboarding", { hotelId, hotelName })}
          showArrow={false}
          style={styles.continueButton}
        >
          Continue without picking a meal yet
        </PrimaryButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, color: COLORS.text },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 4, marginBottom: 16 },
  center: { alignItems: "center", paddingVertical: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold },
  empty: { color: COLORS.textMuted, textAlign: "center", fontFamily: FONTS.body },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontFamily: FONTS.bodySemibold, color: COLORS.text },
  card: { flexDirection: "row", padding: 14, alignItems: "flex-start" },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, marginRight: 12, backgroundColor: COLORS.border },
  thumbFallback: {
    width: 48, height: 48, borderRadius: RADIUS.sm, marginRight: 12,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  itemName: { fontSize: 15, fontFamily: FONTS.bodySemibold, color: COLORS.text },
  itemDesc: { fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  price: { fontSize: 14, fontFamily: FONTS.displayBold, color: COLORS.text, marginBottom: 6 },
  requestButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 12 },
  requestButtonText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontSize: 11 },
  footer: { position: "absolute", bottom: 16, left: 20, right: 20 },
  continueButton: { backgroundColor: COLORS.primaryDark },
});
