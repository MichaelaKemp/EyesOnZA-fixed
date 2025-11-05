import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, Timestamp, } from "firebase/firestore";
import { DateTime } from "luxon";
import OpenAI from "openai";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";

const OPENAI_API_KEY = Constants.expoConfig?.extra?.OPENAI_API_KEY;
const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const systemPrompt = `
You are Vigil — a calm, concise safety assistant for a community app in South Africa.
Keep replies short (<= 3 sentences). Stay on-topic (safety, reporting, tips, local contacts).
If the user is reporting an incident, do not give advice first — the app will handle the report flow.
`;

type FireTs = { seconds: number; nanoseconds: number };
type Report = {
  id: string;
  title?: string;
  description?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  incidentTime?: FireTs | Timestamp | null;
  createdAt?: FireTs | Timestamp | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type PendingReport = {
  title: string;
  description: string;
  location: string;
  incidentTime?: string | Date | null;
  anonymous: boolean;
  category?: string | null;
  userEmail?: string | null;
  userName?: string | null;
};

const speak = (text: string, enabled: boolean) => {
  try { if (enabled) Speech.speak(text, { language: "en-US", rate: 1.0, pitch: 1.0 }); } catch {}
};

const CATEGORIES = [
  "Theft",
  "Vandalism",
  "Suspicious Activity",
  "Assault",
  "Robbery",
  "Drug Activity",
  "Trespassing",
  "Traffic Violation",
];

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

async function geocodeLocation(location: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      location + ", South Africa"
    )}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.results?.[0]) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat as number, lng: loc.lng as number };
    }
  } catch (err) {
    console.error("Geocoding failed:", err);
  }
  return null;
}

async function createFirestoreReport(payload: PendingReport, userMeta: { userName: string; userEmail: string | null }) {
  let latitude: number | null = null;
  let longitude: number | null = null;
  let locLabel = payload.location || "Current Location";

  try {
    if (!payload.location || /my location|current location/i.test(payload.location)) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = current.coords.latitude;
        longitude = current.coords.longitude;
        locLabel = "Current Location";
      }
    } else {
      const geo = await geocodeLocation(payload.location);
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lng;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          latitude = current.coords.latitude;
          longitude = current.coords.longitude;
          locLabel = payload.location || "Current Location";
        }
      }
    }
  } catch (e) {
    console.warn("Location resolution failure:", e);
  }

  let incidentDate = DateTime.now().setZone("Africa/Johannesburg").toJSDate();
  if (payload.incidentTime instanceof Date) {
    incidentDate = DateTime.fromJSDate(payload.incidentTime).setZone("Africa/Johannesburg").toJSDate();
  } else if (typeof payload.incidentTime === "string") {
    const lower = payload.incidentTime.toLowerCase();
    if (lower === "now") {
      incidentDate = DateTime.now().setZone("Africa/Johannesburg").toJSDate();
    } else {
      const parsed = DateTime.fromISO(payload.incidentTime, { zone: "Africa/Johannesburg" });
      if (parsed.isValid) {
        incidentDate = parsed.toJSDate();
      } else {
        const fallback = Date.parse(payload.incidentTime);
        if (!isNaN(fallback)) {
          incidentDate = DateTime.fromMillis(fallback).setZone("Africa/Johannesburg").toJSDate();
        }
      }
    }
  }

  const cat = CATEGORIES.find(
    (c) => c.toLowerCase() === (payload.category || payload.title || "").toLowerCase()
  );
  const title = cat ? cat : "Other";

  await addDoc(collection(db, "reports"), {
    title,
    category: title,
    description: payload.description,
    location: locLabel,
    latitude,
    longitude,
    userName: payload.anonymous ? "Anonymous" : (payload.userName ?? userMeta.userName),
    userEmail: payload.anonymous ? null : (payload.userEmail ?? userMeta.userEmail),
    incidentTime: Timestamp.fromDate(incidentDate),
    createdAt: serverTimestamp(),
  });
}

