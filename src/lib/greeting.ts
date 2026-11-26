/** Pure helpers for time-of-day greetings (safe on server and client). */

export type DayPeriod = "night" | "morning" | "afternoon" | "evening";

export type Greeting = {
  period: DayPeriod;
  text: string;
  emoji: string;
  /** Small supporting line shown under the greeting. */
  hint: string;
};

/**
 * Maps a 24-hour clock hour to a greeting.
 * 05–11 morning · 12–16 afternoon · 17–20 evening · 21–04 night
 */
export function greetingForHour(hour: number): Greeting {
  const h = ((Math.floor(hour) % 24) + 24) % 24;

  if (h >= 5 && h < 12) {
    return { period: "morning", text: "Good morning", emoji: "☀️", hint: "Start of the day — review overnight alerts." };
  }
  if (h >= 12 && h < 17) {
    return { period: "afternoon", text: "Good afternoon", emoji: "🌤️", hint: "Midday check — keep dispensing queues moving." };
  }
  if (h >= 17 && h < 21) {
    return { period: "evening", text: "Good evening", emoji: "🌇", hint: "Wrap up — confirm dispatches before the EOD count." };
  }
  return {
    period: "night",
    text: h >= 21 ? "Good evening" : "Good night",
    emoji: "🌙",
    hint: h >= 21 ? "Late shift — near-expiry dispensing needs confirmation." : "Working late? Overnight automation runs at 02:00.",
  };
}

/** Greeting for a specific Date, using the runtime's local timezone. */
export function greetingForDate(date: Date): Greeting {
  return greetingForHour(date.getHours());
}

export function localDateLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function localTimeLabel(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
