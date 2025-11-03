import { Link, useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";

export default function HomeScreen() {
  const { logout, user } = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    Alert.alert("Confirm Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>EyesOnZA</Text>
      <Text style={styles.subtitle}>Community Crime Reporting</Text>

      {user && (
        <Text style={styles.welcomeText}>
          Welcome, <Text style={{ fontWeight: "bold" }}>{user.email}</Text>
        </Text>
      )}

      <Link href="/report" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Report an Incident</Text>
        </TouchableOpacity>
      </Link>

      <Link href="/map" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>View Safety Map</Text>
        </TouchableOpacity>
      </Link>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9f9f9", paddingHorizontal: 20 },
  title: { fontSize: 32, fontWeight: "bold", color: "#d32f2f" },
  subtitle: { marginBottom: 30, color: "#555" },
  button: { backgroundColor: "#d32f2f", padding: 15, borderRadius: 10, marginVertical: 10, width: 220 },
  buttonText: { color: "#fff", fontWeight: "600", textAlign: "center" },
  signOutButton: { marginTop: 30, padding: 12, borderColor: "#d32f2f", borderWidth: 1, borderRadius: 8, width: 220 },
  signOutText: { color: "#d32f2f", textAlign: "center", fontWeight: "600" },
  welcomeText: { marginBottom: 20, color: "#333" },
});