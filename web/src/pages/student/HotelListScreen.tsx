import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Store, ChevronRight, MapPin, Search, LogOut } from "lucide-react";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS } from "../../styles/theme";
import { fetchHotels, Hotel } from "../../services/hotelsApi";
import { useAuth } from "../../context/AuthContext";
import { useWindowSize } from "../../hooks/useWindowSize";

const MOBILE_BREAKPOINT = 768;

// Deterministic (not random) badge color per hotel, so the same hotel
// always gets the same color across renders/reloads — hashes the id
// string against a small fixed palette drawn from the app's own brand
// colors, rather than picking randomly per render.
const BADGE_COLORS = [COLORS.primary, COLORS.accent, COLORS.success, COLORS.primaryLight, COLORS.primaryDark];
function badgeColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

export default function HotelListScreen() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const isMobile = width < MOBILE_BREAKPOINT;
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchHotels()
      .then(setHotels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredHotels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hotels;
    return hotels.filter((h) => h.name.toLowerCase().includes(q));
  }, [hotels, query]);

  const openOnMap = (hotel: Hotel) => {
    // HotelMapScreen is carried over unwired in this migration (it
    // was already dead code in the original app — imports
    // react-native-maps but was never registered in StudentStack, so
    // it never shipped in the original web bundle either). This link
    // matches that exact do-nothing status rather than building out
    // new map functionality.
    navigate("/student/hotels/map", { state: { hotel, studentLocation: null } });
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div style={{ flex: 1 }}>
          <h1 style={styles.title}>Choose a hotel</h1>
          <p style={styles.subtitle}>Hotels registered with MEALVEST — pick one to see its menu.</p>
        </div>
        <button style={styles.logoutIcon} onClick={() => logout()}>
          <LogOut size={18} color={COLORS.danger} />
        </button>
      </div>

      <div style={styles.searchWrap}>
        <Search size={16} color={COLORS.textOnDarkMuted} style={styles.searchIcon} />
        <input
          style={styles.searchInput}
          placeholder="Search hotels by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCapitalize="none"
        />
      </div>

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
      {!loading && !error && hotels.length === 0 && (
        <div style={styles.center}>
          <p style={styles.empty}>No hotels are registered yet. Check back soon.</p>
        </div>
      )}
      {!loading && !error && hotels.length > 0 && filteredHotels.length === 0 && (
        <div style={styles.center}>
          <p style={styles.empty}>No hotels match "{query}".</p>
        </div>
      )}

      <div style={{ ...styles.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)" }}>
        {filteredHotels.map((item) => (
          <div key={item.id} className="mv-card-lift" style={styles.gridCard}>
            <button
              style={styles.cardMain}
              onClick={() => navigate(`/student/hotels/${item.id}/menu`, { state: { hotelName: item.name } })}
            >
              <div style={styles.bannerWrap}>
                <div style={styles.bannerClip}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={styles.banner} />
                  ) : (
                    <div style={styles.bannerFallback}>
                      <Store size={28} color={COLORS.textFaint} />
                    </div>
                  )}
                </div>
                <div style={{ ...styles.initialBadge, backgroundColor: badgeColorFor(item.id) }}>
                  <span style={styles.initialBadgeText}>{item.name.trim().charAt(0).toUpperCase()}</span>
                </div>
              </div>

              <div style={styles.cardBody}>
                <div style={styles.nameRow}>
                  <span style={styles.hotelName}>{item.name}</span>
                  <ChevronRight size={18} color={COLORS.textFaint} />
                </div>
                <div style={styles.locationRow}>
                  <MapPin size={12} color={COLORS.textMuted} />
                  <span style={styles.hotelLocation}>{item.location}</span>
                </div>
                {item.description && <p style={styles.hotelDescription}>{item.description}</p>}
              </div>
            </button>

            {typeof item.latitude === "number" && (
              <button style={styles.mapLink} onClick={() => openOnMap(item)}>
                <MapPin size={12} color={COLORS.primary} />
                <span style={styles.mapLinkText}>View on Google Maps</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flexShrink: 0, width: "100%", minHeight: "100%", backgroundColor: COLORS.bg, padding: 20, paddingTop: 60, display: "flex", flexDirection: "column" },
  headerRow: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, fontWeight: 800, color: COLORS.textOnDark, margin: 0 },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textOnDarkMuted, marginTop: 4, marginBottom: 16 },
  logoutIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: "rgba(252,244,234,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    flexShrink: 0,
  },
  searchWrap: { position: "relative", display: "flex", alignItems: "center", marginBottom: 20 },
  searchIcon: { position: "absolute", left: 16, pointerEvents: "none" },
  searchInput: {
    width: "100%",
    backgroundColor: "rgba(252,244,234,0.06)",
    borderRadius: RADIUS.pill,
    border: `1.5px solid ${COLORS.border}`,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 44,
    paddingRight: 16,
    fontSize: 14,
    fontFamily: FONTS.bodyMedium,
    fontWeight: 500,
    color: COLORS.textOnDark,
    outline: "none",
  },
  center: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, paddingBottom: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  empty: { color: COLORS.textOnDarkMuted, textAlign: "center", fontFamily: FONTS.body },
  grid: {
    display: "grid",
    gap: 16,
    paddingBottom: 24,
    maxWidth: 1320,
    width: "100%",
    margin: "0 auto",
  },
  // Card surface matches components/Card.tsx (bg/border/shadow) but
  // has no padding of its own and, crucially, no overflow:hidden — the
  // banner clips its own corners locally (bannerClip below) so the
  // initial badge (which deliberately overlaps outside the banner's
  // box) is never clipped. .mv-card-lift lives on this whole div (not
  // the inner button) so hover lifts the entire card — border, shadow
  // and all — as one piece, not just the content inside it.
  gridCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.borderSoft}`,
    boxShadow: "0 1px 2px rgba(29,21,17,0.12), 0 8px 20px rgba(29,21,17,0.16)",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  cardMain: { display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", borderRadius: RADIUS.sm, textAlign: "left" },
  bannerWrap: { position: "relative", width: "100%" },
  bannerClip: { width: "100%", height: 130, borderTopLeftRadius: RADIUS.sm, borderTopRightRadius: RADIUS.sm, overflow: "hidden" },
  banner: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  bannerFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.accentSoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  initialBadge: {
    position: "absolute",
    left: 14,
    bottom: -16,
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: `2px solid ${COLORS.card}`,
    boxShadow: "0 2px 6px rgba(29,21,17,0.25)",
    zIndex: 1,
  },
  initialBadgeText: { fontFamily: FONTS.displayBold, fontWeight: 800, fontSize: 16, color: "#fff" },
  cardBody: { padding: 14, paddingTop: 22, display: "flex", flexDirection: "column" },
  nameRow: { display: "flex", flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  hotelName: { display: "block", fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text, flex: 1 },
  locationRow: { display: "flex", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  hotelLocation: { display: "block", fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted },
  hotelDescription: {
    fontSize: 12,
    fontFamily: FONTS.body,
    color: COLORS.textMuted,
    margin: "8px 0 0 0",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  mapLink: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 0,
    paddingTop: 10,
    paddingBottom: 12,
    paddingLeft: 14,
    borderTop: `1px solid ${COLORS.borderSoft}`,
    width: "100%",
  },
  mapLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
};
