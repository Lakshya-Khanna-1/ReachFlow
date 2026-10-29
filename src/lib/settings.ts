import { z } from "zod";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { database } from "../db";
import { settings } from "../db/schema";
import { emailSchema } from "./contracts";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const settingsSchema = z
  .object({
    provider: z.enum(["local", "openrouter", "gemini"]).default("local"),
    model: z.string().min(1).max(200).default("llama3.1:8b"),
    baseUrl: z
      .url()
      .refine(
        (v) =>
          ["http:", "https:"].includes(new URL(v).protocol) &&
          !new URL(v).username &&
          !new URL(v).password,
        "Use HTTP(S) without embedded credentials",
      )
      .default("http://localhost:11434/v1"),
    dailyCap: z.number().int().min(1).max(50).default(20),
    warmup: z.boolean().default(true),
    jitterMin: z.number().int().min(60).max(180).default(60),
    jitterMax: z.number().int().min(60).max(180).default(180),
    start: time.default("10:00"),
    end: time.default("17:00"),
    weekends: z.boolean().default(false),
    timezone: z
      .string()
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Invalid timezone")
      .default(Intl.DateTimeFormat().resolvedOptions().timeZone),
    forwardTo: z.array(emailSchema).max(20).default([]),
    senderName: z.string().trim().max(100).default(""),
    footer: z
      .string()
      .max(500)
      .default(
        "If this isn't relevant, reply 'unsubscribe' and I won't email again.",
      ),
    googleClientId: z.string().max(300).default(""),
    dryRun: z.boolean().default(true),
    noticeAccepted: z.boolean().default(false),
  })
  .refine(
    (v) => v.jitterMin <= v.jitterMax,
    "Minimum jitter must not exceed maximum",
  )
  .refine((v) => v.start < v.end, "Business hours must start before they end");
export type AppSettings = z.infer<typeof settingsSchema>;
export type SecretName = "llmKey" | "googleSecret" | "googleToken";
function key() {
  const folder = dirname(process.env.DATABASE_PATH ?? "./data/reachflow.db");
  mkdirSync(folder, { recursive: true });
  const path = join(folder, ".key");
  try {
    writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const bytes = readFileSync(path);
  if (bytes.length !== 32)
    throw new Error("Encryption key invalid; restore data/.key from backup.");
  return bytes;
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64");
}
export function decrypt(value: string) {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    decipher.update(data.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
export function getSetting(key: string) {
  return database()
    .db.select()
    .from(settings)
    .where(eq(settings.key, key))
    .get()?.value;
}
export function putSetting(key: string, value: string) {
  database().db.transaction((tx) =>
    tx
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run(),
  );
}
export function config(): AppSettings {
  return settingsSchema.parse(JSON.parse(getSetting("config") ?? "{}"));
}
export function secret(name: SecretName) {
  const value = getSetting(name);
  return value ? decrypt(value) : "";
}
export function saveConfig(input: unknown) {
  const parsed = z
    .object({
      config: settingsSchema,
      secrets: z
        .object({
          llmKey: z.string().max(10000).optional(),
          googleSecret: z.string().max(10000).optional(),
        })
        .default({}),
    })
    .parse(input);
  database().db.transaction((tx) => {
    tx.insert(settings)
      .values({ key: "config", value: JSON.stringify(parsed.config) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(parsed.config) },
      })
      .run();
    for (const [key, value] of Object.entries(parsed.secrets))
      if (value) {
        const encrypted = encrypt(value);
        tx.insert(settings)
          .values({ key, value: encrypted })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: encrypted },
          })
          .run();
      }
  });
}
export function saveSecret(name: SecretName, value: string) {
  putSetting(name, encrypt(value));
}
export function publicConfig() {
  return {
    config: config(),
    configured: {
      llmKey: !!getSetting("llmKey"),
      googleSecret: !!getSetting("googleSecret"),
      googleConnected: !!getSetting("googleToken"),
    },
    googleAddress: getSetting("googleAddress") ?? "",
  };
}
