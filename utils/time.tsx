import { Timestamp } from "firebase/firestore";
import { DateTime } from "luxon";

export function toSA(dt: any) {
  if (!dt) return null;

  if (dt instanceof DateTime) {
    return dt.setZone("Africa/Johannesburg");
  }

  if (dt instanceof Timestamp) {
    return DateTime.fromJSDate(dt.toDate()).setZone("Africa/Johannesburg");
  }

  if (dt instanceof Date) {
    return DateTime.fromJSDate(dt).setZone("Africa/Johannesburg");
  }

  if (typeof dt === "string") {
    const parsed = parseNaturalString(dt);
    if (parsed?.isValid) return parsed;
  }

  return null;
}

function parseNaturalString(text: string): DateTime {
  const now = DateTime.now().setZone("Africa/Johannesburg");
  const lower = text.toLowerCase().trim();

  if (lower === "now") return now;

  const min = lower.match(/(\d+)\s*(min|mins|minute|minutes)\s*(ago)?/);
  if (min) return now.minus({ minutes: Number(min[1]) });

  const hr = lower.match(/(\d+)\s*(hr|hrs|hour|hours)\s*(ago)?/);
  if (hr) return now.minus({ hours: Number(hr[1]) });

  const sec = lower.match(/(\d+)\s*(sec|secs|second|seconds)\s*(ago)?/);
  if (sec) return now.minus({ seconds: Number(sec[1]) });

  if (lower.startsWith("yesterday")) {
    const time = lower.replace("yesterday", "").trim();
    const parsed = DateTime.fromFormat(time, "HH:mm", { zone: "Africa/Johannesburg" });
    if (parsed.isValid) return parsed.minus({ days: 1 });
    return now.minus({ days: 1 });
  }

  const iso = DateTime.fromISO(text, { zone: "Africa/Johannesburg" });
  if (iso.isValid) return iso;

  return now;
}

export function relativeSA(dt: any) {
  const sa = toSA(dt);
  return sa ? sa.toRelative() : "Unknown time";
}