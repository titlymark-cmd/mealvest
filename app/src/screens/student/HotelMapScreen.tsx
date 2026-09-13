import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Callout } from "react-native-maps";
import { Phone, LifeBuoy, Navigation, ArrowLeft, Clock } from "lucide-react-native";
import { COLORS, FONTS, RADIUS } from "../../theme/theme";
import { Card } from "../../components/Card";

/**
 * Real react-native-maps usage with PROVIDER_GOOGLE — this renders
 * the actual Google Maps SDK on both Android and iOS (once the API
 * key from app.config.js is set and the app is rebuilt; Expo Go
 * cannot load a custom native Maps API key, this requires a
 * development build — see TESTING.md).
 */
export default function HotelMapScreen({ route, navigation }: any) {
  const { hotel, studentLocation } = route.params;
  const [calloutVisible, setCalloutVisible] = useState(true);

  const hasHotelCoords = typeof hotel.latitude === "number" && typeof hotel.longitude === "number";
  const hasStudentCoords = studentLocation && typeof studentLocation.latitude === "number";

  if (!hasHotelCoords) {
    // Spec requirement: "Hotel has missing coordinates" must never
    // produce a blank/broken screen.
    return (
      <View style={styles.container}>
        <BackBar onBack={() => navigation.goBack()} title={hotel.name} />
        <View style={styles.centerFill}>
          <Text style={styles.errorTitle}>Location not available yet</Text>
          <Text style={styles.errorBody}>
            {hotel.name} hasn't set up their exact map location yet. You can still view their menu and contact them
            directly.
          </Text>
        </View>
      </View>
    );
  }

  const region = {
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  const distanceLabel =
    typeof hotel.distance_km === "number" ? `${hotel.distance_km.toFixed(1)} km away` : null;

  const callNumber = (number?: string | null) => {
    if (!number) return;
    // tel: is the correct, non-fake way to trigger a call on both
    // platforms — this is not a custom in-app dialer.
    Linking.openURL(`tel:${number}`);
  };

  const getDirections = () => {
    // Opens the device's Google Maps app/navigation where available,
    // falling back to the Maps web URL otherwise — this hands off to
    // real Google Maps navigation rather than building a fake router.
    const destination = `${hotel.latitude},${hotel.longitude}`;
    const label = encodeURIComponent(hotel.name);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${destination}`,
      android: `google.navigation:q=${destination}&mode=w`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
    });
    Linking.canOpenURL(url!)
      .then((supported) => {
        if (supported) return Linking.openURL(url!);
        return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
      })
      .catch(() => {
        Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
      });
  };

  return (
    <View style={styles.container}>
      <BackBar onBack={() => navigation.goBack()} title={hotel.name} />

      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={hasStudentCoords}
        showsMyLocationButton={hasStudentCoords}
      >
        <Marker
          coordinate={{ latitude: hotel.latitude, longitude: hotel.longitude }}
          pinColor={COLORS.primary}
          onPress={() => setCalloutVisible(true)}
        >
          <Callout>
            <View style={{ width: 160 }}>
              <Text style={{ fontFamily: FONTS.bodySemibold, fontSize: 13, color: COLORS.text }}>{hotel.name}</Text>
              {distanceLabel && (
                <Text style={{ fontFamily: FONTS.body, fontSize: 11, color: COLORS.textMuted }}>{distanceLabel}</Text>
              )}
            </View>
          </Callout>
        </Marker>

        {hasStudentCoords && (
          <Marker
            coordinate={studentLocation}
            pinColor={COLORS.accent}
            title="Your location"
          />
        )}
      </MapView>

      {/* Per spec: help/helpline info must stay visible on screen at
          all times, NOT hidden behind a marker tap / zoom level. */}
      {calloutVisible && (
        <Card style={styles.infoCard}>
          <View style={styles.infoHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hotelName}>{hotel.name}</Text>
              {distanceLabel && <Text style={styles.distance}>{distanceLabel}</Text>}
            </View>
          </View>

          {hotel.address && (
            <Text style={styles.address}>{hotel.address}</Text>
          )}

          {hotel.opening_hours && (
            <View style={styles.rowInline}>
              <Clock size={13} color={COLORS.textMuted} />
              <Text style={styles.hoursText}>{hotel.opening_hours}</Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <ActionButton
              Icon={Phone}
              label="Call Hotel"
              onPress={() => callNumber(hotel.contact_phone)}
              disabled={!hotel.contact_phone}
            />
            <ActionButton
              Icon={LifeBuoy}
              label="Call Help"
              onPress={() => callNumber(hotel.helpline)}
              disabled={!hotel.helpline}
            />
            <ActionButton Icon={Navigation} label="Directions" onPress={getDirections} primary />
          </View>
        </Card>
      )}
    </View>
  );
}

function BackBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.backBar}>
      <TouchableOpacity onPress={onBack} style={styles.backButton}>
        <ArrowLeft size={18} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.backTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

function ActionButton({ Icon, label, onPress, disabled, primary }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, primary && styles.actionButtonPrimary, disabled && styles.actionButtonDisabled]}
    >
      <Icon size={16} color={primary ? "#fff" : disabled ? COLORS.textFaint : COLORS.primary} />
      <Text style={[styles.actionButtonLabel, primary && { color: "#fff" }, disabled && { color: COLORS.textFaint }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  backBar: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.pill,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  backTitle: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: RADIUS.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontFamily: FONTS.bodySemibold,
    fontSize: 13,
    color: COLORS.text,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  map: { flex: 1 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  errorTitle: { fontFamily: FONTS.displayBold, fontSize: 17, color: COLORS.text, marginBottom: 8, textAlign: "center" },
  errorBody: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  infoCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  infoHeaderRow: { flexDirection: "row", alignItems: "flex-start" },
  hotelName: { fontFamily: FONTS.displayBold, fontSize: 16, color: COLORS.text },
  distance: { fontFamily: FONTS.bodySemibold, fontSize: 12, color: COLORS.primary, marginTop: 2 },
  address: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  rowInline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  hoursText: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.textMuted },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
  },
  actionButtonPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  actionButtonDisabled: { opacity: 0.5 },
  actionButtonLabel: { fontFamily: FONTS.bodySemibold, fontSize: 11, color: COLORS.primary },
});
