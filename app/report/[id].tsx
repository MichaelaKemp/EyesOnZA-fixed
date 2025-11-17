import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../firebaseConfig";
import { relativeSA, toSA } from "../../utils/time";

export default function ReportDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const params = useLocalSearchParams();
  const incomingLat = params?.lat as string | undefined;
  const incomingLng = params?.lng as string | undefined;
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const docRef = doc(db, "reports", id as string);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setReport({ id: docSnap.id, ...docSnap.data() });
        } else {
          Alert.alert("Not Found", "This report no longer exists.");
          const qp =
            incomingLat && incomingLng
              ? `?fromReport=true&lat=${incomingLat}&lng=${incomingLng}`
              : "?fromReport=true";
          router.replace((`/${qp}`) as any);
        }
      } catch (error) {
        Alert.alert("Error", "Failed to load report.");
        const qpErr =
          incomingLat && incomingLng
            ? `?fromReport=true&lat=${incomingLat}&lng=${incomingLng}`
            : "?fromReport=true";
        router.replace((`/${qpErr}`) as any);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#d32f2f" />
      </View>
    );
  }

  const incidentDT = report.incidentTime
    ? toSA(report.incidentTime)
    : report.createdAt
    ? toSA(report.createdAt)
    : null;

  const absoluteText = incidentDT
    ? incidentDT.toFormat("d LLL yyyy 'at' HH:mm")
    : "Unknown time";

  const relativeText = incidentDT ? relativeSA(incidentDT) : null;

  const finalTimeLabel = relativeText
    ? `${absoluteText} • ${relativeText}`
    : absoluteText;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{report.title}</Text>

        <Text style={styles.time}>{finalTimeLabel}</Text>

        <Text style={styles.description}>{report.description}</Text>

        <Text style={styles.email}>
          Reported by: {report.userName || "Anonymous"}
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            const qpBack =
              incomingLat && incomingLng
                ? `?fromReport=true&lat=${incomingLat}&lng=${incomingLng}`
                : "?fromReport=true";
            router.replace((`/${qpBack}`) as any);
          }}
        >
          <Text style={styles.backButtonText}>← Back to Map</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 10, color: "#d32f2f" },
  time: { fontSize: 13, color: "#666", marginBottom: 20 },
  description: { fontSize: 16, lineHeight: 22, color: "#333" },
  email: { marginTop: 10, fontSize: 14, color: "#666" },
  backButton: { marginTop: 30, padding: 12, backgroundColor: "#d32f2f", borderRadius: 8 },
  backButtonText: { color: "#fff", textAlign: "center", fontWeight: "600" },
});