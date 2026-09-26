import React, { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Store, Coffee, Sun, Moon, Cookie, GlassWater, UtensilsCrossed } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT } from "../../styles/theme";
import { badgeColorFor } from "../../components/shared/format";
import { useWindowSize } from "../../hooks/useWindowSize";
import { fetchHotelMenu, Hotel, MenuItem } from "../../services/hotelsApi";

const MOBILE_BREAKPOINT = 768;

// "dinner" is relabeled "Supper" for display only — the real category
// value stored on each menu item is still "dinner", this is cosmetic.
const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Supper", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

export default function HotelMenuScreen() {
  const { hotelId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const isMobile = width < MOBILE_BREAKPOINT;
  const fallbackHotelName: string | undefined = (location.state as any)?.hotelName;

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHotelMenu(hotelId)
      .then((data) => {
        setHotel(data.hotel);
        setMenu(data.menu);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [hotelId]);

  const hotelName = hotel?.name || fallbackHotelName;

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

  if (loading) {
    return (
      <div style={styles.center}>
        <Spinner size="large" color={COLORS.primary} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ ...styles.bannerImageWrap, height: isMobile ? 200 : 280 }}>
        {hotel?.image_url ? (
          <img src={hotel.image_url} alt="" style={styles.bannerImage} />
        ) : (
          <div style={styles.bannerFallback}>
            <Store size={32} color={COLORS.textFaint} />
          </div>
        )}
        <button onClick={() => navigate("/student")} style={styles.backPill}>
          <ArrowLeft size={16} color="#fff" />
          <span style={styles.backPillText}>Back to hotels</span>
        </button>
        {hotel && (
          <div style={{ ...styles.initialBadge, backgroundColor: badgeColorFor(hotel.id) }}>
            <span style={styles.initialBadgeText}>{hotelName?.trim().charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      <div style={styles.headerInfo}>
        <h1 style={styles.title}>{hotelName}</h1>
        {hotel?.location && (
          <div style={styles.locationRow}>
            <MapPin size={13} color={COLORS.textOnDarkMuted} />
            <span style={styles.locationText}>{hotel.location}</span>
          </div>
        )}
      </div>

      <p style={styles.subtitle}>Take a look at their menu before you commit to a plan.</p>

      {menu.length === 0 ? (
        <div style={styles.center}>
          <p style={styles.empty}>This hotel hasn't added any menu items yet.</p>
        </div>
      ) : (
        <div style={styles.sectionsWrap}>
          {sections.map((section) => (
            <div key={section.key}>
              <div style={styles.sectionHeader}>
                <section.Icon size={16} color={COLORS.primary} />
                <span style={styles.sectionTitle}>{section.label}</span>
              </div>
              <div style={{ ...styles.itemsWrap, gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)" }}>
                {section.data.map((item) => (
                  <Card key={item.id} style={styles.itemCard}>
                    {item.image_url ? (
                      <img src={item.image_url} alt="" style={styles.thumb} />
                    ) : (
                      <div style={styles.thumbFallback}>
                        <UtensilsCrossed size={18} color={COLORS.textFaint} />
                      </div>
                    )}
                    <div style={styles.itemBody}>
                      <span style={styles.itemName}>{item.name}</span>
                      {item.description && <span style={styles.itemDesc}>{item.description}</span>}
                    </div>
                    <div style={styles.itemAction}>
                      <span style={styles.price}>KSh {Number(item.price).toLocaleString()}</span>
                      <button style={styles.requestButton} onClick={() => requestMeal(item)}>
                        <span style={styles.requestButtonText}>Request</span>
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="mv-action"
        style={styles.continueButton}
        onClick={() => navigate("/student/budget-onboarding", { state: { hotelId, hotelName } })}
      >
        <UtensilsCrossed size={18} color="#fff" />
        <span style={styles.continueButtonText}>This looks good — continue</span>
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, minHeight: "100vh", backgroundColor: COLORS.bg, paddingBottom: 32, display: "flex", flexDirection: "column" },
  center: { flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.bg, padding: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center" },
  empty: { color: COLORS.textOnDarkMuted, textAlign: "center", fontFamily: FONTS.body },

  bannerImageWrap: { position: "relative", width: "100%", overflow: "hidden", flexShrink: 0 },
  bannerImage: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  bannerFallback: { width: "100%", height: "100%", backgroundColor: COLORS.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" },
  backPill: {
    position: "absolute",
    top: 16,
    left: 16,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: RADIUS.pill,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 14,
  },
  backPillText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13 },
  initialBadge: {
    position: "absolute",
    left: 20,
    bottom: -20,
    width: 52,
    height: 52,
    borderRadius: RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `3px solid ${COLORS.bg}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  },
  initialBadgeText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: "#fff" },

  headerInfo: { padding: "28px 20px 0 20px" },
  title: { fontSize: 24, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  locationRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  locationText: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, margin: "18px 20px 0 20px" },

  sectionsWrap: { display: "flex", flexDirection: "column", gap: 22, padding: "20px 20px 0 20px" },
  sectionHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark },
  itemsWrap: { display: "grid", gap: 14 },
  itemCard: { display: "flex", flexDirection: "row", padding: 14, alignItems: "center", gap: 12, minWidth: 0 },
  thumb: { width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.borderSoft, objectFit: "cover", flexShrink: 0 },
  thumbFallback: {
    width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0,
  },
  itemBody: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  itemName: { display: "block", fontSize: 14, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  itemDesc: { display: "block", fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  itemAction: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 },
  price: { fontSize: 14, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, whiteSpace: "nowrap" },
  requestButton: { border: `1px solid ${COLORS.primary}`, borderRadius: RADIUS.pill, paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10 },
  requestButtonText: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10 },

  continueButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: RADIUS.sm,
    paddingTop: 15,
    paddingBottom: 15,
    margin: "28px 20px 0 20px",
    background: `linear-gradient(135deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  continueButtonText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 15 },
};
