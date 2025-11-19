import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { DateTime } from "luxon";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from "react-native";
import { LineChart, PieChart } from "react-native-gifted-charts";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../firebaseConfig";

type TimeFilter = "all" | "week" | "month" | "year";

interface FirestoreTimestamp {
  seconds: number;
  nanoseconds?: number;
}

interface Report {
  id: string;
  title?: string;
  description?: string;
  createdAt?: FirestoreTimestamp;
}

interface TimelinePoint {
  label: string;
  value: number;
  fullDate?: string;
}

type TimelineMap = Record<string, (Report & { created: DateTime })[]>;

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  useEffect(() => {
    const fetchReports = async () => {
      const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const items: Report[] = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setReports(items);
      setLoading(false);
    };

    fetchReports();
  }, []);

  const filteredReports = reports.filter((r) => {
    if (!r.createdAt?.seconds) return false;

    const created = DateTime.fromSeconds(r.createdAt.seconds).setZone(
      "Africa/Johannesburg"
    );
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

  const countByCategory = filteredReports.reduce((acc, r) => {
    const raw = (r.title || "").trim();
    const match = OFFICIAL_CATEGORIES.find(
      (c) => c.toLowerCase() === raw.toLowerCase()
    );
    const category = match || "Other";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  OFFICIAL_CATEGORIES.forEach((cat) => {
    if (!countByCategory[cat]) countByCategory[cat] = 0;
  });

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

  const pieData = OFFICIAL_CATEGORIES.map((cat, i) => ({
    value: countByCategory[cat],
    color: COLORS[i],
    text: cat,
  })).filter((item) => item.value > 0);

  const timeline: TimelineMap = filteredReports
    .map((r) => ({
      ...r,
      created: DateTime.fromSeconds(r.createdAt!.seconds).setZone(
        "Africa/Johannesburg"
      ),
    }))
    .sort((a, b) => b.created.toMillis() - a.created.toMillis())
    .reduce((groups, rpt) => {
      const day = rpt.created.toFormat("dd MMM yyyy");
      if (!groups[day]) groups[day] = [];
      groups[day].push(rpt);
      return groups;
    }, {} as TimelineMap);

  const timelineData: TimelinePoint[] = getTimelineData(
    filteredReports,
    timeFilter
  );

  let lineData = timelineData.map((d) => ({
    value: d.value,
    label: d.label,
    dataPointText: String(d.value),
  }));

  if (lineData.length === 0) {
    lineData = [{ value: 0, label: " ", dataPointText: "0" }];
  }

  const maxValueSafe =
    lineData.length > 1 ? Math.max(...lineData.map((p) => p.value)) + 2 : 5;

  const spacingSafe =
    lineData.length > 12 ? 35 : lineData.length > 1 ? 50 : 80;

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
          {(["all", "week", "month", "year"] as TimeFilter[]).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTimeFilter(key)}
              style={[
                styles.filterBtn,
                timeFilter === key && styles.filterActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  timeFilter === key && { color: "#fff" },
                ]}
              >
                {key === "all"
                  ? "All Time"
                  : key.charAt(0).toUpperCase() + key.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.timelineHeader}>
          <Text style={styles.sectionTitle}>Crime Timeline</Text>

          <TouchableOpacity
            onPress={() => setTimelineExpanded(!timelineExpanded)}
            style={styles.expandBtn}
          >
            <Text style={styles.expandBtnText}>
              {timelineExpanded ? "Collapse" : "Expand"}
            </Text>
          </TouchableOpacity>
        </View>

        {timelineExpanded && (
          <View style={{ marginBottom: 10 }}>
            {Object.entries(timeline).map(([day, items]) => (
              <View key={day} style={styles.timelineDay}>
                <Text style={styles.timelineDate}>{day}</Text>

                {items.map((r) => (
                  <View key={r.id} style={styles.timelineItem}>
                    <Text style={styles.timelineTitle}>{r.title}</Text>
                    <Text style={styles.timelineDesc}>
                      {r.description || "No description"}
                    </Text>
                    <Text style={styles.timelineTime}>
                      {r.created.toFormat("HH:mm")}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>
          {timeFilter === "week" && "Crime Trend (Past 7 Days)"}
          {timeFilter === "month" && "Crime Trend (Past 30 Days)"}
          {timeFilter === "year" && "Crime Trend (Past 12 Months)"}
          {timeFilter === "all" && "Crime Trend (By Month)"}
        </Text>

        <LineChart
          data={lineData}
          curved={lineData.length > 2}
          thickness={3}
          color="#d32f2f"
          hideDataPoints={false}
          dataPointsColor="#d32f2f"
          spacing={spacingSafe}
          yAxisTextStyle={{ color: "#555" }}
          xAxisLabelTextStyle={{ color: "#555", fontSize: 11 }}
          noOfSections={5}
          maxValue={maxValueSafe}
        />

        <Text style={styles.sectionTitle}>Crime Categories</Text>

        <View style={{ alignItems: "center" }}>
          <PieChart
            data={pieData}
            radius={120}
            innerRadius={50}
            showText
            textColor="#333"
            textSize={12}
          />
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
                {item.text} —{" "}
                <Text style={styles.summaryCount}>{item.value}</Text>
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getTimelineData(
  reports: Report[],
  timeFilter: TimeFilter
): TimelinePoint[] {
  const now = DateTime.now().setZone("Africa/Johannesburg");

  if (timeFilter === "week") {
    const days: TimelinePoint[] = [];

    for (let i = 6; i >= 0; i--) {
      const day = now.minus({ days: i });

      const count = reports.filter((r) => {
        if (!r.createdAt?.seconds) return false;
        const created = DateTime.fromSeconds(r.createdAt.seconds).setZone(
          "Africa/Johannesburg"
        );
        return (
          created.toFormat("yyyy-MM-dd") === day.toFormat("yyyy-MM-dd")
        );
      }).length;

      days.push({
        label: day.toFormat("EEE"),
        value: count,
        fullDate: day.toFormat("yyyy-MM-dd"),
      });
    }

    return days;
  }

  if (timeFilter === "month") {
    const days: TimelinePoint[] = [];

    for (let i = 29; i >= 0; i--) {
      const day = now.minus({ days: i });

      const count = reports.filter((r) => {
        if (!r.createdAt?.seconds) return false;
        const created = DateTime.fromSeconds(r.createdAt.seconds).setZone(
          "Africa/Johannesburg"
        );
        return (
          created.toFormat("yyyy-MM-dd") === day.toFormat("yyyy-MM-dd")
        );
      }).length;

      days.push({
        label: day.toFormat("dd MMM"), // 12 Nov
        value: count,
        fullDate: day.toFormat("yyyy-MM-dd"),
      });
    }

    return days;
  }

  if (timeFilter === "year") {
    const months: Record<string, number> = {};

    for (let i = 11; i >= 0; i--) {
      const month = now.minus({ months: i });
      const key = month.toFormat("yyyy-MM");
      months[key] = 0;

      reports.forEach((r) => {
        if (!r.createdAt?.seconds) return;
        const created = DateTime.fromSeconds(r.createdAt.seconds).setZone(
          "Africa/Johannesburg"
        );
        if (created.toFormat("yyyy-MM") === key) {
          months[key]++;
        }
      });
    }

    return Object.entries(months).map(([key, count]) => ({
      label: DateTime.fromISO(key + "-01").toFormat("MMM"),
      value: count,
      fullDate: key + "-01",
    }));
  }

  const monthGroups: Record<string, number> = {};

  reports.forEach((r) => {
    if (!r.createdAt?.seconds) return;
    const created = DateTime.fromSeconds(r.createdAt.seconds).setZone(
      "Africa/Johannesburg"
    );
    const key = created.toFormat("yyyy-MM");
    monthGroups[key] = (monthGroups[key] || 0) + 1;
  });

  return Object.entries(monthGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      label: DateTime.fromISO(key + "-01").toFormat("MMM yyyy"),
      value: count,
      fullDate: key + "-01",
    }));
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  logo: { width: 34, height: 34, marginRight: 8, backgroundColor: "#fff", borderRadius: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#d32f2f" },
  filters: { flexDirection: "row", marginBottom: 16 },
  filterBtn: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  filterActive: { backgroundColor: "#d32f2f", borderColor: "#d32f2f" },
  filterText: { color: "#d32f2f", fontWeight: "600" },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#d32f2f", marginTop: 25, marginBottom: 10 },
  timelineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  timelineDay: { marginBottom: 15 },
  timelineDate: { fontSize: 16, fontWeight: "700", color: "#222", marginBottom: 8 },
  timelineItem: { padding: 12, backgroundColor: "#fafafa", borderRadius: 10, borderLeftWidth: 4, borderLeftColor: "#d32f2f", marginBottom: 10 },
  timelineTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  timelineDesc: { fontSize: 13, color: "#555" },
  timelineTime: { fontSize: 12, color: "#999", marginTop: 5 },
  summaryList: { borderTopWidth: 1, borderColor: "#eee", paddingTop: 12, marginTop: 20 },
  summaryRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  summaryItem: { fontSize: 15, color: "#333" },
  summaryCount: { fontWeight: "700", color: "#d32f2f" },
  expandBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#d32f2f", borderRadius: 8 },
  expandBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});