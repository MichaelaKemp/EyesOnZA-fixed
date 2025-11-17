import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, Timestamp, } from "firebase/firestore";
import { DateTime } from "luxon";
import OpenAI from "openai";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View, } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebaseConfig";

const OPENAI_API_KEY = Constants.expoConfig?.extra?.OPENAI_API_KEY;
const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY;
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const VOICE_ID: string | undefined = undefined;

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

const stopSpeech = () => {
  try {
    Speech.stop();
  } catch {}
};

async function geocodeLocation(location: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      location + ", South Africa"
    )}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data?.results?.[0]?.geometry?.location) {
      return null;
    }

    const loc = data.results[0].geometry.location;
    return {
      lat: loc.lat as number,
      lng: loc.lng as number,
      formatted_address: data.results[0].formatted_address || location,
    };
  } catch {
    return null;
  }
}

async function searchPlaces(queryText: string) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    queryText + ", South Africa"
  )}&key=${GOOGLE_MAPS_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.results) return null;
    return data.results;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lng: number) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    return data?.results?.[0]?.formatted_address || null;
  } catch {
    return null;
  }
}

async function createFirestoreReport(
  payload: PendingReport,
  userMeta: { userName: string; userEmail: string | null }
) {
  let latitude: number | null = null;
  let longitude: number | null = null;
  let locLabel = payload.location || "Current Location";

  try {
    if (!payload.location || /my location|current location/i.test(payload.location)) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        latitude = current.coords.latitude;
        longitude = current.coords.longitude;

        const addr = await reverseGeocode(latitude, longitude);
        locLabel = addr || "Unknown Location";
      }
    }

    else {
      const geo = await geocodeLocation(payload.location);

      if (geo) {
        latitude = geo.lat;
        longitude = geo.lng;
        locLabel = geo.formatted_address || payload.location;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status === "granted") {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          latitude = current.coords.latitude;
          longitude = current.coords.longitude;

          const addr = await reverseGeocode(latitude, longitude);
          locLabel = addr || payload.location || "Unknown Location";
        }
      }
    }
  } catch {}

  let incidentDate = DateTime.now().setZone("Africa/Johannesburg").toJSDate();
  if (payload.incidentTime instanceof Date) {
    incidentDate = DateTime.fromJSDate(payload.incidentTime)
      .setZone("Africa/Johannesburg")
      .toJSDate();
  } else if (typeof payload.incidentTime === "string") {
    const lower = payload.incidentTime.toLowerCase();
    const parsed = DateTime.fromISO(payload.incidentTime, { zone: "Africa/Johannesburg" });
    const fallback = Date.parse(payload.incidentTime);
    if (lower === "now") {
      incidentDate = DateTime.now().setZone("Africa/Johannesburg").toJSDate();
    } else if (parsed.isValid) {
      incidentDate = parsed.toJSDate();
    } else if (!isNaN(fallback)) {
      incidentDate = DateTime.fromMillis(fallback).setZone("Africa/Johannesburg").toJSDate();
    }
  }

  const firestorePayload = {
    title: payload.title,
    category: payload.title,
    description: payload.description,
    location: locLabel,
    latitude,
    longitude,
    userName: payload.anonymous ? "Anonymous" : userMeta.userName,
    userEmail: payload.anonymous ? null : userMeta.userEmail,
    incidentTime: Timestamp.fromDate(incidentDate),
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "reports"), firestorePayload);
  } catch {
  }
}

async function listRecentHuman(limit = 5): Promise<string> {
  try {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items: Report[] = snap.docs.map((d) => ({ ...(d.data() as Report), id: d.id }));
    const limited = items.slice(0, limit);
    if (!limited.length) return "No reports found yet.";

    return (
      "Recent Reports:\n" +
      limited.map((r) => `• ${r.title || "Incident"} — ${r.location || "Unknown"}`).join("\n")
    );
  } catch (err) {
    return "Couldn't read recent reports right now.";
  }
}