async function listRecentHuman(limit = 5): Promise<string> {
  try {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items: Report[] = snap.docs.map((d) => ({ ...(d.data() as Report), id: d.id }));
    const limited = items.slice(0, limit);
    if (!limited.length) return "No reports found yet.";
    return "Recent Reports:\n" + limited.map((r) => `• ${r.title || "Incident"} — ${r.location || "Unknown"}`).join("\n");
  } catch {
    return "Couldn't read recent reports right now.";
  }
}

async function extractReportFieldsWithAI(
  text: string,
  defaults: { userName: string; userEmail: string | null }
): Promise<PendingReport | null> {
  const system = `
You are Vigil. Extract ONE incident from the user's message.
Return STRICT JSON ONLY with keys:
{"title": string, "description": string, "location": string, "incidentTime": string|null, "anonymous": boolean, "category": string|null}
`.trim();

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0].message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.title) return null;

    const exact = CATEGORIES.find((c) => c.toLowerCase() === String(parsed.title).toLowerCase());
    const title = exact || "Other";

    return {
      title,
      category: title,
      description: parsed.description || "No description provided.",
      location: parsed.location || "my location",
      incidentTime: parsed.incidentTime || "now",
      anonymous: !!parsed.anonymous,
      userEmail: defaults.userEmail,
      userName: defaults.userName,
    };
  } catch {
    return null;
  }
}

function seemsLikeIncident(t: string) {
  const l = t.toLowerCase();
  return /(theft|stole|robber|mugging|assault|vandal|trespass|drug|traffic|hijack|break[- ]?in|suspicious)/i.test(l);
}

