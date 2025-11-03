import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View, } from "react-native";
import MapView, { Heatmap, Marker, PROVIDER_GOOGLE } from "react-native-maps";
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
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "reports"));
        const data: Report[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Report[];
        setReports(data);
        console.log("Loaded reports:", data.length);
      } catch (error) {
        console.error("Error fetching reports:", error);
      }
    };

    fetchReports();
  }, []);

  useEffect(() => {
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

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const newRegion = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        };

        setUserRegion(newRegion);
        setLoadingLocation(false);

        if (mapRef.current) {
          mapRef.current.animateToRegion(newRegion, 1500);
        }
      } catch (error) {
        console.error("Error getting location:", error);
        setLoadingLocation(false);
        Alert.alert(
          "Location Error",
          "Unable to determine your location. The map will remain zoomed out."
        );
      }
    };

    getUserLocation();
  }, []);

  const handleViewReport = (id: string) => {
    router.push(`/report/${id}`);
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
          <Text style={{ marginTop: 10, color: "#555" }}>
            Getting your location...
          </Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: -29.0,
          longitude: 24.0,
          latitudeDelta: 10.5,
          longitudeDelta: 10.5,
        }}
        showsUserLocation={true}
      >
        {heatmapMode ? (
          validPoints.length > 0 ? (
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
          ) : null
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
      </MapView>

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
  noData: { position: "absolute", top: "50%", left: 0, right: 0, alignItems: "center" },
  noDataText: { color: "#555", backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  overlay: { position: "absolute", bottom: 20, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  overlayText: { color: "#fff", textAlign: "center" },
});