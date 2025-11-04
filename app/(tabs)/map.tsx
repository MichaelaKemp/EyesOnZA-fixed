import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, StyleSheet, Text, TouchableOpacity, View, } from "react-native";
import MapView, { Heatmap, Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { db } from "../../firebaseConfig";

interface Report {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  createdAt?: any;
}

export default function MapScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCrime, setSelectedCrime] = useState<string>("All");
  const [heatmapMode, setHeatmapMode] = useState<boolean>(false);
  const [userRegion, setUserRegion] = useState<any>(null);
  const [loadingLocation, setLoadingLocation] = useState<boolean>(true);
  const [userMarker, setUserMarker] = useState<any>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState(1);

  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();
  const fromReport = params?.fromReport === "true";
  const initialVisitRef = useRef(true);
  const startFromMiddle = initialVisitRef.current && !fromReport;

  useEffect(() => {
    (async () => {
      try {
        const pLat = params?.lat as string | undefined;
        const pLng = params?.lng as string | undefined;
        if (pLat && pLng) {
          const lat = parseFloat(pLat);
          const lng = parseFloat(pLng);
          if (!isNaN(lat) && !isNaN(lng)) {
            const region = {
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            };
            console.log("map: using params lat/lng for initial userRegion", lat, lng);
            setUserRegion(region);
            setUserMarker({ latitude: lat, longitude: lng });
            return;
          }
        }

        const last = await Location.getLastKnownPositionAsync();
        if (last && last.coords) {
          const region = {
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          };
          console.log("map: using lastKnownPosition for initial userRegion", region);
          setUserRegion(region);
          setUserMarker({ latitude: last.coords.latitude, longitude: last.coords.longitude });
        }
      } catch (e) {
      }
    })();
  }, []);

  useEffect(() => {
    try {
      if (fromReport) {
        router.replace(("/(tabs)/map") as any);
      }
    } catch (e) {
    }
  }, [fromReport]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const handleRegionChange = (region: Region) => {
    const zoom = Math.round(Math.log(360 / region.longitudeDelta) / Math.LN2);
    setZoomScale(Math.max(0.4, Math.min(1, (zoom - 3) / 10)));
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "reports"), (snapshot) => {
      const data: Report[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Report[];
      setReports(data);
      console.log("Live updates:", data.length);
    });
    return () => unsubscribe();
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to show your area."
        );
        setLoadingLocation(false);
        return;
      }

      await new Promise((res) => setTimeout(res, 1500));

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      if (!current || !current.coords) throw new Error("No coordinates returned");

      const targetRegion = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };

      setUserRegion(targetRegion);
      setUserMarker({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      });
      console.log("map: got current position in getUserLocation", targetRegion);

      setLoadingLocation(false);

    } catch (error) {
      console.warn("Location error:", error);
      setLoadingLocation(false);
      Alert.alert(
        "Location Error",
        "Unable to determine your location. Please try again."
      );
    }
  };

  useEffect(() => {
    if (mapReady) getUserLocation();
  }, [mapReady]);

  useEffect(() => {
    if (!initialVisitRef.current || !startFromMiddle) return;
    if (mapReady && mapRef.current && userRegion) {
      console.log("map: animating to userRegion from mapReady/userRegion effect (delayed)", userRegion);
      setTimeout(() => {
        try {
          const ref = mapRef.current;
          if (!ref) return;
          if ((ref as any).animateCamera) {
            (ref as any).animateCamera({ center: { latitude: userRegion.latitude, longitude: userRegion.longitude }, zoom: 15 }, { duration: 1000 });
          } else {
            ref.animateToRegion(userRegion, 1000);
          }
        } catch (e) {
          console.warn("map: animateToRegion/animateCamera failed", e);
        }
      }, 300);
      initialVisitRef.current = false;
    }
  }, [mapReady, userRegion]);

  useFocusEffect(
    useCallback(() => {
      if (!mapReady || !mapRef.current || !userRegion) return;

      if (initialVisitRef.current && startFromMiddle) {
        console.log("map: animating to userRegion from focusEffect (delayed)", userRegion);
        setTimeout(() => {
          try {
            const ref = mapRef.current;
            if (!ref) return;
            if ((ref as any).animateCamera) {
              (ref as any).animateCamera({ center: { latitude: userRegion.latitude, longitude: userRegion.longitude }, zoom: 15 }, { duration: 1000 });
            } else {
              ref.animateToRegion(userRegion, 1000);
            }
          } catch (e) {
            console.warn("map: animateToRegion failed in focusEffect", e);
          }
        }, 300);
        initialVisitRef.current = false;
        return;
      }

      mapRef.current.animateToRegion(userRegion, 0);
    }, [mapReady, userRegion])
  );

  useEffect(() => {
    let locationSubscription: any;
    
    const subscribeToLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000,
            distanceInterval: 10,
          },
          (location) => {
            const newRegion = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            };
            setUserRegion(newRegion);
            setUserMarker({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      }
    };

    if (mapReady) {
      subscribeToLocation();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [mapReady]);

  const recenterMap = () => {
    if (userRegion && mapRef.current) {
      mapRef.current.animateToRegion(userRegion, 1500);
    } else {
      Alert.alert("Location not ready", "Your location has not been determined yet.");
    }
  };

  const handleViewReport = (id: string) => {
    const lat = userRegion?.latitude ?? userMarker?.latitude;
    const lng = userRegion?.longitude ?? userMarker?.longitude;
    const latParam = lat ? `&lat=${encodeURIComponent(lat)}` : "";
    const lngParam = lng ? `&lng=${encodeURIComponent(lng)}` : "";
    router.push(`/report/${id}?returnToMap=true${latParam}${lngParam}`);
  };

  const filteredReports =
    selectedCrime === "All"
      ? reports
      : reports.filter(
          (r) => r.title?.toLowerCase() === selectedCrime.toLowerCase()
        );

  const validPoints = filteredReports.filter(
    (r) =>
      typeof r.latitude === "number" &&
      typeof r.longitude === "number" &&
      !isNaN(r.latitude) &&
      !isNaN(r.longitude)
  );

  const hasNoData = validPoints.length === 0;
  const dynamicRadius = Math.max(15, Math.min(50, validPoints.length * 2));

  return (
    <View style={styles.container}>
      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedCrime}
            onValueChange={setSelectedCrime}
            style={styles.picker}
          >
            <Picker.Item label="All Crimes" value="All" />
            <Picker.Item label="Theft" value="Theft" />
            <Picker.Item label="Vandalism" value="Vandalism" />
            <Picker.Item label="Suspicious Activity" value="Suspicious Activity" />
            <Picker.Item label="Assault" value="Assault" />
            <Picker.Item label="Robbery" value="Robbery" />
            <Picker.Item label="Drug Activity" value="Drug Activity" />
            <Picker.Item label="Trespassing" value="Trespassing" />
            <Picker.Item label="Traffic Violation" value="Traffic Violation" />
          </Picker>
        </View>

        <TouchableOpacity
          style={[styles.toggleButton, heatmapMode && styles.toggleActive]}
          onPress={() => setHeatmapMode(!heatmapMode)}
        >
          <Text style={styles.toggleText}>
            {heatmapMode ? "Heatmap Mode" : "Filter Mode"}
          </Text>
        </TouchableOpacity>
      </View>

      {loadingLocation && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#d32f2f" />
          <Text style={{ marginTop: 10, color: "#555" }}>Getting your location...</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        onMapReady={() => setMapReady(true)}
          onRegionChangeComplete={handleRegionChange}
          initialRegion={
            startFromMiddle
              ? {
                  latitude: -30.5595,
                  longitude: 22.9375,
                  latitudeDelta: 25,
                  longitudeDelta: 25,
                }
              : userRegion || {
                  latitude: -30.5595,
                  longitude: 22.9375,
                  latitudeDelta: 25,
                  longitudeDelta: 25,
                }
          }
      >
        {heatmapMode ? (
          validPoints.length > 0 && (
            <Heatmap
              points={validPoints.map((r) => ({
                latitude: r.latitude,
                longitude: r.longitude,
                weight: 1,
              }))}
              radius={dynamicRadius}
              opacity={0.6}
              gradient={{
                colors: ["#00BCD4", "#FF9800", "#F44336"],
                startPoints: [0.2, 0.6, 1],
                colorMapSize: 256,
              }}
            />
          )
        ) : (
          validPoints.map((report) => (
            <Marker
              key={report.id}
              coordinate={{
                latitude: report.latitude,
                longitude: report.longitude,
              }}
              pinColor="#d32f2f"
              title={report.title}
              description="Tap to view full report"
              onCalloutPress={() => handleViewReport(report.id)}
            />
          ))
        )}

        {userMarker && (
          <Marker
            coordinate={userMarker}
            title="You are here"
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            tracksViewChanges
          >
            <View style={[styles.pulseContainer, { transform: [{ scale: zoomScale }] }]}>
              <Animated.View
                style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
              />
              <View style={styles.pulseCore} />
            </View>
          </Marker>
        )}
      </MapView>

      {userRegion && (
        <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
          <Ionicons name="locate-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {hasNoData && !loadingLocation && (
        <View style={styles.noData}>
          <Text style={styles.noDataText}>
            No reports found for this crime type.
          </Text>
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          {heatmapMode
            ? `Heatmap: ${
                selectedCrime === "All" ? "All Crimes" : selectedCrime
              }`
            : `Showing ${filteredReports.length} ${
                selectedCrime === "All" ? "" : selectedCrime + " "
              }incidents`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { position: "absolute", top: 40, left: 10, right: 10, zIndex: 10, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 10, padding: 10 },
  pickerContainer: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, marginBottom: 10, overflow: "hidden" },
  picker: { height: 50, width: "100%" },
  toggleButton: { backgroundColor: "#d32f2f", padding: 10, borderRadius: 8 },
  toggleActive: { backgroundColor: "#555" },
  toggleText: { color: "#fff", textAlign: "center", fontWeight: "600" },
  loadingOverlay: { position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center" },
  recenterButton: { position: "absolute", bottom: 100, right: 20, backgroundColor: "#d32f2f", padding: 14, borderRadius: 50, elevation: 5 },
  noData: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center" },
  noDataText: { color: "#555", backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  overlay: { position: "absolute", bottom: 20, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  overlayText: { color: "#fff", textAlign: "center" },
  pulseContainer: { alignItems: "center", justifyContent: "center", width: 28, height: 28 },
  pulseRing: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(66,133,244,0.3)", borderWidth: 1, borderColor: "rgba(66,133,244,0.5)" },
  pulseCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4285F4", borderWidth: 2, borderColor: "#fff"},
});