async function isIncident(text: string) {
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Respond only with 'yes' or 'no'. Is the user describing a crime, safety issue, emergency, suspicious activity, or harmful incident?",
        },
        { role: "user", content: text },
      ],
    });

    const answer = completion.choices[0].message?.content?.toLowerCase().trim();
    return answer === "yes";
  } catch (err) {
    console.error("Incident detection error:", err);
    return false;
  }
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
    {
      role: "assistant",
      content: "Hi, I’m Vigil — your safety assistant. Ask about area safety or report incidents.",
    },
  ]);

  const [pending, setPending] = useState<PendingReport | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [currentReadingIndex, setCurrentReadingIndex] = useState<number | null>(null);

  const scrollRef = useRef<any>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
  }, [messages, loading]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        stopSpeech();
        setCurrentReadingIndex(null);
      };
    }, [])
  );

  const show = (content: string) => {
    setMessages((prev: ChatMessage[]) => [...prev, { role: "assistant", content }]);
  };

  const confirmSummary = (p: PendingReport) => {
    const timeText =
      p.incidentTime instanceof Date
        ? DateTime.fromJSDate(p.incidentTime)
            .setZone("Africa/Johannesburg")
            .toLocaleString(DateTime.DATETIME_MED)
        : p.incidentTime || "now";

    const summary =
      `Here’s what I understood:\n` +
      `• Incident: ${p.title}\n` +
      `• Location: ${p.location}\n` +
      `• Time: ${timeText}\n` +
      `• Anonymous: ${p.anonymous ? "Yes" : "No"}\n` +
      `• Details: ${p.description}\n\n` +
      `Would you like to submit this report? (yes / no)\n` +
      `You can also edit: title: Theft | location: my location | time: yesterday 21:00 | anonymous: yes`;

    show(summary);
  };

  const handleSpeak = (index: number, text: string) => {
    if (currentReadingIndex === index) {
      stopSpeech();
      setCurrentReadingIndex(null);
      return;
    }

    stopSpeech();
    setCurrentReadingIndex(index);

    Speech.speak(text, {
      voice: VOICE_ID,
      language: "en-US",
      pitch: 1.0,
      rate: 1.0,
      onDone: () => setCurrentReadingIndex(null),
      onStopped: () => setCurrentReadingIndex(null),
    });
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

          try {
            await createFirestoreReport(pending, { userName, userEmail });
          } catch (err) {
            show("Something went wrong saving your report. Please try again.");
            setLoading(false);
            return;
          }

          show("Report submitted. Thank you for helping keep your community safe.");
          setPending(null);
          setTimeout(() => router.replace("/(tabs)?fromReport=true"), 1500);
          return;
        }

        if (/^(no|n|cancel)$/i.test(userMsg)) {
          setPending(null);
          show("Okay, I’ve cancelled that report.");
          return;
        }

        const edits = userMsg.split(/[,|]/).map((s) => s.trim());
        const next = { ...pending };

        edits.forEach((e) => {
          const m = e.match(/^(title|category|description|location|time|anonymous)\s*[:=]\s*(.+)$/i);
          if (!m) return;

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
              next.title = val || "Other";
              next.category = next.title;
              break;
            case "location":
              next.location = val || "my location";
              break;
            case "description":
              next.description = val || next.description;
              break;
          }
        });

        setPending(next);
        confirmSummary(next);
        return;
      }

      if (/list\b.*reports\b.*in\b/i.test(userMsg)) {
        const area = userMsg.replace(/list\b.*reports\b.*in\b/i, "").trim();

        const places = await searchPlaces(area);

        if (!places || places.length === 0) {
          show(`I couldn’t find an area named "${area}". Try another landmark or suburb.`);
          return;
        }

        const first = places[0];
        const loc = first.geometry.location;
        const areaName = first.formatted_address;

        const snap = await getDocs(collection(db, "reports"));
        const items: Report[] = snap.docs.map((d) => ({ ...(d.data() as Report), id: d.id }));

        const near = items.filter((r) => {
          if (!r.latitude || !r.longitude) return false;
          const dx = r.latitude - loc.lat;
          const dy = r.longitude - loc.lng;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < 0.1; // very rough ~10km-ish filter
        });

        if (near.length === 0) {
          show(`No reports found near **${areaName}**.`);
          return;
        }

        const summary =
          `Reports near **${areaName}**:\n` +
          near
            .map(
              (r) =>
                `• ${r.title || "Incident"} — ${
                  r.location || "Unknown location"
                }`
            )
            .join("\n");

        show(summary);
        return;
      }

      if (/^list\b.*reports\b/i.test(userMsg) || /show\b.*reports\b/i.test(userMsg)) {
        const out = await listRecentHuman(5);
        show(out);
        return;
      }

      if (await isIncident(userMsg)) {

        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `
              You are Vigil. Extract ONE incident.
              Return strict JSON: {"title":string,"description":string,"location":string,"incidentTime":string|null,"anonymous":boolean,"category":string|null}
            `,
            },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0].message?.content || "{}";

        try {
          const parsed = JSON.parse(raw);

          const extracted: PendingReport = {
            title: parsed.title || "Other",
            category: parsed.title || "Other",
            description: parsed.description || "No description provided.",
            location: parsed.location || "my location",
            incidentTime: parsed.incidentTime || "now",
            anonymous: !!parsed.anonymous,
            userEmail,
            userName,
          };
          setPending(extracted);
          confirmSummary(extracted);
          return;
        } catch (err) {
          show("I couldn’t understand the incident details clearly. Please describe it again.");
          return;
        }
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

      const reply =
        completion.choices[0].message?.content?.trim() ||
        "I’m focused on safety and reports.";
      show(reply);
    } catch (err) {
      show("Something went wrong. Please try again.");
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
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.backBtn}>
            <Ionicons name="arrow-back-outline" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.centerGroup}>
            <Image
              source={require("../../assets/images/EyesOnZA-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.header}>Vigil</Text>
          </View>
        </View>

        <View style={styles.chatContainer}>
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === "user" ? styles.user : styles.ai]}>
              <Text style={m.role === "user" ? styles.userText : styles.aiText}>{m.content}</Text>

              {m.role === "assistant" && (
                <TouchableOpacity style={styles.speakBtn} onPress={() => handleSpeak(i, m.content)}>
                  <Ionicons
                    name={currentReadingIndex === i ? "volume-mute" : "volume-high"}
                    size={18}
                    color="#d32f2f"
                  />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {loading && <ActivityIndicator color="#d32f2f" style={{ marginVertical: 10 }} />}
        </View>

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe an incident or say 'list recent reports'…"
            style={styles.input}
            multiline
          />
          <TouchableOpacity style={styles.send} onPress={handleSend} disabled={loading}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  chatContainer: { flex: 1, padding: 16 },
  bubble: { borderRadius: 12, padding: 12, marginVertical: 4, maxWidth: "85%", position: "relative" },
  ai: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  user: { alignSelf: "flex-end", backgroundColor: "#d32f2f" },
  aiText: { color: "#000" },
  userText: { color: "#fff" },
  speakBtn: { marginTop: 6, alignSelf: "flex-end", padding: 4 },
  inputBar: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#eee", backgroundColor: "#fff" },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, maxHeight: 120 },
  send: { backgroundColor: "#d32f2f", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", marginLeft: 8 },
  sendText: { color: "#fff", fontWeight: "600" },
  backBtn: { backgroundColor: "#d32f2f", padding: 8, borderRadius: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  centerGroup: { flexDirection: "row", alignItems: "center", justifyContent: "center", flex: 1, marginLeft: -28 },
  logo: { width: 34, height: 34, marginRight: 6, backgroundColor: "#fff", borderRadius: 8 },
  header: { fontSize: 20, fontWeight: "700", color: "#d32f2f" },
});