export default function AIAgentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userName =
    user?.name
      ? `${user.name} ${user.surname ? user.surname.charAt(0) + "." : ""}`
      : user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || null;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi, I’m Vigil — your safety assistant. Ask about area safety or report incidents." },
  ]);
  const [pending, setPending] = useState<PendingReport | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, [messages, loading]);

  const show = (content: string, speakIt = true) => {
    setMessages((p) => [...p, { role: "assistant", content }]);
    if (speakIt) speak(content, ttsOn);
  };

  const confirmSummary = (p: PendingReport) => {
    const timeText =
      p.incidentTime instanceof Date
        ? DateTime.fromJSDate(p.incidentTime).setZone("Africa/Johannesburg").toLocaleString(DateTime.DATETIME_MED)
        : (p.incidentTime || "now");
    const summary =
      `Here’s what I understood:\n` +
      `• Incident: ${titleCase(p.title || "Other")}\n` +
      `• Location: ${p.location || "my location"}\n` +
      `• Time: ${timeText}\n` +
      `• Anonymous: ${p.anonymous ? "Yes" : "No"}\n` +
      `• Details: ${p.description}\n\n` +
      `Would you like to submit this report? (yes / no)\n` +
      `You can also edit like: title: Theft | location: my location | time: yesterday 21:00 | anonymous: yes`;
    show(summary);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((p) => [...p, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      if (pending) {
        if (/^(yes|y|confirm|submit|proceed)$/i.test(userMsg)) {
          await createFirestoreReport(pending, { userName, userEmail });
          show("Report submitted. Thank you for helping keep your community safe.");
          setPending(null);
          setTimeout(() => {
            router.replace("/(tabs)/map?fromReport=true");
          }, 1500);
          return;
        }
        if (/^(no|n|cancel)$/i.test(userMsg)) {
          setPending(null);
          show("Okay, I’ve cancelled that report.");
          return;
        }
        const edits = userMsg.split(/[,|]/).map((s) => s.trim());
        if (edits.some((e) => e.includes(":") || e.includes("="))) {
          const next: PendingReport = { ...pending };
          for (const e of edits) {
            const m = e.match(/^(title|category|description|location|time|anonymous)\s*[:=]\s*(.+)$/i);
            if (m) {
              const field = m[1].toLowerCase();
              const val = m[2].trim();
              switch (field) {
                case "anonymous":
                  next.anonymous = /^(true|yes|y|on)$/i.test(val);
                  break;
                case "time":
                  next.incidentTime = val || "now";
                  break;
                case "title":
                case "category":
                  const exact = CATEGORIES.find((c) => c.toLowerCase() === val.toLowerCase());
                  next.title = exact || "Other";
                  next.category = next.title;
                  break;
                case "location":
                  next.location = val || "my location";
                  break;
                case "description":
                  next.description = val || next.description;
                  break;
              }
            }
          }
          setPending(next);
          confirmSummary(next);
          return;
        }
        show('Say "yes" to submit, or edit any fields like: title: Theft, location: Shoprite, time: yesterday 19:00, anonymous: yes');
        return;
      }

      if (seemsLikeIncident(userMsg)) {
        const extracted = await extractReportFieldsWithAI(userMsg, { userName, userEmail });
        if (extracted && extracted.title) {
          setPending(extracted);
          confirmSummary(extracted);
          return;
        }
      }

      if (/^list\b.*reports\b/i.test(userMsg) || /show\b.*reports\b/i.test(userMsg)) {
        const out = await listRecentHuman(5);
        show(out);
        return;
      }

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.6,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: userMsg },
        ],
      });
      const reply = completion.choices[0].message?.content?.trim() || "I’m focused on safety and reports.";
      show(reply);
    } catch (err) {
      console.error(err);
      show("Something went wrong. Please try again.", false);
    } finally {
      setLoading(false);
    }
  };

    return (
    <SafeAreaView style={styles.safe}>
        <KeyboardAwareScrollView
        ref={scrollRef}
        enableOnAndroid
        extraScrollHeight={80}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        >
        <View style={styles.headerRow}>
            <TouchableOpacity
            onPress={() => router.replace("/")}
            style={styles.backBtn}
            >
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.header}>Vigil</Text>

            <TouchableOpacity
            onPress={() => setTtsOn((v) => !v)}
            style={[styles.smallBtn, ttsOn ? styles.smallBtnActive : null]}
            >
            <Text style={styles.smallBtnText}>{ttsOn ? "🔊" : "🔈"}</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.chatContainer}>
            {messages.map((m, i) => (
            <View
                key={i}
                style={[styles.bubble, m.role === "user" ? styles.user : styles.ai]}
            >
                <Text
                style={m.role === "user" ? styles.userText : styles.aiText}
                >
                {m.content}
                </Text>
            </View>
            ))}
            {loading && (
            <ActivityIndicator color="#d32f2f" style={{ marginVertical: 10 }} />
            )}
        </View>

        <View style={styles.inputBar}>
            <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe an incident or say 'list recent reports'…"
            style={styles.input}
            multiline
            />
            <TouchableOpacity
            style={styles.send}
            onPress={handleSend}
            disabled={loading}
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  header: { fontSize: 20, fontWeight: "700", color: "#d32f2f" },
  smallBtn: { backgroundColor: "#eee", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  smallBtnActive: { backgroundColor: "#d32f2f" },
  smallBtnText: { color: "#fff", fontWeight: "700" },
  chatContainer: { flex: 1, padding: 16 },
  bubble: { borderRadius: 12, padding: 12, marginVertical: 4, maxWidth: "85%" },
  ai: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  user: { alignSelf: "flex-end", backgroundColor: "#d32f2f" },
  aiText: { color: "#000" },
  userText: { color: "#fff" },
  inputBar: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#eee", backgroundColor: "#fff" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, maxHeight: 120 },
  send: { backgroundColor: "#d32f2f", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  sendText: { color: "#fff", fontWeight: "600" },
  backBtn: { backgroundColor: "#d32f2f", padding: 8, borderRadius: 8 },
});