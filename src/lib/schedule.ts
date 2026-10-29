import type { AppSettings } from "./settings";
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: get("weekday"),
  };
}
export function inHours(c: AppSettings, now: Date) {
  const p = localParts(now, c.timezone);
  return (
    (c.weekends || !["Sat", "Sun"].includes(p.weekday)) &&
    p.time >= c.start &&
    p.time < c.end
  );
}
export function nextWindow(c: AppSettings, now: Date) {
  if (inHours(c, now)) return now.getTime();
  let t = Math.ceil(now.getTime() / 60000) * 60000;
  for (let i = 0; i < 8 * 24 * 60; i++, t += 60000)
    if (inHours(c, new Date(t))) return t;
  throw new Error("No business window found");
}
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000,
  );
}
export function warmupCap(
  c: AppSettings,
  date: string,
  start: string,
  lastSent: string,
) {
  if (!c.warmup) return c.dailyCap;
  const reset = !start || (!!lastSent && daysBetween(lastSent, date) > 14);
  return Math.min(
    c.dailyCap,
    50,
    5 + 3 * Math.max(0, reset ? 0 : daysBetween(start, date)),
  );
}
export function jitter(c: AppSettings, random = Math.random) {
  return (
    (c.jitterMin + Math.floor(random() * (c.jitterMax - c.jitterMin + 1))) *
    1000
  );
}
