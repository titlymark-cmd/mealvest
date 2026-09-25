import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, Switch, Image } from "react-native";
import { ArrowLeft, Plus, ImagePlus } from "lucide-react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchOwnMenu, addMenuItem, updateMenuItem, HotelMenuItem } from "../../services/hotelStaffApi";

const CATEGORIES = ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"];

export default function HotelMenuManageScreen({ navigation }: any) {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<HotelMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("lunch");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchOwnMenu(authFetch);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your menu.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!name.trim() || !Number(price)) return;
    setSaving(true);
    try {
      await addMenuItem(authFetch, { name: name.trim(), price: Number(price), category, imageUrl: imageUrl.trim() || undefined });
      setName("");
      setPrice("");
      setImageUrl("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (item: HotelMenuItem) => {
    try {
      await updateMenuItem(authFetch, item.id, { available: !item.available });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this item.");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Menu</Text>
        <TouchableOpacity onPress={() => setShowForm((v) => !v)} style={styles.addBtn}>
          <Plus size={14} color={COLORS.primary} />
          <Text style={styles.addBtnText}>{showForm ? "Cancel" : "Add item"}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <Card style={{ marginBottom: 14 }}>
          <TextInput
            style={styles.input}
            placeholder="Item name"
            placeholderTextColor={COLORS.textFaint}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Price (KSh)"
            placeholderTextColor={COLORS.textFaint}
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
          <View style={styles.imageInputRow}>
            <ImagePlus size={14} color={COLORS.textMuted} />
            <TextInput
              style={styles.imageInput}
              placeholder="Image URL (optional — direct upload isn't available yet)"
              placeholderTextColor={COLORS.textFaint}
              value={imageUrl}
              onChangeText={setImageUrl}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.categoryPill, category === c && styles.categoryPillActive]}
              >
                <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton onPress={handleAdd} loading={saving} showArrow={false}>
            Save item
          </PrimaryButton>
        </Card>
      )}

      {loading && <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />}
      {!loading && error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbFallback}>
                <ImagePlus size={16} color={COLORS.textFaint} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.category} · KSh {Number(item.price).toLocaleString()}</Text>
            </View>
            <Switch value={item.available} onValueChange={() => toggleAvailable(item)} />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 56 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.primary },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontFamily: FONTS.displayBold, fontSize: 20, color: COLORS.textOnDark },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(252,244,234,0.08)",
    borderRadius: RADIUS.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  addBtnText: { fontFamily: FONTS.bodySemibold, fontSize: 12, color: COLORS.primary },
  input: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderSoft,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, fontSize: 14, fontFamily: FONTS.bodyMedium, color: COLORS.text,
  },
  imageInputRow: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: COLORS.borderSoft, paddingHorizontal: 14, marginBottom: 10,
  },
  imageInput: { flex: 1, paddingVertical: 12, fontSize: 13, fontFamily: FONTS.bodyMedium, color: COLORS.text },
  thumb: { width: 40, height: 40, borderRadius: RADIUS.sm, marginRight: 10, backgroundColor: COLORS.borderSoft },
  thumbFallback: {
    width: 40, height: 40, borderRadius: RADIUS.sm, marginRight: 10, backgroundColor: COLORS.accentSoft,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  categoryPill: { borderWidth: 1, borderColor: COLORS.borderSoft, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  categoryPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.accentSoft },
  categoryText: { fontFamily: FONTS.bodyMedium, fontSize: 11, color: COLORS.textMuted, textTransform: "capitalize" },
  categoryTextActive: { color: COLORS.primary, fontFamily: FONTS.bodySemibold },
  errorText: { fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 16 },
  itemCard: { flexDirection: "row", alignItems: "center", padding: 12 },
  itemName: { fontFamily: FONTS.bodySemibold, fontSize: 14, color: COLORS.text },
  itemMeta: { fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2, textTransform: "capitalize" },
});
