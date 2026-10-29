import { test, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encrypt, decrypt, settingsSchema } from "./settings";
import { guard } from "./http";
test("secrets use authenticated encryption and cap/hour boundaries reject bad values", () => {
  const folder = mkdtempSync(join(tmpdir(), "reachflow-key-"));
  const old = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = join(folder, "db");
  try {
    const encrypted = encrypt("private-token");
    expect(encrypted).not.toContain("private-token");
    expect(decrypt(encrypted)).toBe("private-token");
    expect(() => decrypt(encrypted.slice(0, -5) + "AAAAA")).toThrow();
    expect(() => settingsSchema.parse({ dailyCap: 51 })).toThrow();
    expect(() =>
      settingsSchema.parse({ start: "18:00", end: "09:00" }),
    ).toThrow();
  } finally {
    if (old === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = old;
    rmSync(folder, { recursive: true, force: true });
  }
});
test("cross-origin mutations and hostile hosts are rejected", () => {
  expect(() =>
    guard(
      new Request("http://localhost:3000/api/settings", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    ),
  ).toThrow("Untrusted origin");
  expect(() =>
    guard(new Request("http://evil.example:3000/api/settings")),
  ).toThrow("Untrusted host");
});
