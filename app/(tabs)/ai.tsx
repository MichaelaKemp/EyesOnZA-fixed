import Constants from "expo-constants";
import * as Location from "expo-location";
import { addDoc, collection, getDocs, serverTimestamp, Timestamp, } from "firebase/firestore";
import OpenAI from "openai";
import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";

const EMERGENCY_CONTACTS = [
  { name: "Police", number: "10111" },
  { name: "Ambulance", number: "10177" },
  { name: "Fire Brigade", number: "10177" },
  { name: "National Gender-Based Violence Helpline", number: "0800 150 150" },
  { name: "Childline", number: "0800 055 555" },
  { name: "Crime Stop", number: "08600 10111" },
];

async function findNearbyPlace(type: "hospital" | "police"): Promise<string> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return "Location permission denied. Unable to find nearby places.";
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const geoResults = await Location.reverseGeocodeAsync({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    const matches = geoResults.filter(
      (place) =>
        (type === "hospital" && /hospital|clinic|medical/i.test(place.name || place.street || "")) ||
        (type === "police" && /police|station/i.test(place.name || place.street || ""))
    );
    if (matches.length) {
      const place = matches[0];
      return `Closest ${type === "hospital" ? "hospital/clinic" : "police station"}:
${place.name ? place.name + "\n" : ""}${place.street ? place.street + ", " : ""}${place.city ? place.city + ", " : ""}${place.region ? place.region + ", " : ""}${place.postalCode ? place.postalCode : ""}`;
    } else {
      return `No nearby ${type === "hospital" ? "hospital/clinic" : "police station"} found in your area.`;
    }
  } catch (err) {
    return "Could not find nearby places due to an error.";
  }
}

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

type PendingReport = {
  title: string;
  description: string;
  location: string;
  incidentTime?: string | Date;
  anonymous: boolean;
  category?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  anonymousRequested?: boolean;
};

const OPENAI_API_KEY = Constants.expoConfig?.extra?.OPENAI_API_KEY;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

function formatNow(d: Date) {
  return d.toLocaleString();
}

function inferCategory(source: string): string | null {
  const s = source.toLowerCase();
  if (/\b(trespass|tres?passing|on.*(property|premises)|yard|garden|fence|gate|climb.*over|jump.*over|break.*in|sneak.*in|trying to get in|enter.*without|unauthorized|unwanted|intruder)\b/.test(s)) return "Trespassing";
  
  if (/(attempt|tried|attempting).*(steal|theft|rob)/.test(s)) return "Attempted Theft";
  if (/\b(robbery|robber|rob|hold.?up)\b/.test(s)) return "Robbery";
  if (/\b(theft|steal|stolen|shoplifting|took|snatched)\b/.test(s)) return "Theft";
  
  if (/\b(assault|attack|fight|beat|punch|hit|struck|violence|weapon)\b/.test(s)) return "Assault";
  
  if (/\b(vandal(ism)?|damage|graffiti|break|broke|smash|destroy|defac(e|ing)|spray.?paint)\b/.test(s)) return "Vandalism";
  
  if (/\b(drug|deal|narcotic|substance|dealing|dealers|selling drugs)\b/.test(s)) return "Drug Activity";
  
  if (/\b(traffic|reckless|violation|speed|driving|vehicle|car|accident|crash|drunk.?driv|dui)\b/.test(s)) return "Traffic Violation";
  
  if (/\b(suspicious|loiter|following|lurking|prowling|stalking|watching|casing|strange|weird)\b/.test(s)) return "Suspicious Activity";
  
  if (/\b(crime|criminal|illegal|police|law|report|incident|emergency)\b/.test(s)) return "Suspicious Activity";
  
  return null;
}

function normalizeCategory(category: string | null): string | null {
  if (!category) return null;
  const map: Record<string, string> = {
    "Attempted Theft": "Theft",
    "Vehicle Theft": "Theft",
    "Breaking and Entering": "Robbery",
    "Burglary": "Robbery",
    "Vandalism": "Vandalism",
    "Drug Activity": "Drug Activity",
    "Suspicious Activity": "Suspicious Activity",
    "Traffic Violation": "Traffic Violation",
    "Trespassing": "Trespassing",
    "Assault": "Assault",
    "Robbery": "Robbery",
    "Theft": "Theft",
  };
  const key = Object.keys(map).find(
    (k) => k.toLowerCase() === category.toLowerCase()
  );
  return key ? map[key] : "Custom";
}

