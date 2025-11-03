import Constants from "expo-constants";
import * as Location from "expo-location";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import OpenAI from "openai";
import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../firebaseConfig";

type Report = {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  createdAt?: { seconds: number; nanoseconds: number };
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const OPENAI_API_KEY = Constants.expoConfig?.extra?.OPENAI_API_KEY;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

async function listReports(): Promise<string> {
  try {
    const snapshot = await getDocs(collection(db, "reports"));
    const reports: Report[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Report),
      id: doc.id,
    }));

    if (!reports.length) return "No reports found in the database.";

    const sorted = reports
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);

    let summary = "Recent reports:\n";
    for (const r of sorted) {
      summary += `• ${r.title || "Untitled"} — ${r.location || "Unknown area"}\n`;
    }
    return summary;
  } catch (error) {
    console.error("listReports error:", error);
    return "Error fetching reports.";
  }
}

async function createReport({
  title,
  description,
  location,
}: {
  title: string;
  description: string;
  location: string;
}): Promise<string> {
  try {
    let lat: number | null = null;
    let lng: number | null = null;
    let locName = location;

    if (
      location.toLowerCase().includes("my location") ||
      location.toLowerCase().includes("current location")
    ) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        lat = current.coords.latitude;
        lng = current.coords.longitude;
        locName = "Current Location";
      } else {
        locName = "Unknown (permission denied)";
      }
    }

    await addDoc(collection(db, "reports"), {
      title,
      description,
      location: locName,
      latitude: lat,
      longitude: lng,
      createdAt: serverTimestamp(),
      userEmail: "vigil@system",
    });

    return lat && lng
      ? `Report created successfully.\nCoordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
      : "Report created successfully.";
  } catch (error) {
    console.error("createReport error:", error);
    return "Failed to create report.";
  }
}

async function analyzeSafety(area: string): Promise<string> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.warn("Permission not granted for geocoding. Using text match instead.");
    }

    let targetCoords: { lat: number; lng: number } | null = null;
    if (status === "granted") {
      const geo = await Location.geocodeAsync(area);
      if (geo[0]) targetCoords = { lat: geo[0].latitude, lng: geo[0].longitude };
    }

    const snapshot = await getDocs(collection(db, "reports"));
    const reports: Report[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Report),
      id: doc.id,
    }));

    const filtered = reports.filter((r) => {
      if (targetCoords && r.latitude && r.longitude) {
        const d = getDistanceKm(targetCoords.lat, targetCoords.lng, r.latitude, r.longitude);
        return d <= 5;
      }
      return (r.location || "").toLowerCase().includes(area.toLowerCase());
    });

    if (!filtered.length)
      return `No recent reports near ${area}. It might be quiet — stay alert just in case.`;

    const total = filtered.length;
    const recent = filtered
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 3);

    let summary = `Safety summary for ${area}:\nFound ${total} report${
      total > 1 ? "s" : ""
    }.\n`;
    for (const r of recent)
      summary += `• ${r.title || "Untitled"} — ${r.description || "No description"}\n`;

    summary +=
      total <= 2
        ? "\nOnly a few reports — relatively calm area."
        : total <= 5
        ? "\nSeveral reports — use caution."
        : "\nMultiple incidents — avoid if possible.";

    return summary;
  } catch (err) {
    console.error("analyzeSafety error:", err);
    return "Could not analyze safety data for that area.";
  }
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function AIAgentScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m Vigil — your safety assistant. Ask about area safety or report incidents.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<any>(null);

    const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);

    try {
        const lower = userMsg.toLowerCase();
        const relevant =
        lower.includes("safe") ||
        lower.includes("safety") ||
        lower.includes("report") ||
        lower.includes("incident") ||
        lower.includes("crime") ||
        lower.includes("area") ||
        lower.includes("location") ||
        lower.includes("show") ||
        lower.includes("list");

        if (!relevant) {
        setMessages([
            ...newMessages,
            {
            role: "assistant",
            content:
                "I'm here only to help with safety information, incident reports, and local area analysis. Please ask about those topics.",
            },
        ]);
        setLoading(false);
        return;
        }

        const context = newMessages
        .map((m) => `${m.role === "user" ? "User" : "Vigil"}: ${m.content}`)
        .join("\n");

        const completion = await client.responses.create({
        model: "gpt-5",
        input: `
            You are Vigil, the EyesOnZA safety assistant.
            Only discuss safety, area crime summaries, or reporting incidents.
            If a user asks unrelated questions, reply: 
            "I'm here only to help with safety and reports."
            
            Tools you can call:
            - listReports()
            - analyzeSafety(area)
            - createReport(title, description, location)
            Respond with TOOL_CALL: [toolName] [argument] only when needed.
            Conversation:
            ${context}
            Vigil:
        `,
        });

        let reply = completion.output_text || "";

        if (reply.toLowerCase().includes("tool_call")) {
        const match = reply.match(/tool_call\s*[:\-]?\s*(\w+)([\s\S]*)/i);
        if (match) {
            const [, tool, rest] = match;
            const args = rest.trim();
            if (tool.toLowerCase() === "listreports") reply = await listReports();
            else if (tool.toLowerCase() === "analyzesafety")
            reply = await analyzeSafety(args.replace(/^area[:\-]?\s*/i, "").trim());
            else if (tool.toLowerCase() === "createreport") {
            const clean = args.replace(/\n|\r/g, " ").trim();
            const rgx =
                /title\s*[:\-]\s*(.*?)\s*(?:desc|description)\s*[:\-]\s*(.*?)\s*(?:loc|location)\s*[:\-]\s*(.*)/i;
            const found = clean.match(rgx);
            reply = found
                ? await createReport({
                    title: found[1].trim(),
                    description: found[2].trim(),
                    location: found[3].trim(),
                })
                : "Use: `Report: title: [Title] desc: [Description] loc: my location`";
            }
        }
        }

        setMessages([...newMessages, { role: "assistant", content: reply }]);
        setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 200);
    } catch (err) {
        console.error("Vigil error:", err);
        setMessages([
        ...messages,
        { role: "assistant", content: "There was a problem connecting to Vigil." },
        ]);
    } finally {
        setLoading(false);
    }
    };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerCard}>
        <Text style={styles.headerText}>Vigil</Text>
        <Text style={styles.subText}>
          Ask about safety, reports, or your current area
        </Text>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef as any}
        enableOnAndroid
        extraScrollHeight={80}
        keyboardOpeningTime={0}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.chatContainer}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text style={m.role === "user" ? styles.userText : styles.aiText}>
                {m.content}
              </Text>
            </View>
          ))}
          {loading && (
            <ActivityIndicator color="#d32f2f" style={{ marginVertical: 10 }} />
          )}
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Vigil something..."
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={loading}
            style={styles.sendBtn}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  headerCard: { padding: 20, backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#eee", alignItems: "center"},
  headerText: { fontSize: 22, fontWeight: "bold", color: "#d32f2f" },
  subText: { fontSize: 14, color: "#666", marginTop: 4 },
  chatContainer: { flex: 1, padding: 20 },
  bubble: { borderRadius: 12, padding: 12, marginVertical: 4, maxWidth: "80%" },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#d32f2f" },
  aiText: { color: "#000" },
  userText: { color: "#fff" },
  inputContainer: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#eee", backgroundColor: "#fff" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, maxHeight: 120 },
  sendBtn: { backgroundColor: "#d32f2f", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  sendText: { color: "#fff", fontWeight: "600" },
});