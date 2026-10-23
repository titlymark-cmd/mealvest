import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, UtensilsCrossed, SearchX, ImageOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ImageUploadField } from "../../components/ImageUploadField";
import { Modal } from "../../components/ui/Modal";
import { SkeletonRegion, SkeletonCards } from "../../components/ui/Skeleton";
import {
  Banner,
  Chips,
  EmptyState,
  HdSwitch,
  PageHeader,
  Panel,
  SearchBox,
  StatusPill,
  useNotice,
  whole,
} from "../../components/hotel/hd";
import { fetchOwnMenu, addMenuItem, updateMenuItem, deleteMenuItem, HotelMenuItem } from "../../services/hotelStaffApi";

// Mirrors the backend's menuItemSchema (hotel.controller.ts).
const CATEGORIES = ["breakfast", "lunch", "dinner", "snacks", "drinks", "other"];
const MAX_NAME = 120;
const MAX_DESC = 300;
const MAX_PRICE = 10_000;

interface FormState {
  name: string;
  price: string;
  category: string;
  description: string;
  imageUrl: string;
}

const BLANK: FormState = { name: "", price: "", category: "lunch", description: "", imageUrl: "" };

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.name.trim()) errors.name = "Give the meal a name.";
  else if (f.name.trim().length > MAX_NAME) errors.name = `Keep the name under ${MAX_NAME} characters.`;
  const price = Number(f.price);
  if (!f.price.trim() || !Number.isFinite(price) || price <= 0) errors.price = "Enter a price above KSh 0.";
  else if (price > MAX_PRICE) errors.price = `Price can't exceed KSh ${MAX_PRICE.toLocaleString()}.`;
  if (f.description.length > MAX_DESC) errors.description = `Keep the description under ${MAX_DESC} characters.`;
  return errors;
}

