import { Ionicons } from "@expo/vector-icons";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { DateTime } from "luxon";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { G, Line, Text as SvgText } from "react-native-svg";
import { PieChart as SvgPieChart } from "react-native-svg-charts";
import { db } from "../../firebaseConfig";

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [timeFilter, setTimeFilter] = useState("all");

  useEffect(() => {
    const fetchReports = async () => {
      const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReports(items);
      setLoading(false);
    };
    fetchReports();
  }, []);

  const filteredReports = reports.filter((r) => {
    if (!r.createdAt || !r.createdAt.seconds) return false;
    const created = DateTime.fromSeconds(r.createdAt.seconds).setZone("Africa/Johannesburg");
    const now = DateTime.now().setZone("Africa/Johannesburg");

    switch (timeFilter) {
      case "week":
        return created >= now.minus({ weeks: 1 });
      case "month":
        return created >= now.minus({ months: 1 });
      case "year":
        return created >= now.minus({ years: 1 });
      default:
        return true;
    }
  });

  const OFFICIAL_CATEGORIES = [
    "Theft",
    "Vandalism",
    "Suspicious Activity",
    "Assault",
    "Robbery",
    "Drug Activity",
    "Trespassing",
    "Traffic Violation",
    "Other",
  ];

  const countByCategory: Record<string, number> = filteredReports.reduce((acc, r) => {
    const raw = (r.title || "").trim();
    const match = OFFICIAL_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
    const category = match || "Other";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  OFFICIAL_CATEGORIES.forEach((cat) => {
    if (!countByCategory[cat]) countByCategory[cat] = 0;
  });

  const totalCrimes = filteredReports.length;

  const COLORS = [
    "#e57373",
    "#f06292",
    "#ba68c8",
    "#64b5f6",
    "#4db6ac",
    "#81c784",
    "#ffd54f",
    "#ffb74d",
    "#90a4ae",
  ];

  const pieData = OFFICIAL_CATEGORIES.map((cat, i) => {
    const count = Number(countByCategory[cat] || 0);
    return {
      name: cat,
      count,
      color: COLORS[i % COLORS.length],
    };
  }).filter((c) => c.count > 0);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#d32f2f" />
        <Text style={{ color: "#555", marginTop: 10 }}>Loading stats...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
        <Image
            source={require("../../assets/images/EyesOnZA-logo.png")}
            style={styles.logo}
            resizeMode="contain"
        />
        <Text style={styles.title}>Crime Statistics</Text>
        </View>

        <View style={styles.filters}>
          {["all", "week", "month", "year"].map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTimeFilter(key)}
              style={[styles.filterBtn, timeFilter === key && styles.filterActive]}
            >
              <Text
                style={[
                  styles.filterText,
                  timeFilter === key && { color: "#fff" },
                ]}
              >
                {key === "all" ? "All Time" : key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.summaryCard}>
          <Ionicons name="stats-chart-outline" size={24} color="#d32f2f" />
          <Text style={styles.summaryText}>
            {totalCrimes} total crimes {timeFilter !== "all" ? "in this " + timeFilter : "to date"}
          </Text>
        </View>

        <View style={styles.chartWrapper}>
          <SvgPieChart
            style={{
              height: 260,
              width: Dimensions.get("window").width - 40,
            }}
            outerRadius="78%"
            innerRadius="35%"
            valueAccessor={({ item }: { item: { value: number } }) => item.value}
            data={Object.entries(countByCategory).map(([name, count], i) => ({
              key: name,
              value: count,
              svg: { fill: COLORS[i % COLORS.length] },
              arc: { cornerRadius: 5 },
            }))}
          >
            {({
              slices,
              height: chartHeight,
              width: chartWidth,
            }: {
              slices: any[];
              height: number;
              width: number;
            }) => {
              return slices.map((slice, index) => {
                const { data, endAngle, startAngle } = slice;
                const midAngle = (startAngle + endAngle) / 2;
                const radius = 105;

                const x1 = chartWidth / 2 + radius * Math.cos(midAngle - Math.PI / 2);
                const y1 = chartHeight / 2 + radius * Math.sin(midAngle - Math.PI / 2);
                const x2 =
                  chartWidth / 2 + (radius + 25) * Math.cos(midAngle - Math.PI / 2);
                const y2 =
                  chartHeight / 2 + (radius + 25) * Math.sin(midAngle - Math.PI / 2);

                const textX =
                  chartWidth / 2 + (radius + 45) * Math.cos(midAngle - Math.PI / 2);
                const textY =
                  chartHeight / 2 + (radius + 45) * Math.sin(midAngle - Math.PI / 2);

                return (
                  <G key={`label-${index}`}>
                    <Line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={data.svg.fill}
                      strokeWidth={2}
                    />
                    <SvgText
                      x={textX}
                      y={textY}
                      fontSize="12"
                      fontWeight="600"
                      fill="#333"
                      textAnchor={textX > chartWidth / 2 ? "start" : "end"}
                      alignmentBaseline="middle"
                    >
                      {`${data.key} (${data.value})`}
                    </SvgText>
                  </G>
                );
              });
            }}
          </SvgPieChart>
        </View>

        <View style={styles.summaryList}>
          {pieData.map((item, i) => (
            <View key={i} style={styles.summaryRow}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  backgroundColor: item.color,
                  borderRadius: 3,
                  marginRight: 8,
                }}
              />
              <Text style={styles.summaryItem}>
                {item.name} — <Text style={styles.summaryCount}>{item.count}</Text>
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", color: "#d32f2f", marginBottom: 12 },
  filters: { flexDirection: "row", marginBottom: 10 },
  filterBtn: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  filterActive: { backgroundColor: "#d32f2f", borderColor: "#d32f2f" },
  filterText: { color: "#d32f2f", fontWeight: "600" },
  summaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#f9f9f9", padding: 14, borderRadius: 10, marginBottom: 15 },
  summaryText: { marginLeft: 10, fontSize: 16, fontWeight: "500", color: "#333" },
  chartWrapper: { alignItems: "center", justifyContent: "center", marginVertical: 30},
  summaryList: { borderTopWidth: 1, borderColor: "#eee", paddingTop: 12 },
  summaryRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  summaryItem: { fontSize: 15, color: "#333" },
  summaryCount: { fontWeight: "700", color: "#d32f2f" },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 34, height: 34, marginRight: 8, backgroundColor: "#fff", borderRadius: 8 },
});