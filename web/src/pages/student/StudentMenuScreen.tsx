import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, Sun, Moon, Cookie, GlassWater, UtensilsCrossed, Store } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";
import { getActiveBudget } from "../../services/budgetApi";
import { fetchHotelMenu, Hotel, MenuItem } from "../../services/hotelsApi";

const MOBILE_BREAKPOINT = 768;

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  breakfast: { label: "Breakfast", Icon: Coffee },
  lunch: { label: "Lunch", Icon: Sun },
  dinner: { label: "Supper", Icon: Moon },
  snacks: { label: "Snacks", Icon: Cookie },
  drinks: { label: "Drinks", Icon: GlassWater },
  other: { label: "Other", Icon: UtensilsCrossed },
};

/**
 * The student's OWN assigned hotel's menu — reached from the
 * dashboard sidebar/"Order today's meal", not the hotel-browsing flow
 * (that's HotelListScreen -> HotelMenuScreen, still unchanged, for a
 * student setting up a plan for the first time). Ordering itself
 * reuses that exact same real order+payment+QR pipeline
 * (/student/meal-pass -> createOrder -> payOrder), just entered from
 * here instead.
 */
export default function StudentMenuScreen() {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const isMobile = width < MOBILE_BREAKPOINT;

  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [spendableToday, setSpendableToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const budget = await getActiveBudget(authFetch);
        if (!budget) {
          setError("You don't have an active meal plan yet.");
          return;
        }
        if (!budget.hotel_id) {
          setError("Your plan isn't linked to a hotel yet — contact Customer Care for help.");
          return;
        }
        const dailyCredit = Number(budget.daily_allowance);
        const banked = Number(budget.banked_amount);
        const spentToday = Number(budget.spent_today);
        setSpendableToday(Math.max(0, dailyCredit + banked - spentToday));

        const data = await fetchHotelMenu(budget.hotel_id);
        setHotel(data.hotel);
        setMenu(data.menu);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your hotel's menu.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch]);

  const requestMeal = (item: MenuItem) => {
    navigate("/student/meal-pass", {
      state: { hotelId: hotel?.id, hotelName: hotel?.name, itemId: item.id, itemName: item.name, itemPrice: item.price },
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
      <div style={styles.headerRow}>
        <div style={styles.hotelIcon}>
          <Store size={18} color={COLORS.primary} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={styles.title}>{hotel?.name}</h1>
          <span style={styles.subtitle}>Order today's meal</span>
        </div>
        {spendableToday !== null && (
          <span style={styles.balancePill}>KSh {spendableToday.toLocaleString()} left today</span>
        )}
      </div>

      {menu.length === 0 ? (
        <p style={styles.empty}>Your hotel hasn't added any menu items yet.</p>
      ) : (
        <div style={styles.sectionsWrap}>
          {sections.map((section) => (
            <div key={section.key}>
              <div style={styles.sectionHeader}>
                <section.Icon size={16} color={COLORS.primary} />
                <span style={styles.sectionTitle}>{section.label}</span>
              </div>
              <div style={{ ...styles.itemsWrap, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
                {section.data.map((item) => {
                  const exceedsBalance = spendableToday !== null && Number(item.price) > spendableToday;
                  return (
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
                        {exceedsBalance && <span style={styles.exceedsText}>Exceeds remaining balance</span>}
                      </div>
                      <div style={styles.itemAction}>
                        <span style={styles.price}>KSh {Number(item.price).toLocaleString()}</span>
                        <button
                          style={{ ...styles.requestButton, opacity: exceedsBalance ? 0.4 : 1 }}
                          onClick={() => requestMeal(item)}
                          disabled={exceedsBalance}
                        >
                          <span style={styles.requestButtonText}>Order</span>
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", backgroundColor: COLORS.bg, padding: 24, maxWidth: 900, display: "flex", flexDirection: "column" },
  center: { minHeight: "100vh", backgroundColor: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600, textAlign: "center" },
  empty: { color: COLORS.textFaint, fontFamily: FONTS.body, textAlign: "center", marginTop: 20 },

  headerRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" },
  hotelIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 20, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textOnDarkMuted },
  balancePill: {
    marginLeft: "auto",
    backgroundColor: COLORS.primary,
    color: "#fff",
    borderRadius: RADIUS.pill,
    padding: "6px 14px",
    fontFamily: FONTS.bodySemibold,
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  sectionsWrap: { display: "flex", flexDirection: "column", gap: 22 },
  sectionHeader: { display: "flex", flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.textOnDark },
  itemsWrap: { display: "grid", gap: 14 },
  itemCard: { display: "flex", flexDirection: "row", padding: 14, alignItems: "center", gap: 12, minWidth: 0 },
  thumb: { width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.borderSoft, objectFit: "cover", flexShrink: 0 },
  thumbFallback: {
    width: 56, height: 56, borderRadius: RADIUS.sm, backgroundColor: COLORS.accentSoft,
    display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.borderSoft}`, flexShrink: 0,
  },
  itemBody: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  itemName: { display: "block", fontSize: 13, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  itemDesc: { display: "block", fontSize: 11, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  exceedsText: { display: "block", fontSize: 10, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.danger, marginTop: 3 },
  itemAction: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 },
  price: { fontSize: 13, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.text, whiteSpace: "nowrap" },
  requestButton: { border: `1px solid ${COLORS.primary}`, borderRadius: RADIUS.pill, paddingTop: 4, paddingBottom: 4, paddingLeft: 10, paddingRight: 10 },
  requestButtonText: { color: COLORS.primary, fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 10 },
};
