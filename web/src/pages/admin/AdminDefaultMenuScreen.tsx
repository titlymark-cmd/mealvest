import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Pencil, Plus, Save, Trash2, RefreshCcw } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { ADMIN_MOBILE_BREAKPOINT } from "../../components/admin/AdminSidebar";
import {
  createDefaultMenuCategory,
  createDefaultMenuItem,
  deleteDefaultMenuCategory,
  deleteDefaultMenuItem,
  fetchDefaultMenuCatalogue,
  initializeDefaultMenuForHotel,
  updateDefaultMenuCategory,
  updateDefaultMenuItem,
  type DefaultMenuCategory,
  type DefaultMenuItem,
} from "../../services/adminApi";

const emptyCategoryForm = () => ({ slug: "", label: "", sortOrder: 0, isActive: true });
const emptyItemForm = (category = "breakfast") => ({ category, name: "", description: "", price: "", imageUrl: "", sortOrder: 0, isActive: true });

export default function AdminDefaultMenuScreen() {
  const { authFetch } = useAuth();
  const { width } = useWindowSize();
  const isCompact = width < ADMIN_MOBILE_BREAKPOINT;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [categories, setCategories] = useState<DefaultMenuCategory[]>([]);
  const [items, setItems] = useState<DefaultMenuItem[]>([]);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [itemForm, setItemForm] = useState(emptyItemForm());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [hotelIdInput, setHotelIdInput] = useState("");
  const [hotelInitMessage, setHotelInitMessage] = useState<string | null>(null);
  const [hotelInitBusy, setHotelInitBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDefaultMenuCatalogue(authFetch);
      setCategories(data.categories || []);
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the default menu catalogue.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryOptions = useMemo(() => categories.filter((c) => c.is_active), [categories]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const submitCategory = async () => {
    clearMessages();
    const slug = categoryForm.slug.trim();
    const label = categoryForm.label.trim();
    if (!slug || !label) {
      setError("Category slug and label are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingCategoryId) {
        await updateDefaultMenuCategory(authFetch, editingCategoryId, {
          slug,
          label,
          sortOrder: Number(categoryForm.sortOrder) || 0,
          isActive: categoryForm.isActive,
        });
        setSuccess("Default menu category updated.");
      } else {
        await createDefaultMenuCategory(authFetch, {
          slug,
          label,
          sortOrder: Number(categoryForm.sortOrder) || 0,
          isActive: categoryForm.isActive,
        });
        setSuccess("Default menu category created.");
      }
      setCategoryForm(emptyCategoryForm());
      setEditingCategoryId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the category.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoryArchive = async (category: DefaultMenuCategory) => {
    clearMessages();
    try {
      await updateDefaultMenuCategory(authFetch, category.id, { isActive: !category.is_active });
      await load();
      setSuccess(`Category ${category.label} ${category.is_active ? "archived" : "restored"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this category.");
    }
  };

  const deleteCategory = async (categoryId: string) => {
    clearMessages();
    if (!window.confirm("Delete this default category? Items already assigned to it must be moved first.")) return;
    try {
      await deleteDefaultMenuCategory(authFetch, categoryId);
      await load();
      setSuccess("Default category deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this category.");
    }
  };

  const startCategoryEdit = (category: DefaultMenuCategory) => {
    clearMessages();
    setEditingCategoryId(category.id);
    setCategoryForm({
      slug: category.slug,
      label: category.label,
      sortOrder: category.sort_order,
      isActive: category.is_active,
    });
  };

  const submitItem = async () => {
    clearMessages();
    const price = Number(itemForm.price);
    if (!itemForm.name.trim()) {
      setError("Item name is required.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("Default item price must be a positive number.");
      return;
    }
    if (!categoryOptions.some((cat) => cat.slug === itemForm.category)) {
      setError("Choose a valid default category.");
      return;
    }
    setSaving(true);
    try {
      if (editingItemId) {
        await updateDefaultMenuItem(authFetch, editingItemId, {
          category: itemForm.category,
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || undefined,
          price,
          imageUrl: itemForm.imageUrl.trim() || undefined,
          sortOrder: Number(itemForm.sortOrder) || 0,
          isActive: itemForm.isActive,
        });
        setSuccess("Default menu item updated.");
      } else {
        await createDefaultMenuItem(authFetch, {
          category: itemForm.category,
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || undefined,
          price,
          imageUrl: itemForm.imageUrl.trim() || undefined,
          sortOrder: Number(itemForm.sortOrder) || 0,
          isActive: itemForm.isActive,
        });
        setSuccess("Default menu item created.");
      }
      setItemForm(emptyItemForm(itemForm.category));
      setEditingItemId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the menu item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleItemArchive = async (item: DefaultMenuItem) => {
    clearMessages();
    try {
      await updateDefaultMenuItem(authFetch, item.id, { isActive: !item.is_active });
      await load();
      setSuccess(`Menu item ${item.name} ${item.is_active ? "archived" : "restored"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this menu item.");
    }
  };

  const deleteItem = async (itemId: string) => {
    clearMessages();
    if (!window.confirm("Delete this central menu item? Existing hotel copies are not deleted.")) return;
    try {
      await deleteDefaultMenuItem(authFetch, itemId);
      await load();
      setSuccess("Default menu item deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this menu item.");
    }
  };

  const startItemEdit = (item: DefaultMenuItem) => {
    clearMessages();
    setEditingItemId(item.id);
    setItemForm({
      category: item.category,
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      imageUrl: item.image_url || "",
      sortOrder: item.sort_order,
      isActive: item.is_active,
    });
  };

  const handleHotelInit = async () => {
    const hotelId = hotelIdInput.trim();
    if (!hotelId) {
      setHotelInitMessage("Enter a hotel ID to initialize an empty menu.");
      return;
    }
    setHotelInitBusy(true);
    setHotelInitMessage(null);
    try {
      const result = await initializeDefaultMenuForHotel(authFetch, hotelId);
      const statusText = result.initialized
        ? `Initialized ${result.cloned} default menu item${result.cloned === 1 ? "" : "s"}.`
        : result.reason === "already_populated"
          ? "Skipped: this hotel already has menu items."
          : result.reason === "no_default_items"
            ? "Skipped: there are no active default menu items to clone."
            : "Skipped: no action needed.";
      setHotelInitMessage(statusText);
    } catch (err) {
      setHotelInitMessage(err instanceof Error ? err.message : "Could not initialize this hotel's menu.");
    } finally {
      setHotelInitBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  const responsiveStyles: Record<string, React.CSSProperties> = {
    container: { ...styles.container, padding: isCompact ? 14 : 24 },
    headerRow: { ...styles.headerRow, flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "flex-start" : "center" },
    title: { ...styles.title, fontSize: isCompact ? 24 : 30 },
    subtitle: { ...styles.subtitle, fontSize: isCompact ? 12 : 13, lineHeight: 1.5 },
    grid: { ...styles.grid, gridTemplateColumns: isCompact ? "1fr" : "repeat(2, minmax(0, 1fr))" },
    card: { ...styles.card, padding: isCompact ? 14 : 20 },
    cardWide: { ...styles.cardWide, padding: isCompact ? 14 : 20 },
    sectionHeader: { ...styles.sectionHeader, marginBottom: isCompact ? 10 : 14 },
    formGrid: { ...styles.formGrid, gridTemplateColumns: isCompact ? "1fr" : "repeat(auto-fit, minmax(180px, 1fr))" },
    input: { ...styles.input, minHeight: 44, fontSize: isCompact ? 13 : 14 },
    textArea: { ...styles.textArea, minHeight: isCompact ? 96 : 90, fontSize: isCompact ? 13 : 14 },
    checkboxRow: { ...styles.checkboxRow, minHeight: 44 },
    actionRow: { ...styles.actionRow, flexDirection: isCompact ? "column" : "row" },
    primaryButton: { ...styles.primaryButton, minHeight: 44, width: isCompact ? "100%" : undefined, justifyContent: "center" },
    secondaryButton: { ...styles.secondaryButton, minHeight: 44, width: isCompact ? "100%" : undefined, justifyContent: "center" },
    row: { ...styles.row, flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "stretch" : "center" },
    rowCopy: { ...styles.rowCopy, width: isCompact ? "100%" : undefined },
    rowActions: { ...styles.rowActions, width: isCompact ? "100%" : undefined, justifyContent: isCompact ? "flex-end" : undefined },
    inlineForm: { ...styles.inlineForm, flexDirection: isCompact ? "column" : "row", alignItems: isCompact ? "stretch" : "center" },
    buttonLabel: { whiteSpace: isCompact ? "normal" : "nowrap" },
  };

  return (
    <div style={responsiveStyles.container}>
      <div style={responsiveStyles.headerRow}>
        <div>
          <h1 style={responsiveStyles.title}>Default menu catalogue</h1>
          <p style={responsiveStyles.subtitle}>Central default categories and menu items used when new hotels are onboarded.</p>
        </div>
      </div>

      {error && <p style={styles.errorText}>{error}</p>}
      {success && <p style={styles.successText}>{success}</p>}

      <div style={responsiveStyles.grid}>
        <Card style={responsiveStyles.card}>
          <div style={responsiveStyles.sectionHeader}>
            <span style={styles.sectionTitle}>Default categories</span>
          </div>

          <div style={responsiveStyles.formGrid}>
            <input
              value={categoryForm.slug}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="Slug (breakfast)"
              style={responsiveStyles.input}
            />
            <input
              value={categoryForm.label}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="Label"
              style={responsiveStyles.input}
            />
            <input
              type="number"
              min={0}
              value={categoryForm.sortOrder}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))}
              placeholder="Sort"
              style={responsiveStyles.input}
            />
            <label style={responsiveStyles.checkboxRow}>
              <input
                type="checkbox"
                checked={categoryForm.isActive}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <div style={responsiveStyles.actionRow}>
            <button className="mv-action" onClick={submitCategory} disabled={saving} style={responsiveStyles.primaryButton}>
              {editingCategoryId ? <Save size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
              <span style={responsiveStyles.buttonLabel}>{saving ? "Saving…" : editingCategoryId ? "Update category" : "Create category"}</span>
            </button>
            {editingCategoryId && (
              <button className="mv-action" onClick={() => { setEditingCategoryId(null); setCategoryForm(emptyCategoryForm()); }} style={responsiveStyles.secondaryButton}>
                Cancel
              </button>
            )}
          </div>

          <div style={styles.columns}> 
            {categories.length === 0 ? (
              <p style={styles.emptyText}>No default categories yet.</p>
            ) : (
              categories.map((category) => (
                <div key={category.id} style={{ ...responsiveStyles.row, opacity: category.is_active ? 1 : 0.65 }}>
                  <div style={responsiveStyles.rowCopy}>
                    <strong>{category.label}</strong>
                    <span>{category.slug} · sort {category.sort_order}</span>
                  </div>
                  <div style={responsiveStyles.rowActions}>
                    <button onClick={() => startCategoryEdit(category)} style={styles.iconBtn} aria-label="Edit category">
                      <Pencil size={14} color={COLORS.text} />
                    </button>
                    <button onClick={() => toggleCategoryArchive(category)} style={styles.iconBtn} aria-label={category.is_active ? "Archive category" : "Restore category"}>
                      <Archive size={14} color={COLORS.text} />
                    </button>
                    <button onClick={() => deleteCategory(category.id)} style={styles.iconBtnDanger} aria-label="Delete category">
                      <Trash2 size={14} color="#fff" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card style={responsiveStyles.card}>
          <div style={responsiveStyles.sectionHeader}>
            <span style={styles.sectionTitle}>Default menu items</span>
          </div>

          <div style={responsiveStyles.formGrid}>
            <select value={itemForm.category} onChange={(e) => setItemForm((prev) => ({ ...prev, category: e.target.value }))} style={responsiveStyles.input}>
              {categoryOptions.length === 0 ? <option value="">No active categories</option> : categoryOptions.map((cat) => <option key={cat.id} value={cat.slug}>{cat.label}</option>)}
            </select>
            <input value={itemForm.name} onChange={(e) => setItemForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Item name" style={responsiveStyles.input} />
            <input value={itemForm.price} onChange={(e) => setItemForm((prev) => ({ ...prev, price: e.target.value }))} placeholder="Price (KSh)" type="number" min="0" step="0.01" style={responsiveStyles.input} />
            <input value={itemForm.sortOrder} onChange={(e) => setItemForm((prev) => ({ ...prev, sortOrder: Number(e.target.value) || 0 }))} placeholder="Sort order" type="number" min={0} style={responsiveStyles.input} />
            <input value={itemForm.imageUrl} onChange={(e) => setItemForm((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="Image URL" style={responsiveStyles.input} />
            <textarea value={itemForm.description} onChange={(e) => setItemForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" style={responsiveStyles.textArea} />
            <label style={responsiveStyles.checkboxRow}>
              <input type="checkbox" checked={itemForm.isActive} onChange={(e) => setItemForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
              Active
            </label>
          </div>

          <div style={responsiveStyles.actionRow}>
            <button className="mv-action" onClick={submitItem} disabled={saving} style={responsiveStyles.primaryButton}>
              {editingItemId ? <Save size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
              <span style={responsiveStyles.buttonLabel}>{saving ? "Saving…" : editingItemId ? "Update item" : "Create item"}</span>
            </button>
            {editingItemId && (
              <button className="mv-action" onClick={() => { setEditingItemId(null); setItemForm(emptyItemForm(itemForm.category)); }} style={responsiveStyles.secondaryButton}>
                Cancel
              </button>
            )}
          </div>

          <div style={styles.columns}>
            {items.length === 0 ? (
              <p style={styles.emptyText}>No default items yet.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} style={{ ...responsiveStyles.row, opacity: item.is_active ? 1 : 0.65 }}>
                  <div style={responsiveStyles.rowCopy}>
                    <strong>{item.name}</strong>
                    <span>{item.category} · {item.price} · {item.is_active ? "active" : "archived"}</span>
                  </div>
                  <div style={responsiveStyles.rowActions}>
                    <button onClick={() => startItemEdit(item)} style={styles.iconBtn} aria-label="Edit item">
                      <Pencil size={14} color={COLORS.text} />
                    </button>
                    <button onClick={() => toggleItemArchive(item)} style={styles.iconBtn} aria-label={item.is_active ? "Archive item" : "Restore item"}>
                      <Archive size={14} color={COLORS.text} />
                    </button>
                    <button onClick={() => deleteItem(item.id)} style={styles.iconBtnDanger} aria-label="Delete item">
                      <Trash2 size={14} color="#fff" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card style={responsiveStyles.cardWide}>
        <div style={responsiveStyles.sectionHeader}>
          <span style={styles.sectionTitle}>Initialize empty hotel menus</span>
        </div>
        <div style={responsiveStyles.inlineForm}>
          <input value={hotelIdInput} onChange={(e) => setHotelIdInput(e.target.value)} placeholder="Hotel ID" style={responsiveStyles.input} />
          <button className="mv-action" onClick={handleHotelInit} disabled={hotelInitBusy} style={responsiveStyles.primaryButton}>
            {hotelInitBusy ? <Spinner size="small" color="#fff" /> : <RefreshCcw size={14} color="#fff" />}
            <span style={responsiveStyles.buttonLabel}>{hotelInitBusy ? "Initializing…" : "Initialize default menu"}</span>
          </button>
        </div>
        {hotelInitMessage && (
          <p style={hotelInitMessage.includes("Skipped") || hotelInitMessage.includes("Enter") ? styles.warningText : styles.successText}>{hotelInitMessage}</p>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 18, padding: 24, maxWidth: 1280, minWidth: 0, margin: "0 auto" },
  center: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 30, color: COLORS.text, margin: 0 },
  subtitle: { fontFamily: FONTS.body, color: COLORS.textMuted, margin: "6px 0 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 18 },
  card: { padding: 20, borderRadius: RADIUS.lg },
  cardWide: { padding: 20, borderRadius: RADIUS.lg },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  sectionTitle: { fontFamily: FONTS.bodySemibold, fontWeight: 700, fontSize: 14, color: COLORS.text, letterSpacing: 0.4, textTransform: "uppercase" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  input: { width: "100%", background: "#fffdfb", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "10px 12px", fontFamily: FONTS.body, fontSize: 14, color: COLORS.text },
  textArea: { width: "100%", minHeight: 90, background: "#fffdfb", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "10px 12px", fontFamily: FONTS.body, fontSize: 14, color: COLORS.text, resize: "vertical" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontFamily: FONTS.bodyMedium, fontSize: 14, color: COLORS.text },
  actionRow: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16, marginBottom: 14 },
  primaryButton: { display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#FF6B35,#E5482E)", border: "none", borderRadius: 12, padding: "10px 14px", cursor: "pointer", color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 700 },
  secondaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "rgba(58,41,35,0.08)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: COLORS.text, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  columns: { display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "rgba(49,33,28,0.03)", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 12 },
  rowCopy: { display: "flex", flexDirection: "column", minWidth: 0 },
  rowActions: { display: "flex", gap: 8, flexShrink: 0 },
  iconBtn: { width: 32, height: 32, borderRadius: 8, border: `1px solid ${COLORS.borderSoft}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  iconBtnDanger: { width: 32, height: 32, borderRadius: 8, border: "none", background: COLORS.danger, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" },
  emptyText: { fontFamily: FONTS.body, color: COLORS.textMuted, margin: 0 },
  errorText: { fontFamily: FONTS.bodySemibold, color: COLORS.danger, margin: 0 },
  successText: { fontFamily: FONTS.bodySemibold, color: COLORS.success, margin: 0 },
  warningText: { fontFamily: FONTS.bodySemibold, color: COLORS.warning, margin: 0 },
  inlineForm: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 },
};
