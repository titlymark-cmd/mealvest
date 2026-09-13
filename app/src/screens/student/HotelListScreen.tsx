import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Store, ChevronRight, MapPin, LocateFixed } from "lucide-react-native";
import { Card } from "../../components/Card";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { fetchHotels, fetchNearbyHotels, Hotel } from "../../services/hotelsApi";
import { getCurrentLocation } from "../../services/locationService";

export default function HotelListScreen({ navigation }: any) {
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
    navigation.navigate("HotelMap", { hotel, studentLocation });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose a hotel</Text>
      <Text style={styles.subtitle}>Hotels registered with MEALVEST — pick one to see its menu.</Text>

      <TouchableOpacity style={styles.nearMeButton} onPress={findNearMe} disabled={locating}>
        <LocateFixed size={16} color="#fff" />
        <Text style={styles.nearMeText}>{locating ? "Finding hotels near you…" : "Find hotels near me"}</Text>
      </TouchableOpacity>

      {locationNotice && <Text style={styles.notice}>{locationNotice}</Text>}

      {nearestHotel && (
        <View style={styles.nearestBadge}>
          <MapPin size={12} color={COLORS.primary} />
          <Text style={styles.nearestBadgeText}>
            Nearest: {nearestHotel.name} · {nearestHotel.distance_km?.toFixed(1)} km
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
      {!loading && !error && hotels.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>No hotels are registered yet. Check back soon.</Text>
        </View>
      )}

      <FlatList
        data={hotels}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.cardMain}
              onPress={() => navigation.navigate("HotelMenu", { hotelId: item.id, hotelName: item.name })}
            >
              <View style={styles.iconCircle}>
                <Store size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hotelName}>{item.name}</Text>
                <Text style={styles.hotelLocation}>
                  {item.location}
                  {typeof item.distance_km === "number" ? ` · ${item.distance_km.toFixed(1)} km` : ""}
                </Text>
              </View>
              <ChevronRight size={18} color={COLORS.textFaint} />
            </TouchableOpacity>

            {typeof item.latitude === "number" && (
              <TouchableOpacity style={styles.mapLink} onPress={() => openOnMap(item)}>
                <MapPin size={12} color={COLORS.primary} />
                <Text style={styles.mapLinkText}>View on Google Maps</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 22, fontFamily: FONTS.displayBold, color: COLORS.text },
  subtitle: { fontSize: 13, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 4, marginBottom: 16 },
  nearMeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    marginBottom: 10,
  },
  nearMeText: { color: "#fff", fontFamily: FONTS.bodySemibold, fontSize: 13 },
  notice: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.warning, marginBottom: 10 },
  nearestBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EFF9FF",
    borderRadius: RADIUS.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  nearestBadgeText: { fontFamily: FONTS.bodySemibold, fontSize: 11, color: COLORS.primary },
  center: { alignItems: "center", paddingVertical: 40 },
  error: { color: COLORS.danger, fontFamily: FONTS.bodySemibold },
  empty: { color: COLORS.textMuted, textAlign: "center", fontFamily: FONTS.body },
  card: { padding: 14 },
  cardMain: { flexDirection: "row", alignItems: "center" },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.pill,
    backgroundColor: "#EFF9FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  hotelName: { fontSize: 15, fontFamily: FONTS.bodySemibold, color: COLORS.text },
  hotelLocation: { fontSize: 12, fontFamily: FONTS.body, color: COLORS.textMuted, marginTop: 2 },
  mapLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mapLinkText: { fontFamily: FONTS.bodySemibold, fontSize: 12, color: COLORS.primary },
});
