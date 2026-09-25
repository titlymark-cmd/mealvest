import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, ImagePlus } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { Switch } from "../../components/Switch";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { fetchOwnMenu, addMenuItem, updateMenuItem, HotelMenuItem } from "../../services/hotelStaffApi";

const CATEGORIES = ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"];

export default function HotelMenuManageScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
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
    <div style={styles.container}>
      <button onClick={() => navigate(-1)} style={styles.backRow}>
        <ArrowLeft size={16} color={COLORS.primary} />
        <span style={styles.backText}>Back</span>
      </button>

      <div style={styles.headerRow}>
        <h1 style={styles.title}>Menu</h1>
        <button className="mv-action" onClick={() => setShowForm((v) => !v)} style={styles.addBtn}>
          <Plus size={14} color={COLORS.primary} />
          <span style={styles.addBtnText}>{showForm ? "Cancel" : "Add item"}</span>
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 14, display: "flex", flexDirection: "column" }}>
          <input style={styles.input} placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={styles.input} placeholder="Price (KSh)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          <div style={styles.imageInputRow}>
            <ImagePlus size={14} color={COLORS.textMuted} />
            <input
              style={styles.imageInput}
              placeholder="Image URL (optional — direct upload isn't available yet)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              autoCapitalize="none"
            />
          </div>
          <div style={styles.categoryRow}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                style={{ ...styles.categoryPill, ...(category === c ? styles.categoryPillActive : null) }}
              >
                <span style={{ ...styles.categoryText, ...(category === c ? styles.categoryTextActive : null) }}>{c}</span>
              </button>
            ))}
          </div>
          <PrimaryButton onPress={handleAdd} loading={saving} showArrow={false}>
            Save item
          </PrimaryButton>
        </Card>
      )}

      {loading && (
        <div style={{ marginTop: 20, display: "flex" }}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && <p style={styles.errorText}>{error}</p>}

      <div style={styles.list}>
        {items.map((item) => (
          <Card key={item.id} style={styles.itemCard}>
            {item.image_url ? (
              <img src={item.image_url} alt="" style={styles.thumb} />
            ) : (
              <div style={styles.thumbFallback}>
                <ImagePlus size={16} color={COLORS.textFaint} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <span style={styles.itemName}>{item.name}</span>
              <span style={styles.itemMeta}>
                {item.category} · KSh {Number(item.price).toLocaleString()}
              </span>
            </div>
            <Switch value={item.available} onValueChange={() => toggleAvailable(item)} />
          </Card>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 56, display: "flex", flexDirection: "column" },
  backRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.primary },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0 },
  addBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(252,244,234,0.08)",
    borderRadius: RADIUS.sm,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
  },
  addBtnText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
  input: {
    backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderSoft}`,
    paddingLeft: 14, paddingRight: 14, paddingTop: 12, paddingBottom: 12, marginBottom: 10, fontSize: 14,
    fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.text, outline: "none", width: "100%",
  },
  imageInputRow: {
    display: "flex", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.cardWhite, borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`, paddingLeft: 14, paddingRight: 14, marginBottom: 10,
  },
  imageInput: { flex: 1, paddingTop: 12, paddingBottom: 12, fontSize: 13, fontFamily: FONTS.bodyMedium, fontWeight: 500, color: COLORS.text, outline: "none", backgroundColor: "transparent" },
  thumb: { width: 40, height: 40, borderRadius: RADIUS.sm, marginRight: 10, backgroundColor: COLORS.borderSoft, objectFit: "cover", flexShrink: 0 },
  thumbFallback: {
    width: 40, height: 40, borderRadius: RADIUS.sm, marginRight: 10, backgroundColor: COLORS.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0,
  },
  categoryRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  categoryPill: { border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12 },
  categoryPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.accentSoft },
  categoryText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 11, color: COLORS.textMuted, textTransform: "capitalize" },
  categoryTextActive: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, textAlign: "center", marginTop: 16 },
  list: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 24 },
  itemCard: { display: "flex", flexDirection: "row", alignItems: "center", padding: 12 },
  itemName: { display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.text },
  itemMeta: { display: "block", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted, marginTop: 2, textTransform: "capitalize" },
};
