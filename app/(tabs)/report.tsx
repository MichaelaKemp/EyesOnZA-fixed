import { Picker } from "@react-native-picker/picker"; // ✅ Dropdown picker
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, } from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";

export default function ReportScreen() {
  const [crimeType, setCrimeType] = useState("");
  const [customCrime, setCustomCrime] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<string | null>(null);
  const [longitude, setLongitude] = useState<string | null>(null);
  const [useManualLocation, setUseManualLocation] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY;

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to use your current position."
        );
        return;
      }

      Alert.alert("Getting location...", "Please wait a moment while we get your GPS fix.");

      const current = (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ])) as Location.LocationObject | null;

      if (!current || !current.coords) {
        Alert.alert(
          "Location Unavailable",
          "Could not detect your location. Make sure GPS is on and try again."
        );
        return;
      }

      setLatitude(current.coords.latitude.toString());
      setLongitude(current.coords.longitude.toString());
      setLocation("Current Location");
      Alert.alert("Location Set", "Your current location has been added!");
    } catch (error) {
      console.error("Location error:", error);
      Alert.alert(
        "Error",
        "Unable to get your current location. Please ensure GPS is enabled and try again."
      );
    }
  };

  const handleSubmit = async () => {
    const title = crimeType === "Custom" ? customCrime.trim() : crimeType;

    if (!title || title === "" || title === "Select a crime...") {
      Alert.alert("Error", "Please select or specify a crime type.");
      return;
    }

    if (!description) {
      Alert.alert("Error", "Please add a short description.");
      return;
    }

    if (!latitude || !longitude) {
      Alert.alert(
        "Missing Location",
        "Please set a location manually or use your current location before submitting."
      );
      return;
    }

    const locationLabel = location || "Current Location";

    try {
      await addDoc(collection(db, "reports"), {
        title,
        description,
        location: locationLabel,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        userEmail: user?.email || "anonymous",
        createdAt: serverTimestamp(),
      });

      Alert.alert("Report Submitted", "Thank you for helping keep your community safe!");
      setCrimeType("");
      setCustomCrime("");
      setDescription("");
      setLocation("");
      setLatitude(null);
      setLongitude(null);
      router.replace("/(tabs)/map");
    } catch (error) {
      console.error("Report error:", error);
      Alert.alert("Error", "Failed to submit your report. Please try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.header}>Report an Incident</Text>

          <Text style={styles.label}>Crime Type</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={crimeType}
              onValueChange={(value) => setCrimeType(value)}
              style={styles.picker}
            >
              <Picker.Item label="Select a crime..." value="Select a crime..." />
              <Picker.Item label="Theft" value="Theft" />
              <Picker.Item label="Vandalism" value="Vandalism" />
              <Picker.Item label="Suspicious Activity" value="Suspicious Activity" />
              <Picker.Item label="Assault" value="Assault" />
              <Picker.Item label="Robbery" value="Robbery" />
              <Picker.Item label="Drug Activity" value="Drug Activity" />
              <Picker.Item label="Trespassing" value="Trespassing" />
              <Picker.Item label="Traffic Violation" value="Traffic Violation" />
              <Picker.Item label="Other (Specify Below)" value="Custom" />
            </Picker>
          </View>

          {crimeType === "Custom" && (
            <TextInput
              placeholder="Specify crime type..."
              style={styles.input}
              value={customCrime}
              onChangeText={setCustomCrime}
            />
          )}

          <TextInput
            placeholder="Description"
            style={[styles.input, { height: 100 }]}
            multiline
            value={description}
            onChangeText={setDescription}
          />

          {!useManualLocation ? (
            <TouchableOpacity
              style={[styles.input, { justifyContent: "center" }]}
              onPress={() => setUseManualLocation(true)}
            >
              <Text style={{ color: location ? "#000" : "#999" }}>
                {location || "Tap to search location manually"}
              </Text>
            </TouchableOpacity>
          ) : (
            <GooglePlacesAutocomplete
              placeholder="Type location..."
              minLength={2}
              fetchDetails={true}
              enablePoweredByContainer={false}
              debounce={300}
              onPress={(data, details = null) => {
                if (!data || !details) return;
                setLocation(data.description);
                setLatitude(details.geometry.location.lat.toString());
                setLongitude(details.geometry.location.lng.toString());
                setUseManualLocation(false);
              }}
              query={{
                key: GOOGLE_MAPS_API_KEY,
                language: "en",
                components: "country:za",
              }}
              styles={{
                container: { flex: 0, width: "100%", marginVertical: 8, zIndex: 999 },
                listView: { backgroundColor: "white", borderRadius: 8, elevation: 3 },
                textInput: styles.input,
              }}
            />
          )}

          {latitude && longitude && (
            <Text style={styles.coords}>
              📍 {latitude}, {longitude}
            </Text>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={getCurrentLocation}>
            <Text style={styles.secondaryButtonText}>Use My Current Location</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Submit Report</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
 container: { paddingHorizontal: 20, paddingTop: 20, backgroundColor: "#fff", justifyContent: "center" },
  header: { fontSize: 24, fontWeight: "bold", color: "#d32f2f", textAlign: "center", marginBottom: 20 },
  label: { fontWeight: "600", color: "#333", marginTop: 8, marginBottom: 4 },
  pickerContainer: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, marginVertical: 8, overflow: "hidden" },
  picker: { height: 50, width: "100%" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginVertical: 8 },
  coords: { textAlign: "center", color: "#555", marginVertical: 5 },
  button: { backgroundColor: "#d32f2f", padding: 15, borderRadius: 8, marginTop: 20},
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  secondaryButton: { backgroundColor: "#eee", padding: 15, borderRadius: 8, marginTop: 10 },
  secondaryButtonText: { color: "#333", fontWeight: "600", textAlign: "center" },
});