function extractReportFields(
  raw: string,
  defaultUser: string,
  defaultEmail: string
): PendingReport {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(
    /\b(?:create|make|submit|file|record)\s+(?:a\s+)?(?:report|incident|case|entry)\b[:\-]?\s*/gi,
    ""
  );

  const titleMatch =
    text.match(/(?:title|crime|type|incident)\s*[:=\-]\s*([^;,.]+)/i) ||
    text.match(/^report\s+(.+?)\s+(?:at|in|near)\b/i);

  let title = (titleMatch?.[1] || "").trim();
  if (!title) title = inferCategory(text) || "Untitled Report";

  const descMatch = text.match(
    /(?:desc|description|details|info|about)\s*[:=\-]\s*([^;]+)/i
  );

  let loc =
    (text.match(/(?:loc|location|place|area)\s*[:=\-]\s*([^;]+)/i)?.[1] || "")
      .trim() || "";

  if (!loc) {
    const prepositional = text.match(
      /\b(?:at|in|near|outside|around|by|close to)\s+([A-Za-z0-9 ,.'\-]+?)(?=(?:\s(?:time|when|yesterday|today|now|last|because|after|before|and|then)\b|[,.;]|$))/i
    );
    if (prepositional?.[1]) loc = prepositional[1].trim();
  }

  const wantsGPS =
    /(?:my|current)\s+location/i.test(text) ||
    /use\s+gps/i.test(text) ||
    /near\s+me/i.test(text);

  const timeMatch =
    text.match(/(?:time|when|date|incident\s*time)\s*[:=\-]\s*([^\n,;.]+)/i) ||
    text.match(/\b(?:yesterday|last night|today|now|right now)\b/i);

  const anon = /(?:anon|anonymous)\s*[:=\-]?\s*(true|yes|on|1)/i.test(text);

  let description =
    (descMatch?.[1] || "").trim() ||
    (text.match(/(?:because|after)\s+(.*)/i)?.[1]?.trim() ?? "");

  if (!description) {
    let fallback = text;
    fallback = fallback.replace(
      /\b(?:report|incident|crime|type|title|category|location|place|area|time|when)\b[:=\-]?\s*[A-Za-z0-9 ,.'\-]+/gi,
      ""
    );
    fallback = fallback.replace(
      /\b(?:at|in|near|outside|around|by|close to)\s+[A-Za-z0-9 ,.'\-]+/gi,
      ""
    );
    description = fallback.trim();
  }

  description = description
    .replace(
      /\b(?:create|make|submit|file|record|report|incident)\b[:\-]?\s*/gi,
      ""
    )
    .replace(/^[,.\s]+/, "");

  if (!description) description = "No description provided.";

  return {
    title,
    description: description.trim(),
    location: loc || (wantsGPS ? "my location" : ""),
    incidentTime: timeMatch?.[0]?.trim(),
    anonymous: anon,
    userEmail: anon ? null : defaultEmail,
    userName: anon ? "Anonymous" : defaultUser,
    category: inferCategory(text),
  };
}

async function listReports(): Promise<string> {
  try {
    const snapshot = await getDocs(collection(db, "reports"));
    const reports: Report[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Report),
      id: doc.id,
    }));

    if (!reports.length) return "No reports found.";

    const sorted = reports
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 5);

    let summary = "📋 Recent Reports:\n";
    for (const r of sorted) {
      summary += `• ${r.title || "Untitled"} — ${r.location || "Unknown area"}\n`;
    }
    return summary;
  } catch {
    return "Couldn't fetch recent reports.";
  }
}