export default function HotelMenuManageScreen() {
  const { authFetch } = useAuth();
  const { notice, notify } = useNotice();

  const [items, setItems] = useState<HotelMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<HotelMenuItem | "new" | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<HotelMenuItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchOwnMenu(authFetch));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your menu.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const replaceItem = (updated: HotelMenuItem) => setItems((cur) => cur.map((i) => (i.id === updated.id ? updated : i)));

  const openNew = () => {
    setForm(BLANK);
    setTouched(false);
    setFormError(null);
    setEditing("new");
  };

  const openEdit = (item: HotelMenuItem) => {
    setForm({
      name: item.name,
      price: String(Number(item.price)),
      category: item.category,
      description: item.description ?? "",
      imageUrl: item.image_url ?? "",
    });
    setTouched(false);
    setFormError(null);
    setEditing(item);
  };

  const errors = validate(form);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    setTouched(true);
    if (Object.keys(errors).length > 0 || !editing) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editing === "new") {
        await addMenuItem(authFetch, {
          name: form.name.trim(),
          price: Number(form.price),
          category: form.category,
          description: form.description.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
        });
        notify(`“${form.name.trim()}” added to your menu.`);
        await load();
      } else {
        // Send only what changed — the backend COALESCEs omitted fields.
        const patch: Parameters<typeof updateMenuItem>[2] = {};
        if (form.name.trim() !== editing.name) patch.name = form.name.trim();
        if (Number(form.price) !== Number(editing.price)) patch.price = Number(form.price);
        if (form.category !== editing.category) patch.category = form.category;
        if (form.description.trim() !== (editing.description ?? "")) patch.description = form.description.trim();
        if (form.imageUrl.trim() && form.imageUrl.trim() !== (editing.image_url ?? "")) patch.imageUrl = form.imageUrl.trim();
        if (Object.keys(patch).length === 0) {
          setEditing(null);
          return;
        }
        replaceItem(await updateMenuItem(authFetch, editing.id, patch));
        notify(`“${form.name.trim()}” updated.`);
      }
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this meal.");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailable = async (item: HotelMenuItem) => {
    setBusyId(item.id);
    try {
      replaceItem(await updateMenuItem(authFetch, item.id, { available: !item.available }));
      notify(item.available ? `“${item.name}” hidden from students.` : `“${item.name}” is visible to students.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update this meal.", "bad");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteMenuItem(authFetch, deleting.id);
      setItems((cur) => cur.filter((i) => i.id !== deleting.id));
      notify(`“${deleting.name}” removed.`);
      setDeleting(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not remove this meal.", "bad");
    } finally {
      setDeleteBusy(false);
    }
  };

  const hideInstead = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    if (target.available) await toggleAvailable(target);
  };

  const chips = useMemo(
    () => [
      { value: "all", label: "All", count: items.length },
      ...CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => ({
        value: c,
        label: c,
        count: items.filter((i) => i.category === c).length,
      })),
    ],
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q))
    );
  }, [items, category, query]);

  const shownCount = items.filter((i) => i.available).length;

  return (
    <div className="hd-page mv-page">
      <PageHeader
        eyebrow="Menu"
        title="Menu board"
        subtitle={loading ? undefined : `${items.length} meal${items.length === 1 ? "" : "s"} · ${shownCount} visible to students`}
        actions={
          <button className="hd-btn hd-btn-primary" onClick={openNew}>
            <Plus size={18} aria-hidden="true" /> Add meal
          </button>
        }
      />

      {error && (
        <Banner tone="bad" title="Couldn't load your menu" action={<button className="hd-btn hd-btn-dark hd-btn-sm" onClick={() => { setLoading(true); load(); }}>Try again</button>}>
          {error}
        </Banner>
      )}

      {items.length > 0 && (
        <div className="hd-toolbar">
          <Chips label="Filter by category" options={chips} value={category} onChange={setCategory} />
          <SearchBox label="Search menu" placeholder="Search meals" value={query} onChange={setQuery} />
        </div>
      )}

      {loading ? (
        <SkeletonRegion label="menu">
          <SkeletonCards count={6} />
        </SkeletonRegion>
      ) : items.length === 0 && !error ? (
        <EmptyState
          icon={<UtensilsCrossed size={22} />}
          title="Your menu is empty"
          action={
            <button className="hd-btn hd-btn-primary" onClick={openNew}>
              <Plus size={18} aria-hidden="true" /> Add your first meal
            </button>
          }
        >
          Students can only order meals you list here. Add a name, a price and a photo to get started.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<SearchX size={22} />} title="No meals found">
          Try a different search or category.
        </EmptyState>
      ) : (
        <ul className="hd-menu-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visible.map((item) => (
            <li key={item.id}>
              <Panel as="article" className="hd-dish" data-hidden={!item.available} style={{ height: "100%" }}>
                <div className="hd-dish-img">
                  {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" /> : <ImageOff size={28} aria-label="No photo" />}
                </div>
                <div className="hd-dish-body">
                  <div className="hd-dish-line">
                    <StatusPill tone="muted">{item.category}</StatusPill>
                    <span className="hd-amount">{whole(item.price)}</span>
                  </div>
                  <h2 className="hd-dish-name">{item.name}</h2>
                  {item.description && <p className="hd-dish-desc">{item.description}</p>}
                  <div className="hd-dish-foot">
                    <HdSwitch
                      checked={item.available}
                      disabled={busyId === item.id}
                      onChange={() => toggleAvailable(item)}
                      label={item.available ? "Visible to students" : "Hidden from students"}
                    />
                    <div className="hd-dish-actions">
                      <button className="hd-btn hd-btn-quiet hd-btn-sm" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}>
                        <Pencil size={15} aria-hidden="true" /> Edit
                      </button>
                      <button className="hd-btn hd-btn-danger hd-btn-sm" onClick={() => setDeleting(item)} aria-label={`Remove ${item.name}`}>
                        <Trash2 size={15} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add a meal" : "Edit meal"}
        onClose={() => !saving && setEditing(null)}
      >
        <div className="hd-form">
          <div className="hd-field">
            <label htmlFor="hd-name">Name</label>
            <input id="hd-name" className="hd-input" value={form.name} maxLength={MAX_NAME + 20} onChange={(e) => set({ name: e.target.value })} aria-invalid={touched && !!errors.name} aria-describedby={errors.name && touched ? "hd-name-err" : undefined} />
            {touched && errors.name && <p className="hd-err" id="hd-name-err">{errors.name}</p>}
          </div>
          <div className="hd-field">
            <label htmlFor="hd-price">Price (KSh)</label>
            <input id="hd-price" className="hd-input" inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} aria-invalid={touched && !!errors.price} aria-describedby={errors.price && touched ? "hd-price-err" : undefined} />
            {touched && errors.price && <p className="hd-err" id="hd-price-err">{errors.price}</p>}
          </div>
          <div className="hd-field">
            <label htmlFor="hd-cat">Category</label>
            <select id="hd-cat" className="hd-input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="hd-field">
            <label htmlFor="hd-desc">Description (optional)</label>
            <textarea id="hd-desc" className="hd-input" value={form.description} onChange={(e) => set({ description: e.target.value })} aria-invalid={touched && !!errors.description} />
            <p className="hd-hint">{form.description.length}/{MAX_DESC}</p>
            {touched && errors.description && <p className="hd-err">{errors.description}</p>}
          </div>
          <div className="hd-field">
            <span className="hd-label">Photo</span>
            <ImageUploadField
              authFetch={authFetch}
              value={form.imageUrl}
              onChange={(url) => set({ imageUrl: url })}
              itemId={editing && editing !== "new" ? editing.id : undefined}
              label="Upload a photo"
            />
          </div>
          {formError && <p className="hd-err" role="alert">{formError}</p>}
          <div className="hd-modal-actions">
            <button className="hd-btn hd-btn-quiet" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button className="hd-btn hd-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing === "new" ? "Add meal" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        title="Remove this meal?"
        onClose={() => !deleteBusy && setDeleting(null)}
        icon={<Trash2 size={22} color="#b83420" aria-hidden="true" />}
        actions={
          <>
            <button className="hd-btn hd-btn-danger" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Removing…" : "Remove permanently"}
            </button>
            {deleting?.available && (
              <button className="hd-btn hd-btn-quiet" onClick={hideInstead} disabled={deleteBusy}>
                Hide from students instead
              </button>
            )}
            <button className="hd-btn hd-btn-quiet" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Keep it
            </button>
          </>
        }
      >
        “{deleting?.name}” will be deleted from your menu and can't be restored. Past orders keep their own record of the meal. Hiding it instead keeps it here so you can bring it back later.
      </Modal>

      {notice}
    </div>
  );
}
