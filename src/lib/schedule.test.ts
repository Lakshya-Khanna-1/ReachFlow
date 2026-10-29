import { test, expect } from "vitest";
import { settingsSchema } from "./settings";
import { inHours, nextWindow, warmupCap, jitter, localParts } from "./schedule";
test("local business windows exclude weekends and respect timezone and DST", () => {
  const c = settingsSchema.parse({ timezone: "Asia/Kolkata" });
  expect(inHours(c, new Date("2026-10-30T05:00:00Z"))).toBe(true);
  expect(inHours(c, new Date("2026-10-31T05:00:00Z"))).toBe(false);
  expect(
    new Date(nextWindow(c, new Date("2026-10-30T12:00:00Z"))).toISOString(),
  ).toBe("2026-11-02T04:30:00.000Z");
  expect(
    localParts(new Date("2026-11-02T15:00:00Z"), "America/New_York").time,
  ).toBe("10:00");
});
test("warm-up resets after 14 days and jitter respects inclusive bounds", () => {
  const c = settingsSchema.parse({});
  expect(warmupCap(c, "2026-10-30", "2026-10-30", "")).toBe(5);
  expect(warmupCap(c, "2026-11-01", "2026-10-30", "2026-10-31")).toBe(11);
  expect(warmupCap(c, "2026-11-20", "2026-10-30", "2026-11-01")).toBe(5);
  expect(jitter(c, () => 0)).toBe(60000);
  expect(jitter(c, () => 0.999999)).toBe(180000);
});
