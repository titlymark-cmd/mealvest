import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, ImagePlus, Trash2, UtensilsCrossed } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { Switch } from "../../components/Switch";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { HOTEL_MOBILE_BREAKPOINT } from "../../components/hotel/HotelSidebar";
import { formatKsh } from "../../components/shared/format";
import { fetchOwnMenu, addMenuItem, updateMenuItem, deleteMenuItem, HotelMenuItem } from "../../services/hotelStaffApi";

const CATEGORIES = ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"];

export default function HotelMenuManageScreen() {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < HOTEL_MOBILE_BREAKPOINT;

  const [items, setItems] = useState<HotelMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleDelete = async (item: HotelMenuItem) => {
    if (!window.confirm(`Remove "${item.name}" from your menu?`)) return;
    setDeletingId(item.id);
    try {
      await deleteMenuItem(authFetch, item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove this item.");
    } finally {
      setDeletingId(null);
    }
  };

  const tabs = useMemo(
    () => [
      { value: "all", label: "All", count: items.length },
      ...CATEGORIES.map((c) => ({ value: c, label: c, count: items.filter((i) => i.category === c).length })),
    ],
    [items]
  );

  const visibleItems = activeTab === "all" ? items : items.filter((i) => i.category === activeTab);

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Menu board</h1>
          <p style={styles.subtitle}>{items.length} meal{items.length === 1 ? "" : "s"} listed.</p>
        </div>
        <button className="mv-action" onClick={() => setShowForm((v) => !v)} style={styles.addBtn}>
          <Plus size={14} color={COLORS.primary} />
          <span style={styles.addBtnText}>{showForm ? "Cancel" : "Add meal"}</span>
        </button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, display: "flex", flexDirection: "column" }}>
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

      <div style={styles.tabRow}>
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            style={{ ...styles.tab, ...(activeTab === t.value ? styles.tabActive : null) }}
          >
            <span style={{ ...styles.tabText, ...(activeTab === t.value ? styles.tabTextActive : null) }}>
              {t.label} ({t.count})
            </span>
          </button>
        ))}
      </div>

      {error && <p style={styles.errorText}>{error}</p>}

      {loading ? (
        <div style={styles.center}>
          <Spinner size="large" color={COLORS.primary} />
        </div>
      ) : visibleItems.length === 0 ? (
        <Card style={styles.emptyCard}>
          <UtensilsCrossed size={22} color={COLORS.textFaint} />
          <p style={styles.emptyText}>
            {items.length === 0 ? "No meals listed yet — add your first one." : "No meals in this category."}
          </p>
        </Card>
      ) : (
        <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)" }}>
          {visibleItems.map((item) => (
            <Card key={item.id} style={styles.itemCard}>
              {item.image_url ? (
                <img src={item.image_url} alt="" style={styles.thumb} />
              ) : (
                <div style={styles.thumbFallback}>
                  <ImagePlus size={20} color={COLORS.textFaint} />
                </div>
              )}
              <div style={styles.itemBody}>
                <span style={styles.itemName}>{item.name}</span>
                {item.description && <p style={styles.itemDesc}>{item.description}</p>}
                <div style={styles.itemFooter}>
                  <span style={styles.itemPrice}>{formatKsh(item.price)}</span>
                  <span style={styles.itemCategory}>{item.category}</span>
                </div>
              </div>
              <div style={styles.itemActions}>
                <Switch value={item.available} onValueChange={() => toggleAvailable(item)} />
                <button
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  style={styles.deleteBtn}
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 size={14} color={COLORS.danger} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, display: "flex", flexDirection: "column" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 60 },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 22, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 0 },
  addBtn: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(252,244,234,0.08)",
    borderRadius: RADIUS.sm,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 14,
    paddingRight: 14,
    flexShrink: 0,
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
  categoryRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  categoryPill: { border: `1px solid ${COLORS.borderSoft}`, borderRadius: 999, paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12 },
  categoryPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.accentSoft },
  categoryText: { fontFamily: FONTS.bodyMedium, fontWeight: 500, fontSize: 11, color: COLORS.textMuted, textTransform: "capitalize" },
  categoryTextActive: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  tabRow: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  tab: { backgroundColor: "rgba(252,244,234,0.08)", borderRadius: RADIUS.pill, padding: "8px 16px" },
  tabActive: { background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})` },
  tabText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.textOnDarkMuted, textTransform: "capitalize" },
  tabTextActive: { color: "#fff" },
  errorText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13, color: COLORS.danger, marginBottom: 12 },
  emptyCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 40 },
  emptyText: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textFaint, margin: 0, textAlign: "center" },
  grid: { display: "grid", gap: 16, paddingBottom: 24 },
  itemCard: { display: "flex", flexDirection: "column", padding: 14, gap: 10, minWidth: 0 },
  thumb: { width: "100%", height: 110, borderRadius: RADIUS.sm, backgroundColor: COLORS.borderSoft, objectFit: "cover", flexShrink: 0 },
  thumbFallback: {
    width: "100%", height: 110, borderRadius: RADIUS.sm, backgroundColor: COLORS.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0,
  },
  itemBody: { display: "flex", flexDirection: "column", minWidth: 0 },
  itemName: {
    display: "block", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 14, color: COLORS.text,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  itemDesc: {
    margin: "3px 0 0 0", fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  itemFooter: { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 6 },
  itemPrice: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 14, color: COLORS.text },
  itemCategory: { fontFamily: FONTS.body, fontSize: 10, color: COLORS.textFaint, textTransform: "capitalize" },
  itemActions: { display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  deleteBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    borderRadius: RADIUS.sm, backgroundColor: "rgba(220,53,69,0.08)", flexShrink: 0,
  },
};