async function analyzeSafety(area: string): Promise<string> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted")
      console.warn("Permission denied for geocoding");

    let targetCoords: { lat: number; lng: number } | null = null;
    if (status === "granted") {
      const geo = await Location.geocodeAsync(area);
      if (geo[0])
        targetCoords = { lat: geo[0].latitude, lng: geo[0].longitude };
    }

    const snapshot = await getDocs(collection(db, "reports"));
    const reports: Report[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Report),
      id: doc.id,
    }));

    const filtered = reports.filter((r) => {
      if (targetCoords && r.latitude && r.longitude) {
        const d = getDistanceKm(
          targetCoords.lat,
          targetCoords.lng,
          r.latitude,
          r.longitude
        );
        return d <= 5;
      }
      return (r.location || "").toLowerCase().includes(area.toLowerCase());
    });

    if (!filtered.length)
      return `No recent incidents found near ${area}. It seems relatively quiet.`;

    const total = filtered.length;
    const recent = filtered
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      .slice(0, 3);

    let summary = `Safety summary for ${area}:\nFound ${total} report${
      total > 1 ? "s" : ""
    } recently.\n`;
    for (const r of recent)
      summary += `• ${r.title || "Incident"} — ${
        r.description || "No description"
      }\n`;

    summary +=
      total <= 2
        ? "\nSeems calm overall."
        : total <= 5
        ? "\nModerate activity — stay alert."
        : "\nHigh incident density — be cautious in this area.";

    return summary;
  } catch {
    return "Could not analyze safety data for that area.";
  }
}

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
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

async function createReport(report: PendingReport): Promise<string> {
  try {
    let {
      title,
      description,
      location,
      incidentTime,
      anonymous,
      userEmail,
      userName,
      category,
    } = report;

    let lat: number | null = null;
    let lng: number | null = null;
    let locName = location?.trim() || "";

    if (!locName || /my location|current location/i.test(locName)) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        lat = current.coords.latitude;
        lng = current.coords.longitude;
        locName = "Current Location";
      } else locName = "Unspecified (permission denied)";
    }

    let finalDate = new Date();
    if (incidentTime) {
      try {
        if (incidentTime instanceof Date) finalDate = incidentTime;
        else if (!isNaN(Date.parse(incidentTime)))
          finalDate = new Date(incidentTime);
      } catch {
        finalDate = new Date();
      }
    }

    const finalTime = Timestamp.fromDate(finalDate);

    await addDoc(collection(db, "reports"), {
      title,
      description,
      location: locName,
      latitude: lat,
      longitude: lng,
      userName: anonymous ? "Anonymous" : userName,
      userEmail: anonymous ? null : userEmail,
      incidentTime: finalTime,
      category: normalizeCategory(category ?? null),
      createdAt: serverTimestamp(),
    });

    return `Report created!\n• ${title}\n• ${locName}\n• ${formatNow(
      finalDate
    )}\nReporter: ${anonymous ? "Anonymous" : userName}`;
  } catch (error) {
    console.error("createReport error:", error);
    return "Failed to create report.";
  }
}

