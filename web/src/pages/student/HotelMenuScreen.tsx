import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Coffee, Sun, Moon, Cookie, GlassWater, UtensilsCrossed } from "lucide-react";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { fetchHotelMenu, MenuItem } from "../../services/hotelsApi";

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Dinner", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

export default function HotelMenuScreen() {
  const { hotelId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const hotelName: string | undefined = (location.state as any)?.hotelName;

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
    navigate("/student/meal-pass", {
      state: { hotelId, hotelName, itemId: item.id, itemName: item.name, itemPrice: item.price },
    });
  };

  const sections = Object.keys(CATEGORY_META)
    .map((key) => ({ key, ...CATEGORY_META[key], data: menu.filter((m) => m.category === key) }))
    .filter((s) => s.data.length > 0);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>{hotelName}</h1>
      <p style={styles.subtitle}>Pick a meal to request, or continue to set up your plan.</p>

      {loading && (
        <div style={styles.center}>
          <Spinner color={COLORS.primary} />
        </div>
      )}
      {!loading && error && (
        <div style={styles.center}>
          <p style={styles.error}>{error}</p>
        </div>
      )}
      {!loading && !error && menu.length === 0 && (
        <div style={styles.center}>
          <p style={styles.empty}>This hotel hasn't added any menu items yet.</p>
        </div>
      )}

      <div style={styles.sectionsWrap}>
        {sections.map((section) => (
          <div key={section.key}>
            <div style={styles.sectionHeader}>
              <section.Icon size={15} color={COLORS.primary} />
              <span style={styles.sectionTitle}>{section.label}</span>
            </div>
            <div style={styles.itemsWrap}>
              {section.data.map((item) => (
                <Card key={item.id} style={styles.card}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={styles.thumb} />
                  ) : (
                    <div style={styles.thumbFallback}>
                      <UtensilsCrossed size={20} color={COLORS.textFaint} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <span style={styles.itemName}>{item.name}</span>
                    {item.description && <span style={styles.itemDesc}>{item.description}</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={styles.price}>KSh {Number(item.price).toLocaleString()}</span>
                    <button style={styles.requestButton} onClick={() => requestMeal(item)}>
                      <span style={styles.requestButtonText}>Request meal</span>
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <PrimaryButton onPress={() => navigate("/student/budget-onboarding", { state: { hotelId, hotelName } })} showArrow={false}>
          Continue without picking a meal yet
        </PrimaryButton>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 60, paddingBottom: 100, position: "relative", display: "flex", flexDirection: "column" },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 16 },
  center: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, paddingBottom: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  empty: { color: COLORS.textOnDarkMuted, textAlign: "center", fontFamily: FONTS.body },
  sectionsWrap: { display: "flex", flexDirection: "column", gap: 6 },
  sectionHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark },
  itemsWrap: { display: "flex", flexDirection: "column", gap: 10 },
  card: { display: "flex", flexDirection: "row", padding: 14, alignItems: "flex-start" },
  thumb: { width: 48, height: 48, borderRadius: RADIUS.sm, marginRight: 12, backgroundColor: COLORS.borderSoft, objectFit: "cover", flexShrink: 0 },
  thumbFallback: {
    width: 48, height: 48, borderRadius: RADIUS.sm, marginRight: 12,
    backgroundColor: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center",
    border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0,
  },
  itemName: { display: "block", fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  itemDesc: { display: "block", fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  price: { fontSize: 14, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, marginBottom: 6 },
  requestButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12 },
  requestButtonText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11 },
  footer: { position: "absolute", bottom: 16, left: 20, right: 20 },
};
