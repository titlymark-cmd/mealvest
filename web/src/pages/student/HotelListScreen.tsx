import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Store, ChevronRight, MapPin, LocateFixed, LogOut } from "lucide-react";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";
import { COLORS, FONTS, RADIUS, GRADIENT, glow } from "../../styles/theme";
import { fetchHotels, fetchNearbyHotels, Hotel } from "../../services/hotelsApi";
import { getCurrentLocation } from "../../services/locationService";
import { useAuth } from "../../context/AuthContext";

export default function HotelListScreen() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nearby-search state — additive to the existing manual browse
  // list below, per "do not redesign existing UI/flow", just extends it.
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [studentLocation, setStudentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearestHotel, setNearestHotel] = useState<Hotel | null>(null);

  useEffect(() => {
    fetchHotels()
      .then(setHotels)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const findNearMe = async () => {
    setLocating(true);
    setLocationNotice(null);
    try {
      const result = await getCurrentLocation();
      if (result.status !== "granted" || !result.coords) {
        // Spec requirement: denial/unavailable/timeout must never
        // crash the app — just show a message and let the student
        // keep using the manual list below.
        setLocationNotice(result.message);
        return;
      }
      setStudentLocation(result.coords);
      const nearby = await fetchNearbyHotels(result.coords.latitude, result.coords.longitude);
      setNearestHotel(nearby.nearestHotel);
      if (nearby.hotels.length > 0) {
        setHotels(nearby.hotels); // replace the plain list with distance-sorted results
      } else {
        setLocationNotice("No MEALVEST hotels with a set location were found near you yet.");
      }
    } catch (err) {
      setLocationNotice(err instanceof Error ? err.message : "Could not search nearby hotels.");
    } finally {
      setLocating(false);
    }
  };

  const openOnMap = (hotel: Hotel) => {
    // HotelMapScreen is carried over unwired in this migration (it
    // was already dead code in the original app — imports
    // react-native-maps but was never registered in StudentStack, so
    // it never shipped in the original web bundle either). This link
    // matches that exact do-nothing status rather than building out
    // new map functionality.
    navigate("/student/hotels/map", { state: { hotel, studentLocation } });
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

      <button
        onClick={findNearMe}
        disabled={locating}
        className={locating ? undefined : "mv-action mv-action-no-ring"}
        style={{ ...styles.nearMeButtonWrap, ...glow(COLORS.primary, 10) }}
      >
        <div style={styles.nearMeButton}>
          <LocateFixed size={16} color="#fff" />
          <span style={styles.nearMeText}>{locating ? "Finding hotels near you…" : "Find hotels near me"}</span>
        </div>
      </button>

      {locationNotice && <p style={styles.notice}>{locationNotice}</p>}

      {nearestHotel && (
        <div style={styles.nearestBadge}>
          <MapPin size={12} color={COLORS.primary} />
          <span style={styles.nearestBadgeText}>
            Nearest: {nearestHotel.name} · {nearestHotel.distance_km?.toFixed(1)} km
          </span>
        </div>
      )}

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

      <div style={styles.list}>
        {hotels.map((item) => (
          <Card key={item.id} style={styles.card}>
            <button
              className="mv-action mv-action-no-ring"
              style={styles.cardMain}
              onClick={() => navigate(`/student/hotels/${item.id}/menu`, { state: { hotelName: item.name } })}
            >
              <div style={styles.iconCircle}>
                <Store size={20} color={COLORS.primary} />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <span style={styles.hotelName}>{item.name}</span>
                <span style={styles.hotelLocation}>
                  {item.location}
                  {typeof item.distance_km === "number" ? ` · ${item.distance_km.toFixed(1)} km` : ""}
                </span>
              </div>
              <ChevronRight size={18} color={COLORS.textFaint} />
            </button>

            {typeof item.latitude === "number" && (
              <button style={styles.mapLink} onClick={() => openOnMap(item)}>
                <MapPin size={12} color={COLORS.primary} />
                <span style={styles.mapLinkText}>View on Google Maps</span>
              </button>
            )}
          </Card>
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
  nearMeButtonWrap: { borderRadius: RADIUS.sm, width: "100%" },
  nearMeButton: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: RADIUS.sm,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 10,
    background: `linear-gradient(90deg, ${GRADIENT[0]}, ${GRADIENT[1]})`,
  },
  nearMeText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 13 },
  notice: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.accent, marginBottom: 10, marginTop: 0 },
  nearestBadge: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(229,72,46,0.15)",
    borderRadius: RADIUS.sm,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  nearestBadgeText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 11, color: COLORS.primary },
  center: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 40, paddingBottom: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold, fontWeight: 600 },
  empty: { color: COLORS.textOnDarkMuted, textAlign: "center", fontFamily: FONTS.body },
  list: { display: "flex", flexDirection: "column", gap: 10, paddingBottom: 24 },
  card: { padding: 14 },
  cardMain: { display: "flex", flexDirection: "row", alignItems: "center", width: "100%", borderRadius: RADIUS.sm },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentSoft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  hotelName: { display: "block", fontSize: 15, fontFamily: FONTS.bodySemibold, fontWeight: 600, color: COLORS.text },
  hotelLocation: { display: "block", fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  mapLink: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${COLORS.borderSoft}`,
    width: "100%",
  },
  mapLinkText: { fontFamily: FONTS.bodySemibold, fontWeight: 600, fontSize: 12, color: COLORS.primary },
};