export default function AIAgentScreen() {
  const { user } = useAuth();
  const displayName = user?.name
    ? `${user.name} ${user.surname ? user.surname.charAt(0) + "." : ""}`
    : user?.email?.split("@")[0] || "User";

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m Vigil — I can list reports, check area safety, or help you create a report. Try: “Is Centurion safe?” or “Create a report: someone broke into my car.”",
    },
  ]);
  const [pendingReport, setPendingReport] = useState<PendingReport | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<any>(null);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((p) => [...p, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);

    const lower = userMsg.toLowerCase();
    if (/\b(nearest|closest|nearby|find|where is|local)\b.*\b(hospital|clinic|medical)\b/i.test(lower)) {
      const reply = await findNearbyPlace("hospital");
      setMessages((p) => [...p, { role: "assistant", content: reply }]);
      setLoading(false);
      return;
    }
    if (/\b(nearest|closest|nearby|find|where is|local)\b.*\b(police|station)\b/i.test(lower)) {
      const reply = await findNearbyPlace("police");
      setMessages((p) => [...p, { role: "assistant", content: reply }]);
      setLoading(false);
      return;
    }
    if (/\b(police|emergency|ambulance|fire|crime stop|childline|violence|help|contact number|call|number for|how do i contact|who do i call|phone number|hotline)\b/i.test(lower)) {
      const found = EMERGENCY_CONTACTS.filter(c => lower.includes(c.name.toLowerCase()) || lower.includes(c.number));
      if (found.length) {
        const reply = found.map(c => `• ${c.name}: ${c.number}`).join("\n");
        setMessages((p) => [
          ...p,
          { role: "assistant", content: `Here are the emergency contact numbers you requested:\n${reply}` }
        ]);
        setLoading(false);
        return;
      } else {
        const reply = EMERGENCY_CONTACTS.map(c => `• ${c.name}: ${c.number}`).join("\n");
        setMessages((p) => [
          ...p,
          { role: "assistant", content: `Here are important emergency contact numbers for South Africa:\n${reply}` }
        ]);
        setLoading(false);
        return;
      }
    }
    if (/^(hi|hello|hey|howdy|greetings|good (morning|afternoon|evening))\b/i.test(lower)) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "Hello! I’m Vigil, your community safety assistant. Ask me about safety, incidents, or reports in your area." }
      ]);
      setLoading(false);
      return;
    }
    if (/\b(who are you|what( is|'s) your purpose|what do you do|your role|about you)\b/i.test(lower)) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "I’m Vigil — I help with community safety, incident reporting, and local crime awareness. You can ask me to list recent reports, analyze area safety, or help you file a report." }
      ]);
      setLoading(false);
      return;
    }
    if (/^(what is|what's|calculate|solve|how much|how many|count|add|subtract|multiply|divide|math|number|sum|total|answer)\b|\b(\d+\s*[+\-*/]\s*\d+)\b/i.test(lower)) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "I’m here to help with safety and incident reporting, not general questions or math problems." }
      ]);
      setLoading(false);
      return;
    }

    try {
      if (pendingReport && /^(make|set|submit).*anonymous/i.test(userMsg)) {
        setPendingReport({
          ...pendingReport,
          anonymous: true,
          anonymousRequested: true
        });
        setMessages((p) => [
          ...p,
          {
            role: "assistant",
            content: `Got it — this report will be submitted anonymously. Say 'ready' when you want to create the report.`,
          },
        ]);
        setLoading(false);
        return;
      }

      const editMatch = userMsg.match(
        /edit\s+(title|description|location|time|reporter|category)\s+(?:to|as|=)\s*["']?(.+?)["']?$/i
      );
      if (editMatch && pendingReport) {
        const [, field, value] = editMatch;
        let updatedValue = value.trim();
        let updatedField = field.toLowerCase();
        
        if (updatedField === 'category' || updatedField === 'title') {
          const inferredCategory = inferCategory(updatedValue) || updatedValue;
          const normalized = normalizeCategory(inferredCategory) || inferredCategory;
          updatedValue = normalized;
          setPendingReport({
            ...pendingReport,
            title: updatedValue,
            category: inferredCategory
          });
        } else {
          setPendingReport({
            ...pendingReport,
            [updatedField]: updatedValue
          });
        }

        setMessages((p) => [
          ...p,
          {
            role: "assistant",
            content: `Got it — updated ${updatedField} to "${updatedValue}". Say 'ready' when done tweaking.`,
          },
        ]);
        setLoading(false);
        return;
      }

      if (pendingReport) {
        if (/^(yes|ready|create|confirm|ok)$/i.test(userMsg)) {
          const reply = await createReport(pendingReport);
          setMessages((p) => [...p, { role: "assistant", content: reply }]);
          setPendingReport(null);
          setLoading(false);
          return;
        } else {
          setMessages((p) => [
            ...p,
            {
              role: "assistant",
              content: "Got it — say 'ready' when you’re done tweaking.",
            },
          ]);
          setLoading(false);
          return;
        }
      }

    } catch (err) {
      console.error(err);
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "Something went wrong while processing your request." },
      ]);
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
        keyboardOpeningTime={0}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.chatContainer}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === "user" ? styles.user : styles.ai]}
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

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about safety or make a report..."
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
  chatContainer: { flex: 1, padding: 20 },
  bubble: { borderRadius: 12, padding: 12, marginVertical: 4, maxWidth: "80%" },
  ai: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  user: { alignSelf: "flex-end", backgroundColor: "#d32f2f" },
  aiText: { color: "#000" },
  userText: { color: "#fff" },
  inputBar: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#eee", backgroundColor: "#fff" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, maxHeight: 120 },
  send: { backgroundColor: "#d32f2f", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  sendText: { color: "#fff", fontWeight: "600" },
});